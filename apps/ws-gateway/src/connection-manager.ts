import type WebSocket from 'ws';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import {
  activeConnections,
  totalConnections,
  heartbeatLatency,
  disconnectedByTimeout,
} from './metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConnectionMeta {
  userId: string;
  socketId: string;
  rooms: Set<string>;
  connectedAt: Date;
  lastPing: Date;
  isAlive: boolean;
  pingSentAt?: number;
}

export interface AuthenticatedSocket extends WebSocket {
  meta: ConnectionMeta;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export class ConnectionManager {
  private static instance: ConnectionManager | null = null;

  /** socketId -> AuthenticatedSocket */
  private connections = new Map<string, AuthenticatedSocket>();

  /** userId -> Set<socketId> (one user may have multiple tabs) */
  private userConnections = new Map<string, Set<string>>();

  /** roomId -> Set<socketId> */
  private roomConnections = new Map<string, Set<string>>();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    /* use getInstance() */
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, config.heartbeatIntervalMs);

    logger.info('Heartbeat started', { intervalMs: config.heartbeatIntervalMs });
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('Heartbeat stopped');
    }
  }

  // ── Connection management ─────────────────────────────────────────────────

  addConnection(socket: AuthenticatedSocket): void {
    const { socketId, userId } = socket.meta;

    this.connections.set(socketId, socket);

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socketId);

    activeConnections.labels(config.shardId).inc();
    totalConnections.labels(config.shardId, 'connected').inc();

    logger.info('Connection added', { socketId, userId, total: this.connections.size });
  }

  removeConnection(socketId: string): void {
    const socket = this.connections.get(socketId);
    if (!socket) return;

    const { userId, rooms } = socket.meta;

    // Remove from all rooms
    for (const roomId of rooms) {
      this.removeFromRoom(socketId, roomId);
    }

    // Remove from user index
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    this.connections.delete(socketId);
    activeConnections.labels(config.shardId).dec();
    totalConnections.labels(config.shardId, 'disconnected').inc();

    logger.info('Connection removed', { socketId, userId, total: this.connections.size });
  }

  getConnection(socketId: string): AuthenticatedSocket | undefined {
    return this.connections.get(socketId);
  }

  // ── Room management ───────────────────────────────────────────────────────

  addToRoom(socketId: string, roomId: string): boolean {
    const socket = this.connections.get(socketId);
    if (!socket) return false;

    if (!this.roomConnections.has(roomId)) {
      this.roomConnections.set(roomId, new Set());
    }

    this.roomConnections.get(roomId)!.add(socketId);
    socket.meta.rooms.add(roomId);

    return true;
  }

  removeFromRoom(socketId: string, roomId: string): void {
    const socket = this.connections.get(socketId);
    if (socket) {
      socket.meta.rooms.delete(roomId);
    }

    const roomSockets = this.roomConnections.get(roomId);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this.roomConnections.delete(roomId);
      }
    }
  }

  getConnectionsByRoom(roomId: string): AuthenticatedSocket[] {
    const socketIds = this.roomConnections.get(roomId);
    if (!socketIds) return [];

    const sockets: AuthenticatedSocket[] = [];
    for (const id of socketIds) {
      const socket = this.connections.get(id);
      if (socket) sockets.push(socket);
    }
    return sockets;
  }

  getConnectionsByUser(userId: string): AuthenticatedSocket[] {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) return [];

    const sockets: AuthenticatedSocket[] = [];
    for (const id of socketIds) {
      const socket = this.connections.get(id);
      if (socket) sockets.push(socket);
    }
    return sockets;
  }

  getRoomCount(): number {
    return this.roomConnections.size;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getRoomMemberCount(roomId: string): number {
    return this.roomConnections.get(roomId)?.size ?? 0;
  }

  getAllRoomIds(): string[] {
    return Array.from(this.roomConnections.keys());
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  private performHeartbeat(): void {
    const now = Date.now();
    const timeout = config.heartbeatTimeoutMs;

    for (const [socketId, socket] of this.connections) {
      if (!socket.meta.isAlive) {
        const timeSinceLastPing = now - socket.meta.lastPing.getTime();
        if (timeSinceLastPing > timeout) {
          logger.warn('Connection timed out, closing', {
            socketId,
            userId: socket.meta.userId,
            lastPing: socket.meta.lastPing.toISOString(),
          });
          disconnectedByTimeout.inc();
          socket.terminate();
          this.removeConnection(socketId);
          continue;
        }
      }

      socket.meta.isAlive = false;
      socket.meta.pingSentAt = now;

      try {
        socket.ping();
      } catch (err) {
        logger.error('Failed to send ping', { socketId, error: (err as Error).message });
        socket.terminate();
        this.removeConnection(socketId);
      }
    }
  }

  handlePong(socketId: string): void {
    const socket = this.connections.get(socketId);
    if (!socket) return;

    socket.meta.isAlive = true;
    socket.meta.lastPing = new Date();

    if (socket.meta.pingSentAt) {
      const latency = (Date.now() - socket.meta.pingSentAt) / 1000;
      heartbeatLatency.observe(latency);
      socket.meta.pingSentAt = undefined;
    }
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────

  broadcastToRoom(roomId: string, message: string, excludeSocketId?: string): void {
    const sockets = this.getConnectionsByRoom(roomId);
    for (const socket of sockets) {
      if (socket.meta.socketId === excludeSocketId) continue;
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  sendToUser(userId: string, message: string): void {
    const sockets = this.getConnectionsByUser(userId);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.stopHeartbeat();

    for (const [socketId, socket] of this.connections) {
      try {
        socket.close(1001, 'Server shutting down');
      } catch {
        socket.terminate();
      }
      this.removeConnection(socketId);
    }

    logger.info('All connections closed');
  }
}
