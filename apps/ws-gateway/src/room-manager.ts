import { ConnectionManager, type AuthenticatedSocket } from './connection-manager.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { getRedis } from './utils/redis.js';
import { activeRooms, roomMembersGauge } from './metrics.js';
import { CrossShardBroadcast } from './cross-shard-broadcast.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoomType = 'document' | 'code' | 'whiteboard' | 'project';

export interface RoomMeta {
  id: string;
  type: RoomType;
  memberCount: number;
  createdAt: Date;
  maxCapacity: number;
  metadata: Record<string, unknown>;
}

export interface RoomMemberInfo {
  userId: string;
  socketId: string;
  joinedAt: Date;
}

// ── Room Manager ──────────────────────────────────────────────────────────────

export class RoomManager {
  private static instance: RoomManager | null = null;
  private rooms = new Map<string, RoomMeta>();
  private roomMembers = new Map<string, Map<string, RoomMemberInfo>>(); // roomId -> (socketId -> info)

  private constructor() {}

  static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  // ── Join / Leave ──────────────────────────────────────────────────────────

  async joinRoom(
    socket: AuthenticatedSocket,
    roomId: string,
    roomType: RoomType,
    metadata: Record<string, unknown> = {},
  ): Promise<{ success: boolean; error?: string }> {
    const connectionManager = ConnectionManager.getInstance();
    const { socketId, userId } = socket.meta;

    // Check / create room
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        type: roomType,
        memberCount: 0,
        createdAt: new Date(),
        maxCapacity: config.maxRoomCapacity,
        metadata,
      };
      this.rooms.set(roomId, room);
      activeRooms.labels(roomType).inc();
    }

    // Enforce capacity
    if (room.memberCount >= room.maxCapacity) {
      logger.warn('Room at capacity', { roomId, capacity: room.maxCapacity, userId });
      return { success: false, error: 'ROOM_FULL' };
    }

    // Add to connection manager
    connectionManager.addToRoom(socketId, roomId);

    // Track member
    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Map());
    }
    this.roomMembers.get(roomId)!.set(socketId, {
      userId,
      socketId,
      joinedAt: new Date(),
    });

    room.memberCount = this.roomMembers.get(roomId)!.size;
    roomMembersGauge.labels(roomId, roomType).set(room.memberCount);

    // Subscribe this node to the room's cross-shard fanout channel. Without it,
    // members of the same room sitting on different gateway nodes never see
    // each other's messages and the room silently splits. See
    // cross-shard-broadcast.ts.
    await CrossShardBroadcast.getInstance().addLocalMember(roomId);

    // Store in Redis for cross-shard visibility
    const redis = getRedis();
    await redis.sadd(`room:${roomId}:members`, userId);
    await redis.hset(`room:${roomId}:meta`, {
      type: roomType,
      memberCount: String(room.memberCount),
      createdAt: room.createdAt.toISOString(),
    });

    // Broadcast join to room
    const joinMsg = JSON.stringify({
      type: 'room:member_joined',
      roomId,
      userId,
      memberCount: room.memberCount,
      timestamp: new Date().toISOString(),
    });
    connectionManager.broadcastToRoom(roomId, joinMsg, socketId);

    logger.info('User joined room', { userId, roomId, roomType, memberCount: room.memberCount });
    return { success: true };
  }

  async leaveRoom(socketId: string, roomId: string): Promise<void> {
    const connectionManager = ConnectionManager.getInstance();
    const socket = connectionManager.getConnection(socketId);
    if (!socket) return;

    const { userId } = socket.meta;
    const room = this.rooms.get(roomId);

    connectionManager.removeFromRoom(socketId, roomId);
    await CrossShardBroadcast.getInstance().removeLocalMember(roomId);

    const members = this.roomMembers.get(roomId);
    if (members) {
      members.delete(socketId);

      if (members.size === 0) {
        this.roomMembers.delete(roomId);
        this.rooms.delete(roomId);
        activeRooms.labels(room?.type ?? 'document').dec();
        roomMembersGauge.remove(roomId, room?.type ?? 'document');

        // Cleanup Redis
        const redis = getRedis();
        await redis.del(`room:${roomId}:members`, `room:${roomId}:meta`);
      } else if (room) {
        room.memberCount = members.size;
        roomMembersGauge.labels(roomId, room.type).set(room.memberCount);

        const redis = getRedis();
        await redis.srem(`room:${roomId}:members`, userId);
        await redis.hset(`room:${roomId}:meta`, 'memberCount', String(room.memberCount));
      }
    }

    // Broadcast leave to room
    const leaveMsg = JSON.stringify({
      type: 'room:member_left',
      roomId,
      userId,
      memberCount: room?.memberCount ?? 0,
      timestamp: new Date().toISOString(),
    });
    connectionManager.broadcastToRoom(roomId, leaveMsg);

    logger.info('User left room', { userId, roomId, memberCount: room?.memberCount ?? 0 });
  }

  async leaveAllRooms(socketId: string): Promise<void> {
    const connectionManager = ConnectionManager.getInstance();
    const socket = connectionManager.getConnection(socketId);
    if (!socket) return;

    const rooms = Array.from(socket.meta.rooms);
    for (const roomId of rooms) {
      await this.leaveRoom(socketId, roomId);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getRoomMembers(roomId: string): RoomMemberInfo[] {
    const members = this.roomMembers.get(roomId);
    if (!members) return [];
    return Array.from(members.values());
  }

  getRoomMeta(roomId: string): RoomMeta | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Delivers `message` to every member of the room — on this node and on every
   * other gateway node holding members of the same room.
   *
   * Local delivery happens synchronously and first, so a single-node deployment
   * behaves exactly as it did before cross-shard fanout existed. The Redis
   * publish is fire-and-forget: a keystroke should not wait on a round trip.
   *
   * `excludeSocketId` applies locally only — the excluded socket is on this
   * node by definition, so peers have nothing to exclude.
   */
  broadcastToRoom(roomId: string, message: string, excludeSocketId?: string): void {
    ConnectionManager.getInstance().broadcastToRoom(roomId, message, excludeSocketId);
    CrossShardBroadcast.getInstance().publish(roomId, message);
  }

  /**
   * Local-only delivery, for messages that must not leave this node. Kept
   * separate rather than adding a boolean flag to broadcastToRoom, so that the
   * cross-shard path is the default and skipping it has to be deliberate.
   */
  broadcastToLocalRoom(roomId: string, message: string, excludeSocketId?: string): void {
    ConnectionManager.getInstance().broadcastToRoom(roomId, message, excludeSocketId);
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getAllRooms(): RoomMeta[] {
    return Array.from(this.rooms.values());
  }
}
