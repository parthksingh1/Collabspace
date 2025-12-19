import { logger } from '../utils/logger.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

interface RateLimitEntry {
  requestBucket: TokenBucket;
  tokenBucket: TokenBucket;
  queue: QueuedRequest[];
}

interface QueuedRequest {
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
  tokensNeeded: number;
  enqueuedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface RateLimiterOptions {
  requestsPerMinute: number;
  tokensPerMinute: number;
  queueTimeoutMs: number;
  maxQueueSize: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  requestsPerMinute: 60,
  tokensPerMinute: 100_000,
  queueTimeoutMs: 30_000,
  maxQueueSize: 100,
};

function createBucket(maxTokens: number, refillPerMinute: number): TokenBucket {
  return {
    tokens: maxTokens,
    lastRefill: Date.now(),
    maxTokens,
    refillRate: refillPerMinute / 60_000,
  };
}

function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const newTokens = elapsed * bucket.refillRate;
  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + newTokens);
  bucket.lastRefill = now;
}

function tryConsume(bucket: TokenBucket, amount: number): boolean {
  refillBucket(bucket);
  if (bucket.tokens >= amount) {
    bucket.tokens -= amount;
    return true;
  }
  return false;
}

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private options: RateLimiterOptions;
  private drainInterval: ReturnType<typeof setInterval>;

  constructor(options?: Partial<RateLimiterOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.drainInterval = setInterval(() => this.drainQueues(), 1000);
  }

  private getEntry(key: string): RateLimitEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        requestBucket: createBucket(
          this.options.requestsPerMinute,
          this.options.requestsPerMinute,
        ),
        tokenBucket: createBucket(
          this.options.tokensPerMinute,
          this.options.tokensPerMinute,
        ),
        queue: [],
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  async acquire(key: string, estimatedTokens: number = 1): Promise<void> {
    const entry = this.getEntry(key);

    // Try immediate consumption
    const requestOk = tryConsume(entry.requestBucket, 1);
    const tokenOk = estimatedTokens <= 0 || tryConsume(entry.tokenBucket, estimatedTokens);

    if (requestOk && tokenOk) {
      return;
    }

    // If either failed, restore the request token if it was consumed
    if (requestOk && !tokenOk) {
      entry.requestBucket.tokens += 1;
    }

    // Queue the request
    if (entry.queue.length >= this.options.maxQueueSize) {
      throw new RateLimitError(
        `Rate limit queue full for ${key}`,
        this.getRetryAfterMs(entry),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = entry.queue.findIndex((q) => q.resolve === resolve);
        if (idx !== -1) {
          entry.queue.splice(idx, 1);
        }
        reject(new RateLimitError(
          `Rate limit queue timeout for ${key}`,
          this.getRetryAfterMs(entry),
        ));
      }, this.options.queueTimeoutMs);

      entry.queue.push({
        resolve,
        reject,
        tokensNeeded: estimatedTokens,
        enqueuedAt: Date.now(),
        timeoutId,
      });
    });
  }

  private drainQueues(): void {
    for (const [key, entry] of this.entries) {
      while (entry.queue.length > 0) {
        const next = entry.queue[0];
        const requestOk = tryConsume(entry.requestBucket, 1);
        const tokenOk = next.tokensNeeded <= 0 || tryConsume(entry.tokenBucket, next.tokensNeeded);

        if (requestOk && tokenOk) {
          entry.queue.shift();
          clearTimeout(next.timeoutId);
          next.resolve();
        } else {
          if (requestOk) {
            entry.requestBucket.tokens += 1;
          }
          break;
        }
      }

      // Clean up empty entries
      if (entry.queue.length === 0) {
        const sinceLastRefill = Date.now() - entry.requestBucket.lastRefill;
        if (sinceLastRefill > 300_000) {
          this.entries.delete(key);
        }
      }
    }
  }

  private getRetryAfterMs(entry: RateLimitEntry): number {
    refillBucket(entry.requestBucket);
    refillBucket(entry.tokenBucket);

    if (entry.requestBucket.tokens < 1) {
      const needed = 1 - entry.requestBucket.tokens;
      return Math.ceil(needed / entry.requestBucket.refillRate);
    }

    return 1000;
  }

  getRemainingRequests(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return this.options.requestsPerMinute;
    refillBucket(entry.requestBucket);
    return Math.floor(entry.requestBucket.tokens);
  }

  getRemainingTokens(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return this.options.tokensPerMinute;
    refillBucket(entry.tokenBucket);
    return Math.floor(entry.tokenBucket.tokens);
  }

  destroy(): void {
    clearInterval(this.drainInterval);
    for (const entry of this.entries.values()) {
      for (const queued of entry.queue) {
        clearTimeout(queued.timeoutId);
        queued.reject(new Error('Rate limiter destroyed'));
      }
    }
    this.entries.clear();
  }
}

export class RateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export const userRateLimiter = new RateLimiter();

export const providerRateLimiters: Map<string, RateLimiter> = new Map();

export function getProviderRateLimiter(provider: string, options?: Partial<RateLimiterOptions>): RateLimiter {
  let limiter = providerRateLimiters.get(provider);
  if (!limiter) {
    limiter = new RateLimiter(options);
    providerRateLimiters.set(provider, limiter);
    logger.info(`Created rate limiter for provider: ${provider}`);
  }
  return limiter;
}
