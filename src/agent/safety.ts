import { TaskStep, TaskContext, SafetyValidation } from '../types';

export class SafetyValidator {
    private dangerousOperations = [
        'rm -rf',
        'sudo rm -rf',
        'del /s /q',
        'format',
        'dd if=/dev/zero',
        'shred',
        'wipe'
    ];

    private sensitiveFiles = [
        '.env',
        '.git',
        'node_modules',
        'package-lock.json',
        'yarn.lock',
        '.vscode/settings.json',
        'config.json',
        'secrets.json'
    ];

    async validateStep(step: TaskStep, context: TaskContext): Promise<SafetyValidation> {
        const validation: SafetyValidation = {
            safe: true,
            warnings: [],
            recommendations: []
        };

        // Check for dangerous terminal commands
        if (step.type === 'terminal_command') {
            const command = step.parameters.command?.toLowerCase() || '';
            const isDangerous = this.dangerousOperations.some(op => command.includes(op));
            
            if (isDangerous) {
                validation.safe = false;
                validation.reason = `Dangerous command detected: ${step.parameters.command}`;
                validation.warnings!.push('This command could cause data loss or system damage');
                validation.recommendations!.push('Review the command carefully before execution');
            }
        }

        // Check for sensitive file operations
        if (step.type === 'file_operation') {
            const filePath = step.parameters.filePath || '';
            const operation = step.parameters.operation || '';
            
            const isSensitiveFile = this.sensitiveFiles.some(sensitive => 
                filePath.includes(sensitive)
            );
            
            if (isSensitiveFile && (operation === 'delete' || operation === 'replace')) {
                validation.safe = false;
                validation.reason = `Attempting to modify sensitive file: ${filePath}`;
                validation.warnings!.push('This operation could affect project configuration or security');
                validation.recommendations!.push('Backup the file before proceeding');
            }
        }

        // Check for workspace boundary violations
        if (context.workspaceRoot) {
            const filePath = step.parameters.filePath || '';
            if (filePath && !filePath.startsWith(context.workspaceRoot)) {
                validation.safe = false;
                validation.reason = `Operation outside workspace boundary: ${filePath}`;
                validation.warnings!.push('This operation targets files outside the current workspace');
                validation.recommendations!.push('Ensure the file path is within the workspace');
            }
        }

        // Check for git repository modifications
        if (context.gitInfo?.hasUncommittedChanges && step.type === 'file_operation') {
            validation.warnings!.push('There are uncommitted changes in the git repository');
            validation.recommendations!.push('Consider committing or stashing changes before proceeding');
        }

        // Check for large file operations
        if (step.type === 'file_operation' && step.parameters.content) {
            const contentSize = step.parameters.content.length;
            if (contentSize > 1000000) { // 1MB
                validation.warnings!.push('Large file operation detected');
                validation.recommendations!.push('Consider breaking this into smaller operations');
            }
        }

        // Check for recursive operations
        if (step.type === 'terminal_command') {
            const command = step.parameters.command || '';
            if (command.includes('**') || command.includes('/*') || command.includes('\\*')) {
                validation.warnings!.push('Recursive operation detected');
                validation.recommendations!.push('Verify the scope of this operation');
            }
        }

        return validation;
    }

    validateCodeGeneration(code: string, context: TaskContext): SafetyValidation {
        const validation: SafetyValidation = {
            safe: true,
            warnings: [],
            recommendations: []
        };

        // Check for potential security issues
        const securityPatterns = [
            /eval\s*\(/,
            /exec\s*\(/,
            /system\s*\(/,
            /shell_exec\s*\(/,
            /passthru\s*\(/,
            /`.*`/, // Backticks for command execution
            /process\.exec/,
            /child_process\.spawn/,
            /require\s*\(.*http/,
            /fetch\s*\(.*http/
        ];

        for (const pattern of securityPatterns) {
            if (pattern.test(code)) {
                validation.warnings!.push('Potential security issue detected in generated code');
                validation.recommendations!.push('Review the code for security vulnerabilities');
                break;
            }
        }

        // Check for hardcoded credentials
        const credentialPatterns = [
            /password\s*=\s*['"][^'"]+['"]/,
            /api_key\s*=\s*['"][^'"]+['"]/,
            /secret\s*=\s*['"][^'"]+['"]/,
            /token\s*=\s*['"][^'"]+['"]/
        ];

        for (const pattern of credentialPatterns) {
            if (pattern.test(code)) {
                validation.warnings!.push('Hardcoded credentials detected');
                validation.recommendations!.push('Use environment variables or secure configuration management');
                break;
            }
        }

        // Check for infinite loops
        const loopPatterns = [
            /while\s*\(\s*true\s*\)/,
            /for\s*\(\s*;\s*;\s*\)/,
            /while\s*\(\s*1\s*\)/
        ];

        for (const pattern of loopPatterns) {
            if (pattern.test(code)) {
                validation.warnings!.push('Potential infinite loop detected');
                validation.recommendations!.push('Ensure proper exit conditions are in place');
                break;
            }
        }

        return validation;
    }

    validateRefactoring(originalCode: string, refactoredCode: string): SafetyValidation {
        const validation: SafetyValidation = {
            safe: true,
            warnings: [],
            recommendations: []
        };

        // Check if refactoring preserves functionality
        const originalLines = originalCode.split('\n').length;
        const refactoredLines = refactoredCode.split('\n').length;
        
        if (Math.abs(originalLines - refactoredLines) > originalLines * 0.5) {
            validation.warnings!.push('Significant code structure change detected');
            validation.recommendations!.push('Verify that functionality is preserved');
        }

        // Check for removed important patterns
        const importantPatterns = [
            /export\s+/,
            /import\s+/,
            /function\s+/,
            /class\s+/,
            /return\s+/,
            /throw\s+/
        ];

        for (const pattern of importantPatterns) {
            const originalMatches = (originalCode.match(pattern) || []).length;
            const refactoredMatches = (refactoredCode.match(pattern) || []).length;
            
            if (originalMatches > 0 && refactoredMatches === 0) {
                validation.warnings!.push('Important code patterns may have been removed');
                validation.recommendations!.push('Review the refactored code for completeness');
                break;
            }
        }

        return validation;
    }
} 