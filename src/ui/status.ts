import * as vscode from 'vscode';
import { CodeCompanionManager } from '../manager';

export class StatusBar {
    private _statusBarItem: vscode.StatusBarItem;
    private _manager: CodeCompanionManager;

    constructor(manager: CodeCompanionManager) {
        this._manager = manager;
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._statusBarItem.command = 'codeCompanion.startChat';
        this._statusBarItem.tooltip = 'Click to open CodeCompanion chat';
    }

    public initialize() {
        this._statusBarItem.text = '$(lightbulb) CodeCompanion';
        this._statusBarItem.show();
        this.updateStatus();
    }

    public updateStatus(statusText?: string) {
        const activeTasks = this._manager.getActiveTasks();
        if (activeTasks.length > 0) {
            const runningTasks = activeTasks.filter(task => 
                task.status === 'planning' || task.status === 'analyzing' || task.status === 'executing'
            );
            if (runningTasks.length > 0) {
                this._statusBarItem.text = `$(sync~spin) CodeCompanion: ${runningTasks.length} active`;
                this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            } else {
                this._statusBarItem.text = '$(lightbulb) CodeCompanion: Ready';
                this._statusBarItem.backgroundColor = undefined;
            }
        } else {
            this._statusBarItem.text = '$(lightbulb) CodeCompanion';
            this._statusBarItem.backgroundColor = undefined;
        }
        if (statusText) {
            this._statusBarItem.tooltip = statusText;
        } else {
            this._statusBarItem.tooltip = 'Click to open CodeCompanion chat';
        }
    }

    public showError(message: string) {
        this._statusBarItem.text = '$(error) CodeCompanion: Error';
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('errorForeground');
        this._statusBarItem.tooltip = message;
    }

    public showSuccess(message: string) {
        this._statusBarItem.text = '$(check) CodeCompanion: Success';
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        this._statusBarItem.tooltip = message;
        setTimeout(() => {
            this.updateStatus();
        }, 3000);
    }

    public dispose() {
        this._statusBarItem.dispose();
    }
} 