import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { memoryManager } from '../memory/memory-manager.js';
import { aiRouter } from '../gateway/ai-router.js';
import { vectorStore } from '../memory/vector-store.js';

// ---------------------------------------------------------------------------
// Topics we subscribe to
// ---------------------------------------------------------------------------

const SUBSCRIBED_TOPICS = [
  'document-events',
  'task-events',
  'code-events',
  'workspace-events',
  'chat-events',
];

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

interface ServiceEvent {
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

async function handleDocumentEvent(event: ServiceEvent): Promise<void> {
  const { type, data } = event;
  const documentId = data.documentId as string | undefined;
  const workspaceId = data.workspaceId as string | undefined;
  const content = data.content as string | undefined;
  const title = data.title as string | undefined;

  if (!documentId || !workspaceId) return;

  switch (type) {
    case 'document_created':
    case 'document_updated': {
      if (!content) return;

      try {
        // Generate embedding and store in vector DB for knowledge retrieval
        const embeddings = await aiRouter.embed(
          [content.slice(0, 8000)],
          'embedding',
        );

        if (embeddings[0]) {
          await vectorStore.upsert(
            [
              {
                id: `doc_${documentId}`,
                values: embeddings[0],
                metadata: {
                  documentId,
                  workspaceId,
                  title: title ?? '',
                  content: content.slice(0, 10_000),
                  type: 'document',
                  updatedAt: event.timestamp,
                },
              },
            ],
            `ws_${workspaceId}`,
          );

          logger.info('Indexed document for AI', { documentId, workspaceId });
        }
      } catch (err) {
        logger.error('Failed to index document', {
          documentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'document_deleted': {
      try {
        await vectorStore.delete([`doc_${documentId}`], `ws_${workspaceId}`);
        logger.info('Removed document from AI index', { documentId });
      } catch (err) {
        logger.error('Failed to remove document from index', {
          documentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    default:
      logger.debug('Unhandled document event type', { type });
  }
}

async function handleTaskEvent(event: ServiceEvent): Promise<void> {
  const { type, data } = event;
  const workspaceId = data.workspaceId as string | undefined;
  const taskId = data.taskId as string | undefined;

  if (!workspaceId || !taskId) return;

  switch (type) {
    case 'task_created':
    case 'task_updated': {
      const title = data.title as string | undefined;
      const description = data.description as string | undefined;
      if (!title) return;

      const taskContent = `Task: ${title}\n${description ?? ''}`;

      try {
        const embeddings = await aiRouter.embed([taskContent], 'embedding');

        if (embeddings[0]) {
          await vectorStore.upsert(
            [
              {
                id: `task_${taskId}`,
                values: embeddings[0],
                metadata: {
                  taskId,
                  workspaceId,
                  title,
                  content: taskContent.slice(0, 5000),
                  type: 'task',
                  status: data.status ?? 'unknown',
                  priority: data.priority ?? 'medium',
                  updatedAt: event.timestamp,
                },
              },
            ],
            `ws_${workspaceId}`,
          );

          logger.debug('Indexed task for AI', { taskId });
        }
      } catch (err) {
        logger.error('Failed to index task', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'task_deleted': {
      try {
        await vectorStore.delete([`task_${taskId}`], `ws_${workspaceId}`);
      } catch (err) {
        logger.error('Failed to remove task from index', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    default:
      logger.debug('Unhandled task event type', { type });
  }
}

async function handleCodeEvent(event: ServiceEvent): Promise<void> {
  const { type, data } = event;
  const workspaceId = data.workspaceId as string | undefined;

  if (!workspaceId) return;

  if (type === 'file_saved' || type === 'file_updated') {
    const filePath = data.filePath as string | undefined;
    const content = data.content as string | undefined;

    if (!filePath || !content) return;

    try {
      const embeddings = await aiRouter.embed(
        [content.slice(0, 8000)],
        'embedding',
      );

      if (embeddings[0]) {
        const fileId = `file_${Buffer.from(filePath).toString('base64url').slice(0, 50)}`;
        await vectorStore.upsert(
          [
            {
              id: fileId,
              values: embeddings[0],
              metadata: {
                workspaceId,
                filePath,
                content: content.slice(0, 10_000),
                type: 'code',
                updatedAt: event.timestamp,
              },
            },
          ],
          `ws_${workspaceId}`,
        );
      }
    } catch (err) {
      logger.error('Failed to index code file', {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function handleWorkspaceEvent(event: ServiceEvent): Promise<void> {
  const { type, data } = event;

  if (type === 'workspace_deleted') {
    const workspaceId = data.workspaceId as string | undefined;
    if (workspaceId) {
      try {
        // Clean up all vectors for this workspace
        await vectorStore.deleteByFilter(
          { workspaceId: { $eq: workspaceId } },
          `ws_${workspaceId}`,
        );
        logger.info('Cleaned up AI index for deleted workspace', { workspaceId });
      } catch (err) {
        logger.error('Failed to clean up workspace AI index', {
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

async function handleChatEvent(event: ServiceEvent): Promise<void> {
  const { type, data } = event;
  const workspaceId = data.workspaceId as string | undefined;
  const userId = data.userId as string | undefined;
  const content = data.content as string | undefined;

  if (!workspaceId || !userId) return;

  if (type === 'message_sent' && content) {
    // Store in short-term memory for conversational context
    await memoryManager.addToRecentInteractions(workspaceId, {
      type: 'chat_message',
      content: content.slice(0, 1000),
      userId,
      timestamp: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

async function routeMessage(topic: string, event: ServiceEvent): Promise<void> {
  switch (topic) {
    case 'document-events':
      await handleDocumentEvent(event);
      break;
    case 'task-events':
      await handleTaskEvent(event);
      break;
    case 'code-events':
      await handleCodeEvent(event);
      break;
    case 'workspace-events':
      await handleWorkspaceEvent(event);
      break;
    case 'chat-events':
      await handleChatEvent(event);
      break;
    default:
      logger.debug('Unhandled topic', { topic });
  }
}

// ---------------------------------------------------------------------------
// Consumer
// ---------------------------------------------------------------------------

class AIConsumer {
  private kafka: Kafka;
  private consumer: Consumer;
  private running: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'ai-service-consumer',
      brokers: config.kafkaBrokers,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: 'ai-service-group',
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  async start(): Promise<void> {
    if (this.running) return;

    try {
      await this.consumer.connect();
      logger.info('Kafka consumer connected');

      for (const topic of SUBSCRIBED_TOPICS) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
        logger.info(`Subscribed to topic: ${topic}`);
      }

      await this.consumer.run({
        autoCommit: true,
        autoCommitInterval: 5_000,
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic, message } = payload;

          if (!message.value) return;

          try {
            const event = JSON.parse(message.value.toString()) as ServiceEvent;
            await routeMessage(topic, event);
          } catch (err) {
            logger.error('Failed to process Kafka message', {
              topic,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      });

      this.running = true;
      logger.info('Kafka consumer started');
    } catch (err) {
      logger.error('Kafka consumer start failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: the service can run without Kafka
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    try {
      await this.consumer.disconnect();
      this.running = false;
      logger.info('Kafka consumer stopped');
    } catch (err) {
      logger.error('Kafka consumer stop failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const aiConsumer = new AIConsumer();
