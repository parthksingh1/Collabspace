import { BaseLLMProvider, LLMMessage, LLMOptions, LLMResponse } from '../providers/base-provider.js';
import { GeminiProvider } from '../providers/gemini-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import { getProviderRateLimiter, RateLimitError } from './rate-limiter.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskType =
  | 'code_generation'
  | 'long_context'
  | 'fast_response'
  | 'embedding'
  | 'complex_reasoning'
  | 'general';

interface CostRecord {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  timestamp: number;
}

interface ProviderEntry {
  provider: BaseLLMProvider;
  priority: number;
  enabled: boolean;
}

// Rough cost per 1M tokens (USD) — input / output
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'text-embedding-004': { input: 0.0, output: 0.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.0 },
  'text-embedding-3-small': { input: 0.02, output: 0.0 },
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export class AIRouter {
  private providers: Map<string, ProviderEntry> = new Map();
  private costLog: CostRecord[] = [];
  private roundRobinIndex: number = 0;

  constructor() {
    this.initProviders();
  }

  private initProviders(): void {
    if (config.providers.gemini.enabled) {
      this.providers.set('gemini', {
        provider: new GeminiProvider(),
        priority: config.providers.gemini.priority,
        enabled: true,
      });
      logger.info('Registered LLM provider: gemini');
    }

    if (config.providers.openai.enabled) {
      this.providers.set('openai', {
        provider: new OpenAIProvider(),
        priority: config.providers.openai.priority,
        enabled: true,
      });
      logger.info('Registered LLM provider: openai');
    }

    if (this.providers.size === 0) {
      logger.warn('No LLM providers are enabled — AI features will be unavailable');
    }
  }

  // ---------------------------------------------------------------------------
  // Task → model mapping
  // ---------------------------------------------------------------------------

  private getPreferredProviderAndModel(taskType: TaskType): { provider: string; modelTier: string }[] {
    switch (taskType) {
      case 'code_generation':
        return [
          { provider: 'gemini', modelTier: 'pro' },
          { provider: 'openai', modelTier: 'pro' },
        ];
      case 'long_context':
        return [
          { provider: 'gemini', modelTier: 'pro' },
          { provider: 'openai', modelTier: 'pro' },
        ];
      case 'fast_response':
        return [
          { provider: 'gemini', modelTier: 'fast' },
          { provider: 'openai', modelTier: 'fast' },
        ];
      case 'embedding':
        return [
          { provider: 'gemini', modelTier: 'embed' },
          { provider: 'openai', modelTier: 'embed' },
        ];
      case 'complex_reasoning':
        return [
          { provider: 'gemini', modelTier: 'pro' },
          { provider: 'openai', modelTier: 'pro' },
        ];
      case 'general':
      default:
        return [
          { provider: 'gemini', modelTier: 'fast' },
          { provider: 'openai', modelTier: 'fast' },
        ];
    }
  }

  private resolveModelName(providerName: string, tier: string): string {
    const providerConfig = config.providers[providerName];
    if (!providerConfig) return tier;
    return providerConfig.models[tier as keyof typeof providerConfig.models] ?? tier;
  }

  // ---------------------------------------------------------------------------
  // Provider selection with fallback
  // ---------------------------------------------------------------------------

  private getAvailableProviders(taskType: TaskType): { provider: BaseLLMProvider; model: string; name: string }[] {
    const preferences = this.getPreferredProviderAndModel(taskType);
    const available: { provider: BaseLLMProvider; model: string; name: string }[] = [];

    for (const pref of preferences) {
      const entry = this.providers.get(pref.provider);
      if (!entry || !entry.enabled) continue;

      const breaker = circuitBreakerRegistry.get(pref.provider);
      if (!breaker.canExecute()) {
        logger.debug(`Skipping provider ${pref.provider} — circuit breaker open`);
        continue;
      }

      const model = this.resolveModelName(pref.provider, pref.modelTier);
      available.push({ provider: entry.provider, model, name: pref.provider });
    }

    // If no preferred providers available, try all providers sorted by priority
    if (available.length === 0) {
      const sorted = [...this.providers.entries()]
        .filter(([, entry]) => entry.enabled)
        .sort((a, b) => a[1].priority - b[1].priority);

      for (const [name, entry] of sorted) {
        const breaker = circuitBreakerRegistry.get(name);
        if (!breaker.canExecute()) continue;

        const tier = taskType === 'embedding' ? 'embed' : 'fast';
        const model = this.resolveModelName(name, tier);
        available.push({ provider: entry.provider, model, name });
      }
    }

    return available;
  }

  // ---------------------------------------------------------------------------
  // Cost tracking
  // ---------------------------------------------------------------------------

  private trackCost(provider: string, model: string, promptTokens: number, completionTokens: number): void {
    const costs = COST_TABLE[model] ?? { input: 0.5, output: 1.5 };
    const estimatedCostUsd =
      (promptTokens / 1_000_000) * costs.input +
      (completionTokens / 1_000_000) * costs.output;

    this.costLog.push({
      provider,
      model,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      timestamp: Date.now(),
    });

    // Keep only last 10,000 records
    if (this.costLog.length > 10_000) {
      this.costLog = this.costLog.slice(-5_000);
    }

    logger.debug('AI request cost', {
      provider,
      model,
      promptTokens,
      completionTokens,
      costUsd: estimatedCostUsd.toFixed(6),
    });
  }

  getCostSummary(sinceMs?: number): {
    totalCostUsd: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
    totalRequests: number;
  } {
    const since = sinceMs ? Date.now() - sinceMs : 0;
    const relevant = this.costLog.filter((r) => r.timestamp >= since);

    const byProvider: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    let totalCostUsd = 0;

    for (const record of relevant) {
      totalCostUsd += record.estimatedCostUsd;
      byProvider[record.provider] = (byProvider[record.provider] ?? 0) + record.estimatedCostUsd;
      byModel[record.model] = (byModel[record.model] ?? 0) + record.estimatedCostUsd;
    }

    return { totalCostUsd, byProvider, byModel, totalRequests: relevant.length };
  }

  // ---------------------------------------------------------------------------
  // Main routing methods
  // ---------------------------------------------------------------------------

  async chat(
    messages: LLMMessage[],
    options: LLMOptions,
    taskType: TaskType = 'general',
    userId?: string,
  ): Promise<LLMResponse> {
    const available = this.getAvailableProviders(taskType);
    if (available.length === 0) {
      throw new Error('No LLM providers available');
    }

    // Rate limiting
    if (userId) {
      const estimatedInputTokens = messages.reduce(
        (sum, m) => sum + Math.ceil(m.content.length / 4),
        0,
      );
      try {
        const providerLimiter = getProviderRateLimiter(available[0].name, {
          requestsPerMinute: config.providers[available[0].name]?.rateLimit.requestsPerMinute ?? 60,
          tokensPerMinute: config.providers[available[0].name]?.rateLimit.tokensPerMinute ?? 100_000,
        });
        await providerLimiter.acquire(available[0].name, estimatedInputTokens);
      } catch (err) {
        if (err instanceof RateLimitError) {
          logger.warn('Rate limit hit', { userId, provider: available[0].name });
          // Try next provider
          if (available.length > 1) {
            available.shift();
          } else {
            throw err;
          }
        }
      }
    }

    let lastError: Error | undefined;

    for (const { provider, model, name } of available) {
      const breaker = circuitBreakerRegistry.get(name);

      try {
        const response = await breaker.execute(() =>
          provider.chat(messages, { ...options, model }),
        );

        this.trackCost(name, model, response.usage.promptTokens, response.usage.completionTokens);
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(`Provider ${name} failed, trying fallback`, {
          error: lastError.message,
          model,
        });
      }
    }

    throw lastError ?? new Error('All LLM providers failed');
  }

  async *stream(
    messages: LLMMessage[],
    options: LLMOptions,
    taskType: TaskType = 'general',
  ): AsyncGenerator<string> {
    const available = this.getAvailableProviders(taskType);
    if (available.length === 0) {
      throw new Error('No LLM providers available');
    }

    let lastError: Error | undefined;

    for (const { provider, model, name } of available) {
      const breaker = circuitBreakerRegistry.get(name);

      if (!breaker.canExecute()) continue;

      try {
        const generator = provider.stream(messages, { ...options, model });
        let yielded = false;

        for await (const chunk of generator) {
          yielded = true;
          yield chunk;
        }

        if (yielded) {
          breaker.recordSuccess();
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        breaker.recordFailure();
        logger.warn(`Streaming from ${name} failed, trying fallback`, {
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error('All LLM providers failed for streaming');
  }

  async embed(texts: string[], taskType: TaskType = 'embedding'): Promise<number[][]> {
    const available = this.getAvailableProviders(taskType);
    if (available.length === 0) {
      throw new Error('No LLM providers available for embeddings');
    }

    let lastError: Error | undefined;

    for (const { provider, name } of available) {
      const breaker = circuitBreakerRegistry.get(name);
      try {
        const result = await breaker.execute(() => provider.embed(texts));
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(`Embedding from ${name} failed, trying fallback`, {
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error('All LLM providers failed for embeddings');
  }

  getProviderStatus(): Record<string, { enabled: boolean; circuitState: string }> {
    const status: Record<string, { enabled: boolean; circuitState: string }> = {};
    for (const [name, entry] of this.providers) {
      const breaker = circuitBreakerRegistry.get(name);
      status[name] = {
        enabled: entry.enabled,
        circuitState: breaker.getState(),
      };
    }
    return status;
  }
}

export const aiRouter = new AIRouter();
