import {
  BaseLLMProvider,
  LLMMessage,
  LLMOptions,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from './base-provider.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface OpenAIMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string;
}

interface OpenAIResponse {
  id: string;
  choices: OpenAIChoice[];
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
}

interface OpenAIStreamChoice {
  index: number;
  delta: OpenAIStreamDelta;
  finish_reason: string | null;
}

interface OpenAIStreamChunk {
  id: string;
  choices: OpenAIStreamChoice[];
  model: string;
}

const MODEL_MAP: Record<string, string> = {
  fast: 'gpt-4o-mini',
  pro: 'gpt-4o',
  embed: 'text-embedding-3-small',
};

export class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    super();
    this.apiKey = config.openaiApiKey;
    this.baseUrl = config.providers.openai.baseUrl;
  }

  private resolveModel(model?: string): string {
    if (!model) return MODEL_MAP.fast;
    return MODEL_MAP[model] ?? model;
  }

  private convertMessages(messages: LLMMessage[], systemPrompt?: string): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const oaiMsg: OpenAIMessage = { role: 'assistant', content: msg.content || null };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          oaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }));
        }
        result.push(oaiMsg);
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId ?? '',
        });
      }
    }

    return result;
  }

  private convertTools(
    tools?: ToolDefinition[],
  ): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private parseResponse(data: OpenAIResponse): LLMResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      return {
        content: '',
        model: data.model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'error',
      };
    }

    const toolCalls: ToolCall[] = [];
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { raw: tc.function.arguments };
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
      }
    }

    const finishMap: Record<string, LLMResponse['finishReason']> = {
      stop: 'stop',
      tool_calls: 'tool_calls',
      length: 'length',
      content_filter: 'error',
    };

    return {
      content: choice.message.content ?? '',
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: finishMap[choice.finish_reason] ?? 'stop',
    };
  }

  async chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
    const model = this.resolveModel(options.model);
    const oaiMessages = this.convertMessages(messages, options.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: oaiMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP ?? 1,
    };

    if (options.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const oaiTools = this.convertTools(options.tools);
    if (oaiTools) {
      body.tools = oaiTools;
    }

    return this.retryWithBackoff(async () => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('OpenAI API error', { status: response.status, body: errText, model });
        throw new Error(`OpenAI API error ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as OpenAIResponse;
      return this.parseResponse(data);
    });
  }

  async *stream(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<string> {
    const model = this.resolveModel(options.model);
    const oaiMessages = this.convertMessages(messages, options.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: oaiMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP ?? 1,
      stream: true,
    };

    const oaiTools = this.convertTools(options.tools);
    if (oaiTools) {
      body.tools = oaiTools;
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
      const errText = await response.text();
      logger.error('OpenAI streaming error', { status: response.status, body: errText });
      throw new Error(`OpenAI streaming error ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          if (jsonStr === '[DONE]') return;

          try {
            const chunk = JSON.parse(jsonStr) as OpenAIStreamChunk;
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              yield delta.content;
            }
          } catch {
            // partial JSON, skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const model = MODEL_MAP.embed;
    const results: number[][] = [];

    const batchSize = 2048;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const embeddings = await this.retryWithBackoff(async () => {
        const response = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model, input: batch }),
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.error('OpenAI embed error', { status: response.status, body: errText });
          throw new Error(`OpenAI embed error ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          data: { embedding: number[]; index: number }[];
        };
        return data.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding);
      });

      results.push(...embeddings);
    }

    return results;
  }
}
