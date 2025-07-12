import * as vscode from 'vscode';
import { CodeCompanionManager } from './manager';
import { ChatPanel } from './ui/chat';
import { TaskPanel } from './ui/tasks';
import { StatusBar } from './ui/status';

let manager: CodeCompanionManager;
let chatPanel: ChatPanel;
let taskPanel: TaskPanel;
let statusBar: StatusBar;

export function activate(context: vscode.ExtensionContext) {
    console.log('CodeCompanion extension is now active!');

    // Initialize core components
    manager = new CodeCompanionManager(context);
    chatPanel = new ChatPanel(context, manager);
    taskPanel = new TaskPanel(context, manager);
    statusBar = new StatusBar(manager);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('codeCompanion.startChat', () => {
            chatPanel.show();
        }),
        vscode.commands.registerCommand('codeCompanion.refactorCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            const selection = editor.selection;
            const text = editor.document.getText(selection);
            
            if (!text) {
                vscode.window.showWarningMessage('Please select code to refactor');
                return;
            }

            await manager.executeTask('refactor', {
                code: text,
                filePath: editor.document.fileName,
                selection: {
                    start: selection.start,
                    end: selection.end
                }
            });
        }),
        vscode.commands.registerCommand('codeCompanion.implementFeature', async () => {
            const feature = await vscode.window.showInputBox({
                prompt: 'Describe the feature you want to implement',
                placeHolder: 'e.g., Add user authentication with JWT tokens'
            });

            if (feature) {
                await manager.executeTask('implement', {
                    description: feature,
                    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });
            }
        }),
        vscode.commands.registerCommand('codeCompanion.fixBugs', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            // Get diagnostics for the current file
            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
            
            if (diagnostics.length === 0) {
                vscode.window.showInformationMessage('No errors or warnings found in the current file');
                return;
            }

            await manager.executeTask('fix', {
                filePath: editor.document.fileName,
                diagnostics: diagnostics.map(d => ({
                    message: d.message,
                    range: d.range,
                    severity: d.severity
                }))
            });
        }),
        vscode.commands.registerCommand('codeCompanion.reviewCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            const selection = editor.selection;
            const text = editor.document.getText(selection);
            
            if (!text) {
                vscode.window.showWarningMessage('Please select code to review');
                return;
            }

            await manager.executeTask('review', {
                code: text,
                filePath: editor.document.fileName,
                language: editor.document.languageId
            });
        }),
        vscode.commands.registerCommand('codeCompanion.showSidebar', () => {
            vscode.commands.executeCommand('workbench.view.extension.codeCompanionSidebar');
        }),
        vscode.commands.registerCommand('codeCompanion.updateStatus', (statusText?: string) => {
            statusBar.updateStatus(statusText);
        }),
        vscode.commands.registerCommand('codeCompanion.refreshTasks', () => {
            taskPanel.update();
        })
    ];

    // Register views
    const chatView = vscode.window.registerWebviewViewProvider('codeCompanionChat', chatPanel);
    const taskView = vscode.window.registerWebviewViewProvider('codeCompanionTasks', taskPanel);

    // Add disposables to context
    context.subscriptions.push(
        manager,
        chatPanel,
        taskPanel,
        statusBar,
        chatView,
        taskView,
        ...commands
    );

    // Initialize status bar
    statusBar.initialize();

    // Show welcome message
    vscode.window.showInformationMessage(
        'CodeCompanion is ready! Use the command palette or sidebar to get started.',
        'Start Chat',
        'View Tasks'
    ).then(selection => {
        if (selection === 'Start Chat') {
            chatPanel.show();
        } else if (selection === 'View Tasks') {
            taskPanel.show();
        }
    });
}

export function deactivate() {
    console.log('CodeCompanion extension is now deactivated');
    
    if (manager) {
        manager.dispose();
    }
    if (chatPanel) {
        chatPanel.dispose();
    }
    if (taskPanel) {
        taskPanel.dispose();
    }
    if (statusBar) {
        statusBar.dispose();
    }
} 