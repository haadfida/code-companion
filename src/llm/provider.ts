export interface LLMProvider {
  /**
   * Generate a full completion in one shot.
   */
  generate(prompt: string, options?: Record<string, any>): Promise<string>;

  /**
   * Optional streamed generation – provider may choose not to implement.
   */
  generateStream?(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: Record<string, any>
  ): Promise<void>;

  /**
   * List available models if the provider supports it.
   */
  listModels?(): Promise<string[]>;

  /**
   * Update provider-specific configuration at runtime.
   */
  updateConfig?(options: Record<string, any>): void;

  /**
   * Return current configuration snapshot.
   */
  getConfig?(): Record<string, any>;

  /**
   * Dispose any resources (sockets, streams, etc.)
   */
  dispose?(): void;
} 