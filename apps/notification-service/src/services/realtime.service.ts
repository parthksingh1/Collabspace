import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

interface RealtimeMessage {
  type: string;
  data: unknown;
}

export class RealtimeService {
  private readonly CHANNEL_PREFIX = 'realtime:user:';

  /**
   * Push a message to a specific user via Redis pub/sub.
   * The WebSocket gateway subscribes to these channels and forwards to connected clients.
   */
  async pushToUser(userId: string, message: RealtimeMessage): Promise<void> {
    try {
      const channel = this.CHANNEL_PREFIX + userId;
      const payload = JSON.stringify({
        ...message,
        timestamp: Date.now(),
      });

      await redis.publish(channel, payload);
      logger.debug('Realtime push', { userId, type: message.type });
    } catch (error) {
      logger.error('Realtime push failed', { userId, error: (error as Error).message });
    }
  }

  /**
   * Push a message to all users in a room/channel.
   */
  async pushToRoom(roomId: string, message: RealtimeMessage): Promise<void> {
    try {
      const channel = `realtime:room:${roomId}`;
      await redis.publish(channel, JSON.stringify({ ...message, timestamp: Date.now() }));
    } catch (error) {
      logger.error('Room push failed', { roomId, error: (error as Error).message });
    }
  }

  /**
   * Broadcast to all connected users.
   */
  async broadcast(message: RealtimeMessage): Promise<void> {
    try {
      await redis.publish('realtime:broadcast', JSON.stringify({ ...message, timestamp: Date.now() }));
    } catch (error) {
      logger.error('Broadcast failed', { error: (error as Error).message });
    }
  }

  /**
   * Update cached unread count and push to user.
   */
  async pushUnreadCount(userId: string, count: number): Promise<void> {
    await this.pushToUser(userId, {
      type: 'unread_count',
      data: { count },
    });
  }
}
