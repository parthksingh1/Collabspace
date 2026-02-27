import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let redisSub: Redis | null = null;
let redisPub: Redis | null = null;

function createRedisClient(label: string): Redis {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      logger.warn(`Redis [${label}] reconnecting, attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    logger.info(`Redis [${label}] connected`);
  });

  client.on('error', (err: Error) => {
    logger.error(`Redis [${label}] error`, { message: err.message });
  });

  client.on('close', () => {
    logger.warn(`Redis [${label}] connection closed`);
  });

  client.connect().catch((err: Error) => {
    logger.error(`Redis [${label}] initial connection failed`, { message: err.message });
  });

  return client;
}

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient('main');
  }
  return redisClient;
}

export function getRedisSub(): Redis {
  if (!redisSub) {
    redisSub = createRedisClient('sub');
  }
  return redisSub;
}

export function getRedisPub(): Redis {
  if (!redisPub) {
    redisPub = createRedisClient('pub');
  }
  return redisPub;
}

export async function closeAllRedis(): Promise<void> {
  const clients = [
    { client: redisClient, label: 'main' },
    { client: redisSub, label: 'sub' },
    { client: redisPub, label: 'pub' },
  ];

  for (const { client, label } of clients) {
    if (client) {
      await client.quit();
      logger.info(`Redis [${label}] disconnected`);
    }
  }

  redisClient = null;
  redisSub = null;
  redisPub = null;
}
