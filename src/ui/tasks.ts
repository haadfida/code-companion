import * as vscode from 'vscode';
import { CodeCompanionManager } from '../manager';
import { Task, TaskResult } from '../types';

export class TaskPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeCompanionTasks';
    private _view?: vscode.WebviewView;

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
            (message: any) => {
                switch (message.command) {
                    case 'cancelTask':
                        this._cancelTask(message.taskId);
                        break;
                    case 'viewTaskDetails':
                        this._viewTaskDetails(message.taskId);
                        break;
                    case 'retryTask':
                        this._retryTask(message.taskId);
                        break;
                }
            }
        );

        // Initial update
        this._updateWebview();
    }

    public show() {
        if (this._view) {
            this._view.show(true);
        } else {
            vscode.commands.executeCommand('codeCompanionTasks.focus');
        }
    }

    public update() {
        this._updateWebview();
    }

    private async _cancelTask(taskId: string) {
        try {
            const cancelled = await this._manager.cancelTask(taskId);
            if (cancelled) {
                vscode.window.showInformationMessage('Task cancelled successfully');
                this._updateWebview();
            } else {
                vscode.window.showWarningMessage('Task not found or already completed');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async _retryTask(taskId: string) {
        try {
            vscode.window.showInformationMessage('Retrying task…');
            await this._manager.retryTask(taskId);
            this._updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to retry task: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private _viewTaskDetails(taskId: string) {
        const task = this._manager.getTaskById(taskId);
        if (task) {
            // Show task details in a new editor
            const content = this._formatTaskDetails(task);
            const document = vscode.workspace.openTextDocument({
                content,
                language: 'markdown'
            });
            document.then(doc => vscode.window.showTextDocument(doc));
        }
    }

    private _formatTaskDetails(task: Task): string {
        return `# Task Details: ${task.type}

## Status: ${task.status}
- Created: ${task.createdAt.toLocaleString()}
- ${task.completedAt ? `Completed: ${task.completedAt.toLocaleString()}` : 'In Progress'}

## Steps (${task.steps.length}):
${task.steps.map((step, index) => `
### ${index + 1}. ${step.name}
- **Status**: ${step.status}
- **Type**: ${step.type}
- **Description**: ${step.description}
${step.startedAt ? `- **Started**: ${step.startedAt.toLocaleString()}` : ''}
${step.completedAt ? `- **Completed**: ${step.completedAt.toLocaleString()}` : ''}
${step.error ? `- **Error**: ${step.error}` : ''}
${step.result ? `- **Result**: ${JSON.stringify(step.result, null, 2)}` : ''}
`).join('\n')}

${task.error ? `## Error\n${task.error}` : ''}

${task.progress !== undefined ? `## Progress: ${task.progress.toFixed(1)}%` : ''}
`;
    }

    private _updateWebview() {
        if (this._view) {
            const activeTasks = this._manager.getActiveTasks();
            const taskHistory = this._manager.getTaskHistory();

            this._view.webview.postMessage({
                command: 'updateTasks',
                activeTasks,
                taskHistory
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeCompanion Tasks</title>
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
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h3 {
            margin: 0;
        }
        .tabs {
            display: flex;
            margin-bottom: 10px;
        }
        .tab {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 8px 15px;
            cursor: pointer;
            border-radius: 3px 3px 0 0;
            margin-right: 2px;
        }
        .tab.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .tab-content {
            display: none;
            flex: 1;
            overflow-y: auto;
        }
        .tab-content.active {
            display: block;
        }
        .task-item {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 10px;
            margin-bottom: 8px;
        }
        .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        .task-title {
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        .task-status {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .status-planning { background: var(--vscode-textPreformat-background); }
        .status-analyzing { background: var(--vscode-textPreformat-background); }
        .status-executing { background: var(--vscode-progressBar-background); }
        .status-completed { background: var(--vscode-notificationsInfoIcon-foreground); }
        .status-failed { background: var(--vscode-errorForeground); }
        .status-cancelled { background: var(--vscode-descriptionForeground); }
        .task-progress {
            margin: 5px 0;
        }
        .progress-bar {
            width: 100%;
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            transition: width 0.3s ease;
        }
        .task-actions {
            display: flex;
            gap: 5px;
            margin-top: 5px;
        }
        .action-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 3px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
        }
        .action-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .action-btn.danger {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .action-btn.danger:hover {
            background: var(--vscode-inputValidation-errorBorder);
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px;
        }
        .task-details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>CodeCompanion Tasks</h3>
    </div>
    <div class="tabs">
        <button class="tab active" onclick="switchTab('active')">Active</button>
        <button class="tab" onclick="switchTab('history')">History</button>
    </div>
    <div class="tab-content active" id="activeTab">
        <div id="activeTasks"></div>
    </div>
    <div class="tab-content" id="historyTab">
        <div id="taskHistory"></div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let currentTab = 'active';
        function switchTab(tabName) {
            currentTab = tabName;
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            event.target.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabName + 'Tab').classList.add('active');
        }
        function cancelTask(taskId) {
            vscode.postMessage({
                command: 'cancelTask',
                taskId: taskId
            });
        }
        function viewTaskDetails(taskId) {
            vscode.postMessage({
                command: 'viewTaskDetails',
                taskId: taskId
            });
        }
        function retryTask(taskId) {
            vscode.postMessage({
                command: 'retryTask',
                taskId: taskId
            });
        }
        function renderTasks(tasks, containerId) {
            const container = document.getElementById(containerId);
            if (tasks.length === 0) {
                container.innerHTML = '<div class="empty-state">No tasks found</div>';
                return;
            }
            container.innerHTML = tasks.map(task => {
                const statusClass = 'status-' + task.status;
                const progress = task.progress || 0;
                const canCancel = task.status === 'planning' || task.status === 'analyzing' || task.status === 'executing';
                return '<div class="task-item">' +
                    '<div class="task-header">' +
                        '<div class="task-title">' + task.type + '</div>' +
                        '<div class="task-status ' + statusClass + '">' + task.status + '</div>' +
                    '</div>' +
                    '<div class="task-details">' +
                        'Created: ' + new Date(task.createdAt).toLocaleTimeString() +
                        (task.currentStep ? ' | Step ' + task.currentStep + '/' + task.steps.length : '') +
                    '</div>' +
                    (task.progress !== undefined ? 
                        '<div class="task-progress">' +
                            '<div class="progress-bar">' +
                                '<div class="progress-fill" style="width: ' + progress + '%"></div>' +
                            '</div>' +
                        '</div>' : '') +
                    '<div class="task-actions">' +
                        '<button class="action-btn" onclick="viewTaskDetails(\\'' + task.id + '\\')">Details</button>' +
                        (canCancel ? '<button class="action-btn danger" onclick="cancelTask(\\'' + task.id + '\\')">Cancel</button>' : '') +
                        (task.status === 'failed' ? '<button class="action-btn" onclick="retryTask(\\'' + task.id + '\\')">Retry</button>' : '') +
                    '</div>' +
                '</div>';
            }).join('');
        }
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateTasks':
                    renderTasks(message.activeTasks, 'activeTasks');
                    renderTasks(message.taskHistory, 'taskHistory');
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose() {
        // Cleanup if needed
    }
} 