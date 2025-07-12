import { LLMProvider } from '../llm/provider';
import { TaskType, TaskContext, TaskStep } from '../types';

export class TaskPlanner {
    private llm: LLMProvider;

    constructor(llmProvider: LLMProvider) {
        this.llm = llmProvider;
    }

    async createPlan(type: TaskType, params: any, context: TaskContext): Promise<{ steps: TaskStep[], estimatedDuration: number }> {
        const prompt = this.buildPlanningPrompt(type, params, context);
        
        try {
            const response = await this.llm.generate(prompt);
            const plan = this.parsePlanResponse(response);
            return plan;
        } catch (error) {
            // Fallback to default plans if LLM fails
            return this.createDefaultPlan(type, params, context);
        }
    }

    private buildPlanningPrompt(type: TaskType, params: any, context: TaskContext): string {
        let prompt = `You are a task planning AI. Create a detailed execution plan for a coding task.

Task Type: ${type}
Parameters: ${JSON.stringify(params, null, 2)}

Context:
- Workspace: ${context.workspaceRoot || 'Unknown'}
- Language: ${context.language || 'Unknown'}
- Project Type: ${context.projectType || 'Unknown'}

Create a JSON response with the following structure:
{
  "steps": [
    {
      "id": "step_1",
      "name": "Step name",
      "description": "Detailed description",
      "type": "code_generation|file_operation|terminal_command|analysis",
      "parameters": {}
    }
  ],
  "estimatedDuration": 300
}

Focus on practical, executable steps. For ${type} tasks, consider:
`;

        switch (type) {
            case 'refactor':
                prompt += `- Analyze existing code structure
- Identify refactoring opportunities
- Generate improved code
- Update related files if needed
- Run tests to ensure functionality`;
                break;
            case 'implement':
                prompt += `- Analyze requirements
- Design solution architecture
- Generate implementation code
- Create tests
- Update documentation`;
                break;
            case 'fix':
                prompt += `- Analyze error messages
- Identify root cause
- Generate fix
- Test the solution
- Verify no regressions`;
                break;
            case 'review':
                prompt += `- Analyze code quality
- Check for security issues
- Review performance
- Suggest improvements
- Provide detailed feedback`;
                break;
            case 'test':
                prompt += `- Analyze code to test
- Design test cases
- Generate test code
- Run tests
- Report results`;
                break;
            case 'document':
                prompt += `- Analyze code structure
- Generate documentation
- Update README files
- Create examples
- Ensure completeness`;
                break;
        }

        prompt += `\n\nRespond only with valid JSON.`;

        return prompt;
    }

    private parsePlanResponse(response: string): { steps: TaskStep[], estimatedDuration: number } {
        try {
            // Extract JSON from response (in case there's extra text)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            
            const steps: TaskStep[] = parsed.steps.map((step: any, index: number) => ({
                id: step.id || `step_${index + 1}`,
                name: step.name || `Step ${index + 1}`,
                description: step.description || '',
                type: step.type || 'analysis',
                status: 'pending',
                parameters: step.parameters || {}
            }));

            return {
                steps,
                estimatedDuration: parsed.estimatedDuration || 300
            };
        } catch (error) {
            console.error('Failed to parse plan response:', error);
            throw new Error('Invalid plan response format');
        }
    }

    private createDefaultPlan(type: TaskType, params: any, context: TaskContext): { steps: TaskStep[], estimatedDuration: number } {
        const steps: TaskStep[] = [];

        switch (type) {
            case 'refactor':
                steps.push(
                    {
                        id: 'step_1',
                        name: 'Analyze Code',
                        description: 'Analyze the selected code for refactoring opportunities',
                        type: 'analysis',
                        status: 'pending',
                        parameters: { code: params.code, language: context.language }
                    },
                    {
                        id: 'step_2',
                        name: 'Generate Refactored Code',
                        description: 'Generate improved version of the code',
                        type: 'code_generation',
                        status: 'pending',
                        parameters: { originalCode: params.code, goal: 'improve readability and maintainability' }
                    },
                    {
                        id: 'step_3',
                        name: 'Apply Changes',
                        description: 'Apply the refactored code to the file',
                        type: 'file_operation',
                        status: 'pending',
                        parameters: { filePath: params.filePath, operation: 'replace' }
                    }
                );
                break;

            case 'implement':
                steps.push(
                    {
                        id: 'step_1',
                        name: 'Analyze Requirements',
                        description: 'Analyze the feature requirements',
                        type: 'analysis',
                        status: 'pending',
                        parameters: { description: params.description }
                    },
                    {
                        id: 'step_2',
                        name: 'Design Solution',
                        description: 'Design the implementation approach',
                        type: 'analysis',
                        status: 'pending',
                        parameters: { context }
                    },
                    {
                        id: 'step_3',
                        name: 'Generate Implementation',
                        description: 'Generate the feature implementation',
                        type: 'code_generation',
                        status: 'pending',
                        parameters: { requirements: params.description, context }
                    },
                    {
                        id: 'step_4',
                        name: 'Create Tests',
                        description: 'Generate tests for the new feature',
                        type: 'code_generation',
                        status: 'pending',
                        parameters: { testType: 'unit', context }
                    },
                    {
                        id: 'step_5',
                        name: 'Update Documentation',
                        description: 'Generate or update project README and docs',
                        type: 'documentation',
                        status: 'pending',
                        parameters: {}
                    }
                );
                break;

            case 'fix':
                steps.push(
                    {
                        id: 'step_1',
                        name: 'Analyze Error',
                        description: 'Analyze the error message and stack trace',
                        type: 'analysis',
                        status: 'pending',
                        parameters: { errorMessage: params.errorMessage, stackTrace: params.stackTrace }
                    },
                    {
                        id: 'step_2',
                        name: 'Generate Fix',
                        description: 'Generate the fix for the identified issue',
                        type: 'code_generation',
                        status: 'pending',
                        parameters: { originalCode: params.code, error: params.errorMessage }
                    },
                    {
                        id: 'step_3',
                        name: 'Apply Fix',
                        description: 'Apply the fix to the file',
                        type: 'file_operation',
                        status: 'pending',
                        parameters: { filePath: params.filePath, operation: 'replace' }
                    }
                );
                break;

            case 'review':
                steps.push(
                    {
                        id: 'step_1',
                        name: 'Code Analysis',
                        description: 'Analyze the code for quality, security, and performance issues',
                        type: 'analysis',
                        status: 'pending',
                        parameters: { code: params.code, language: context.language }
                    },
                    {
                        id: 'step_2',
                        name: 'Generate Review Report',
                        description: 'Generate a comprehensive code review report',
                        type: 'code_generation',
                        status: 'pending',
                        parameters: { reviewType: 'comprehensive', code: params.code }
                    }
                );
                break;

            default:
                steps.push(
                    {
                        id: 'step_1',
                        name: 'Analyze Task',
                        description: 'Analyze the task requirements',
                        type: 'analysis',
                        status: 'pending',
                        parameters: { taskType: type, params }
                    },
                    {
                        id: 'step_2',
                        name: 'Execute Task',
                        description: 'Execute the requested task',
                        type: 'code_generation',
                        status: 'pending',
                        parameters: { taskType: type, params, context }
                    }
                );
        }

        return {
            steps,
            estimatedDuration: steps.length * 60 // 1 minute per step
        };
    }
} 