import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type RawData } from 'ws';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { closeAllRedis } from './utils/redis.js';
import { ConnectionManager, type AuthenticatedSocket } from './connection-manager.js';
import { RoomManager, type RoomType } from './room-manager.js';
import { ShardManager } from './shard-manager.js';
import { PresenceManager } from './presence-manager.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import { authenticateUpgrade, rejectUpgrade } from './middleware/auth.middleware.js';
import { handleDocumentMessage } from './handlers/document.handler.js';
import { handleCodeMessage } from './handlers/code.handler.js';
import { handleWhiteboardMessage } from './handlers/whiteboard.handler.js';
import { handleProjectMessage } from './handlers/project.handler.js';
import { registry, messagesReceived, messageLatency } from './metrics.js';

// ── Globals ───────────────────────────────────────────────────────────────────

const connectionManager = ConnectionManager.getInstance();
const roomManager = RoomManager.getInstance();
const shardManager = ShardManager.getInstance();
const presenceManager = PresenceManager.getInstance();
const rateLimiter = new RateLimiter();

let socketIdCounter = 0;

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        service: 'ws-gateway',
        shard: config.shardId,
        connections: connectionManager.getConnectionCount(),
        rooms: roomManager.getRoomCount(),
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  // Prometheus metrics
  if (req.url === '/metrics' && req.method === 'GET') {
    registry
      .metrics()
      .then((metrics) => {
        res.writeHead(200, { 'Content-Type': registry.contentType });
        res.end(metrics);
      })
      .catch((err) => {
        res.writeHead(500);
        res.end(`Error collecting metrics: ${(err as Error).message}`);
      });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// ── WebSocket Server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req: IncomingMessage, socket, head) => {
  // Authenticate before upgrading
  const authResult = authenticateUpgrade(req);

  if (!authResult.authenticated || !authResult.userId) {
    rejectUpgrade(socket, 401, authResult.error ?? 'Unauthorized');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, authResult);
  });
});

wss.on(
  'connection',
  (
    ws: AuthenticatedSocket,
    _req: IncomingMessage,
    auth: { userId: string; email?: string; role?: string },
  ) => {
    const socketId = `sock_${++socketIdCounter}_${Date.now()}`;

    // Attach metadata
    ws.meta = {
      userId: auth.userId,
      socketId,
      rooms: new Set(),
      connectedAt: new Date(),
      lastPing: new Date(),
      isAlive: true,
    };

    connectionManager.addConnection(ws);

    // Set presence online
    presenceManager.setPresence(auth.userId, 'online').catch((err) => {
      logger.error('Failed to set presence', { error: (err as Error).message });
    });

    // Send welcome message
    const welcome = JSON.stringify({
      type: 'connection:established',
      socketId,
      userId: auth.userId,
      timestamp: new Date().toISOString(),
    });
    ws.send(welcome);

    // ── Pong handler ──────────────────────────────────────────────────────

    ws.on('pong', () => {
      connectionManager.handlePong(socketId);
    });

    // ── Message handler ───────────────────────────────────────────────────

    ws.on('message', (data: RawData) => {
      const raw = data.toString();

      // Rate limiting
      const rateResult = rateLimiter.consume(socketId, raw);
      if (!rateResult.allowed) {
        if (!rateResult.buffered) {
          // Dropped — notify client
          const warning = JSON.stringify({
            type: 'error:rate_limit',
            message: 'Message rate limit exceeded, message dropped',
            retryAfterMs: rateResult.retryAfterMs,
          });
          if (ws.readyState === ws.OPEN) {
            ws.send(warning);
          }
        }
        return;
      }

      processMessage(ws, raw);
    });

    // ── Close handler ─────────────────────────────────────────────────────

    ws.on('close', (code: number, reason: Buffer) => {
      logger.info('Connection closed', {
        socketId,
        userId: auth.userId,
        code,
        reason: reason.toString(),
      });

      roomManager.leaveAllRooms(socketId).catch((err) => {
        logger.error('Error leaving rooms on close', { error: (err as Error).message });
      });

      rateLimiter.removeConnection(socketId);
      connectionManager.removeConnection(socketId);

      // If user has no more connections, set offline
      const remaining = connectionManager.getConnectionsByUser(auth.userId);
      if (remaining.length === 0) {
        presenceManager.removePresence(auth.userId).catch((err) => {
          logger.error('Failed to remove presence', { error: (err as Error).message });
        });
      }
    });

    // ── Error handler ─────────────────────────────────────────────────────

    ws.on('error', (err: Error) => {
      logger.error('WebSocket error', { socketId, userId: auth.userId, error: err.message });
    });
  },
);

// ── Rate limiter drain callback ───────────────────────────────────────────────

rateLimiter.onDrain = (connectionId: string, message: string) => {
  const socket = connectionManager.getConnection(connectionId);
  if (socket) {
    processMessage(socket, message);
  }
};

// ── Message processing ────────────────────────────────────────────────────────

function processMessage(socket: AuthenticatedSocket, raw: string): void {
  const startTime = Date.now();

  let parsed: { type: string; [key: string]: unknown };
  try {
    parsed = JSON.parse(raw) as { type: string };
  } catch {
    const errorMsg = JSON.stringify({ type: 'error:parse', message: 'Invalid JSON' });
    if (socket.readyState === socket.OPEN) {
      socket.send(errorMsg);
    }
    return;
  }

  if (!parsed.type || typeof parsed.type !== 'string') {
    const errorMsg = JSON.stringify({
      type: 'error:validation',
      message: 'Message must have a "type" field',
    });
    if (socket.readyState === socket.OPEN) {
      socket.send(errorMsg);
    }
    return;
  }

  // Route messages
  const handler = routeMessage(socket, parsed);
  if (handler) {
    handler
      .then(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        messageLatency.labels(parsed.type.split(':')[0]!).observe(elapsed);
      })
      .catch((err) => {
        logger.error('Message handler error', {
          type: parsed.type,
          socketId: socket.meta.socketId,
          error: (err as Error).message,
        });
        const errorMsg = JSON.stringify({
          type: 'error:internal',
          message: 'An error occurred processing your message',
          originalType: parsed.type,
        });
        if (socket.readyState === socket.OPEN) {
          socket.send(errorMsg);
        }
      });
  }
}

function routeMessage(
  socket: AuthenticatedSocket,
  message: { type: string; [key: string]: unknown },
): Promise<void> | null {
  const { type } = message;

  // ── Room join/leave ───────────────────────────────────────────────────────
  if (type === 'room:join') {
    const { roomId, roomType } = message as { roomId: string; roomType: RoomType };
    if (!roomId || !roomType) {
      socket.send(JSON.stringify({ type: 'error:validation', message: 'roomId and roomType required' }));
      return null;
    }
    return roomManager
      .joinRoom(socket, roomId, roomType, message.metadata as Record<string, unknown>)
      .then((result) => {
        if (result.success) {
          presenceManager.addRoomToPresence(socket.meta.userId, roomId);
          socket.send(
            JSON.stringify({
              type: 'room:joined',
              roomId,
              roomType,
              members: roomManager.getRoomMembers(roomId),
            }),
          );
        } else {
          socket.send(
            JSON.stringify({ type: 'room:join_failed', roomId, error: result.error }),
          );
        }
      });
  }

  if (type === 'room:leave') {
    const { roomId } = message as { roomId: string };
    if (!roomId) {
      socket.send(JSON.stringify({ type: 'error:validation', message: 'roomId required' }));
      return null;
    }
    return roomManager.leaveRoom(socket.meta.socketId, roomId).then(() => {
      presenceManager.removeRoomFromPresence(socket.meta.userId, roomId);
      socket.send(JSON.stringify({ type: 'room:left', roomId }));
    });
  }

  // ── Presence ──────────────────────────────────────────────────────────────
  if (type === 'presence:set') {
    const { state } = message as { state: string };
    return presenceManager.setPresence(
      socket.meta.userId,
      state as 'online' | 'away' | 'busy' | 'offline',
      message.metadata as Record<string, unknown>,
    );
  }

  if (type === 'presence:typing') {
    const { roomId, isTyping } = message as { roomId: string; isTyping: boolean };
    return presenceManager.setTypingIndicator({
      userId: socket.meta.userId,
      roomId,
      isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Document messages ─────────────────────────────────────────────────────
  if (type.startsWith('doc:')) {
    return handleDocumentMessage(socket, message as Parameters<typeof handleDocumentMessage>[1]);
  }

  // ── Code messages ─────────────────────────────────────────────────────────
  if (type.startsWith('code:')) {
    return handleCodeMessage(socket, message as Parameters<typeof handleCodeMessage>[1]);
  }

  // ── Whiteboard messages ───────────────────────────────────────────────────
  if (type.startsWith('wb:')) {
    return handleWhiteboardMessage(socket, message as Parameters<typeof handleWhiteboardMessage>[1]);
  }

  // ── Project messages ──────────────────────────────────────────────────────
  if (type.startsWith('project:')) {
    return handleProjectMessage(socket, message as Parameters<typeof handleProjectMessage>[1]);
  }

  // ── Ping (application-level) ──────────────────────────────────────────────
  if (type === 'ping') {
    presenceManager.updateLastSeen(socket.meta.userId);
    socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
    return null;
  }

  // ── Unknown ───────────────────────────────────────────────────────────────
  logger.warn('Unknown message type', { type, socketId: socket.meta.socketId });
  socket.send(
    JSON.stringify({ type: 'error:unknown_type', message: `Unknown message type: ${type}` }),
  );
  return null;
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await shardManager.initialize();
    connectionManager.startHeartbeat();

    server.listen(config.port, () => {
      logger.info(`WebSocket gateway running on port ${config.port} [${config.nodeEnv}]`, {
        shard: config.shardId,
      });
    });
  } catch (err) {
    logger.error('Failed to start WebSocket gateway', { error: (err as Error).message });
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  rateLimiter.shutdown();
  await connectionManager.shutdown();
  await shardManager.shutdown();
  await closeAllRedis();

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

start();
