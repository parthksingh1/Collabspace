import { Kafka, type Consumer, type EachMessagePayload } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { CrdtPersistenceService } from '../services/crdt-persistence.service.js';
import { CollaborationService } from '../services/collaboration.service.js';
import { publishDocumentEvent } from './producer.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentUpdateMessage {
  documentId: string;
  userId: string;
  update: number[]; // serialized Uint8Array
  timestamp: string;
}

// ── Consumer ──────────────────────────────────────────────────────────────────

let consumer: Consumer | null = null;
let kafka: Kafka | null = null;

const crdtPersistence = new CrdtPersistenceService();
const collaborationService = new CollaborationService();

export async function startConsumer(): Promise<void> {
  kafka = new Kafka({
    clientId: 'doc-service-consumer',
    brokers: config.kafkaBrokers,
    retry: { retries: 5, initialRetryTime: 300 },
  });

  consumer = kafka.consumer({
    groupId: config.kafkaGroupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  });

  await consumer.connect();
  logger.info('Kafka consumer connected');

  // Subscribe to document update topics
  await consumer.subscribe({ topic: 'document-updates', fromBeginning: false });

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      const { topic, partition, message } = payload;

      try {
        const value = message.value?.toString();
        if (!value) {
          logger.warn('Empty Kafka message', { topic, partition, offset: message.offset });
          return;
        }

        switch (topic) {
          case 'document-updates':
            await handleDocumentUpdate(value);
            break;

          default:
            logger.warn('Unknown Kafka topic', { topic });
        }
      } catch (err) {
        logger.error('Error processing Kafka message', {
          topic,
          partition,
          offset: message.offset,
          error: (err as Error).message,
          stack: config.nodeEnv === 'development' ? (err as Error).stack : undefined,
        });
      }
    },
  });

  logger.info('Kafka consumer started, listening to document-updates');
}

// ── Message handlers ──────────────────────────────────────────────────────────

async function handleDocumentUpdate(value: string): Promise<void> {
  const msg = JSON.parse(value) as DocumentUpdateMessage;
  const { documentId, userId, update } = msg;

  if (!documentId || !userId || !update) {
    logger.warn('Invalid document update message', { documentId, userId });
    return;
  }

  // Convert number[] back to Uint8Array
  const updateData = new Uint8Array(update);

  // Queue for debounced persistence
  crdtPersistence.queueUpdate(documentId, userId, updateData);

  // Update collaboration tracking
  await collaborationService.updateCollaboratorActivity(documentId, userId);

  // Record activity
  await collaborationService.recordActivity(documentId, userId, 'edit', {
    updateSize: updateData.length,
  });

  // Emit document change event for other services
  await publishDocumentEvent('updated', documentId, userId, {
    updateSize: updateData.length,
  });

  logger.debug('Document update processed', {
    documentId,
    userId,
    updateSize: updateData.length,
  });
}

// ── Getters ───────────────────────────────────────────────────────────────────

export function getCrdtPersistenceService(): CrdtPersistenceService {
  return crdtPersistence;
}

export function getCollaborationService(): CollaborationService {
  return collaborationService;
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

export async function stopConsumer(): Promise<void> {
  // Flush pending CRDT batches
  await crdtPersistence.flushAll();

  if (consumer) {
    await consumer.disconnect();
    consumer = null;
    logger.info('Kafka consumer disconnected');
  }
}
