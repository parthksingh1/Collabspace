import { Router, Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

const router = Router();
const notificationService = new NotificationService();

// GET /notifications — List user's notifications
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const type = req.query.type as string;
    const read = req.query.read !== undefined ? req.query.read === 'true' : undefined;

    const result = await notificationService.getUserNotifications(userId, { page, pageSize, type, read });
    res.json({ success: true, data: result.data, total: result.total, page, pageSize, hasMore: result.hasMore });
  } catch (error) {
    logger.error('Failed to fetch notifications', { error: (error as Error).message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// GET /notifications/unread-count — Get unread count
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const count = await notificationService.getUnreadCount(userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// PUT /notifications/:id/read — Mark as read
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    await notificationService.markAsRead(req.params.id, userId);
    res.json({ success: true, data: { id: req.params.id, read: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// PUT /notifications/read-all — Mark all as read
router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const count = await notificationService.markAllAsRead(userId);
    res.json({ success: true, data: { markedRead: count } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// DELETE /notifications/:id — Delete notification
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    await notificationService.deleteNotification(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// PUT /notifications/preferences — Update notification preferences
router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { channel, notificationType, enabled, quietHours } = req.body;
    await notificationService.updatePreferences(userId, { channel, notificationType, enabled, quietHours });
    res.json({ success: true, data: { updated: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

export { router as notificationRoutes };
