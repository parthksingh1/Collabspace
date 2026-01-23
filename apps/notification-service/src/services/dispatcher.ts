import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { RealtimeService } from './realtime.service';
import { logger } from '../utils/logger';
import { query } from '../utils/db';

interface DispatchPayload {
  type: string;
  title: string;
  body: string;
  recipientId: string;
  senderId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

interface UserPreferences {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export class NotificationDispatcher {
  private notificationService = new NotificationService();
  private emailService = new EmailService();
  private realtimeService = new RealtimeService();

  // Dedup window: don't send same notification within this period (ms)
  private readonly DEDUP_WINDOW = 60_000;
  private recentNotifications = new Map<string, number>();

  async dispatch(payload: DispatchPayload): Promise<void> {
    // Deduplication check
    const dedupKey = `${payload.recipientId}:${payload.type}:${payload.entityId || ''}`;
    const lastSent = this.recentNotifications.get(dedupKey);
    if (lastSent && Date.now() - lastSent < this.DEDUP_WINDOW) {
      logger.debug('Notification deduplicated', { key: dedupKey });
      return;
    }
    this.recentNotifications.set(dedupKey, Date.now());

    // Get user preferences for this notification type
    const prefs = await this.getUserChannelPreferences(payload.recipientId, payload.type);

    // Always create in-app notification
    if (prefs.inApp) {
      await this.notificationService.createNotification(payload);
    }

    // Push to real-time (WebSocket)
    await this.realtimeService.pushToUser(payload.recipientId, {
      type: 'notification',
      data: { type: payload.type, title: payload.title, body: payload.body },
    });

    // Send email if enabled and not in quiet hours
    if (prefs.email) {
      const inQuietHours = await this.isInQuietHours(payload.recipientId);
      if (!inQuietHours) {
        try {
          const recipientEmail = await this.getUserEmail(payload.recipientId);
          if (recipientEmail) {
            await this.emailService.sendNotificationEmail(recipientEmail, payload.title, payload.body, payload.type);
          }
        } catch (err) {
          logger.error('Failed to send notification email', { error: (err as Error).message, recipientId: payload.recipientId });
        }
      }
    }

    logger.info('Notification dispatched', { type: payload.type, recipientId: payload.recipientId, channels: { inApp: prefs.inApp, email: prefs.email } });
  }

  async dispatchBatch(payloads: DispatchPayload[]): Promise<void> {
    // Group by recipient for batching
    const byRecipient = new Map<string, DispatchPayload[]>();
    for (const p of payloads) {
      const existing = byRecipient.get(p.recipientId) || [];
      existing.push(p);
      byRecipient.set(p.recipientId, existing);
    }

    for (const [recipientId, notifications] of byRecipient) {
      if (notifications.length === 1) {
        await this.dispatch(notifications[0]);
      } else {
        // Batch: create individual in-app, send single batched email
        for (const n of notifications) {
          await this.notificationService.createNotification(n);
        }

        // Single real-time push with count
        await this.realtimeService.pushToUser(recipientId, {
          type: 'notification_batch',
          data: { count: notifications.length, latest: notifications[0] },
        });
      }
    }
  }

  private async getUserChannelPreferences(userId: string, notificationType: string): Promise<UserPreferences> {
    try {
      const result = await query(
        `SELECT channel, enabled FROM notification_preferences
         WHERE user_id = $1 AND notification_type = $2`,
        [userId, notificationType]
      );

      const prefs: UserPreferences = { inApp: true, email: true, push: true };
      for (const row of result.rows) {
        if (row.channel === 'in_app') prefs.inApp = row.enabled;
        if (row.channel === 'email') prefs.email = row.enabled;
        if (row.channel === 'push') prefs.push = row.enabled;
      }
      return prefs;
    } catch {
      return { inApp: true, email: true, push: true };
    }
  }

  private async isInQuietHours(userId: string): Promise<boolean> {
    try {
      const result = await query(
        `SELECT quiet_hours FROM notification_preferences
         WHERE user_id = $1 AND quiet_hours IS NOT NULL LIMIT 1`,
        [userId]
      );
      if (result.rows.length === 0) return false;

      const quietHours = result.rows[0].quiet_hours;
      if (!quietHours?.start || !quietHours?.end) return false;

      const now = new Date();
      const currentHour = now.getHours();
      const start = parseInt(quietHours.start.split(':')[0]);
      const end = parseInt(quietHours.end.split(':')[0]);

      if (start < end) {
        return currentHour >= start && currentHour < end;
      }
      // Wraps around midnight
      return currentHour >= start || currentHour < end;
    } catch {
      return false;
    }
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    try {
      const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
      return result.rows[0]?.email || null;
    } catch {
      return null;
    }
  }

  // Cleanup old dedup entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.recentNotifications) {
      if (now - timestamp > this.DEDUP_WINDOW * 2) {
        this.recentNotifications.delete(key);
      }
    }
  }
}
