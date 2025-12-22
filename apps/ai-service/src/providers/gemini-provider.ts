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

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiCandidate {
  content: { parts: GeminiPart[]; role: string };
  finishReason: string;
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

const MODEL_MAP: Record<string, string> = {
  fast: 'gemini-2.0-flash',
  pro: 'gemini-2.5-pro',
  embed: 'text-embedding-004',
};

export class GeminiProvider extends BaseLLMProvider {
  name = 'gemini';
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    super();
    this.apiKey = config.geminiApiKey;
    this.baseUrl = config.providers.gemini.baseUrl;
  }

  private resolveModel(model?: string): string {
    if (!model) return MODEL_MAP.fast;
    return MODEL_MAP[model] ?? model;
  }

  private convertMessagesToGemini(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): { contents: GeminiContent[]; systemInstruction?: { parts: { text: string }[] } } {
    const contents: GeminiContent[] = [];
    let sysInstruction: { parts: { text: string }[] } | undefined;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemText = [systemPrompt, ...systemMessages.map((m) => m.content)]
      .filter(Boolean)
      .join('\n\n');

    if (systemText) {
      sysInstruction = { parts: [{ text: systemText }] };
    }

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (msg.role === 'assistant') {
        const parts: GeminiPart[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      } else if (msg.role === 'tool') {
        const resultData: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(msg.content);
          Object.assign(resultData, typeof parsed === 'object' && parsed !== null ? parsed : { result: parsed });
        } catch {
          resultData.result = msg.content;
        }
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: msg.name ?? 'tool', response: resultData } }],
        });
      }
    }

    return { contents, systemInstruction: sysInstruction };
  }

  private convertToolsToGemini(tools?: ToolDefinition[]): object[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  private parseGeminiResponse(data: GeminiResponse, model: string): LLMResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      return {
        content: '',
        model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'error',
      };
    }

    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        content += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }

    const finishReasonMap: Record<string, LLMResponse['finishReason']> = {
      STOP: 'stop',
      MAX_TOKENS: 'length',
      SAFETY: 'error',
      RECITATION: 'error',
      OTHER: 'stop',
    };

    let finishReason: LLMResponse['finishReason'] =
      finishReasonMap[candidate.finishReason] ?? 'stop';
    if (toolCalls.length > 0) {
      finishReason = 'tool_calls';
    }

    const usage = data.usageMetadata ?? {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    return {
      content,
      model,
      usage: {
        promptTokens: usage.promptTokenCount,
        completionTokens: usage.candidatesTokenCount,
        totalTokens: usage.totalTokenCount,
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }

  async chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
    const model = this.resolveModel(options.model);
    const { contents, systemInstruction } = this.convertMessagesToGemini(
      messages,
      options.systemPrompt,
    );

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
        topP: options.topP ?? 0.95,
        ...(options.responseFormat === 'json' && { responseMimeType: 'application/json' }),
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const geminiTools = this.convertToolsToGemini(options.tools);
    if (geminiTools) {
      body.tools = geminiTools;
    }

    return this.retryWithBackoff(async () => {
      const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('Gemini API error', { status: response.status, body: errText, model });
        throw new Error(`Gemini API error ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as GeminiResponse;
      return this.parseGeminiResponse(data, model);
    });
  }

  async *stream(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<string> {
    const model = this.resolveModel(options.model);
    const { contents, systemInstruction } = this.convertMessagesToGemini(
      messages,
      options.systemPrompt,
    );

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
        topP: options.topP ?? 0.95,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const geminiTools = this.convertToolsToGemini(options.tools);
    if (geminiTools) {
      body.tools = geminiTools;
    }

    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Gemini streaming error', { status: response.status, body: errText });
      throw new Error(`Gemini streaming error ${response.status}: ${errText}`);
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
            const parsed = JSON.parse(jsonStr) as GeminiResponse;
            const candidate = parsed.candidates?.[0];
            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  yield part.text;
                }
              }
            }
          } catch {
            // Partial JSON, skip
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

    const batchSize = 100;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const embeddings = await this.retryWithBackoff(async () => {
        const url = `${this.baseUrl}/models/${model}:batchEmbedContents?key=${this.apiKey}`;
        const requests = batch.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }));

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.error('Gemini embed error', { status: response.status, body: errText });
          throw new Error(`Gemini embed error ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          embeddings: { values: number[] }[];
        };
        return data.embeddings.map((e) => e.values);
      });

      results.push(...embeddings);
    }

    return results;
  }
}
