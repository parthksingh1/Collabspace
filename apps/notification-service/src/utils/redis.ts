import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let redisSub: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        logger.warn(`Redis reconnecting, attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (err: Error) => {
      logger.error('Redis error', { message: err.message });
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.connect().catch((err: Error) => {
      logger.error('Redis initial connection failed', { message: err.message });
    });
  }

  return redisClient;
}

export function getRedisSubscriber(): Redis {
  if (!redisSub) {
    redisSub = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
    });

    redisSub.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    redisSub.on('error', (err: Error) => {
      logger.error('Redis subscriber error', { message: err.message });
    });

    redisSub.connect().catch((err: Error) => {
      logger.error('Redis subscriber connection failed', { message: err.message });
    });
  }

  return redisSub;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (redisSub) {
    await redisSub.quit();
    redisSub = null;
  }
  logger.info('Redis disconnected');
}
