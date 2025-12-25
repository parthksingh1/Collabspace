import { Tool, ToolContext, ToolResult } from './tool-registry.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export const sendNotificationTool: Tool = {
  name: 'send_notification',
  description:
    'Send a notification to one or more users via the notification service. Supports mentions, alerts, and various notification types.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['mention', 'alert', 'info', 'action_required', 'reminder'],
        description: 'Type of notification',
      },
      recipientIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of user IDs to notify',
      },
      title: {
        type: 'string',
        description: 'Notification title',
      },
      message: {
        type: 'string',
        description: 'Notification message body',
      },
      channel: {
        type: 'string',
        enum: ['in_app', 'email', 'both'],
        description: 'Notification channel (default: in_app)',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: 'Notification priority (default: normal)',
      },
      actionUrl: {
        type: 'string',
        description: 'URL the notification links to',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for the notification',
      },
    },
    required: ['type', 'recipientIds', 'title', 'message'],
  },
  agentTypes: ['meeting', 'planner'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const type = String(args.type ?? 'info');
    const recipientIds = args.recipientIds as string[];
    const title = String(args.title ?? '');
    const message = String(args.message ?? '');
    const channel = (args.channel as string) ?? 'in_app';
    const priority = (args.priority as string) ?? 'normal';
    const actionUrl = args.actionUrl ? String(args.actionUrl) : undefined;
    const metadata = args.metadata as Record<string, unknown> | undefined;

    if (!recipientIds || recipientIds.length === 0) {
      return { success: false, data: null, error: 'At least one recipient is required' };
    }

    if (!title || !message) {
      return { success: false, data: null, error: 'Title and message are required' };
    }

    // Limit recipients per call
    if (recipientIds.length > 50) {
      return { success: false, data: null, error: 'Maximum 50 recipients per notification' };
    }

    try {
      const response = await fetch(`${config.notificationServiceUrl}/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(context.authToken && { Authorization: `Bearer ${context.authToken}` }),
        },
        body: JSON.stringify({
          type,
          recipientIds,
          title,
          message,
          channel,
          priority,
          actionUrl,
          metadata: {
            ...metadata,
            source: 'ai-service',
            workspaceId: context.workspaceId,
            triggeredBy: context.userId,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          data: null,
          error: `Notification service error: ${response.status} ${errText}`,
        };
      }

      const result = (await response.json()) as {
        notificationId: string;
        deliveredTo: number;
      };

      return {
        success: true,
        data: {
          notificationId: result.notificationId,
          deliveredTo: result.deliveredTo,
          recipientCount: recipientIds.length,
          type,
          channel,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('send_notification tool error', { error: errorMsg, type });

      // Notifications are best-effort; log and report the failure but do not crash the agent
      return {
        success: false,
        data: null,
        error: `Failed to send notification: ${errorMsg}`,
      };
    }
  },
};
