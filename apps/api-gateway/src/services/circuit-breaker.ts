import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Circuit Breaker States
// ---------------------------------------------------------------------------

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CircuitBreakerOptions {
  /** Name of the service protected by this breaker */
  name: string;
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Base timeout in ms before attempting recovery (half-open) */
  resetTimeoutMs: number;
  /** Maximum backoff timeout in ms */
  maxResetTimeoutMs: number;
  /** Number of successful probes in half-open to close the circuit */
  halfOpenSuccessThreshold: number;
  /** Sliding window size for failure rate calculation (seconds) */
  windowSizeMs: number;
}

const DEFAULT_OPTIONS: Omit<CircuitBreakerOptions, 'name'> = {
  failureThreshold: 5,
  resetTimeoutMs: 10000,
  maxResetTimeoutMs: 120000,
  halfOpenSuccessThreshold: 3,
  windowSizeMs: 60000,
};

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type CircuitBreakerEvent =
  | 'state_change'
  | 'failure'
  | 'success'
  | 'rejected';

type EventListener = (data: {
  name: string;
  state: CircuitState;
  previousState?: CircuitState;
  failures?: number;
}) => void;

// ---------------------------------------------------------------------------
// CircuitBreaker class
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  public readonly name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureTimestamps: number[] = [];
  private halfOpenSuccesses = 0;
  private nextAttemptTime = 0;
  private consecutiveOpenings = 0;
  private readonly options: CircuitBreakerOptions;
  private readonly listeners: Map<CircuitBreakerEvent, EventListener[]> = new Map();

  constructor(options: Partial<CircuitBreakerOptions> & { name: string }) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.name = this.options.name;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a function through the circuit breaker.
   * Throws if the circuit is open and the timeout has not elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      this.emit('rejected', {
        name: this.name,
        state: this.state,
        failures: this.failureTimestamps.length,
      });
      throw new CircuitBreakerOpenError(
        `Circuit breaker "${this.name}" is open. Retry after ${new Date(this.nextAttemptTime).toISOString()}`,
        this.name,
        this.nextAttemptTime,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count in the current window.
   */
  getFailureCount(): number {
    this.pruneOldFailures();
    return this.failureTimestamps.length;
  }

  /**
   * Get the time (epoch ms) when the circuit breaker will attempt half-open.
   */
  getNextAttemptTime(): number {
    return this.nextAttemptTime;
  }

  /**
   * Force reset the circuit breaker to closed state.
   */
  reset(): void {
    const prev = this.state;
    this.state = CircuitState.CLOSED;
    this.failureTimestamps = [];
    this.halfOpenSuccesses = 0;
    this.nextAttemptTime = 0;
    this.consecutiveOpenings = 0;

    if (prev !== CircuitState.CLOSED) {
      this.emitStateChange(prev, CircuitState.CLOSED);
    }
  }

  /**
   * Register an event listener.
   */
  on(event: CircuitBreakerEvent, listener: EventListener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN — allow limited requests for probing
    return true;
  }

  private onSuccess(): void {
    this.emit('success', { name: this.name, state: this.state });

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.halfOpenSuccessThreshold) {
        this.consecutiveOpenings = 0;
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.pruneOldFailures();

    this.emit('failure', {
      name: this.name,
      state: this.state,
      failures: this.failureTimestamps.length,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens the circuit again
      this.consecutiveOpenings++;
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      if (this.failureTimestamps.length >= this.options.failureThreshold) {
        this.consecutiveOpenings++;
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      // Exponential backoff: double the timeout for each consecutive opening, up to max
      const backoff = Math.min(
        this.options.resetTimeoutMs * Math.pow(2, this.consecutiveOpenings - 1),
        this.options.maxResetTimeoutMs,
      );
      this.nextAttemptTime = Date.now() + backoff;
      this.halfOpenSuccesses = 0;

      logger.warn(`Circuit breaker "${this.name}" opened`, {
        failures: this.failureTimestamps.length,
        nextAttempt: new Date(this.nextAttemptTime).toISOString(),
        backoffMs: backoff,
      });
    }

    if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses = 0;
      logger.info(`Circuit breaker "${this.name}" half-open, probing`);
    }

    if (newState === CircuitState.CLOSED) {
      this.failureTimestamps = [];
      this.halfOpenSuccesses = 0;
      logger.info(`Circuit breaker "${this.name}" closed (recovered)`);
    }

    this.emitStateChange(prev, newState);
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.options.windowSizeMs;
    this.failureTimestamps = this.failureTimestamps.filter((t) => t > cutoff);
  }

  private emitStateChange(from: CircuitState, to: CircuitState): void {
    this.emit('state_change', {
      name: this.name,
      state: to,
      previousState: from,
    });
  }

  private emit(event: CircuitBreakerEvent, data: Parameters<EventListener>[0]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Custom error for open circuit
// ---------------------------------------------------------------------------

export class CircuitBreakerOpenError extends Error {
  public readonly serviceName: string;
  public readonly retryAfter: number;

  constructor(message: string, serviceName: string, retryAfterEpoch: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.retryAfter = retryAfterEpoch;
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Registry: one breaker per service
// ---------------------------------------------------------------------------

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(serviceName: string): CircuitBreaker {
  let breaker = breakers.get(serviceName);
  if (!breaker) {
    breaker = new CircuitBreaker({ name: serviceName });
    breakers.set(serviceName, breaker);
  }
  return breaker;
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return breakers;
}
