export type TaskType = 'refactor' | 'implement' | 'fix' | 'review' | 'test' | 'document';

export type TaskStatus = 'planning' | 'analyzing' | 'executing' | 'completed' | 'failed' | 'cancelled';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskStep {
    id: string;
    name: string;
    description: string;
    // Extended with additional step types such as `test` and `documentation` so they can be handled explicitly by the executor/renderers.
    type: 'code_generation' | 'file_operation' | 'terminal_command' | 'analysis' | 'design' | 'test' | 'documentation';
    status: StepStatus;
    startedAt?: Date;
    completedAt?: Date;
    result?: any;
    error?: string;
    parameters: Record<string, any>;
}

export interface Task {
    id: string;
    type: TaskType;
    params: Record<string, any>;
    status: TaskStatus;
    createdAt: Date;
    completedAt?: Date;
    error?: string;
    steps: TaskStep[];
    context?: TaskContext;
    estimatedDuration?: number;
    currentStep?: number;
    progress?: number;
}

export interface TaskResult {
    taskId: string;
    type: TaskType;
    success: boolean;
    results?: any[];
    /**
     * Full execution plan including per-step status and results. Useful for displaying expandable details in the chat or tasks UIs.
     */
    steps?: TaskStep[];
    error?: string;
    context?: TaskContext;
    duration: number;
    /** Input params used to create the task (stored so we can retry later) */
    params?: Record<string, any>;
}

export interface TaskContext {
    workspaceRoot?: string;
    currentFile?: string;
    language?: string;
    projectType?: string;
    dependencies?: string[];
    gitInfo?: GitInfo;
    userPreferences?: UserPreferences;
    recentChanges?: FileChange[];
    /** List of currently open/visible files in the editor */
    openFiles?: string[];
    /** npm/yarn/pnpm scripts detected from package.json, if any */
    scripts?: Record<string, string>;
}

export interface GitInfo {
    branch: string;
    lastCommit: string;
    hasUncommittedChanges: boolean;
    remoteUrl?: string;
}

export interface UserPreferences {
    codingStyle: 'functional' | 'oop' | 'procedural';
    framework?: string;
    testingFramework?: string;
    documentationStyle?: string;
    maxLineLength?: number;
    indentationSize?: number;
    useTypeScript?: boolean;
}

export interface FileChange {
    filePath: string;
    changeType: 'created' | 'modified' | 'deleted';
    timestamp: Date;
    description?: string;
}

export interface SafetyValidation {
    safe: boolean;
    reason?: string;
    warnings?: string[];
    recommendations?: string[];
}

export interface LLMResponse {
    content: string;
    tokens: number;
    model: string;
    duration: number;
}

export interface CodeGenerationRequest {
    prompt: string;
    context: TaskContext;
    language: string;
    filePath?: string;
    existingCode?: string;
    requirements?: string[];
}

export interface CodeGenerationResult {
    code: string;
    explanation: string;
    confidence: number;
    suggestions?: string[];
}

export interface RefactoringRequest {
    code: string;
    language: string;
    goal: string;
    constraints?: string[];
    filePath?: string;
}

export interface RefactoringResult {
    originalCode: string;
    refactoredCode: string;
    changes: CodeChange[];
    explanation: string;
    benefits: string[];
}

export interface CodeChange {
    type: 'addition' | 'deletion' | 'modification' | 'replacement';
    lineStart: number;
    lineEnd: number;
    oldCode?: string;
    newCode?: string;
    description: string;
}

export interface BugFixRequest {
    errorMessage: string;
    stackTrace?: string;
    code: string;
    language: string;
    filePath: string;
    lineNumber?: number;
}

export interface BugFixResult {
    originalCode: string;
    fixedCode: string;
    changes: CodeChange[];
    explanation: string;
    rootCause: string;
    preventionTips: string[];
}

export interface CodeReviewRequest {
    code: string;
    language: string;
    filePath?: string;
    reviewType: 'general' | 'security' | 'performance' | 'style';
}

export interface CodeReviewResult {
    score: number;
    issues: ReviewIssue[];
    suggestions: string[];
    positiveAspects: string[];
    overallAssessment: string;
}

export interface ReviewIssue {
    type: 'error' | 'warning' | 'info' | 'suggestion';
    severity: 'low' | 'medium' | 'high' | 'critical';
    line?: number;
    message: string;
    suggestion?: string;
    category: 'security' | 'performance' | 'style' | 'maintainability' | 'readability';
}

export interface OllamaConfig {
    url: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    context?: TaskContext;
}

export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    createdAt: Date;
    lastActivity: Date;
    context?: TaskContext;
} 