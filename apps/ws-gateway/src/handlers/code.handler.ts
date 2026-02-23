import type { AuthenticatedSocket } from '../connection-manager.js';
import { RoomManager } from '../room-manager.js';
import { PresenceManager } from '../presence-manager.js';
import { logger } from '../utils/logger.js';
import { messagesReceived, messagesSent } from '../metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CodeSyncStep1 {
  type: 'code:sync:step1';
  fileId: string;
  stateVector: number[];
}

interface CodeSyncStep2 {
  type: 'code:sync:step2';
  fileId: string;
  update: number[];
}

interface CodeUpdate {
  type: 'code:update';
  fileId: string;
  update: number[];
}

interface CodeCursor {
  type: 'code:cursor';
  fileId: string;
  line: number;
  column: number;
  userName?: string;
  userColor?: string;
}

interface CodeExecuteRequest {
  type: 'code:execute:request';
  fileId: string;
  executionId: string;
  language: string;
  code: string;
  stdin?: string;
}

interface CodeExecuteResult {
  type: 'code:execute:result';
  fileId: string;
  executionId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  memoryUsedBytes: number;
}

interface CodeTerminalOutput {
  type: 'code:terminal:output';
  fileId: string;
  executionId: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

type CodeMessage =
  | CodeSyncStep1
  | CodeSyncStep2
  | CodeUpdate
  | CodeCursor
  | CodeExecuteRequest
  | CodeExecuteResult
  | CodeTerminalOutput;

// ── Kafka placeholder ─────────────────────────────────────────────────────────

let kafkaProducer: { send(topic: string, messages: Array<{ key: string; value: string }>): Promise<void> } | null = null;

export function setKafkaProducer(producer: typeof kafkaProducer): void {
  kafkaProducer = producer;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleCodeMessage(
  socket: AuthenticatedSocket,
  message: CodeMessage,
): Promise<void> {
  const { userId, socketId } = socket.meta;
  const roomManager = RoomManager.getInstance();
  const presenceManager = PresenceManager.getInstance();

  messagesReceived.labels(message.type, 'code').inc();

  switch (message.type) {
    case 'code:sync:step1': {
      const { fileId, stateVector } = message;
      const roomId = `code:${fileId}`;

      logger.debug('Code sync step 1', { userId, fileId });

      const response = JSON.stringify({
        type: 'code:sync:step1',
        fileId,
        stateVector,
        fromUserId: userId,
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('code:sync:step1', 'code').inc();
      break;
    }

    case 'code:sync:step2': {
      const { fileId, update } = message;
      const roomId = `code:${fileId}`;

      logger.debug('Code sync step 2', { userId, fileId, updateSize: update.length });

      const response = JSON.stringify({
        type: 'code:sync:step2',
        fileId,
        update,
        fromUserId: userId,
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('code:sync:step2', 'code').inc();

      await persistCodeUpdateToKafka(fileId, userId, update);
      break;
    }

    case 'code:update': {
      const { fileId, update } = message;
      const roomId = `code:${fileId}`;

      logger.debug('Code update', { userId, fileId, updateSize: update.length });

      const response = JSON.stringify({
        type: 'code:update',
        fileId,
        update,
        fromUserId: userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('code:update', 'code').inc();

      await persistCodeUpdateToKafka(fileId, userId, update);
      break;
    }

    case 'code:cursor': {
      const { fileId, line, column, userName, userColor } = message;
      const roomId = `code:${fileId}`;

      await presenceManager.setCursorPosition({
        userId,
        roomId,
        line,
        column,
        timestamp: new Date().toISOString(),
      });

      const response = JSON.stringify({
        type: 'code:cursor',
        fileId,
        userId,
        line,
        column,
        userName,
        userColor,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('code:cursor', 'code').inc();
      break;
    }

    case 'code:execute:request': {
      const { fileId, executionId, language, code, stdin } = message;

      logger.info('Code execution requested', { userId, fileId, executionId, language });

      // Forward to code-service via Kafka
      if (kafkaProducer) {
        await kafkaProducer.send('code-execution-requests', [
          {
            key: executionId,
            value: JSON.stringify({
              executionId,
              fileId,
              userId,
              language,
              code,
              stdin,
              timestamp: new Date().toISOString(),
            }),
          },
        ]);
      }

      // Acknowledge to the requester
      const ack = JSON.stringify({
        type: 'code:execute:ack',
        executionId,
        fileId,
        status: 'queued',
        timestamp: new Date().toISOString(),
      });
      if (socket.readyState === socket.OPEN) {
        socket.send(ack);
      }

      // Notify room that execution started
      const roomId = `code:${fileId}`;
      const notification = JSON.stringify({
        type: 'code:execute:started',
        executionId,
        fileId,
        userId,
        language,
        timestamp: new Date().toISOString(),
      });
      roomManager.broadcastToRoom(roomId, notification, socketId);
      messagesSent.labels('code:execute:started', 'code').inc();
      break;
    }

    case 'code:execute:result': {
      // Result coming back from code-service (relayed through Kafka consumer)
      const { fileId, executionId, stdout, stderr, exitCode, executionTimeMs, memoryUsedBytes } = message;
      const roomId = `code:${fileId}`;

      logger.info('Code execution completed', { executionId, exitCode, executionTimeMs });

      const response = JSON.stringify({
        type: 'code:execute:result',
        fileId,
        executionId,
        stdout,
        stderr,
        exitCode,
        executionTimeMs,
        memoryUsedBytes,
        timestamp: new Date().toISOString(),
      });

      // Broadcast result to all room members
      roomManager.broadcastToRoom(roomId, response);
      messagesSent.labels('code:execute:result', 'code').inc();
      break;
    }

    case 'code:terminal:output': {
      // Streaming terminal output from execution
      const { fileId, executionId, stream, data } = message;
      const roomId = `code:${fileId}`;

      const response = JSON.stringify({
        type: 'code:terminal:output',
        fileId,
        executionId,
        stream,
        data,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response);
      messagesSent.labels('code:terminal:output', 'code').inc();
      break;
    }

    default: {
      logger.warn('Unknown code message type', { type: (message as { type: string }).type, userId });
    }
  }
}

// ── Kafka persistence ─────────────────────────────────────────────────────────

async function persistCodeUpdateToKafka(
  fileId: string,
  userId: string,
  update: number[],
): Promise<void> {
  if (!kafkaProducer) {
    logger.debug('Kafka producer not available, skipping code persistence', { fileId });
    return;
  }

  try {
    await kafkaProducer.send('code-updates', [
      {
        key: fileId,
        value: JSON.stringify({
          fileId,
          userId,
          update,
          timestamp: new Date().toISOString(),
        }),
      },
    ]);
  } catch (err) {
    logger.error('Failed to publish code update to Kafka', {
      fileId,
      userId,
      error: (err as Error).message,
    });
  }
}
