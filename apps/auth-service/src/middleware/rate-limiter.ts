import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../utils/redis.js';
import { TooManyRequestsError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Rate limit tier definitions
// ---------------------------------------------------------------------------

export interface RateLimitTier {
  /** Maximum number of tokens in the bucket */
  maxTokens: number;
  /** Tokens refilled per second */
  refillRate: number;
  /** Tokens consumed per request */
  tokensPerRequest: number;
}

const TIERS: Record<string, RateLimitTier> = {
  /** Strict tier for authentication endpoints */
  auth: {
    maxTokens: 10,
    refillRate: 0.5,       // 1 token every 2 seconds
    tokensPerRequest: 1,
  },
  /** Normal tier for standard API endpoints */
  api: {
    maxTokens: 60,
    refillRate: 2,         // 2 tokens per second
    tokensPerRequest: 1,
  },
  /** Relaxed tier for WebSocket-related endpoints */
  ws: {
    maxTokens: 120,
    refillRate: 5,         // 5 tokens per second
    tokensPerRequest: 1,
  },
};

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

const BUCKET_PREFIX = 'rl:bucket:';

function getIpKey(tier: string, ip: string): string {
  return `${BUCKET_PREFIX}${tier}:ip:${ip}`;
}

function getUserKey(tier: string, userId: string): string {
  return `${BUCKET_PREFIX}${tier}:user:${userId}`;
}

// ---------------------------------------------------------------------------
// Token bucket algorithm (using Redis for distributed state)
//
// Stored as a hash: { tokens: number, lastRefill: epoch_ms }
// ---------------------------------------------------------------------------

async function consumeToken(
  key: string,
  tier: RateLimitTier,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();

  // Use a Lua script for atomic token bucket operation
  const luaScript = `
    local key = KEYS[1]
    local maxTokens = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local tokensPerReq = tonumber(ARGV[3])
    local nowMs = tonumber(ARGV[4])

    local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
    local tokens = tonumber(data[1])
    local lastRefill = tonumber(data[2])

    if tokens == nil then
      -- First request: initialize bucket
      tokens = maxTokens
      lastRefill = nowMs
    end

    -- Calculate token refill
    local elapsed = (nowMs - lastRefill) / 1000
    tokens = math.min(maxTokens, tokens + elapsed * refillRate)
    lastRefill = nowMs

    local allowed = 0
    if tokens >= tokensPerReq then
      tokens = tokens - tokensPerReq
      allowed = 1
    end

    redis.call('HMSET', key, 'tokens', tostring(tokens), 'lastRefill', tostring(lastRefill))
    -- Expire the key after the bucket would be full again (avoid stale keys)
    local ttl = math.ceil(maxTokens / refillRate) + 60
    redis.call('EXPIRE', key, ttl)

    -- Time until one token is refilled
    local resetMs = 0
    if allowed == 0 then
      resetMs = math.ceil((tokensPerReq - tokens) / refillRate * 1000)
    end

    return { allowed, math.floor(tokens), resetMs }
  `;

  const result = (await redis.eval(
    luaScript,
    1,
    key,
    tier.maxTokens.toString(),
    tier.refillRate.toString(),
    tier.tokensPerRequest.toString(),
    now.toString(),
  )) as [number, number, number];

  const allowed = result[0] === 1;
  const remaining = result[1];
  const resetDeltaMs = result[2];
  const resetAt = Math.ceil((now + resetDeltaMs) / 1000);

  return { allowed, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Rate limiter middleware factory
// ---------------------------------------------------------------------------

export function rateLimiter(tierName: string = 'api') {
  const tier = TIERS[tierName] ?? TIERS.api;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const userId = req.user?.userId;

      // Per-IP rate limiting
      const ipKey = getIpKey(tierName, ip);
      const ipResult = await consumeToken(ipKey, tier);

      // Set rate limit headers based on IP bucket
      res.setHeader('X-RateLimit-Limit', tier.maxTokens);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, ipResult.remaining));
      res.setHeader('X-RateLimit-Reset', ipResult.resetAt);

      if (!ipResult.allowed) {
        const retryAfter = Math.max(1, ipResult.resetAt - Math.floor(Date.now() / 1000));
        res.setHeader('Retry-After', retryAfter);

        logger.warn('Rate limit exceeded (IP)', {
          ip,
          tier: tierName,
          retryAfter,
        });

        next(new TooManyRequestsError(retryAfter, 'Rate limit exceeded. Please try again later.'));
        return;
      }

      // Per-user rate limiting (applied in addition to IP limiting)
      if (userId) {
        const userTier: RateLimitTier = {
          ...tier,
          maxTokens: tier.maxTokens * 2, // Users get higher limits
          refillRate: tier.refillRate * 1.5,
        };

        const userKey = getUserKey(tierName, userId);
        const userResult = await consumeToken(userKey, userTier);

        if (!userResult.allowed) {
          const retryAfter = Math.max(1, userResult.resetAt - Math.floor(Date.now() / 1000));
          res.setHeader('Retry-After', retryAfter);

          logger.warn('Rate limit exceeded (user)', {
            userId,
            tier: tierName,
            retryAfter,
          });

          next(new TooManyRequestsError(retryAfter, 'Rate limit exceeded. Please try again later.'));
          return;
        }

        // Expose user-level remaining as well
        res.setHeader('X-RateLimit-Remaining', Math.min(ipResult.remaining, userResult.remaining));
      }

      next();
    } catch (err) {
      // If Redis is down, allow the request through (fail-open for availability)
      logger.error('Rate limiter error, failing open', {
        message: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  };
}

// ---------------------------------------------------------------------------
// Pre-configured middleware instances
// ---------------------------------------------------------------------------

export const authRateLimiter = rateLimiter('auth');
export const apiRateLimiter = rateLimiter('api');
export const wsRateLimiter = rateLimiter('ws');
