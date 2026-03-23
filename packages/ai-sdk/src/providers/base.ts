// ─── Types ─────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
  topP?: number;
  stop?: string[];
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls: ToolCallResponse[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface ToolCallResponse {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface StreamChunk {
  content: string;
  toolCalls?: ToolCallResponse[];
  done: boolean;
  usage?: ChatResponse['usage'];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: { totalTokens: number };
}

// ─── Abstract Provider ─────────────────────────────────────────────

/**
 * Abstract base class for LLM providers.
 * Implement chat, stream, and embed for each provider.
 */
export abstract class LLMProvider {
  public readonly providerName: string;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;

  constructor(providerName: string, apiKey: string, baseUrl: string) {
    this.providerName = providerName;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Send a chat completion request and get a full response.
   */
  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Send a streaming chat completion request, yielding chunks.
   */
  abstract stream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * Generate embeddings for a list of texts.
   */
  abstract embed(texts: string[], model?: string): Promise<EmbeddingResponse>;

  /**
   * Build the messages array, prepending the system prompt if provided.
   */
  protected buildMessages(messages: ChatMessage[], options?: ChatOptions): ChatMessage[] {
    const result: ChatMessage[] = [];
    if (options?.systemPrompt) {
      result.push({ role: 'system', content: options.systemPrompt });
    }
    result.push(...messages);
    return result;
  }
}
