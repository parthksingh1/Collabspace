import { logger } from '../utils/logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxRequests: number;
  monitorWindowMs: number;
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  halfOpenRequests: number;
}

type CircuitEvent = 'state_change' | 'failure' | 'success' | 'rejected';
type CircuitListener = (data: { provider: string; state: CircuitState; stats: CircuitStats }) => void;

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  halfOpenMaxRequests: 3,
  monitorWindowMs: 60_000,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    halfOpenRequests: 0,
  };
  private options: CircuitBreakerOptions;
  private provider: string;
  private listeners: Map<CircuitEvent, CircuitListener[]> = new Map();
  private failureTimestamps: number[] = [];

  constructor(provider: string, options?: Partial<CircuitBreakerOptions>) {
    this.provider = provider;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  on(event: CircuitEvent, listener: CircuitListener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  private emit(event: CircuitEvent): void {
    const listeners = this.listeners.get(event) ?? [];
    const data = { provider: this.provider, state: this.state, stats: { ...this.stats } };
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (err) {
        logger.error('Circuit breaker listener error', {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.stats.lastFailureTime;
      if (elapsed >= this.options.recoveryTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return this.state;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    logger.info(`Circuit breaker [${this.provider}]: ${oldState} -> ${newState}`);

    if (newState === 'half-open') {
      this.stats.halfOpenRequests = 0;
    }
    if (newState === 'closed') {
      this.stats.failures = 0;
      this.stats.successes = 0;
      this.failureTimestamps = [];
    }

    this.emit('state_change');
  }

  canExecute(): boolean {
    const currentState = this.getState();

    if (currentState === 'closed') return true;

    if (currentState === 'half-open') {
      if (this.stats.halfOpenRequests < this.options.halfOpenMaxRequests) {
        return true;
      }
      return false;
    }

    // open
    return false;
  }

  recordSuccess(): void {
    this.stats.successes++;
    this.emit('success');

    if (this.state === 'half-open') {
      this.stats.halfOpenRequests++;
      if (this.stats.halfOpenRequests >= this.options.halfOpenMaxRequests) {
        this.transitionTo('closed');
      }
    }
  }

  recordFailure(): void {
    const now = Date.now();
    this.stats.failures++;
    this.stats.lastFailureTime = now;
    this.failureTimestamps.push(now);
    this.emit('failure');

    // Clean up old failure timestamps outside the monitor window
    const windowStart = now - this.options.monitorWindowMs;
    this.failureTimestamps = this.failureTimestamps.filter((t) => t >= windowStart);

    if (this.state === 'half-open') {
      this.transitionTo('open');
      return;
    }

    if (this.state === 'closed' && this.failureTimestamps.length >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      this.emit('rejected');
      throw new Error(`Circuit breaker [${this.provider}] is open — request rejected`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  reset(): void {
    this.transitionTo('closed');
  }

  getStats(): { state: CircuitState; stats: CircuitStats } {
    return { state: this.getState(), stats: { ...this.stats } };
  }
}

export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  get(provider: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let breaker = this.breakers.get(provider);
    if (!breaker) {
      breaker = new CircuitBreaker(provider, options);
      breaker.on('state_change', (data) => {
        logger.warn(`Circuit breaker state change`, {
          provider: data.provider,
          state: data.state,
          failures: data.stats.failures,
        });
      });
      this.breakers.set(provider, breaker);
    }
    return breaker;
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
