export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export abstract class BaseLLMProvider {
  abstract name: string;
  abstract chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse>;
  abstract stream(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<string>;
  abstract embed(texts: string[]): Promise<number[][]>;

  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxRetries) break;
        const isRetryable =
          lastError.message.includes('429') ||
          lastError.message.includes('500') ||
          lastError.message.includes('503') ||
          lastError.message.includes('ECONNRESET') ||
          lastError.message.includes('timeout');
        if (!isRetryable) throw lastError;
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new Error('Retry failed');
  }
}
