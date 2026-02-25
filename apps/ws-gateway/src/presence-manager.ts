import { getRedis, getRedisSub } from './utils/redis.js';
import { logger } from './utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PresenceState = 'online' | 'away' | 'busy' | 'offline';

export interface UserPresence {
  userId: string;
  state: PresenceState;
  lastSeen: string;
  activeRooms: string[];
  metadata: Record<string, unknown>;
}

export interface CursorPosition {
  userId: string;
  roomId: string;
  x?: number;
  y?: number;
  /** For document cursors: character offset or anchor/head */
  anchor?: number;
  head?: number;
  /** For code cursors: line + column */
  line?: number;
  column?: number;
  timestamp: string;
}

export interface TypingIndicator {
  userId: string;
  roomId: string;
  isTyping: boolean;
  timestamp: string;
}

type PresenceHandler = (userId: string, presence: UserPresence) => void;

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESENCE_KEY_PREFIX = 'presence:user:';
const CURSOR_KEY_PREFIX = 'presence:cursor:';
const TYPING_KEY_PREFIX = 'presence:typing:';
const PRESENCE_TTL = 300; // 5 min
const TYPING_TTL = 10; // 10 seconds
const CURSOR_TTL = 120; // 2 min

// ── Presence Manager ──────────────────────────────────────────────────────────

export class PresenceManager {
  private static instance: PresenceManager | null = null;
  private subscriptions = new Map<string, PresenceHandler[]>(); // roomId -> handlers

  private constructor() {}

  static getInstance(): PresenceManager {
    if (!PresenceManager.instance) {
      PresenceManager.instance = new PresenceManager();
    }
    return PresenceManager.instance;
  }

  // ── Presence state ────────────────────────────────────────────────────────

  async setPresence(
    userId: string,
    state: PresenceState,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const redis = getRedis();
    const key = `${PRESENCE_KEY_PREFIX}${userId}`;

    const presence: UserPresence = {
      userId,
      state,
      lastSeen: new Date().toISOString(),
      activeRooms: [],
      metadata,
    };

    // Fetch existing active rooms
    const existing = await redis.get(key);
    if (existing) {
      try {
        const prev = JSON.parse(existing) as UserPresence;
        presence.activeRooms = prev.activeRooms;
      } catch {
        // ignore parse errors
      }
    }

    await redis.setex(key, PRESENCE_TTL, JSON.stringify(presence));

    // Publish change
    await redis.publish(`presence:changed`, JSON.stringify(presence));

    logger.debug('Presence set', { userId, state });
  }

  async getPresence(userId: string): Promise<UserPresence | null> {
    const redis = getRedis();
    const key = `${PRESENCE_KEY_PREFIX}${userId}`;
    const data = await redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as UserPresence;
    } catch {
      return null;
    }
  }

  async getRoomPresence(roomId: string, userIds: string[]): Promise<UserPresence[]> {
    if (userIds.length === 0) return [];

    const redis = getRedis();
    const keys = userIds.map((id) => `${PRESENCE_KEY_PREFIX}${id}`);
    const results = await redis.mget(...keys);

    const presences: UserPresence[] = [];
    for (const raw of results) {
      if (raw) {
        try {
          presences.push(JSON.parse(raw) as UserPresence);
        } catch {
          // skip
        }
      }
    }
    return presences;
  }

  async addRoomToPresence(userId: string, roomId: string): Promise<void> {
    const redis = getRedis();
    const key = `${PRESENCE_KEY_PREFIX}${userId}`;
    const data = await redis.get(key);
    if (!data) return;

    try {
      const presence = JSON.parse(data) as UserPresence;
      if (!presence.activeRooms.includes(roomId)) {
        presence.activeRooms.push(roomId);
        await redis.setex(key, PRESENCE_TTL, JSON.stringify(presence));
      }
    } catch {
      // ignore
    }
  }

  async removeRoomFromPresence(userId: string, roomId: string): Promise<void> {
    const redis = getRedis();
    const key = `${PRESENCE_KEY_PREFIX}${userId}`;
    const data = await redis.get(key);
    if (!data) return;

    try {
      const presence = JSON.parse(data) as UserPresence;
      presence.activeRooms = presence.activeRooms.filter((r) => r !== roomId);
      await redis.setex(key, PRESENCE_TTL, JSON.stringify(presence));
    } catch {
      // ignore
    }
  }

  async removePresence(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`${PRESENCE_KEY_PREFIX}${userId}`);
    await redis.publish(
      'presence:changed',
      JSON.stringify({ userId, state: 'offline', lastSeen: new Date().toISOString(), activeRooms: [], metadata: {} }),
    );
  }

  // ── Cursor positions ──────────────────────────────────────────────────────

  async setCursorPosition(cursor: CursorPosition): Promise<void> {
    const redis = getRedis();
    const key = `${CURSOR_KEY_PREFIX}${cursor.roomId}:${cursor.userId}`;
    await redis.setex(key, CURSOR_TTL, JSON.stringify(cursor));

    // Publish to room
    await redis.publish(`cursor:${cursor.roomId}`, JSON.stringify(cursor));
  }

  async getCursorPositions(roomId: string, userIds: string[]): Promise<CursorPosition[]> {
    if (userIds.length === 0) return [];

    const redis = getRedis();
    const keys = userIds.map((id) => `${CURSOR_KEY_PREFIX}${roomId}:${id}`);
    const results = await redis.mget(...keys);

    const cursors: CursorPosition[] = [];
    for (const raw of results) {
      if (raw) {
        try {
          cursors.push(JSON.parse(raw) as CursorPosition);
        } catch {
          // skip
        }
      }
    }
    return cursors;
  }

  async clearCursorPosition(roomId: string, userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`${CURSOR_KEY_PREFIX}${roomId}:${userId}`);
  }

  // ── Typing indicators ─────────────────────────────────────────────────────

  async setTypingIndicator(indicator: TypingIndicator): Promise<void> {
    const redis = getRedis();
    const key = `${TYPING_KEY_PREFIX}${indicator.roomId}:${indicator.userId}`;

    if (indicator.isTyping) {
      await redis.setex(key, TYPING_TTL, JSON.stringify(indicator));
    } else {
      await redis.del(key);
    }

    // Publish to room
    await redis.publish(`typing:${indicator.roomId}`, JSON.stringify(indicator));
  }

  async getTypingUsers(roomId: string): Promise<TypingIndicator[]> {
    const redis = getRedis();
    const pattern = `${TYPING_KEY_PREFIX}${roomId}:*`;

    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const results = await redis.mget(...keys);
    const indicators: TypingIndicator[] = [];
    for (const raw of results) {
      if (raw) {
        try {
          indicators.push(JSON.parse(raw) as TypingIndicator);
        } catch {
          // skip
        }
      }
    }
    return indicators;
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async subscribePresence(roomId: string, handler: PresenceHandler): Promise<void> {
    if (!this.subscriptions.has(roomId)) {
      this.subscriptions.set(roomId, []);

      const sub = getRedisSub();
      await sub.subscribe(`presence:${roomId}`);
      sub.on('message', (channel: string, message: string) => {
        if (channel === `presence:${roomId}`) {
          try {
            const presence = JSON.parse(message) as UserPresence;
            const handlers = this.subscriptions.get(roomId);
            if (handlers) {
              for (const h of handlers) {
                h(presence.userId, presence);
              }
            }
          } catch {
            // skip
          }
        }
      });
    }

    this.subscriptions.get(roomId)!.push(handler);
  }

  async unsubscribePresence(roomId: string): Promise<void> {
    this.subscriptions.delete(roomId);
    const sub = getRedisSub();
    await sub.unsubscribe(`presence:${roomId}`);
  }

  // ── Last seen ─────────────────────────────────────────────────────────────

  async updateLastSeen(userId: string): Promise<void> {
    const redis = getRedis();
    const key = `${PRESENCE_KEY_PREFIX}${userId}`;
    const data = await redis.get(key);
    if (!data) return;

    try {
      const presence = JSON.parse(data) as UserPresence;
      presence.lastSeen = new Date().toISOString();
      await redis.setex(key, PRESENCE_TTL, JSON.stringify(presence));
    } catch {
      // ignore
    }
  }
}
