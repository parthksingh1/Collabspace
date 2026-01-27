import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

let producer: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await producer.connect();
    logger.info('Kafka producer connected');
  }
  return producer;
}

export interface ProjectEvent {
  type: string;
  projectId: string;
  userId: string;
  workspaceId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export async function publishProjectEvent(event: ProjectEvent): Promise<void> {
  try {
    const prod = await getProducer();
    const record: ProducerRecord = {
      topic: 'project-events',
      messages: [
        {
          key: event.projectId,
          value: JSON.stringify(event),
          headers: {
            'event-type': event.type,
            'user-id': event.userId,
            'workspace-id': event.workspaceId,
          },
        },
      ],
    };
    await prod.send(record);
    logger.debug('Published project event', { type: event.type, projectId: event.projectId });
  } catch (err) {
    logger.error('Failed to publish project event', {
      type: event.type,
      projectId: event.projectId,
      message: (err as Error).message,
    });
  }
}

export async function publishTaskEvent(event: {
  type: string;
  taskId: string;
  projectId: string;
  userId: string;
  workspaceId: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const prod = await getProducer();
    const record: ProducerRecord = {
      topic: 'task-events',
      messages: [
        {
          key: event.taskId,
          value: JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
          headers: {
            'event-type': event.type,
            'user-id': event.userId,
            'project-id': event.projectId,
          },
        },
      ],
    };
    await prod.send(record);
    logger.debug('Published task event', { type: event.type, taskId: event.taskId });
  } catch (err) {
    logger.error('Failed to publish task event', {
      type: event.type,
      taskId: event.taskId,
      message: (err as Error).message,
    });
  }
}

export async function publishSprintEvent(event: {
  type: string;
  sprintId: string;
  projectId: string;
  userId: string;
  workspaceId: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const prod = await getProducer();
    const record: ProducerRecord = {
      topic: 'sprint-events',
      messages: [
        {
          key: event.sprintId,
          value: JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
          headers: {
            'event-type': event.type,
            'user-id': event.userId,
            'project-id': event.projectId,
          },
        },
      ],
    };
    await prod.send(record);
    logger.debug('Published sprint event', { type: event.type, sprintId: event.sprintId });
  } catch (err) {
    logger.error('Failed to publish sprint event', {
      type: event.type,
      sprintId: event.sprintId,
      message: (err as Error).message,
    });
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('Kafka producer disconnected');
  }
}
