import type { AuthenticatedSocket } from '../connection-manager.js';
import { RoomManager } from '../room-manager.js';
import { logger } from '../utils/logger.js';
import { messagesReceived, messagesSent } from '../metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhiteboardElement {
  id: string;
  type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'freehand' | 'image' | 'sticky';
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
  style: Record<string, unknown>;
  content?: string;
  locked?: boolean;
  groupId?: string;
}

interface WhiteboardElementUpdate {
  type: 'wb:element:update';
  boardId: string;
  elements: WhiteboardElement[];
}

interface WhiteboardElementDelete {
  type: 'wb:element:delete';
  boardId: string;
  elementIds: string[];
}

interface WhiteboardElementCreate {
  type: 'wb:element:create';
  boardId: string;
  elements: WhiteboardElement[];
}

interface WhiteboardViewportSync {
  type: 'wb:viewport:sync';
  boardId: string;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

interface WhiteboardLaserPointer {
  type: 'wb:laser';
  boardId: string;
  x: number;
  y: number;
  active: boolean;
}

interface WhiteboardBatchUpdate {
  type: 'wb:batch';
  boardId: string;
  operations: Array<{
    op: 'create' | 'update' | 'delete';
    elements?: WhiteboardElement[];
    elementIds?: string[];
  }>;
}

type WhiteboardMessage =
  | WhiteboardElementUpdate
  | WhiteboardElementDelete
  | WhiteboardElementCreate
  | WhiteboardViewportSync
  | WhiteboardLaserPointer
  | WhiteboardBatchUpdate;

// ── Kafka placeholder ─────────────────────────────────────────────────────────

let kafkaProducer: { send(topic: string, messages: Array<{ key: string; value: string }>): Promise<void> } | null = null;

export function setKafkaProducer(producer: typeof kafkaProducer): void {
  kafkaProducer = producer;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleWhiteboardMessage(
  socket: AuthenticatedSocket,
  message: WhiteboardMessage,
): Promise<void> {
  const { userId, socketId } = socket.meta;
  const roomManager = RoomManager.getInstance();

  messagesReceived.labels(message.type, 'whiteboard').inc();

  switch (message.type) {
    case 'wb:element:create': {
      const { boardId, elements } = message;
      const roomId = `wb:${boardId}`;

      logger.debug('Whiteboard elements created', { userId, boardId, count: elements.length });

      const response = JSON.stringify({
        type: 'wb:element:create',
        boardId,
        elements,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('wb:element:create', 'whiteboard').inc();

      await persistWhiteboardChange(boardId, userId, 'create', { elements });
      break;
    }

    case 'wb:element:update': {
      const { boardId, elements } = message;
      const roomId = `wb:${boardId}`;

      logger.debug('Whiteboard elements updated', { userId, boardId, count: elements.length });

      const response = JSON.stringify({
        type: 'wb:element:update',
        boardId,
        elements,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('wb:element:update', 'whiteboard').inc();

      await persistWhiteboardChange(boardId, userId, 'update', { elements });
      break;
    }

    case 'wb:element:delete': {
      const { boardId, elementIds } = message;
      const roomId = `wb:${boardId}`;

      logger.debug('Whiteboard elements deleted', { userId, boardId, count: elementIds.length });

      const response = JSON.stringify({
        type: 'wb:element:delete',
        boardId,
        elementIds,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('wb:element:delete', 'whiteboard').inc();

      await persistWhiteboardChange(boardId, userId, 'delete', { elementIds });
      break;
    }

    case 'wb:viewport:sync': {
      const { boardId, viewport } = message;
      const roomId = `wb:${boardId}`;

      // Viewport sync is transient -- no persistence needed
      const response = JSON.stringify({
        type: 'wb:viewport:sync',
        boardId,
        viewport,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('wb:viewport:sync', 'whiteboard').inc();
      break;
    }

    case 'wb:laser': {
      const { boardId, x, y, active } = message;
      const roomId = `wb:${boardId}`;

      // Laser pointer is ephemeral, high frequency -- broadcast only, no persist
      const response = JSON.stringify({
        type: 'wb:laser',
        boardId,
        x,
        y,
        active,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('wb:laser', 'whiteboard').inc();
      break;
    }

    case 'wb:batch': {
      const { boardId, operations } = message;
      const roomId = `wb:${boardId}`;

      logger.debug('Whiteboard batch update', { userId, boardId, opCount: operations.length });

      const response = JSON.stringify({
        type: 'wb:batch',
        boardId,
        operations,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('wb:batch', 'whiteboard').inc();

      await persistWhiteboardChange(boardId, userId, 'batch', { operations });
      break;
    }

    default: {
      logger.warn('Unknown whiteboard message type', { type: (message as { type: string }).type, userId });
    }
  }
}

// ── Kafka persistence ─────────────────────────────────────────────────────────

async function persistWhiteboardChange(
  boardId: string,
  userId: string,
  operation: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!kafkaProducer) {
    logger.debug('Kafka producer not available, skipping whiteboard persistence', { boardId });
    return;
  }

  try {
    await kafkaProducer.send('whiteboard-updates', [
      {
        key: boardId,
        value: JSON.stringify({
          boardId,
          userId,
          operation,
          data,
          timestamp: new Date().toISOString(),
        }),
      },
    ]);
  } catch (err) {
    logger.error('Failed to publish whiteboard update to Kafka', {
      boardId,
      userId,
      error: (err as Error).message,
    });
  }
}
