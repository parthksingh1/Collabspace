import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { droppedMessages } from '../metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  bufferedMessages: string[];
  warned: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  buffered: boolean;
  retryAfterMs?: number;
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────

export class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly burstSize: number;
  private readonly maxBufferSize = 50;
  private drainTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    this.maxTokens = config.rateLimitBurstSize;
    this.refillRate = config.rateLimitMessagesPerSecond / 1000;
    this.burstSize = config.rateLimitBurstSize;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Check if a message from the given connection should be allowed.
   * Returns { allowed, buffered } indicating whether the message is:
   * - allowed: can be processed immediately
   * - buffered: queued for later delivery (backpressure)
   * - neither: dropped
   */
  consume(connectionId: string, message?: string): RateLimitResult {
    const bucket = this.getOrCreateBucket(connectionId);
    this.refillTokens(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.warned = false;
      return { allowed: true, buffered: false };
    }

    // Out of tokens: try to buffer
    if (message && bucket.bufferedMessages.length < this.maxBufferSize) {
      bucket.bufferedMessages.push(message);
      this.ensureDrainTimer(connectionId);

      if (!bucket.warned) {
        bucket.warned = true;
        logger.warn('Rate limit hit, buffering messages', { connectionId });
      }

      return { allowed: false, buffered: true };
    }

    // Buffer full: drop the message
    droppedMessages.labels('rate_limit').inc();
    logger.warn('Rate limit exceeded, dropping message', {
      connectionId,
      bufferSize: bucket.bufferedMessages.length,
    });

    const timeToNextToken = (1 - bucket.tokens) / this.refillRate;
    return { allowed: false, buffered: false, retryAfterMs: Math.ceil(timeToNextToken) };
  }

  /**
   * Drain one buffered message for a connection (called by timer).
   * Returns the message if available, null otherwise.
   */
  drainOne(connectionId: string): string | null {
    const bucket = this.buckets.get(connectionId);
    if (!bucket || bucket.bufferedMessages.length === 0) {
      this.clearDrainTimer(connectionId);
      return null;
    }

    this.refillTokens(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return bucket.bufferedMessages.shift() ?? null;
    }

    return null;
  }

  /**
   * Remove all state for a connection.
   */
  removeConnection(connectionId: string): void {
    this.buckets.delete(connectionId);
    this.clearDrainTimer(connectionId);
  }

  /**
   * Get the number of buffered messages for a connection.
   */
  getBufferSize(connectionId: string): number {
    return this.buckets.get(connectionId)?.bufferedMessages.length ?? 0;
  }

  /**
   * Register a callback to process drained messages.
   */
  onDrain: ((connectionId: string, message: string) => void) | null = null;

  // ── Internal ──────────────────────────────────────────────────────────────

  private getOrCreateBucket(connectionId: string): RateLimitBucket {
    let bucket = this.buckets.get(connectionId);
    if (!bucket) {
      bucket = {
        tokens: this.maxTokens,
        lastRefill: Date.now(),
        bufferedMessages: [],
        warned: false,
      };
      this.buckets.set(connectionId, bucket);
    }
    return bucket;
  }

  private refillTokens(bucket: RateLimitBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    bucket.tokens = Math.min(this.burstSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private ensureDrainTimer(connectionId: string): void {
    if (this.drainTimers.has(connectionId)) return;

    const interval = Math.ceil(1000 / config.rateLimitMessagesPerSecond);
    const timer = setInterval(() => {
      const msg = this.drainOne(connectionId);
      if (msg && this.onDrain) {
        try {
          this.onDrain(connectionId, msg);
        } catch (err) {
          logger.error('Drain callback error', {
            connectionId,
            error: (err as Error).message,
          });
        }
      }

      // Stop if buffer empty
      const bucket = this.buckets.get(connectionId);
      if (!bucket || bucket.bufferedMessages.length === 0) {
        this.clearDrainTimer(connectionId);
      }
    }, interval);

    this.drainTimers.set(connectionId, timer);
  }

  private clearDrainTimer(connectionId: string): void {
    const timer = this.drainTimers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.drainTimers.delete(connectionId);
    }
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  shutdown(): void {
    for (const [id] of this.drainTimers) {
      this.clearDrainTimer(id);
    }
    this.buckets.clear();
  }
}
