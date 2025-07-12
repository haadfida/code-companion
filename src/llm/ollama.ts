import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { OllamaConfig, LLMResponse } from '../types';
import { LLMProvider } from './provider';

export class OllamaClient implements LLMProvider {
    private client: AxiosInstance;
    private config: OllamaConfig;
    private isConnected: boolean = false;

    constructor() {
        this.config = this.loadConfig();
        this.client = axios.create({
            baseURL: this.config.url,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async generate(prompt: string, options?: Partial<OllamaConfig>): Promise<string> {
        const config = { ...this.config, ...options };
        
        try {
            await this.ensureConnection();
            
            const startTime = Date.now();
            const response = await this.client.post('/api/generate', {
                model: config.model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: config.temperature,
                    num_predict: config.maxTokens,
                    top_p: 0.9,
                    top_k: 40,
                    repeat_penalty: 1.1
                }
            });

            const duration = Date.now() - startTime;
            
            const llmResponse: LLMResponse = {
                content: response.data.response,
                tokens: response.data.eval_count || 0,
                model: config.model,
                duration
            };

            return llmResponse.content;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error(`Cannot connect to Ollama server at ${config.url}. Please ensure Ollama is running.`);
                }
                if (error.response?.status === 404) {
                    throw new Error(`Model '${config.model}' not found. Please install it with: ollama pull ${config.model}`);
                }
                throw new Error(`Ollama API error: ${error.response?.data?.error || error.message}`);
            }
            throw new Error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async generateStream(prompt: string, onChunk: (chunk: string) => void, options?: Partial<OllamaConfig>): Promise<void> {
        const config = { ...this.config, ...options };
        
        try {
            await this.ensureConnection();
            
            const response = await this.client.post('/api/generate', {
                model: config.model,
                prompt: prompt,
                stream: true,
                options: {
                    temperature: config.temperature,
                    num_predict: config.maxTokens,
                    top_p: 0.9,
                    top_k: 40,
                    repeat_penalty: 1.1
                }
            }, {
                responseType: 'stream'
            });

            response.data.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.response) {
                                onChunk(data.response);
                            }
                        } catch (e) {
                            // Ignore parsing errors for incomplete JSON
                        }
                    }
                }
            });

        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error(`Cannot connect to Ollama server at ${config.url}. Please ensure Ollama is running.`);
                }
                throw new Error(`Ollama API error: ${error.response?.data?.error || error.message}`);
            }
            throw new Error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async listModels(): Promise<string[]> {
        try {
            await this.ensureConnection();
            const response = await this.client.get('/api/tags');
            return response.data.models.map((model: any) => model.name);
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }

    async checkModel(model: string): Promise<boolean> {
        try {
            const models = await this.listModels();
            return models.includes(model);
        } catch (error) {
            return false;
        }
    }

    async getModelInfo(model: string): Promise<any> {
        try {
            await this.ensureConnection();
            const response = await this.client.post('/api/show', { name: model });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get model info: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async ensureConnection(): Promise<void> {
        if (this.isConnected) {
            return;
        }

        try {
            await this.client.get('/api/tags');
            this.isConnected = true;
        } catch (error) {
            this.isConnected = false;
            throw error;
        }
    }

    private loadConfig(): OllamaConfig {
        const config = vscode.workspace.getConfiguration('codeCompanion');
        
        return {
            url: config.get('ollamaUrl', 'http://localhost:11434'),
            model: config.get('defaultModel', 'codellama:70b'),
            temperature: config.get('temperature', 0.1),
            maxTokens: config.get('maxTokens', 4096),
            timeout: 30000
        };
    }

    updateConfig(newConfig: Partial<OllamaConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.client.defaults.baseURL = this.config.url;
        this.client.defaults.timeout = this.config.timeout;
        this.isConnected = false; // Reset connection to use new config
    }

    getConfig(): OllamaConfig {
        return { ...this.config };
    }

    dispose(): void {
        // Clean up any resources if needed
    }
} 