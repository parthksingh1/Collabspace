import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { NotificationDispatcher } from '../services/dispatcher';
import { logger } from '../utils/logger';

const NOTIFICATION_TOPICS = [
  'document.events',
  'code.events',
  'project.events',
  'board.events',
  'ai.events',
  'system.events',
];

// Maps service events to notification payloads
const EVENT_HANDLERS: Record<string, (payload: Record<string, unknown>) => { type: string; title: string; body: string; recipientIds: string[] } | null> = {
  'document.comment_added': (p) => ({
    type: 'comment',
    title: `${p.authorName} commented on "${p.documentTitle}"`,
    body: (p.commentContent as string)?.substring(0, 200) || '',
    recipientIds: (p.collaborators as string[]) || [],
  }),
  'document.mention': (p) => ({
    type: 'mention',
    title: `${p.authorName} mentioned you in "${p.documentTitle}"`,
    body: (p.contextText as string) || '',
    recipientIds: (p.mentionedUserIds as string[]) || [],
  }),
  'project.task_assigned': (p) => ({
    type: 'assignment',
    title: `Task assigned: ${p.taskKey} ${p.taskTitle}`,
    body: `${p.assignerName} assigned you this task.`,
    recipientIds: [p.assigneeId as string],
  }),
  'project.task_status_changed': (p) => ({
    type: 'status_change',
    title: `${p.taskKey} moved to ${p.newStatus}`,
    body: `${p.userName} changed status from ${p.oldStatus} to ${p.newStatus}.`,
    recipientIds: [p.assigneeId as string, p.reporterId as string].filter(Boolean),
  }),
  'project.sprint_completed': (p) => ({
    type: 'status_change',
    title: `Sprint "${p.sprintName}" completed`,
    body: `${p.completedTasks}/${p.totalTasks} tasks completed.`,
    recipientIds: (p.memberIds as string[]) || [],
  }),
  'ai.suggestion_generated': (p) => ({
    type: 'ai_suggestion',
    title: 'AI Suggestion',
    body: (p.suggestion as string) || '',
    recipientIds: [p.userId as string],
  }),
};

export class KafkaNotificationConsumer {
  private consumer: Consumer;
  private dispatcher = new NotificationDispatcher();

  constructor() {
    const kafka = new Kafka({
      clientId: 'notification-service',
      brokers: config.kafkaBrokers,
    });
    this.consumer = kafka.consumer({ groupId: 'notification-consumer' });
  }

  async start(): Promise<void> {
    await this.consumer.connect();

    for (const topic of NOTIFICATION_TOPICS) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.handleMessage(payload);
        } catch (error) {
          logger.error('Failed to process Kafka message', {
            topic: payload.topic,
            error: (error as Error).message,
          });
        }
      },
    });

    logger.info('Kafka notification consumer started', { topics: NOTIFICATION_TOPICS });
  }

  private async handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;

    const event = JSON.parse(message.value.toString());
    const eventType = event.type as string;
    const fullEventKey = `${topic.replace('.events', '')}.${eventType}`;

    const handler = EVENT_HANDLERS[fullEventKey];
    if (!handler) {
      logger.debug('No notification handler for event', { eventType: fullEventKey });
      return;
    }

    const notification = handler(event.payload || event);
    if (!notification || notification.recipientIds.length === 0) return;

    // Filter out the sender from recipients
    const senderId = event.userId || event.payload?.userId;
    const recipients = notification.recipientIds.filter((id: string) => id && id !== senderId);

    const payloads = recipients.map((recipientId: string) => ({
      type: notification.type,
      title: notification.title,
      body: notification.body,
      recipientId,
      senderId,
      entityType: topic.replace('.events', ''),
      entityId: event.entityId || event.payload?.entityId,
    }));

    if (payloads.length > 0) {
      await this.dispatcher.dispatchBatch(payloads);
    }
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
