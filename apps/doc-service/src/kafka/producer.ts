import { Kafka, type Producer, type ProducerRecord } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ── Producer singleton ────────────────────────────────────────────────────────

let producer: Producer | null = null;
let kafka: Kafka | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    kafka = new Kafka({
      clientId: 'doc-service-producer',
      brokers: config.kafkaBrokers,
      retry: { retries: 5, initialRetryTime: 300 },
    });

    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30_000,
    });

    await producer.connect();
    logger.info('Kafka producer connected');
  }

  return producer;
}

// ── Publish helpers ─────────────────────────────��───────────────────────────

export async function publishDocumentEvent(
  event: 'created' | 'updated' | 'deleted' | 'restored' | 'exported',
  documentId: string,
  userId: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const p = await getProducer();
    const record: ProducerRecord = {
      topic: 'document-events',
      messages: [
        {
          key: documentId,
          value: JSON.stringify({
            event,
            documentId,
            userId,
            data,
            timestamp: new Date().toISOString(),
          }),
          headers: {
            'event-type': event,
            'service': 'doc-service',
          },
        },
      ],
    };

    await p.send(record);
    logger.debug('Document event published', { event, documentId });
  } catch (err) {
    logger.error('Failed to publish document event', {
      event,
      documentId,
      error: (err as Error).message,
    });
  }
}

export async function publishNotificationEvent(
  type: 'mention' | 'comment' | 'share',
  recipientUserIds: string[],
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const p = await getProducer();

    const messages = recipientUserIds.map((userId) => ({
      key: userId,
      value: JSON.stringify({
        type,
        recipientUserId: userId,
        data,
        timestamp: new Date().toISOString(),
      }),
      headers: {
        'notification-type': type,
        'service': 'doc-service',
      },
    }));

    await p.send({
      topic: 'notification-events',
      messages,
    });

    logger.debug('Notification events published', { type, recipientCount: recipientUserIds.length });
  } catch (err) {
    logger.error('Failed to publish notification event', {
      type,
      error: (err as Error).message,
    });
  }
}

// ── Shutdown ─────────��───────────────────────────���────────────────────────────

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('Kafka producer disconnected');
  }
}
