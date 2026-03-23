import {
  LLMProvider,
  type ChatMessage,
  type ChatOptions,
  type ChatResponse,
  type StreamChunk,
  type EmbeddingResponse,
  type ToolCallResponse,
} from './base.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const GEMINI_MODELS = {
  pro: 'gemini-2.5-pro',
  flash: 'gemini-2.5-flash',
  embedding: 'text-embedding-004',
} as const;

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiTextPart {
  text: string;
}

interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
}

interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;

/**
 * Gemini LLM Provider using the Google Generative AI REST API.
 */
export class GeminiProvider extends LLMProvider {
  constructor(apiKey: string, baseUrl?: string) {
    super('gemini', apiKey, baseUrl ?? GEMINI_BASE_URL);
  }

  private resolveModel(options?: ChatOptions): string {
    return options?.model ?? GEMINI_MODELS.pro;
  }

  private convertMessages(messages: ChatMessage[]): {
    systemInstruction: string | undefined;
    contents: GeminiContent[];
  } {
    let systemInstruction: string | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
        continue;
      }

      if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name ?? 'tool',
                response: { result: msg.content },
              },
            },
          ],
        });
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    return { systemInstruction, contents };
  }

  private buildToolDeclarations(options?: ChatOptions): unknown[] | undefined {
    if (!options?.tools || options.tools.length === 0) return undefined;

    return [
      {
        functionDeclarations: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ];
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = this.resolveModel(options);
    const { systemInstruction, contents } = this.convertMessages(
      this.buildMessages(messages, options),
    );

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4096,
        topP: options?.topP,
        stopSequences: options?.stop,
        responseMimeType: options?.responseFormat === 'json' ? 'application/json' : undefined,
      },
    };

    if (systemInstruction) {
      body['systemInstruction'] = { parts: [{ text: systemInstruction }] };
    }

    const tools = this.buildToolDeclarations(options);
    if (tools) {
      body['tools'] = tools;
    }

    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: GeminiPart[] };
        finishReason: string;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('No response candidates from Gemini');

    const parts = candidate.content.parts;
    let content = '';
    const toolCalls: ToolCallResponse[] = [];

    for (const part of parts) {
      if ('text' in part) {
        content += part.text;
      } else if ('functionCall' in part) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }

    const usage = data.usageMetadata;

    return {
      content,
      model,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = this.resolveModel(options);
    const { systemInstruction, contents } = this.convertMessages(
      this.buildMessages(messages, options),
    );

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4096,
        topP: options?.topP,
        stopSequences: options?.stop,
      },
    };

    if (systemInstruction) {
      body['systemInstruction'] = { parts: [{ text: systemInstruction }] };
    }

    const tools = this.buildToolDeclarations(options);
    if (tools) {
      body['tools'] = tools;
    }

    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini streaming error (${response.status}): ${errorText}`);
    }

    if (!response.body) throw new Error('No response body for streaming');

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
          if (jsonStr === '[DONE]') {
            yield { content: '', done: true };
            return;
          }

          try {
            const chunk = JSON.parse(jsonStr) as {
              candidates?: Array<{
                content: { parts: GeminiPart[] };
                finishReason?: string;
              }>;
              usageMetadata?: {
                promptTokenCount: number;
                candidatesTokenCount: number;
                totalTokenCount: number;
              };
            };

            const candidate = chunk.candidates?.[0];
            if (!candidate) continue;

            let content = '';
            const toolCalls: ToolCallResponse[] = [];

            for (const part of candidate.content.parts) {
              if ('text' in part) {
                content += part.text;
              } else if ('functionCall' in part) {
                toolCalls.push({
                  id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  name: part.functionCall.name,
                  arguments: part.functionCall.args,
                });
              }
            }

            const isDone = candidate.finishReason === 'STOP' || candidate.finishReason === 'MAX_TOKENS';

            yield {
              content,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              done: isDone,
              usage: isDone && chunk.usageMetadata
                ? {
                    promptTokens: chunk.usageMetadata.promptTokenCount,
                    completionTokens: chunk.usageMetadata.candidatesTokenCount,
                    totalTokens: chunk.usageMetadata.totalTokenCount,
                  }
                : undefined,
            };
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const embeddingModel = model ?? GEMINI_MODELS.embedding;
    const url = `${this.baseUrl}/models/${embeddingModel}:batchEmbedContents?key=${this.apiKey}`;

    const body = {
      requests: texts.map((text) => ({
        model: `models/${embeddingModel}`,
        content: { parts: [{ text }] },
      })),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini embedding error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      embeddings: Array<{ values: number[] }>;
    };

    return {
      embeddings: data.embeddings.map((e) => e.values),
      model: embeddingModel,
      usage: { totalTokens: texts.reduce((acc, t) => acc + t.length, 0) },
    };
  }
}
