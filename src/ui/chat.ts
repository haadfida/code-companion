import * as vscode from 'vscode';
import { CodeCompanionManager } from '../manager';
import { ChatMessage, ChatSession, TaskResult, TaskStep, TaskType } from '../types';

export class ChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeCompanionChat';
    private _view?: vscode.WebviewView;
    private _sessions: Map<string, ChatSession> = new Map();
    private _currentSessionId: string | undefined;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _manager: CodeCompanionManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._context.extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendMessage':
                        this._handleUserMessage(message.text, message.mode);
                        break;
                    case 'newSession':
                        this._createNewSession();
                        break;
                    case 'loadSession':
                        this._loadSession(message.sessionId);
                        break;
                    case 'editPlan':
                        this._handleEditPlan(message);
                        break;
                }
            }
        );

        // Create initial session if none exists
        if (this._sessions.size === 0) {
            this._createNewSession();
        }
    }

    public show() {
        if (this._view) {
            this._view.show(true);
        } else {
            vscode.commands.executeCommand('codeCompanionChat.focus');
        }
    }

    private _createNewSession() {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session: ChatSession = {
            id: sessionId,
            messages: [],
            createdAt: new Date(),
            lastActivity: new Date()
        };

        this._sessions.set(sessionId, session);
        this._currentSessionId = sessionId;

        this._updateWebview();
    }

    private _loadSession(sessionId: string) {
        const session = this._sessions.get(sessionId);
        if (session) {
            this._currentSessionId = sessionId;
            this._updateWebview();
        }
    }

    private async _handleUserMessage(text: string, mode: 'chat' | 'agentic' = 'chat') {
        if (!this._currentSessionId || !this._view) {
            return;
        }

        const session = this._sessions.get(this._currentSessionId);
        if (!session) {
            return;
        }

        // Add user message
        const userMessage: ChatMessage = {
            role: 'user',
            content: text,
            timestamp: new Date()
        };
        session.messages.push(userMessage);
        session.lastActivity = new Date();

        // Update UI immediately
        this._updateWebview();

        try {
            // Get current context
            const context = await this._manager.getCurrentContext();

            if (mode === 'agentic') {
                // Provide immediate feedback that the task is being planned/executed
                const placeholderMessage: ChatMessage = {
                    role: 'assistant',
                    content: 'Planning and executing task, please wait…',
                    timestamp: new Date()
                };
                session.messages.push(placeholderMessage);
                this._updateWebview();

                // Use full task pipeline
                const taskResult = await this._manager.executeTask('implement', { description: text });

                // Replace placeholder content with final result and expandable details
                placeholderMessage.content = this._buildTaskResultMessage(taskResult);

                placeholderMessage.timestamp = new Date();
                placeholderMessage.context = taskResult.context;
            } else {
                // Simple chat mode
            const response = await this._manager.chat(text, context);

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response,
                timestamp: new Date(),
                context
            };
            session.messages.push(assistantMessage);
            }

            session.lastActivity = new Date();

            // Update UI with response
            this._updateWebview();

        } catch (error) {
            // Add error message
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date()
            };
            session.messages.push(errorMessage);
            session.lastActivity = new Date();

            this._updateWebview();
        }
    }

    private _updateWebview() {
        if (this._view) {
            const currentSession = this._currentSessionId ? this._sessions.get(this._currentSessionId) : undefined;
            const sessions = Array.from(this._sessions.values());

            this._view.webview.postMessage({
                command: 'updateChat',
                session: currentSession,
                sessions: sessions,
                currentSessionId: this._currentSessionId
            });
        }
    }

    /**
     * Build an HTML message summarising the task result with expandable details.
     */
    private _buildTaskResultMessage(taskResult: TaskResult): string {
        const durationSec = Math.round(taskResult.duration / 1000);
        const header = taskResult.success
            ? `✅ Task completed in ${durationSec} s.`
            : `❌ Task failed after ${durationSec} s: ${taskResult.error ?? 'Unknown error'}`;

        // Build steps summary
        const steps = (taskResult.steps ?? []).map(step => this._formatStep(step)).join('');

        // Format aggregated results as a table for easier reading
        const aggregatedHtml = this._formatAggregatedResults(taskResult.results);

        // Encode steps & params for safe transport to webview
        const stepsEncoded = Buffer.from(JSON.stringify(taskResult.steps ?? [])).toString('base64');
        const paramsEncoded = Buffer.from(JSON.stringify(taskResult.params ?? {})).toString('base64');

        return `${header}
<details style="margin-top:8px;">
  <summary>Show details</summary>
  <h4>Execution Plan</h4>
  <ol>${steps}</ol>
  ${aggregatedHtml}
  <button style="margin-top:8px;" onclick="editPlan('${taskResult.type}', '${stepsEncoded}', '${paramsEncoded}')">Edit Plan</button>
</details>`;
    }

    private _formatStep(step: TaskStep): string {
        const statusSymbol = step.status === 'completed'
            ? '✅'
            : step.status === 'failed'
                ? '❌'
                : '⏳';

        const sanitizedResult = this._sanitizeResult(step.result);
        const resultSnippet = sanitizedResult
            ? `<details><summary>Result</summary><pre>${this._escapeHtml(JSON.stringify(sanitizedResult, null, 2))}</pre></details>`
            : '';

        return `<li>${statusSymbol} <strong>${step.name}</strong> (<em>${step.type}</em>)<br/>${this._escapeHtml(step.description)}${resultSnippet}</li>`;
    }

    /**
     * Convert aggregated results into a simple HTML table, omitting empty arrays/objects.
     */
    private _formatAggregatedResults(results?: any[]): string {
        if (!results || results.length === 0) {
            return '';
        }

        const rows = results.map((res, idx) => {
            const sanitized = this._sanitizeResult(res);
            const cells = Object.entries(sanitized).map(([key, value]) => {
                return `<tr><td style="font-weight:bold;vertical-align:top;">${this._escapeHtml(key)}</td><td>${this._escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</td></tr>`;
            }).join('');
            return `<tbody><tr><th colspan="2" style="text-align:left;background:#333;color:#fff;padding:4px;">Result #${idx + 1}</th></tr>${cells}</tbody>`;
        }).join('');

        return `<h4>Aggregated Results</h4><table style="width:100%;border-collapse:collapse;">${rows}</table>`;
    }

    /**
     * Remove keys that have empty array/object values to reduce noise.
     */
    private _sanitizeResult(result: any): any {
        if (!result || typeof result !== 'object') return result;

        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(result)) {
            if (Array.isArray(value) && value.length === 0) continue;
            if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) continue;
            sanitized[key] = value;
        }
        return sanitized;
    }

    /**
     * Basic HTML escaping to avoid breaking the webview.
     */
    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeCompanion Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .new-chat-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .new-chat-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 10px;
        }

        .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 5px;
        }

        .message.user {
            background-color: var(--vscode-input-background);
            border-left: 3px solid var(--vscode-button-background);
        }

        .message.assistant {
            background-color: var(--vscode-editor-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }

        .message-header {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }

                .message-content {
            white-space: pre-wrap;
            line-height: 1.4;
        }

        /* Enhanced styles for code blocks */
        .code-block {
            position: relative;
            background-color: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-widget-border, #464647);
            border-radius: 6px;
            padding: 16px;
            margin: 12px 0;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', 'Courier New', monospace);
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-editor-foreground, #d4d4d4);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.16);
        }

        .code-block:hover {
            border-color: var(--vscode-focusBorder, #007acc);
        }

        /* Scrollbar styling for code blocks */
        .code-block::-webkit-scrollbar {
            height: 8px;
            width: 8px;
        }

        .code-block::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.1));
        }

        .code-block::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
            border-radius: 4px;
        }

        .code-block::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground, rgba(121, 121, 121, 0.7));
        }
        
        /* Enhanced inline code styling */
        .inline-code {
            background: var(--vscode-textCodeBlock-background, rgba(255, 255, 255, 0.08));
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', 'Courier New', monospace);
            font-size: 0.85em;
            color: var(--vscode-textPreformat-foreground, #ce9178);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
        }

        /* Task result styling */
        .message-content details {
            margin: 8px 0;
            padding: 8px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .message-content summary {
            cursor: pointer;
            font-weight: bold;
            padding: 4px;
        }

        .message-content summary:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .message-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }

        .message-content table td, .message-content table th {
            padding: 8px;
            border: 1px solid var(--vscode-panel-border);
            text-align: left;
        }

        .message-content table th {
            background: var(--vscode-editor-selectionBackground);
            font-weight: bold;
        }

        .message-content pre {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 8px 0;
        }

        .message-content h4 {
            margin: 12px 0 8px 0;
            color: var(--vscode-foreground);
        }

        .input-container {
            display: flex;
            gap: 10px;
        }

        .message-input {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 8px;
            font-family: inherit;
            font-size: inherit;
            resize: vertical;
            min-height: 60px;
        }

        .send-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 15px;
            border-radius: 3px;
            cursor: pointer;
            align-self: flex-end;
        }

        .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .send-btn:disabled {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
        }

        .loading {
            display: none;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .error {
            color: var(--vscode-errorForeground);
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px;
            border-radius: 3px;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h3 style="margin: 0;">CodeCompanion Chat</h3>
        <button class="new-chat-btn" onclick="newChat()">New Chat</button>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="loading" id="loading">CodeCompanion is thinking...</div>
        <div id="messages"></div>
    </div>

    <div class="input-container">
        <div style="display:flex; align-items:center; margin-bottom:8px; gap:8px;">
            <label for="modeSelect" style="font-size:12px;">Mode:</label>
            <select id="modeSelect" style="flex:0 0 auto;">
                <option value="chat" selected>Chat</option>
                <option value="agentic">Agentic</option>
            </select>
        </div>

        <textarea 
            class="message-input" 
            id="messageInput" 
            placeholder="Ask CodeCompanion anything about your code..."
            onkeydown="handleKeyDown(event)"
        ></textarea>
        <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isProcessing = false;

        // Simple markdown processor that avoids backtick issues
        function processMarkdown(text) {
            if (!text || typeof text !== 'string') return '';
            
            // Escape HTML first
            let processed = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            
            // Replace triple backticks with code blocks
            // Using split and join to avoid regex with backticks
            const parts = processed.split(String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96));
            if (parts.length > 1) {
                processed = '';
                for (let i = 0; i < parts.length; i++) {
                    if (i % 2 === 0) {
                        // Regular text
                        processed += parts[i];
                    } else {
                        // Code block
                        const lines = parts[i].split('\\n');
                        const lang = lines[0].trim() || '';
                        const code = lines.slice(1).join('\\n').trim();
                        if (code) {
                            // Only show the code content, not the language identifier
                            processed += '<div class="code-block">' + code + '</div>';
                        } else {
                            // If there's no code after the language, treat the whole thing as code
                            processed += '<div class="code-block">' + parts[i].trim() + '</div>';
                        }
                    }
                }
            }
            
            // Replace single backticks with inline code
            const singleBacktick = String.fromCharCode(96);
            const inlineParts = processed.split(singleBacktick);
            if (inlineParts.length > 1) {
                processed = '';
                for (let i = 0; i < inlineParts.length; i++) {
                    if (i % 2 === 0) {
                        processed += inlineParts[i];
                    } else {
                        processed += '<span class="inline-code">' + inlineParts[i] + '</span>';
                    }
                }
            }
            
            // Convert newlines to breaks
            processed = processed.replace(/\\n/g, '<br>');
            
            return processed;
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const text = input.value.trim();
            
            if (text && !isProcessing) {
                isProcessing = true;
                updateUI();
                
                const mode = document.getElementById('modeSelect').value;
                vscode.postMessage({
                    command: 'sendMessage',
                    text: text,
                    mode: mode
                });
                
                input.value = '';
            }
        }

        function handleKeyDown(event) {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                sendMessage();
            }
        }

        function newChat() {
            vscode.postMessage({
                command: 'newSession'
            });
        }

        function editPlan(taskType, stepsB64, paramsB64) {
            try {
                const currentSteps = JSON.parse(atob(stepsB64));
                const params = JSON.parse(atob(paramsB64));
                const edited = prompt('Edit execution plan (JSON array)', JSON.stringify(currentSteps, null, 2));
                if (!edited) return;
                const newSteps = JSON.parse(edited);
                vscode.postMessage({
                    command: 'editPlan',
                    taskType: taskType,
                    params: params,
                    steps: newSteps
                });
            } catch (err) {
                alert('Invalid JSON');
            }
        }

        function updateUI() {
            const loading = document.getElementById('loading');
            const sendBtn = document.getElementById('sendBtn');
            
            if (isProcessing) {
                loading.style.display = 'block';
                sendBtn.disabled = true;
                sendBtn.textContent = 'Sending...';
            } else {
                loading.style.display = 'none';
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
            }
        }

        function renderMessages(messages) {
            const container = document.getElementById('messages');
            container.innerHTML = '';
            
            messages.forEach(message => {
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${message.role}\`;
                
                const header = document.createElement('div');
                header.className = 'message-header';
                header.textContent = \`\${message.role === 'user' ? 'You' : 'CodeCompanion'} - \${new Date(message.timestamp).toLocaleTimeString()}\`;
                
                const content = document.createElement('div');
                content.className = 'message-content';
                if (message.role === 'assistant') {
                    // Check if it's a task result (pre-formatted HTML)
                    // Task results contain specific markers like task status symbols and details tags
                    if (message.content && (
                        message.content.indexOf('✅') !== -1 || 
                        message.content.indexOf('❌') !== -1 ||
                        message.content.indexOf('<details') !== -1 ||
                        message.content.indexOf('<table') !== -1
                    )) {
                        content.innerHTML = message.content;
                    } else {
                        // Process markdown for regular messages
                        content.innerHTML = processMarkdown(message.content);
                    }
                } else {
                    content.textContent = message.content;
                }
                
                messageDiv.appendChild(header);
                messageDiv.appendChild(content);
                container.appendChild(messageDiv);
            });
            
            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'updateChat':
                    if (message.session) {
                        renderMessages(message.session.messages);
                    }
                    isProcessing = false;
                    updateUI();
                    break;
            }
        });

        // Focus input on load
        document.getElementById('messageInput').focus();
    </script>
</body>
</html>`;
    }

    /** Handle plan edited in the webview: run custom plan and append result. */
    private async _handleEditPlan(message: { taskType: TaskType; params: any; steps: TaskStep[] }) {
        if (!this._currentSessionId || !this._view) return;

        const session = this._sessions.get(this._currentSessionId);
        if (!session) return;

        // Show placeholder
        const placeholder: ChatMessage = {
            role: 'assistant',
            content: 'Executing custom plan, please wait…',
            timestamp: new Date()
        };
        session.messages.push(placeholder);
        this._updateWebview();

        try {
            const result = await this._manager.runCustomPlan(message.taskType, message.params, message.steps);
            placeholder.content = this._buildTaskResultMessage(result);
            placeholder.timestamp = new Date();
        } catch (err) {
            placeholder.content = `Error: ${err instanceof Error ? err.message : String(err)}`;
            placeholder.timestamp = new Date();
        }

        session.lastActivity = new Date();
        this._updateWebview();
    }

    dispose() {
        this._sessions.clear();
    }
} 