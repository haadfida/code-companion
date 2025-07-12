import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TaskContext, GitInfo, UserPreferences, FileChange } from '../types';

export class ContextAnalyzer {
    async analyze(params: any): Promise<TaskContext> {
        const context: TaskContext = {};

        // Get workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0 && workspaceFolders[0]) {
            context.workspaceRoot = workspaceFolders[0].uri.fsPath;
        }

        // Get current file info
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            context.currentFile = activeEditor.document.fileName;
            context.language = activeEditor.document.languageId;
        }

        // Analyze project structure
        if (context.workspaceRoot) {
            context.projectType = await this.detectProjectType(context.workspaceRoot);
            context.dependencies = await this.getDependencies(context.workspaceRoot);
        }

        // Get Git information
        if (context.workspaceRoot) {
            context.gitInfo = await this.getGitInfo(context.workspaceRoot);
        }

        // Get user preferences
        context.userPreferences = this.getUserPreferences();

        // Gather list of open/visible files to feed into LLM context
        context.openFiles = Array.from(new Set(vscode.window.visibleTextEditors.map(ed => ed.document.fileName)));

        // Extract npm scripts from package.json if present
        if (context.workspaceRoot) {
            const pkgPath = path.join(context.workspaceRoot, 'package.json');
            if (await this.fileExists(pkgPath)) {
                try {
                    const pkgRaw = await fs.promises.readFile(pkgPath, 'utf8');
                    const pkgJson = JSON.parse(pkgRaw);
                    if (pkgJson.scripts && typeof pkgJson.scripts === 'object') {
                        context.scripts = pkgJson.scripts;
                    }
                } catch (err) {
                    console.warn('CodeCompanion: failed to parse package.json scripts –', err instanceof Error ? err.message : String(err));
                }
            }
        }

        // Get recent changes
        context.recentChanges = await this.getRecentChanges(context.workspaceRoot);

        return context;
    }

    private async detectProjectType(workspaceRoot: string): Promise<string> {
        const files = await fs.promises.readdir(workspaceRoot);
        
        if (files.includes('package.json')) {
            return 'node';
        } else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
            return 'python';
        } else if (files.includes('Cargo.toml')) {
            return 'rust';
        } else if (files.includes('go.mod')) {
            return 'go';
        } else if (files.includes('pom.xml') || files.includes('build.gradle')) {
            return 'java';
        } else if (files.includes('Gemfile')) {
            return 'ruby';
        } else if (files.includes('composer.json')) {
            return 'php';
        } else if (files.includes('.csproj') || files.includes('.sln')) {
            return 'csharp';
        } else if (files.includes('CMakeLists.txt') || files.includes('Makefile')) {
            return 'cpp';
        }
        
        return 'unknown';
    }

    private async getDependencies(workspaceRoot: string): Promise<string[]> {
        const dependencies: string[] = [];
        
        try {
            // Check for package.json
            const packageJsonPath = path.join(workspaceRoot, 'package.json');
            if (await this.fileExists(packageJsonPath)) {
                const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'));
                if (packageJson.dependencies) {
                    dependencies.push(...Object.keys(packageJson.dependencies));
                }
                if (packageJson.devDependencies) {
                    dependencies.push(...Object.keys(packageJson.devDependencies));
                }
            }

            // Check for requirements.txt
            const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
            if (await this.fileExists(requirementsPath)) {
                const requirements = await fs.promises.readFile(requirementsPath, 'utf8');
                if (requirements) {
                    const lines = requirements.split('\n').filter((line: string) => line.trim());
                    if (lines) {
                        dependencies.push(...lines
                            .map((line: string) => {
                                if (typeof line !== 'string' || !line) return '';
                                const first = line.split('==');
                                const second = first[0] ? first[0].split('>=') : [''];
                                const third = second[0] ? second[0].split('<=') : [''];
                                return third[0] ? third[0].trim() : '';
                            })
                            .filter(Boolean)
                        );
                    }
                }
            }

            // Check for Cargo.toml
            const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
            if (await this.fileExists(cargoPath)) {
                const cargoContent = await fs.promises.readFile(cargoPath, 'utf8');
                const dependencyMatches = cargoContent.match(/\[dependencies\.([^\]]+)\]/g);
                if (dependencyMatches) {
                    dependencies.push(...dependencyMatches.map(match => match.replace('[dependencies.', '').replace(']', '')));
                }
            }
        } catch (error) {
            console.error('Error reading dependencies:', error);
        }

        return dependencies;
    }

    private async getGitInfo(workspaceRoot: string): Promise<GitInfo | undefined> {
        try {
            const { execSync } = require('child_process');
            
            // Check if this is a git repository
            try {
                execSync('git status', { cwd: workspaceRoot, stdio: 'ignore' });
            } catch {
                return undefined; // Not a git repository
            }

            const branch = execSync('git branch --show-current', { cwd: workspaceRoot, encoding: 'utf8' }).trim();
            const lastCommit = execSync('git log -1 --format=%H', { cwd: workspaceRoot, encoding: 'utf8' }).trim();
            const hasUncommittedChanges = execSync('git status --porcelain', { cwd: workspaceRoot, encoding: 'utf8' }).trim().length > 0;
            
            let remoteUrl: string | undefined;
            try {
                remoteUrl = execSync('git remote get-url origin', { cwd: workspaceRoot, encoding: 'utf8' }).trim();
            } catch {
                // No remote origin
            }

            return {
                branch,
                lastCommit,
                hasUncommittedChanges,
                remoteUrl
            };
        } catch (error) {
            console.error('Error getting git info:', error);
            return undefined;
        }
    }

    private getUserPreferences(): UserPreferences {
        const config = vscode.workspace.getConfiguration('codeCompanion');
        
        return {
            codingStyle: config.get('codingStyle', 'functional') as 'functional' | 'oop' | 'procedural',
            framework: config.get('framework'),
            testingFramework: config.get('testingFramework'),
            documentationStyle: config.get('documentationStyle'),
            maxLineLength: config.get('maxLineLength', 80),
            indentationSize: config.get('indentationSize', 2),
            useTypeScript: config.get('useTypeScript', true)
        };
    }

    private async getRecentChanges(workspaceRoot?: string): Promise<FileChange[]> {
        const changes: FileChange[] = [];
        
        if (!workspaceRoot) {
            return changes;
        }

        try {
            const { execSync } = require('child_process');
            
            // Get recent git changes
            try {
                const gitChanges = execSync('git log --name-status --since="1 day ago" --pretty=format:"%H|%an|%ad|%s"', 
                    { cwd: workspaceRoot, encoding: 'utf8' });
                
                const lines = gitChanges.split('\n').filter((line: string) => line.trim());
                for (const line of lines) {
                    if (line.includes('\t')) {
                        const [status, filePath] = line.split('\t');
                        let changeType: 'created' | 'modified' | 'deleted';
                        
                        switch (status) {
                            case 'A':
                                changeType = 'created';
                                break;
                            case 'M':
                                changeType = 'modified';
                                break;
                            case 'D':
                                changeType = 'deleted';
                                break;
                            default:
                                continue;
                        }
                        
                        changes.push({
                            filePath,
                            changeType,
                            timestamp: new Date(),
                            description: 'Git change'
                        });
                    }
                }
            } catch {
                // Not a git repository or no recent changes
            }
        } catch (error) {
            console.error('Error getting recent changes:', error);
        }

        return changes;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
} 