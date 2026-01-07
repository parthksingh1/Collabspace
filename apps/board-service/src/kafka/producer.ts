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

export interface BoardEvent {
  type: string;
  boardId: string;
  userId: string;
  workspaceId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export async function publishBoardEvent(event: BoardEvent): Promise<void> {
  try {
    const prod = await getProducer();
    const record: ProducerRecord = {
      topic: 'board-events',
      messages: [
        {
          key: event.boardId,
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
    logger.debug('Published board event', { type: event.type, boardId: event.boardId });
  } catch (err) {
    logger.error('Failed to publish board event', {
      type: event.type,
      boardId: event.boardId,
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
