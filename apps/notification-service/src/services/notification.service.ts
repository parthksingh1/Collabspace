import { query } from '../utils/db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

interface CreateNotificationData {
  type: string;
  title: string;
  body: string;
  recipientId: string;
  senderId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationFilters {
  page: number;
  pageSize: number;
  type?: string;
  read?: boolean;
}

export class NotificationService {
  private readonly UNREAD_COUNT_KEY = 'notif:unread:';
  private readonly UNREAD_COUNT_TTL = 3600; // 1h cache

  async createNotification(data: CreateNotificationData): Promise<{ id: string }> {
    const result = await query(
      `INSERT INTO notifications (type, title, body, recipient_id, sender_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [data.type, data.title, data.body, data.recipientId, data.senderId, data.entityType, data.entityId, JSON.stringify(data.metadata || {})]
    );

    const notifId = result.rows[0].id;

    // Invalidate unread count cache
    await redis.del(this.UNREAD_COUNT_KEY + data.recipientId);

    // Publish to Redis for real-time delivery
    await redis.publish(`notifications:${data.recipientId}`, JSON.stringify({
      id: notifId,
      type: data.type,
      title: data.title,
      body: data.body,
      senderId: data.senderId,
      entityType: data.entityType,
      entityId: data.entityId,
      createdAt: new Date().toISOString(),
    }));

    logger.info('Notification created', { id: notifId, type: data.type, recipient: data.recipientId });
    return { id: notifId };
  }

  async getUserNotifications(userId: string, filters: NotificationFilters) {
    const { page, pageSize, type, read } = filters;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = ['recipient_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [userId];
    let paramIdx = 2;

    if (type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(type);
    }
    if (read !== undefined) {
      conditions.push(`read = $${paramIdx++}`);
      params.push(read);
    }

    const whereClause = conditions.join(' AND ');

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, type, title, body, sender_id, entity_type, entity_id, read, metadata, created_at
         FROM notifications WHERE ${whereClause}
         ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...params, pageSize, offset]
      ),
      query(`SELECT COUNT(*) FROM notifications WHERE ${whereClause}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return {
      data: dataResult.rows.map(row => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        senderId: row.sender_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        read: row.read,
        metadata: row.metadata,
        createdAt: row.created_at,
      })),
      total,
      hasMore: offset + pageSize < total,
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = this.UNREAD_COUNT_KEY + userId;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return parseInt(cached);

    const result = await query(
      'SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND read = FALSE AND deleted_at IS NULL',
      [userId]
    );

    const count = parseInt(result.rows[0].count);
    await redis.setex(cacheKey, this.UNREAD_COUNT_TTL, count.toString());
    return count;
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND recipient_id = $2',
      [notificationId, userId]
    );
    await redis.del(this.UNREAD_COUNT_KEY + userId);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await query(
      'UPDATE notifications SET read = TRUE WHERE recipient_id = $1 AND read = FALSE AND deleted_at IS NULL',
      [userId]
    );
    await redis.del(this.UNREAD_COUNT_KEY + userId);
    return result.rowCount || 0;
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await query(
      'UPDATE notifications SET deleted_at = NOW() WHERE id = $1 AND recipient_id = $2',
      [notificationId, userId]
    );
    await redis.del(this.UNREAD_COUNT_KEY + userId);
  }

  async updatePreferences(userId: string, prefs: {
    channel: string;
    notificationType: string;
    enabled: boolean;
    quietHours?: { start: string; end: string };
  }): Promise<void> {
    await query(
      `INSERT INTO notification_preferences (user_id, channel, notification_type, enabled, quiet_hours)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, channel, notification_type)
       DO UPDATE SET enabled = EXCLUDED.enabled, quiet_hours = EXCLUDED.quiet_hours`,
      [userId, prefs.channel, prefs.notificationType, prefs.enabled, prefs.quietHours ? JSON.stringify(prefs.quietHours) : null]
    );
  }
}
