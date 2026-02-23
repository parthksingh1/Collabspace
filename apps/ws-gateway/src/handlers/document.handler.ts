import type { AuthenticatedSocket } from '../connection-manager.js';
import { ConnectionManager } from '../connection-manager.js';
import { RoomManager } from '../room-manager.js';
import { PresenceManager } from '../presence-manager.js';
import { logger } from '../utils/logger.js';
import { messagesReceived, messagesSent } from '../metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentSyncStep1 {
  type: 'doc:sync:step1';
  documentId: string;
  stateVector: number[]; // Uint8Array serialized
}

interface DocumentSyncStep2 {
  type: 'doc:sync:step2';
  documentId: string;
  update: number[];
}

interface DocumentUpdate {
  type: 'doc:update';
  documentId: string;
  update: number[];
}

interface DocumentAwareness {
  type: 'doc:awareness';
  documentId: string;
  clientId: number;
  state: Record<string, unknown> | null; // cursor, selection, user info
}

interface DocumentCursorUpdate {
  type: 'doc:cursor';
  documentId: string;
  anchor: number;
  head: number;
  userName?: string;
  userColor?: string;
}

type DocumentMessage =
  | DocumentSyncStep1
  | DocumentSyncStep2
  | DocumentUpdate
  | DocumentAwareness
  | DocumentCursorUpdate;

// ── Kafka placeholder ─────────────────────────────────────────────────────────

let kafkaProducer: { send(topic: string, messages: Array<{ key: string; value: string }>): Promise<void> } | null = null;

export function setKafkaProducer(producer: typeof kafkaProducer): void {
  kafkaProducer = producer;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleDocumentMessage(
  socket: AuthenticatedSocket,
  message: DocumentMessage,
): Promise<void> {
  const { userId, socketId } = socket.meta;
  const roomManager = RoomManager.getInstance();
  const presenceManager = PresenceManager.getInstance();

  messagesReceived.labels(message.type, 'document').inc();

  switch (message.type) {
    case 'doc:sync:step1': {
      // Client sends its state vector, server should respond with missing updates
      // In a Y.js architecture, this is typically the initial sync handshake
      const { documentId, stateVector } = message;
      const roomId = `doc:${documentId}`;

      logger.debug('Document sync step 1', { userId, documentId });

      // Forward to all other clients in the room who can respond with their state
      const response = JSON.stringify({
        type: 'doc:sync:step1',
        documentId,
        stateVector,
        fromUserId: userId,
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('doc:sync:step1', 'document').inc();
      break;
    }

    case 'doc:sync:step2': {
      // Response to step1: the diff/update that the receiver is missing
      const { documentId, update } = message;
      const roomId = `doc:${documentId}`;

      logger.debug('Document sync step 2', { userId, documentId, updateSize: update.length });

      const response = JSON.stringify({
        type: 'doc:sync:step2',
        documentId,
        update,
        fromUserId: userId,
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('doc:sync:step2', 'document').inc();

      // Persist via Kafka
      await persistUpdateToKafka(documentId, userId, update);
      break;
    }

    case 'doc:update': {
      // Incremental CRDT update from a client
      const { documentId, update } = message;
      const roomId = `doc:${documentId}`;

      logger.debug('Document update', { userId, documentId, updateSize: update.length });

      // Broadcast to all other room members
      const response = JSON.stringify({
        type: 'doc:update',
        documentId,
        update,
        fromUserId: userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('doc:update', 'document').inc();

      // Persist via Kafka for durability
      await persistUpdateToKafka(documentId, userId, update);
      break;
    }

    case 'doc:awareness': {
      // Awareness protocol: user cursor, selection, name, color
      const { documentId, clientId, state } = message;
      const roomId = `doc:${documentId}`;

      // Broadcast awareness to all room members (including sender for consistency)
      const response = JSON.stringify({
        type: 'doc:awareness',
        documentId,
        clientId,
        state,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('doc:awareness', 'document').inc();
      break;
    }

    case 'doc:cursor': {
      // Lightweight cursor position update
      const { documentId, anchor, head, userName, userColor } = message;
      const roomId = `doc:${documentId}`;

      // Store cursor in presence manager
      await presenceManager.setCursorPosition({
        userId,
        roomId,
        anchor,
        head,
        timestamp: new Date().toISOString(),
      });

      // Broadcast to room
      const response = JSON.stringify({
        type: 'doc:cursor',
        documentId,
        userId,
        anchor,
        head,
        userName,
        userColor,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('doc:cursor', 'document').inc();
      break;
    }

    default: {
      logger.warn('Unknown document message type', { type: (message as { type: string }).type, userId });
    }
  }
}

// ── Kafka persistence ─────────────────────────────────────────────────────────

async function persistUpdateToKafka(
  documentId: string,
  userId: string,
  update: number[],
): Promise<void> {
  if (!kafkaProducer) {
    logger.debug('Kafka producer not available, skipping persistence', { documentId });
    return;
  }

  try {
    await kafkaProducer.send('document-updates', [
      {
        key: documentId,
        value: JSON.stringify({
          documentId,
          userId,
          update,
          timestamp: new Date().toISOString(),
        }),
      },
    ]);
  } catch (err) {
    logger.error('Failed to publish document update to Kafka', {
      documentId,
      userId,
      error: (err as Error).message,
    });
  }
}
