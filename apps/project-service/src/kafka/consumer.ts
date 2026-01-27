import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { query } from '../utils/db.js';

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
        // Unassign tasks from the removed member
        const { workspaceId, userId } = body.data as { workspaceId: string; userId: string };
        await query(
          `UPDATE tasks SET assignee_id = NULL
           WHERE assignee_id = $1
             AND project_id IN (SELECT id FROM projects WHERE workspace_id = $2 AND deleted_at IS NULL)
             AND deleted_at IS NULL`,
          [userId, workspaceId],
        );
        logger.info('Unassigned tasks for removed workspace member', { workspaceId, userId });
        break;
      }

      case 'workspace.deleted': {
        const { workspaceId } = body.data as { workspaceId: string };
        await query(
          `UPDATE projects SET deleted_at = NOW() WHERE workspace_id = $1 AND deleted_at IS NULL`,
          [workspaceId],
        );
        logger.info('Soft-deleted all projects for deleted workspace', { workspaceId });
        break;
      }

      case 'user.deleted': {
        const { userId } = body.data as { userId: string };
        // Unassign all tasks from deleted user
        await query(
          `UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $1 AND deleted_at IS NULL`,
          [userId],
        );
        logger.info('Unassigned tasks for deleted user', { userId });
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
