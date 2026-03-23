import {
  LLMProvider,
  type ChatMessage,
  type ChatOptions,
  type ChatResponse,
  type StreamChunk,
  type EmbeddingResponse,
  type ToolCallResponse,
} from './base.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

const OPENAI_MODELS = {
  default: 'gpt-4o',
  fast: 'gpt-4o-mini',
  embedding: 'text-embedding-3-small',
} as const;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI LLM Provider using the OpenAI REST API.
 */
export class OpenAIProvider extends LLMProvider {
  constructor(apiKey: string, baseUrl?: string) {
    super('openai', apiKey, baseUrl ?? OPENAI_BASE_URL);
  }

  private resolveModel(options?: ChatOptions): string {
    return options?.model ?? OPENAI_MODELS.default;
  }

  private convertMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const result: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.name) result.name = msg.name;
      if (msg.toolCallId) result.tool_call_id = msg.toolCallId;
      return result;
    });
  }

  private buildTools(options?: ChatOptions): unknown[] | undefined {
    if (!options?.tools || options.tools.length === 0) return undefined;

    return options.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = this.resolveModel(options);
    const allMessages = this.buildMessages(messages, options);

    const body: Record<string, unknown> = {
      model,
      messages: this.convertMessages(allMessages),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    };

    if (options?.topP !== undefined) body['top_p'] = options.topP;
    if (options?.stop) body['stop'] = options.stop;

    if (options?.responseFormat === 'json') {
      body['response_format'] = { type: 'json_object' };
    }

    const tools = this.buildTools(options);
    if (tools) {
      body['tools'] = tools;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: OpenAIToolCall[];
        };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model: string;
    };

    const choice = data.choices[0];
    if (!choice) throw new Error('No response choices from OpenAI');

    const toolCalls: ToolCallResponse[] = (choice.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    let finishReason: ChatResponse['finishReason'];
    switch (choice.finish_reason) {
      case 'stop':
        finishReason = 'stop';
        break;
      case 'tool_calls':
        finishReason = 'tool_calls';
        break;
      case 'length':
        finishReason = 'length';
        break;
      default:
        finishReason = 'stop';
    }

    return {
      content: choice.message.content ?? '',
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      toolCalls,
      finishReason,
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = this.resolveModel(options);
    const allMessages = this.buildMessages(messages, options);

    const body: Record<string, unknown> = {
      model,
      messages: this.convertMessages(allMessages),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options?.topP !== undefined) body['top_p'] = options.topP;
    if (options?.stop) body['stop'] = options.stop;

    const tools = this.buildTools(options);
    if (tools) {
      body['tools'] = tools;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI streaming error (${response.status}): ${errorText}`);
    }

    if (!response.body) throw new Error('No response body for streaming');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate partial tool calls across chunks
    const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') {
            // Emit final tool calls if any
            if (pendingToolCalls.size > 0) {
              const toolCalls: ToolCallResponse[] = [];
              for (const [, tc] of pendingToolCalls) {
                try {
                  toolCalls.push({
                    id: tc.id,
                    name: tc.name,
                    arguments: JSON.parse(tc.args) as Record<string, unknown>,
                  });
                } catch {
                  toolCalls.push({ id: tc.id, name: tc.name, arguments: {} });
                }
              }
              yield { content: '', toolCalls, done: true };
            } else {
              yield { content: '', done: true };
            }
            return;
          }

          try {
            const chunk = JSON.parse(jsonStr) as {
              choices: Array<{
                delta: {
                  content?: string | null;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason: string | null;
              }>;
              usage?: {
                prompt_tokens: number;
                completion_tokens: number;
                total_tokens: number;
              };
            };

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Accumulate tool call arguments
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = pendingToolCalls.get(tc.index);
                if (!existing) {
                  pendingToolCalls.set(tc.index, {
                    id: tc.id ?? '',
                    name: tc.function?.name ?? '',
                    args: tc.function?.arguments ?? '',
                  });
                } else {
                  if (tc.function?.arguments) existing.args += tc.function.arguments;
                }
              }
            }

            const content = delta.content ?? '';
            const isDone = choice.finish_reason !== null;

            yield {
              content,
              done: isDone,
              usage: isDone && chunk.usage
                ? {
                    promptTokens: chunk.usage.prompt_tokens,
                    completionTokens: chunk.usage.completion_tokens,
                    totalTokens: chunk.usage.total_tokens,
                  }
                : undefined,
            };
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const embeddingModel = model ?? OPENAI_MODELS.embedding;

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI embedding error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      model: string;
      usage: { total_tokens: number };
    };

    // Sort by index to preserve order
    const sorted = data.data.sort((a, b) => a.index - b.index);

    return {
      embeddings: sorted.map((d) => d.embedding),
      model: data.model,
      usage: { totalTokens: data.usage.total_tokens },
    };
  }
}
