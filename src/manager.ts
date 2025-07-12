import * as vscode from 'vscode';
import { TaskPlanner } from './agent/planner';
import { ContextAnalyzer } from './agent/context';
import { CodeExecutor } from './agent/executor';
import { SafetyValidator } from './agent/safety';
import { OllamaClient } from './llm/ollama';
import { OpenAIClient } from './llm/openai';
import { LLMProvider } from './llm/provider';
import { Task, TaskType, TaskResult, TaskContext, TaskStep } from './types';

export class CodeCompanionManager implements vscode.Disposable {
    private planner: TaskPlanner;
    private contextAnalyzer: ContextAnalyzer;
    private executor: CodeExecutor;
    private safetyValidator: SafetyValidator;
    private llmProvider: LLMProvider;
    private activeTasks: Map<string, Task> = new Map();
    private taskHistory: TaskResult[] = [];
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('CodeCompanion');
        this.outputChannel.appendLine('CodeCompanion manager initialized');

        // Load persisted history if available
        const persistedHistory: any[] | undefined = context.globalState.get('codeCompanion.taskHistory');
        if (persistedHistory && Array.isArray(persistedHistory)) {
            this.taskHistory = persistedHistory as any;
        }

        const config = vscode.workspace.getConfiguration('codeCompanion');
        const providerId = config.get<string>('llmProvider', 'ollama');

        if (providerId === 'openai') {
            this.llmProvider = new OpenAIClient();
        } else {
            this.llmProvider = new OllamaClient();
        }

        this.planner = new TaskPlanner(this.llmProvider);
        this.contextAnalyzer = new ContextAnalyzer();
        this.executor = new CodeExecutor(this.llmProvider);
        this.safetyValidator = new SafetyValidator();
    }

    async executeTask(type: TaskType, params: any): Promise<TaskResult> {
        this.log(`Starting task ${type}`);
        const taskId = this.generateTaskId();
        const task: Task = {
            id: taskId,
            type,
            params,
            status: 'planning',
            createdAt: new Date(),
            steps: []
        };

        this.activeTasks.set(taskId, task);
        this.updateStatusBar();

        try {
            // Step 1: Analyze context
            task.status = 'analyzing';
            const context = await this.contextAnalyzer.analyze(params);
            task.context = context;

            // Step 2: Plan task execution
            task.status = 'planning';
            const plan = await this.planner.createPlan(type, params, context);
            task.steps = plan.steps;
            task.estimatedDuration = plan.estimatedDuration;

            // Step 3: Execute each step
            task.status = 'executing';
            const results: any[] = [];

            for (let i = 0; i < task.steps.length; i++) {
                // If the task was cancelled from the UI (removed from activeTasks), abort gracefully
                if (!this.activeTasks.has(taskId)) {
                    this.log(`Task ${taskId} was cancelled; aborting remaining steps.`);
                    throw new Error('Task cancelled by user');
                }

                const step = task.steps[i];
                if (!step) continue;
                step.status = 'running';
                step.startedAt = new Date();

                try {
                    // Validate step for safety
                    const validation = await this.safetyValidator.validateStep(step, context);
                    if (!validation.safe) {
                        this.log(`Safety validation failed for step ${step.id}: ${validation.reason}`);
                        throw new Error(`Safety validation failed: ${validation.reason}`);
                    }

                    // Execute step
                    const result = await this.executor.executeStep(step, context);
                    step.status = 'completed';
                    step.completedAt = new Date();
                    step.result = result;

                    // Collect result for task summary
                    results.push(result);

                    // Update progress
                    this.updateTaskProgress(task, i + 1, task.steps.length);
                    this.log(`Step completed: ${step.id}`);

                } catch (error) {
                    this.log(`Step failed: ${step.id} - ${error instanceof Error ? error.message : String(error)}`);
                    step.status = 'failed';
                    step.error = error instanceof Error ? error.message : String(error);
                    step.completedAt = new Date();
                    throw error;
                }
            }

            // Step 4: Complete task
            task.status = 'completed';
            task.completedAt = new Date();
            this.log(`Task completed: ${taskId}`);

            const taskResult: TaskResult = {
                taskId,
                type,
                success: true,
                results,
                steps: task.steps,
                context,
                duration: task.completedAt.getTime() - task.createdAt.getTime(),
                // Store original params to allow retry functionality
                params: task.params
            } as any; // Cast to any until TaskResult typed with params

            this.pushToHistory(taskResult);
            this.activeTasks.delete(taskId);
            this.updateStatusBar();

            return taskResult;

        } catch (error) {
            this.log(`Task failed: ${error instanceof Error ? error.message : String(error)}`);
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : String(error);
            task.completedAt = new Date();

            const taskResult: TaskResult = {
                taskId,
                type,
                success: false,
                error: task.error,
                steps: task.steps,
                context: task.context,
                duration: task.completedAt.getTime() - task.createdAt.getTime(),
                params: task.params
            } as any;

            this.pushToHistory(taskResult);
            this.activeTasks.delete(taskId);
            this.updateStatusBar();

            throw error;
        }
    }

    async chat(message: string, context?: TaskContext): Promise<string> {
        const prompt = this.buildChatPrompt(message, context);
        const response = await this.llmProvider.generate(prompt);
        return response;
    }

    public async getCurrentContext(): Promise<TaskContext> {
        return await this.contextAnalyzer.analyze({});
    }

    getActiveTasks(): Task[] {
        return Array.from(this.activeTasks.values());
    }

    getTaskHistory(): TaskResult[] {
        return this.taskHistory;
    }

    getTaskById(taskId: string): Task | undefined {
        return this.activeTasks.get(taskId);
    }

    async cancelTask(taskId: string): Promise<boolean> {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            return false;
        }

        task.status = 'cancelled';
        task.completedAt = new Date();
        this.activeTasks.delete(taskId);
        this.updateStatusBar();

        return true;
    }

    /** Execute a task using a user-supplied execution plan (steps). */
    async runCustomPlan(type: TaskType, params: any, customSteps: TaskStep[]): Promise<TaskResult> {
        const taskId = this.generateTaskId();
        const task: Task = {
            id: taskId,
            type,
            params,
            status: 'executing',
            createdAt: new Date(),
            steps: customSteps
        };

        this.activeTasks.set(taskId, task);
        this.updateStatusBar();

        try {
            // Gather context once for the whole task
            const context = await this.contextAnalyzer.analyze(params);
            task.context = context;

            const results: any[] = [];

            for (let i = 0; i < task.steps.length; i++) {
                if (!this.activeTasks.has(taskId)) {
                    throw new Error('Task cancelled by user');
                }

                const step = task.steps[i]!; // we know array has defined elements
                step.status = 'running';
                step.startedAt = new Date();

                const validation = await this.safetyValidator.validateStep(step, context);
                if (!validation.safe) {
                    throw new Error(`Safety validation failed: ${validation.reason}`);
                }

                try {
                    const result = await this.executor.executeStep(step, context);
                    step.status = 'completed';
                    step.completedAt = new Date();
                    step.result = result;
                    results.push(result);
                    this.updateTaskProgress(task, i + 1, task.steps.length);
                } catch (err) {
                    step.status = 'failed';
                    step.error = err instanceof Error ? err.message : String(err);
                    step.completedAt = new Date();
                    throw err;
                }
            }

            task.status = 'completed';
            task.completedAt = new Date();

            const taskResult: TaskResult = {
                taskId,
                type,
                success: true,
                results,
                steps: task.steps,
                context,
                duration: task.completedAt.getTime() - task.createdAt.getTime(),
                params
            };

            this.pushToHistory(taskResult);
            this.activeTasks.delete(taskId);
            this.updateStatusBar();

            return taskResult;

        } catch (error) {
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : String(error);
            task.completedAt = new Date();

            const taskResult: TaskResult = {
                taskId,
                type,
                success: false,
                error: task.error,
                steps: task.steps,
                context: task.context,
                duration: task.completedAt.getTime() - task.createdAt.getTime(),
                params
            };

            this.pushToHistory(taskResult);
            this.activeTasks.delete(taskId);
            this.updateStatusBar();

            throw error;
        }
    }

    /**
     * Retry a previously failed or cancelled task by spawning a new task with the same type and params.
     * Returns the new TaskResult once finished.
     */
    async retryTask(originalTaskId: string): Promise<TaskResult> {
        // Try to locate task in history first
        const historyItem = this.taskHistory.find(t => t.taskId === originalTaskId);
        if (!historyItem) {
            throw new Error('Task not found in history');
        }

        const originalParams = (historyItem as any).params || {};
        return await this.executeTask(historyItem.type as TaskType, originalParams);
    }

    private generateTaskId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private buildChatPrompt(message: string, context?: TaskContext): string {
        let prompt = `You are CodeCompanion, an AI coding assistant. Help the user with their request: "${message}"\n\n`;

        if (context) {
            prompt += `Context:\n`;
            if (context.currentFile) {
                prompt += `- Current file: ${context.currentFile}\n`;
            }
            if (context.workspaceRoot) {
                prompt += `- Workspace: ${context.workspaceRoot}\n`;
            }
            if (context.language) {
                prompt += `- Language: ${context.language}\n`;
            }
            prompt += '\n';
        }

        prompt += `Provide a helpful, actionable response. If the request involves code changes, explain what you would do and ask for confirmation before proceeding.`;

        return prompt;
    }

    private updateTaskProgress(task: Task, currentStep: number, totalSteps: number): void {
        task.currentStep = currentStep;
        task.progress = (currentStep / totalSteps) * 100;
        this.updateStatusBar();
    }

    private updateStatusBar(): void {
        const activeCount = this.activeTasks.size;
        const statusText = activeCount > 0 ? `CodeCompanion: ${activeCount} active task(s)` : 'CodeCompanion: Ready';
        
        // This will be handled by the StatusBar class
        vscode.commands.executeCommand('codeCompanion.updateStatus', statusText);
        // Notify task panel to refresh its data
        vscode.commands.executeCommand('codeCompanion.refreshTasks');

        this.log(statusText);
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    private pushToHistory(result: TaskResult): void {
        // Keep only the latest 50 results to prevent unbounded growth
        this.taskHistory.push(result);
        if (this.taskHistory.length > 50) {
            this.taskHistory.shift();
        }
        // Persist to global storage
        this.context.globalState.update('codeCompanion.taskHistory', this.taskHistory);
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.activeTasks.clear();
        this.taskHistory = [];
        this.llmProvider.dispose?.();
    }
} 