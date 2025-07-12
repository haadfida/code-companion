import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { LLMProvider } from './provider';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  endpoint: string;
}

export class OpenAIClient implements LLMProvider {
  private client: AxiosInstance;
  private config: OpenAIConfig;

  constructor() {
    this.config = this.loadConfig();
    this.client = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`
      }
    });
  }

  async generate(prompt: string, opts: Partial<OpenAIConfig> = {}): Promise<string> {
    const cfg = { ...this.config, ...opts };
    try {
      const response = await this.client.post('/chat/completions', {
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens
      });
      const content: string | undefined =
        response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }
      return content.trim();
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `OpenAI API error: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    opts: Partial<OpenAIConfig> = {}
  ): Promise<void> {
    const cfg = { ...this.config, ...opts };
    const response = await this.client.post(
      '/chat/completions',
      {
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream: true
      },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '').trim();
          if (data === '[DONE]') {
            resolve();
          } else if (data) {
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) onChunk(delta);
            } catch (_e) {
              /* ignore malformed */
            }
          }
        }
      });
      response.data.on('error', reject);
    });
  }

  listModels?(): Promise<string[]> {
    // Optional; not implemented yet
    return Promise.resolve([this.config.model]);
  }

  updateConfig(options: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...options };
    this.client.defaults.timeout = this.config.timeout;
    this.client.defaults.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
  }

  getConfig(): OpenAIConfig {
    return { ...this.config };
  }

  dispose(): void {
    // nothing for now
  }

  private loadConfig(): OpenAIConfig {
    const cfg = vscode.workspace.getConfiguration('codeCompanion');
    const apiKey = cfg.get('openaiApiKey') || process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      vscode.window.showWarningMessage(
        'CodeCompanion: OpenAI API key not set (codeCompanion.openaiApiKey or OPENAI_API_KEY env).'
      );
    }
    return {
      apiKey,
      model: cfg.get('openaiModel', 'gpt-4o-mini'),
      temperature: cfg.get('temperature', 0.1),
      maxTokens: cfg.get('maxTokens', 4096),
      timeout: 30000,
      endpoint: cfg.get('openaiEndpoint', 'https://api.openai.com/v1')
    } as OpenAIConfig;
  }
} 