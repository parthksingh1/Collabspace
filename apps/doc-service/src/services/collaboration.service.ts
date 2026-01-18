import { getRedis } from '../utils/redis.js';
import { query } from '../utils/db.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveCollaborator {
  userId: string;
  documentId: string;
  joinedAt: string;
  lastActive: string;
  cursorPosition?: { anchor: number; head: number };
  userName?: string;
  userColor?: string;
}

export interface ConflictWarning {
  documentId: string;
  userIds: string[];
  region: string;
  detectedAt: string;
}

export interface ActivityEntry {
  id: string;
  documentId: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLLAB_KEY_PREFIX = 'collab:doc:';
const COLLAB_TTL = 600; // 10 minutes
const ACTIVITY_KEY_PREFIX = 'activity:doc:';

// ── Service ───────────────────────────────────────────────────────────────────

export class CollaborationService {
  // ── Active collaborators ──────────────────────────────────────────────────

  async addCollaborator(
    documentId: string,
    userId: string,
    meta: { userName?: string; userColor?: string } = {},
  ): Promise<void> {
    const redis = getRedis();
    const key = `${COLLAB_KEY_PREFIX}${documentId}`;

    const collaborator: ActiveCollaborator = {
      userId,
      documentId,
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      userName: meta.userName,
      userColor: meta.userColor,
    };

    await redis.hset(key, userId, JSON.stringify(collaborator));
    await redis.expire(key, COLLAB_TTL);

    logger.debug('Collaborator added', { documentId, userId });
  }

  async removeCollaborator(documentId: string, userId: string): Promise<void> {
    const redis = getRedis();
    const key = `${COLLAB_KEY_PREFIX}${documentId}`;
    await redis.hdel(key, userId);

    logger.debug('Collaborator removed', { documentId, userId });
  }

  async getActiveCollaborators(documentId: string): Promise<ActiveCollaborator[]> {
    const redis = getRedis();
    const key = `${COLLAB_KEY_PREFIX}${documentId}`;
    const all = await redis.hgetall(key);

    const collaborators: ActiveCollaborator[] = [];
    const now = Date.now();

    for (const [userId, raw] of Object.entries(all)) {
      try {
        const collab = JSON.parse(raw) as ActiveCollaborator;
        // Filter out stale entries (last active > 5 minutes ago)
        const lastActiveMs = new Date(collab.lastActive).getTime();
        if (now - lastActiveMs < 5 * 60 * 1000) {
          collaborators.push(collab);
        } else {
          // Clean up stale entry
          await redis.hdel(key, userId);
        }
      } catch {
        // Remove corrupted entries
        await redis.hdel(key, userId);
      }
    }

    return collaborators;
  }

  async updateCollaboratorActivity(
    documentId: string,
    userId: string,
    cursorPosition?: { anchor: number; head: number },
  ): Promise<void> {
    const redis = getRedis();
    const key = `${COLLAB_KEY_PREFIX}${documentId}`;

    const raw = await redis.hget(key, userId);
    if (!raw) return;

    try {
      const collab = JSON.parse(raw) as ActiveCollaborator;
      collab.lastActive = new Date().toISOString();
      if (cursorPosition) {
        collab.cursorPosition = cursorPosition;
      }
      await redis.hset(key, userId, JSON.stringify(collab));
      await redis.expire(key, COLLAB_TTL);
    } catch {
      // ignore
    }
  }

  // ── Conflict detection (heuristic) ────────────────────────────────────────

  async detectConflicts(documentId: string): Promise<ConflictWarning[]> {
    const collaborators = await this.getActiveCollaborators(documentId);
    const warnings: ConflictWarning[] = [];

    // Group collaborators by proximity of cursor positions
    // Heuristic: if two users' cursors are within 200 characters, warn about potential conflict
    const PROXIMITY_THRESHOLD = 200;

    const withCursors = collaborators.filter((c) => c.cursorPosition);

    for (let i = 0; i < withCursors.length; i++) {
      for (let j = i + 1; j < withCursors.length; j++) {
        const a = withCursors[i]!;
        const b = withCursors[j]!;

        if (!a.cursorPosition || !b.cursorPosition) continue;

        const aPos = Math.min(a.cursorPosition.anchor, a.cursorPosition.head);
        const bPos = Math.min(b.cursorPosition.anchor, b.cursorPosition.head);

        if (Math.abs(aPos - bPos) < PROXIMITY_THRESHOLD) {
          warnings.push({
            documentId,
            userIds: [a.userId, b.userId],
            region: `chars ${Math.min(aPos, bPos)}-${Math.max(aPos, bPos) + PROXIMITY_THRESHOLD}`,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (warnings.length > 0) {
      logger.debug('Potential conflicts detected', { documentId, count: warnings.length });
    }

    return warnings;
  }

  // ── Activity feed ─────────────────────────────────────────────────────────

  async recordActivity(
    documentId: string,
    userId: string,
    action: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    const redis = getRedis();
    const key = `${ACTIVITY_KEY_PREFIX}${documentId}`;

    const entry: ActivityEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      documentId,
      userId,
      action,
      details,
      createdAt: new Date().toISOString(),
    };

    // Store in Redis sorted set, scored by timestamp
    await redis.zadd(key, Date.now(), JSON.stringify(entry));

    // Trim to last 200 entries
    await redis.zremrangebyrank(key, 0, -201);

    // TTL of 24 hours
    await redis.expire(key, 86400);
  }

  async getActivityFeed(
    documentId: string,
    limit = 50,
    offset = 0,
  ): Promise<ActivityEntry[]> {
    const redis = getRedis();
    const key = `${ACTIVITY_KEY_PREFIX}${documentId}`;

    const raw = await redis.zrevrange(key, offset, offset + limit - 1);
    const entries: ActivityEntry[] = [];

    for (const item of raw) {
      try {
        entries.push(JSON.parse(item) as ActivityEntry);
      } catch {
        // skip
      }
    }

    return entries;
  }

  // ── Presence data management ──────────────────────────────────────────────

  async getDocumentStats(documentId: string): Promise<{
    activeCollaborators: number;
    recentActivity: number;
    lastEdit: string | null;
  }> {
    const collaborators = await this.getActiveCollaborators(documentId);

    const redis = getRedis();
    const key = `${ACTIVITY_KEY_PREFIX}${documentId}`;
    const activityCount = await redis.zcard(key);

    // Get most recent activity
    const latest = await redis.zrevrange(key, 0, 0);
    let lastEdit: string | null = null;
    if (latest.length > 0) {
      try {
        const entry = JSON.parse(latest[0]!) as ActivityEntry;
        lastEdit = entry.createdAt;
      } catch {
        // ignore
      }
    }

    return {
      activeCollaborators: collaborators.length,
      recentActivity: activityCount,
      lastEdit,
    };
  }
}
