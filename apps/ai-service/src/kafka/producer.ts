import { Kafka, Producer, ProducerRecord, Message } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// AI Event Types
// ---------------------------------------------------------------------------

export interface AIEvent {
  type: string;
  source: 'ai-service';
  timestamp: string;
  data: Record<string, unknown>;
}

export const AI_TOPICS = {
  AI_EVENTS: 'ai-events',
  NOTIFICATIONS: 'notifications',
  DOCUMENT_INDEXING: 'document-indexing',
} as const;

// ---------------------------------------------------------------------------
// Producer
// ---------------------------------------------------------------------------

class AIProducer {
  private kafka: Kafka;
  private producer: Producer;
  private connected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'ai-service-producer',
      brokers: config.kafkaBrokers,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: true,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.producer.connect();
      this.connected = true;
      logger.info('Kafka producer connected');
    } catch (err) {
      logger.error('Kafka producer connection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: the service can run without Kafka
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.producer.disconnect();
      this.connected = false;
      logger.info('Kafka producer disconnected');
    } catch (err) {
      logger.error('Kafka producer disconnect failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async send(record: ProducerRecord): Promise<void> {
    if (!this.connected) {
      logger.warn('Kafka producer not connected, attempting reconnect');
      await this.connect();
      if (!this.connected) {
        logger.warn('Kafka still not connected, dropping message', {
          topic: record.topic,
        });
        return;
      }
    }

    try {
      await this.producer.send(record);
    } catch (err) {
      logger.error('Kafka send failed', {
        topic: record.topic,
        error: err instanceof Error ? err.message : String(err),
      });
      this.connected = false;
    }
  }

  // -----------------------------------------------------------------------
  // AI event publishing
  // -----------------------------------------------------------------------

  async publishAIEvent(
    eventType: string,
    data: Record<string, unknown>,
    key?: string,
  ): Promise<void> {
    const event: AIEvent = {
      type: eventType,
      source: 'ai-service',
      timestamp: new Date().toISOString(),
      data,
    };

    const message: Message = {
      key: key ?? eventType,
      value: JSON.stringify(event),
      headers: {
        eventType,
        source: 'ai-service',
      },
    };

    await this.send({
      topic: AI_TOPICS.AI_EVENTS,
      messages: [message],
    });

    logger.debug('Published AI event', { eventType, key });
  }

  async publishSuggestionGenerated(data: {
    userId: string;
    workspaceId: string;
    suggestionType: string;
    content: string;
  }): Promise<void> {
    await this.publishAIEvent('suggestion_generated', data, data.userId);
  }

  async publishAgentCompleted(data: {
    executionId: string;
    agentType: string;
    success: boolean;
    userId: string;
    workspaceId: string;
    summary: string;
  }): Promise<void> {
    await this.publishAIEvent('agent_completed', data, data.executionId);
  }

  async publishAgentFailed(data: {
    executionId: string;
    agentType: string;
    error: string;
    userId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.publishAIEvent('agent_failed', data, data.executionId);
  }

  // -----------------------------------------------------------------------
  // Notification publishing
  // -----------------------------------------------------------------------

  async publishNotification(data: {
    recipientIds: string[];
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const event: AIEvent = {
      type: 'ai_notification',
      source: 'ai-service',
      timestamp: new Date().toISOString(),
      data,
    };

    await this.send({
      topic: AI_TOPICS.NOTIFICATIONS,
      messages: [
        {
          key: data.type,
          value: JSON.stringify(event),
          headers: { eventType: 'ai_notification', source: 'ai-service' },
        },
      ],
    });
  }

  // -----------------------------------------------------------------------
  // Document indexing events
  // -----------------------------------------------------------------------

  async publishDocumentIndexRequest(data: {
    documentId: string;
    workspaceId: string;
    content: string;
    metadata: Record<string, unknown>;
    action: 'index' | 'reindex' | 'delete';
  }): Promise<void> {
    await this.send({
      topic: AI_TOPICS.DOCUMENT_INDEXING,
      messages: [
        {
          key: data.documentId,
          value: JSON.stringify({
            type: `document_${data.action}`,
            source: 'ai-service',
            timestamp: new Date().toISOString(),
            data,
          }),
          headers: { eventType: `document_${data.action}`, source: 'ai-service' },
        },
      ],
    });
  }
}

export const aiProducer = new AIProducer();
