import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Redis client (singleton)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;
let redisAvailable = false;

function getRedis(): Redis | null {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // Prevent "max retries" throws during eval
      retryStrategy(times: number) {
        if (times > 10) return null; // Stop trying after 10 attempts
        return Math.min(times * 500, 5000);
      },
      lazyConnect: true,
      enableOfflineQueue: false, // Don't queue commands when disconnected
    });

    redis.on('connect', () => {
      redisAvailable = true;
      logger.info('Rate limiter Redis connected');
    });

    redis.on('close', () => {
      redisAvailable = false;
    });

    redis.on('error', (err: Error) => {
      redisAvailable = false;
      // Silently handle — don't crash the process
    });

    redis.connect().catch(() => {
      redisAvailable = false;
    });
  }
  return redisAvailable ? redis : null;
}

// ---------------------------------------------------------------------------
// Route tier definitions
// ---------------------------------------------------------------------------

export interface RateLimitTierConfig {
  /** Requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
}

const ROUTE_TIERS: Record<string, RateLimitTierConfig> = {
  auth: { limit: 20, windowSec: 60 },
  ai: { limit: 30, windowSec: 60 },
  default: { limit: 120, windowSec: 60 },
  upload: { limit: 10, windowSec: 60 },
};

function getTierForPath(path: string): { name: string; config: RateLimitTierConfig } {
  if (path.startsWith('/api/auth')) return { name: 'auth', config: ROUTE_TIERS.auth };
  if (path.startsWith('/api/ai')) return { name: 'ai', config: ROUTE_TIERS.ai };
  return { name: 'default', config: ROUTE_TIERS.default };
}

// ---------------------------------------------------------------------------
// Sliding window rate limiter (Redis sorted sets)
//
// Algorithm:
// - Use a sorted set per key where each member is a unique request ID
//   scored by its timestamp.
// - On each request, remove entries outside the window, count remaining,
//   and conditionally add the new entry.
// ---------------------------------------------------------------------------

const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local member = ARGV[4]

  -- Remove entries outside the window
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window * 1000)

  -- Count entries in the current window
  local count = redis.call('ZCARD', key)

  if count < limit then
    -- Add new entry
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window + 10)
    return { 1, limit - count - 1, 0 }
  else
    -- Oldest entry timestamp determines when space will free
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfterMs = 0
    if #oldest >= 2 then
      retryAfterMs = tonumber(oldest[2]) + window * 1000 - now
    end
    return { 0, 0, retryAfterMs }
  end
`;

// ---------------------------------------------------------------------------
// Global rate limit middleware
// ---------------------------------------------------------------------------

let requestCounter = 0;

export function slidingWindowRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const r = getRedis();
  if (!r) {
    // Redis unavailable — fail open, allow all requests through
    next();
    return;
  }

  rateLimitWithRedis(r, req, res, next).catch((err) => {
    logger.error('Rate limiter error, failing open', {
      message: err instanceof Error ? err.message : String(err),
    });
    next();
  });
}

async function rateLimitWithRedis(
  r: Redis,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const userId = (req.headers['x-user-id'] as string) ?? undefined;
    const tier = getTierForPath(req.path);

    const now = Date.now();
    requestCounter++;
    const member = `${now}:${requestCounter}`;

    // ---- Per-IP limiting ----
    const ipKey = `gw:rl:${tier.name}:ip:${ip}`;
    const ipResult = (await r.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      ipKey,
      now.toString(),
      tier.config.windowSec.toString(),
      tier.config.limit.toString(),
      member,
    )) as [number, number, number];

    const ipAllowed = ipResult[0] === 1;
    const ipRemaining = ipResult[1];
    const ipRetryAfterMs = ipResult[2];

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', tier.config.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, ipRemaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + tier.config.windowSec * 1000) / 1000));

    if (!ipAllowed) {
      const retryAfter = Math.max(1, Math.ceil(ipRetryAfterMs / 1000));
      res.setHeader('Retry-After', retryAfter);
      logger.warn('Rate limit exceeded (IP)', { ip, tier: tier.name, retryAfter });
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter,
        },
      });
      return;
    }

    // ---- Per-user limiting (higher limits) ----
    if (userId) {
      const userLimit = Math.ceil(tier.config.limit * 2);
      const userKey = `gw:rl:${tier.name}:user:${userId}`;
      const userMember = `${now}:u:${requestCounter}`;

      const userResult = (await r.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        userKey,
        now.toString(),
        tier.config.windowSec.toString(),
        userLimit.toString(),
        userMember,
      )) as [number, number, number];

      const userAllowed = userResult[0] === 1;
      const userRetryAfterMs = userResult[2];

      if (!userAllowed) {
        const retryAfter = Math.max(1, Math.ceil(userRetryAfterMs / 1000));
        res.setHeader('Retry-After', retryAfter);
        logger.warn('Rate limit exceeded (user)', { userId, tier: tier.name, retryAfter });
        res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter,
          },
        });
        return;
      }
    }

    // ---- Global rate limit ----
    const globalKey = 'gw:rl:global';
    const globalMember = `${now}:g:${requestCounter}`;
    const globalWindowSec = Math.ceil(config.globalRateLimit.windowMs / 1000);

    const globalResult = (await r.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      globalKey,
      now.toString(),
      globalWindowSec.toString(),
      config.globalRateLimit.max.toString(),
      globalMember,
    )) as [number, number, number];

    const globalAllowed = globalResult[0] === 1;
    const globalRetryAfterMs = globalResult[2];

    if (!globalAllowed) {
      const retryAfter = Math.max(1, Math.ceil(globalRetryAfterMs / 1000));
      res.setHeader('Retry-After', retryAfter);
      logger.warn('Global rate limit exceeded', { retryAfter });
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Service is experiencing high load. Please try again later.',
          retryAfter,
        },
      });
      return;
    }

    next();
}
