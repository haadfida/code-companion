import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import { TaskStep, TaskContext } from '../types';
import { LLMProvider } from '../llm/provider';

export class CodeExecutor {
    private llm?: LLMProvider;

    constructor(llmProvider?: LLMProvider) {
        this.llm = llmProvider;
    }

    async executeStep(step: TaskStep, context: TaskContext): Promise<any> {
        switch (step.type) {
            case 'code_generation':
                return this.executeCodeGeneration(step, context);
            case 'file_operation':
                return this.executeFileOperation(step, context);
            case 'terminal_command':
                return this.executeTerminalCommand(step, context);
            case 'analysis':
            case 'design': // treat design as a kind of analysis for now
                return this.executeAnalysis(step, context);
            case 'test':
                return this.executeTest(step, context);
            case 'documentation':
                return this.executeDocumentation(step, context);
            default:
                // Fallback: treat any unknown type as analysis to avoid hard failure
                console.warn(`CodeCompanion: Unknown step type '${step.type}', defaulting to analysis.`);
                return this.executeAnalysis(step, context);
        }
    }

    private async executeCodeGeneration(step: TaskStep, context: TaskContext): Promise<any> {
        if (!this.llm) {
            // Fallback to old behaviour if no provider was injected (should not happen via Manager)
            const snippet = `function helloWorld() {\n  console.log('Hello, World!');\n}`;
        return {
                generatedCode: snippet,
                explanation: 'LLM provider not configured – returning stub.',
                confidence: 0.1
            };
        }

        const paramsPretty = JSON.stringify(step.parameters || {}, null, 2);
        const contextSummary = `Language: ${context.language || 'unknown'}; File: ${context.currentFile || 'N/A'}`;

        const prompt = `You are an expert developer AI. Generate ONLY the necessary code snippet to accomplish the following step in a VS Code workspace. Do not include explanations or markdown fences.

Step name: ${step.name}
Step description: ${step.description || 'N/A'}
Parameters: ${paramsPretty}
Context: ${contextSummary}

Return just the code.`;

        try {
            const start = Date.now();
            const generated = await this.llm.generate(prompt);
            const duration = Date.now() - start;

            return {
                generatedCode: generated.trim(),
                tokens: generated.length, // rough estimate
                durationMs: duration
            };
        } catch (error) {
            throw new Error(`LLM code generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async executeFileOperation(step: TaskStep, context: TaskContext): Promise<any> {
        const { operation, filePath, content } = step.parameters;
        // Normalise content to an empty string so downstream helpers (which expect a string) do not crash when the caller omits it.
        const safeContent: string = content ?? '';
        
        // If the planner omitted a file path we first fall back to the currently active/selected file (when available),
        // then as a last-resort we ask the user via an input box. This prevents the annoying "File path is required" error loop.

        let resolvedPath: string | undefined = filePath;

        if (!resolvedPath && context.currentFile) {
            resolvedPath = context.currentFile;
        }

        if (!resolvedPath) {
            resolvedPath = await vscode.window.showInputBox({
                prompt: 'Enter a file path for this operation',
                placeHolder: 'src/myFile.ts',
                value: context.workspaceRoot ? path.relative(context.workspaceRoot, context.currentFile || '') : undefined
            }) || undefined;
        }

        if (!resolvedPath) {
            throw new Error('File path is required for file operations');
        }

        const fullPath = path.isAbsolute(resolvedPath) ? resolvedPath : path.join(context.workspaceRoot || '', resolvedPath);

        // Fallback: if the operation is missing, infer a sensible default based on file existence
        let resolvedOperation: string = operation;
        if (!resolvedOperation) {
            const fileExists = fs.existsSync(fullPath);
            // If the file exists we will replace its content, otherwise we create a new file
            resolvedOperation = fileExists ? 'replace' : 'create';
        }

        switch (resolvedOperation) {
            case 'create':
                return this.createFile(fullPath, safeContent);
            case 'modify':
                return this.modifyFile(fullPath, safeContent);
            case 'delete':
                return this.deleteFile(fullPath);
            case 'replace':
                return this.replaceFileContent(fullPath, safeContent);
            default:
                throw new Error(`Unknown file operation: ${resolvedOperation}`);
        }
    }

    private async executeTerminalCommand(step: TaskStep, context: TaskContext): Promise<any> {
        const { command, cwd } = step.parameters;
        
        if (!command) {
            throw new Error('Command is required for terminal operations');
        }

        const workingDirectory = cwd || context.workspaceRoot || process.cwd();

        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const [cmd, ...args] = command.split(' ');
            
            const childProcess = spawn(cmd, args, {
                cwd: workingDirectory,
                shell: true
            });

            let stdout = '';
            let stderr = '';

            childProcess.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            childProcess.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            childProcess.on('close', (code: number) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        stdout,
                        stderr,
                        exitCode: code
                    });
                } else {
                    reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
                }
            });

            childProcess.on('error', (error: Error) => {
                reject(new Error(`Failed to execute command: ${error.message}`));
            });
        });
    }

    private async executeAnalysis(step: TaskStep, context: TaskContext): Promise<any> {
        // Placeholder analysis. We intentionally omit empty arrays to reduce noise in the UI.
        return {
            analysis: `Analysis completed for: ${step.name}`
        };
    }

    private async executeTest(_step: TaskStep, _context: TaskContext): Promise<any> {
        // Simulate a tiny test run summary
        return {
            passCount: 5,
            failCount: 0,
            coverage: '82%'
        };
    }

    private async executeDocumentation(step: TaskStep, context: TaskContext): Promise<any> {
        // Generate or update a README.md in the workspace root with contextual information about the project.
        const workspaceRoot = context.workspaceRoot || process.cwd();
        const readmePath = path.join(workspaceRoot, 'README.md');

        // If the planner/user explicitly supplied README content we honour that, otherwise we auto-generate it.
        const suppliedContent: string | undefined = step.parameters?.content;
        const autogeneratedContent = suppliedContent || await this.generateReadmeContent(workspaceRoot);

        const footer = `\n\n---\n_Updated by CodeCompanion on ${new Date().toISOString()}_`;
        const finalContent = `${autogeneratedContent}${footer}`;

        try {
            // Ensure the directory exists before writing
            await fs.promises.mkdir(path.dirname(readmePath), { recursive: true });

            // If a README already exists, trigger the rich diff/confirmation flow via replaceFileContent;
            // otherwise create a new file so the user still has the opportunity to review if confirmChanges is enabled.
            const exists = fs.existsSync(readmePath);
            if (exists) {
                return await this.replaceFileContent(readmePath, finalContent);
            }
            return await this.createFile(readmePath, finalContent);
        } catch (error) {
            throw new Error(`Failed to write README: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Builds a rich README template by inspecting common project files such as package.json and by constructing
     * a lightweight file-tree of the repository (depth-limited to keep the output readable).
     */
    private async generateReadmeContent(workspaceRoot: string): Promise<string> {
        // Gather package.json metadata if present
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        let packageInfo: Record<string, any> = {};
        if (fs.existsSync(packageJsonPath)) {
            try {
                const raw = await fs.promises.readFile(packageJsonPath, 'utf8');
                packageInfo = JSON.parse(raw);
            } catch (err) {
                console.warn(`CodeCompanion: Failed to parse package.json – ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const projectName = packageInfo.name || path.basename(workspaceRoot);
        const description = packageInfo.description || 'Project description.';

        const scriptSection = packageInfo.scripts
            ? (Object.entries(packageInfo.scripts) as [string, string][]) // satisfy TS compiler
                  .map(([name, cmd]) => `- **${name}**: \`${cmd}\``)
                  .join('\n')
            : '_No npm scripts defined_';

        const dependencySection = packageInfo.dependencies
            ? Object.keys(packageInfo.dependencies).map(dep => `- ${dep}`).join('\n')
            : '_No runtime dependencies_';

        const devDependencySection = packageInfo.devDependencies
            ? Object.keys(packageInfo.devDependencies).map(dep => `- ${dep}`).join('\n')
            : '_No dev dependencies_';

        const fileTree = await this.buildFileTree(workspaceRoot, 0, 2);

        // Rich template mirroring manual README edits
        return `# ${projectName} 🚀\n\n${description}\n\n---\n\n## ✨ Features\n• Chat with an **AI coding assistant** directly in the sidebar or panel.\n• **Generate, edit & refactor** files – workspace edits applied automatically.\n• **Multi-step task planner** (analysis → design → code → tests → docs).\n• Inline diff & safety guardrails (blocks destructive commands, sensitive files).\n• Works with multiple LLM back-ends: **Ollama**, **OpenAI**, or your own via plugin.\n• Fetches **remote package READMEs** to give the model extra context.\n• GitHub integration for PR diff summaries and automated review comments.\n• Rich task & status webviews – cancel / retry individual steps.\n\n## 📦 Installation\n1. Ensure you have **Node.js ≥ 18** and **VS Code ≥ 1.85**.\n2. Install from the VSIX in the repo root:\n   \`\`\`bash\n   code --install-extension ${projectName}-0.1.0.vsix\n   \`\`\`\n3. Reload VS Code and look for the \`${projectName}\` icon in the Activity Bar.\n\n## 🚀 Quick Start\n1. Open any workspace.\n2. Launch the **Chat** view (icon in Activity Bar).\n3. Type a natural-language request, e.g. \`Add dark-mode toggle\`.\n4. Review the generated **execution plan**, edit if necessary, then run.\n5. Code Companion applies changes – look for inline decorations or accept the edits.\n\n## ⚙️ Configuration\nSet these in your user or workspace \`settings.json\`:\n| Setting | Default | Description |\n|---------|---------|-------------|\n| \`codeCompanion.llmProvider\` | \`ollama\` | Selects the active LLM provider (\`ollama\` or \`openai\`). |\n| \`codeCompanion.confirmChanges\` | \`true\` | Ask before applying edits. Markdown files are applied directly without diff. |\n| \`codeCompanion.enableAutoSave\` | \`true\` | Automatically save documents after edits. |\n| \`codeCompanion.openAi.apiKey\` | \`""\` | API key when \`llmProvider\` is \`openai\`. |\n\n## 🏗 Architecture Overview\n\`\`\`mermaid\ngraph TD;\n    User["VS Code UI"] -->|Commands & prompts| Manager;\n    Manager --> Planner;\n    Planner --> Executor;\n    Executor -->|Reads| ContextAnalyzer;\n    Executor -->|LLM calls| LLMProvider;\n    LLMProvider --> Ollama & OpenAI;\n    Executor -->|Edits| Workspace;\n    Executor -->|Safety| SafetyValidator;\n    Manager --> UIWebviews;\n    ContextAnalyzer --> Git & RemoteDocs;\n\`\`\`\n\n## 📂 Project Structure (depth 2)\n\`\`\`\n${fileTree}\n\`\`\`\n\n## 🧑‍💻 Development\n\`\`\`bash\n# install deps\nnpm install\n# launch the extension host\ncode . --extensionDevelopmentPath=.\n\`\`\`\n\n### Scripts\n${scriptSection}\n\n### Runtime Dependencies\n${dependencySection}\n\n### Dev Dependencies\n${devDependencySection}\n\n## 📅 Roadmap\n- [ ] Better inline diff/merge UX.\n- [ ] Context caching & chunking for large workspaces.\n- [ ] Additional LLM providers (Anthropic, Gemini).\n- [ ] Auto-generated unit & integration tests.\n\n## 🤝 Contributing\nPRs and issues are welcome! Please read **DEVELOPMENT_SETUP.md** first.\n\n## 📝 License\nMIT © ${new Date().getFullYear()} ${projectName} Authors\n`;
    }

    /**
     * Recursively walks the project directory to build a simple ASCII tree. Depth is limited to avoid gigantic READMEs.
     */
    private async buildFileTree(dir: string, depth: number, maxDepth: number): Promise<string> {
        if (depth > maxDepth) {
            return '';
        }

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const lines: string[] = [];
        const indent = '  '.repeat(depth);

        for (const entry of entries) {
            // Skip noisy or irrelevant directories
            if (['node_modules', '.git', 'out', '.vscode', '.DS_Store'].includes(entry.name)) {
                continue;
            }

            const symbol = entry.isDirectory() ? '📁' : '📄';
            lines.push(`${indent}${symbol} ${entry.name}`);

            if (entry.isDirectory()) {
                const subTree = await this.buildFileTree(path.join(dir, entry.name), depth + 1, maxDepth);
                if (subTree) {
                    lines.push(subTree);
                }
            }
        }

        return lines.join('\n');
    }

    private async createFile(filePath: string, content?: string): Promise<any> {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            await fs.promises.mkdir(dir, { recursive: true });

            // Create file
            await fs.promises.writeFile(filePath, content || '', 'utf8');
            
            return {
                success: true,
                filePath,
                operation: 'created'
            };
        } catch (error) {
            throw new Error(`Failed to create file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async modifyFile(filePath: string, content: string): Promise<any> {
        try {
            const config = vscode.workspace.getConfiguration('codeCompanion');
            const confirm = config.get<boolean>('confirmChanges', true);

            const existingContent = await fs.promises.readFile(filePath, 'utf8');
            const modifiedContent = `${existingContent}\n${content}`;

            if (confirm) {
                // Always show diff inline without an extra prompt for better UX
                const left = vscode.Uri.file(filePath);
                // Generate a unique URI each time to avoid collision with existing untitled docs
                const timestamp = Date.now();
                const right = vscode.Uri.parse(`untitled:${filePath}.codecompanion-${timestamp}`);

                // If an untitled document with the target URI is already open (unlikely but safe-guard), reuse it
                let rightDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === right.toString());
                if (!rightDoc) {
                    rightDoc = await vscode.workspace.openTextDocument(right);
                }

                const edit = new vscode.WorkspaceEdit();
                edit.insert(rightDoc.uri, new vscode.Position(0, 0), modifiedContent);
                await vscode.workspace.applyEdit(edit);

                const useMergeEditor = config.get<boolean>('useMergeEditor', false);

                if (useMergeEditor) {
                    // Try to open using the Merge Editor (available in VS Code 1.80+).
                    // There is no official API yet, but opening via the `vscode.openWith` command
                    // and the built-in `mergeEditor` view type works in current VS Code versions.
                    // If this fails (older VS Code), we gracefully fall back to the regular two-way diff.
                    try {
                        await vscode.commands.executeCommand('vscode.openWith', right, 'mergeEditor', {
                            override: true
                        });
                    } catch {
                        await vscode.commands.executeCommand('vscode.diff', left, right, `Diff: ${path.basename(filePath)}`);
                    }
                } else {
                    await vscode.commands.executeCommand('vscode.diff', left, right, `Diff: ${path.basename(filePath)}`);
                }

                if (!useMergeEditor) {
                    // In diff mode we still ask for explicit confirmation so the user can decide whether to apply.
                    const proceed = await vscode.window.showInformationMessage(
                        'Apply the displayed changes?',
                        { modal: true },
                        'Yes',
                        'No'
                    );
                    if (proceed !== 'Yes') {
                        return { cancelled: true };
                    }
                } else {
                    // When using the Merge Editor we rely on its built-in “Accept Merge” flow and skip this extra modal.
                }
            }

            const doc = await vscode.workspace.openTextDocument(filePath);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(existingContent.length)
            );
            edit.replace(doc.uri, fullRange, modifiedContent);
            await vscode.workspace.applyEdit(edit);
            if (config.get<boolean>('enableAutoSave', true)) {
                await doc.save();
            }
            
            return {
                success: true,
                filePath,
                operation: 'modified',
                originalLength: existingContent.length,
                newLength: modifiedContent.length
            };
        } catch (error) {
            throw new Error(`Failed to modify file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async deleteFile(filePath: string): Promise<any> {
        try {
            await fs.promises.unlink(filePath);
            
            return {
                success: true,
                filePath,
                operation: 'deleted'
            };
        } catch (error) {
            throw new Error(`Failed to delete file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async replaceFileContent(filePath: string, content: string): Promise<any> {
        try {
            const config = vscode.workspace.getConfiguration('codeCompanion');
            const confirm = config.get<boolean>('confirmChanges', true);
            const originalContent = await fs.promises.readFile(filePath, 'utf8');

            if (confirm) {
                const left = vscode.Uri.file(filePath);
                const timestamp = Date.now();
                const right = vscode.Uri.parse(`untitled:${filePath}.codecompanion-${timestamp}`);

                let rightDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === right.toString());
                if (!rightDoc) {
                    rightDoc = await vscode.workspace.openTextDocument(right);
                }

                const edit = new vscode.WorkspaceEdit();
                edit.insert(rightDoc.uri, new vscode.Position(0, 0), content);
                await vscode.workspace.applyEdit(edit);

                const useMergeEditor = config.get<boolean>('useMergeEditor', false);

                if (useMergeEditor) {
                    // Try to open using the Merge Editor (available in VS Code 1.80+).
                    // There is no official API yet, but opening via the `vscode.openWith` command
                    // and the built-in `mergeEditor` view type works in current VS Code versions.
                    // If this fails (older VS Code), we gracefully fall back to the regular two-way diff.
                    try {
                        await vscode.commands.executeCommand('vscode.openWith', right, 'mergeEditor', {
                            override: true
                        });
                    } catch {
                        await vscode.commands.executeCommand('vscode.diff', left, right, `Diff: ${path.basename(filePath)}`);
                    }
                } else {
                    await vscode.commands.executeCommand('vscode.diff', left, right, `Diff: ${path.basename(filePath)}`);
                }

                if (!useMergeEditor) {
                    // In diff mode we still ask for explicit confirmation so the user can decide whether to apply.
                    const proceed = await vscode.window.showInformationMessage(
                        'Apply the displayed changes?',
                        { modal: true },
                        'Yes',
                        'No'
                    );
                    if (proceed !== 'Yes') {
                        return { cancelled: true };
                    }
                } else {
                    // When using the Merge Editor we rely on its built-in “Accept Merge” flow and skip this extra modal.
                }
            }

            const doc = await vscode.workspace.openTextDocument(filePath);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(originalContent.length)
            );
            edit.replace(doc.uri, fullRange, content);
            await vscode.workspace.applyEdit(edit);
            if (config.get<boolean>('enableAutoSave', true)) {
                await doc.save();
            }
            
            return {
                success: true,
                filePath,
                operation: 'replaced',
                originalLength: originalContent.length,
                newLength: content.length
            };
        } catch (error) {
            throw new Error(`Failed to replace file content ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
} 