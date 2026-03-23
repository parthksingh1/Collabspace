import {
  type LLMProvider,
  type ChatMessage,
  type ChatOptions,
  type ChatResponse,
  type StreamChunk,
  type EmbeddingResponse,
} from './providers/base.js';

// ─── Types ─────────────────────────────────────────────────────────

export type TaskType =
  | 'code_generation'
  | 'long_context'
  | 'fast_response'
  | 'embedding'
  | 'general'
  | 'review'
  | 'planning';

export interface RouteConfig {
  primary: string; // provider name
  secondary?: string; // fallback provider name
  model?: string; // override model
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export interface AIRouterOptions {
  /** Map of provider name to provider instance. */
  providers: Record<string, LLMProvider>;
  /** Routing rules per task type. */
  routes: Record<TaskType, RouteConfig>;
  /** Circuit breaker failure threshold. Default: 5. */
  circuitBreakerThreshold?: number;
  /** Circuit breaker reset time (ms). Default: 60000. */
  circuitBreakerResetMs?: number;
}

/**
 * Routes AI requests to the appropriate provider based on task type.
 * Includes fallback chains and circuit breaker pattern.
 */
export class AIRouter {
  private readonly providers: Record<string, LLMProvider>;
  private readonly routes: Record<TaskType, RouteConfig>;
  private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerResetMs: number;

  constructor(options: AIRouterOptions) {
    this.providers = options.providers;
    this.routes = options.routes;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold ?? 5;
    this.circuitBreakerResetMs = options.circuitBreakerResetMs ?? 60_000;
  }

  /**
   * Create a router with sensible defaults for Gemini + OpenAI.
   */
  static createDefault(providers: Record<string, LLMProvider>): AIRouter {
    return new AIRouter({
      providers,
      routes: {
        code_generation: { primary: 'gemini', secondary: 'openai', model: 'gemini-2.5-pro' },
        long_context: { primary: 'gemini', secondary: 'openai', model: 'gemini-2.5-pro' },
        fast_response: { primary: 'gemini', secondary: 'openai', model: 'gemini-2.5-flash' },
        embedding: { primary: 'openai', secondary: 'gemini' },
        general: { primary: 'gemini', secondary: 'openai', model: 'gemini-2.5-pro' },
        review: { primary: 'gemini', secondary: 'openai', model: 'gemini-2.5-pro' },
        planning: { primary: 'gemini', secondary: 'openai', model: 'gemini-2.5-pro' },
      },
    });
  }

  // ─── Circuit Breaker ───────────────────────────────────────────

  private getCircuitBreaker(providerName: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(providerName)) {
      this.circuitBreakers.set(providerName, { failures: 0, lastFailure: 0, isOpen: false });
    }
    return this.circuitBreakers.get(providerName)!;
  }

  private isCircuitOpen(providerName: string): boolean {
    const cb = this.getCircuitBreaker(providerName);
    if (!cb.isOpen) return false;

    // Check if enough time has passed to try again (half-open)
    if (Date.now() - cb.lastFailure > this.circuitBreakerResetMs) {
      cb.isOpen = false;
      cb.failures = 0;
      return false;
    }

    return true;
  }

  private recordFailure(providerName: string): void {
    const cb = this.getCircuitBreaker(providerName);
    cb.failures++;
    cb.lastFailure = Date.now();

    if (cb.failures >= this.circuitBreakerThreshold) {
      cb.isOpen = true;
    }
  }

  private recordSuccess(providerName: string): void {
    const cb = this.getCircuitBreaker(providerName);
    cb.failures = 0;
    cb.isOpen = false;
  }

  // ─── Provider Resolution ──────────────────────────────────────

  private resolveProvider(taskType: TaskType): { provider: LLMProvider; model?: string } {
    const route = this.routes[taskType];
    if (!route) {
      throw new Error(`No route configured for task type: ${taskType}`);
    }

    // Try primary
    if (!this.isCircuitOpen(route.primary) && this.providers[route.primary]) {
      return { provider: this.providers[route.primary]!, model: route.model };
    }

    // Try secondary
    if (route.secondary && !this.isCircuitOpen(route.secondary) && this.providers[route.secondary]) {
      return { provider: this.providers[route.secondary]! };
    }

    // All circuits open, try primary anyway as last resort
    if (this.providers[route.primary]) {
      return { provider: this.providers[route.primary]!, model: route.model };
    }

    throw new Error(`No available providers for task type: ${taskType}`);
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Route a chat request to the appropriate provider.
   */
  async chat(
    taskType: TaskType,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const { provider, model } = this.resolveProvider(taskType);
    const mergedOptions = { ...options, model: options?.model ?? model };

    try {
      const result = await provider.chat(messages, mergedOptions);
      this.recordSuccess(provider.providerName);
      return result;
    } catch (error) {
      this.recordFailure(provider.providerName);

      // Attempt fallback
      const route = this.routes[taskType];
      if (
        route?.secondary &&
        route.secondary !== provider.providerName &&
        this.providers[route.secondary]
      ) {
        try {
          const fallback = this.providers[route.secondary]!;
          const result = await fallback.chat(messages, options);
          this.recordSuccess(fallback.providerName);
          return result;
        } catch (fallbackError) {
          this.recordFailure(route.secondary);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Route a streaming chat request to the appropriate provider.
   */
  async *stream(
    taskType: TaskType,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { provider, model } = this.resolveProvider(taskType);
    const mergedOptions = { ...options, model: options?.model ?? model };

    try {
      const gen = provider.stream(messages, mergedOptions);
      for await (const chunk of gen) {
        yield chunk;
      }
      this.recordSuccess(provider.providerName);
    } catch (error) {
      this.recordFailure(provider.providerName);

      // Attempt fallback
      const route = this.routes[taskType];
      if (
        route?.secondary &&
        route.secondary !== provider.providerName &&
        this.providers[route.secondary]
      ) {
        try {
          const fallback = this.providers[route.secondary]!;
          const gen = fallback.stream(messages, options);
          for await (const chunk of gen) {
            yield chunk;
          }
          this.recordSuccess(fallback.providerName);
          return;
        } catch (fallbackError) {
          this.recordFailure(route.secondary);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Route an embedding request.
   */
  async embed(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const { provider } = this.resolveProvider('embedding');

    try {
      const result = await provider.embed(texts, model);
      this.recordSuccess(provider.providerName);
      return result;
    } catch (error) {
      this.recordFailure(provider.providerName);
      throw error;
    }
  }

  /**
   * Get circuit breaker status for all providers.
   */
  getHealthStatus(): Record<string, CircuitBreakerState> {
    const status: Record<string, CircuitBreakerState> = {};
    for (const name of Object.keys(this.providers)) {
      status[name] = this.getCircuitBreaker(name);
    }
    return status;
  }

  /**
   * Reset all circuit breakers.
   */
  resetCircuitBreakers(): void {
    this.circuitBreakers.clear();
  }
}
