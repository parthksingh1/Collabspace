import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // Don't throw on individual commands when disconnected
      enableOfflineQueue: false,
      retryStrategy(times: number) {
        if (times > 10) return null; // Stop reconnecting after 10 attempts
        const delay = Math.min(times * 500, 5000);
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

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}
