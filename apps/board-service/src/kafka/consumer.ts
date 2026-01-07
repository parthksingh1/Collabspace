import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getRedis } from '../utils/redis.js';

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

let consumer: Consumer | null = null;

async function handleMessage(payload: EachMessagePayload): Promise<void> {
  const { topic, partition, message } = payload;
  const eventType = message.headers?.['event-type']?.toString() ?? 'unknown';

  logger.debug('Received Kafka message', {
    topic,
    partition,
    offset: message.offset,
    eventType,
  });

  try {
    const body = message.value ? JSON.parse(message.value.toString()) : null;
    if (!body) return;

    switch (eventType) {
      case 'workspace.member_removed': {
        // When a member is removed from workspace, revoke their board access
        const { workspaceId, userId } = body.data as { workspaceId: string; userId: string };
        const redis = getRedis();
        const boardKeys = await redis.keys(`board:access:${workspaceId}:${userId}:*`);
        if (boardKeys.length > 0) {
          await redis.del(...boardKeys);
          logger.info('Revoked board access for removed workspace member', { workspaceId, userId });
        }
        break;
      }

      case 'workspace.deleted': {
        // Mark all boards in workspace as deleted
        const { workspaceId } = body.data as { workspaceId: string };
        logger.info('Workspace deleted, boards will be cleaned up', { workspaceId });
        // The actual DB cleanup is handled by a scheduled job or direct query
        break;
      }

      case 'user.avatar_updated': {
        // Invalidate cached board data containing user info
        const { userId } = body.data as { userId: string };
        const redis = getRedis();
        const cacheKeys = await redis.keys(`board:owner:${userId}:*`);
        if (cacheKeys.length > 0) {
          await redis.del(...cacheKeys);
          logger.debug('Invalidated board cache for user avatar update', { userId });
        }
        break;
      }

      default:
        logger.debug('Unhandled event type', { eventType });
    }
  } catch (err) {
    logger.error('Error processing Kafka message', {
      topic,
      eventType,
      message: (err as Error).message,
    });
  }
}

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  logger.info('Kafka consumer connected');

  await consumer.subscribe({ topics: ['workspace-events', 'user-events'], fromBeginning: false });

  await consumer.run({
    eachMessage: handleMessage,
  });

  logger.info('Kafka consumer running');
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
    logger.info('Kafka consumer disconnected');
  }
}
