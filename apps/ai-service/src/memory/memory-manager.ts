import Redis from 'ioredis';
import { vectorStore } from './vector-store.js';
import { aiRouter } from '../gateway/ai-router.js';
import { LLMMessage } from '../providers/base-provider.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryRecord {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface RecallResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AIMemoryManager
// ---------------------------------------------------------------------------

export class AIMemoryManager {
  private redis: Redis;
  private shortTermPrefix = 'ai:mem:st:';
  private contextPrefix = 'ai:mem:ctx:';

  constructor() {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error (memory)', { error: err.message });
    });

    this.redis.connect().catch((err) => {
      logger.warn('Redis connect failed (memory), will retry', { error: err.message });
    });
  }

  // -----------------------------------------------------------------------
  // Short-term memory (Redis)
  // -----------------------------------------------------------------------

  async storeShortTerm(key: string, data: unknown, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? config.memoryShortTermTtl;
    const redisKey = `${this.shortTermPrefix}${key}`;
    const serialized = JSON.stringify(data);

    try {
      await this.redis.setex(redisKey, ttl, serialized);
      logger.debug('Stored short-term memory', { key, ttl });
    } catch (err) {
      logger.error('Failed to store short-term memory', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async recallShortTerm<T = unknown>(key: string): Promise<T | null> {
    const redisKey = `${this.shortTermPrefix}${key}`;

    try {
      const data = await this.redis.get(redisKey);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      logger.error('Failed to recall short-term memory', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async deleteShortTerm(key: string): Promise<void> {
    const redisKey = `${this.shortTermPrefix}${key}`;
    try {
      await this.redis.del(redisKey);
    } catch (err) {
      logger.error('Failed to delete short-term memory', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Long-term memory (Vector DB)
  // -----------------------------------------------------------------------

  async storeLongTerm(
    content: string,
    metadata: Record<string, unknown>,
    namespace?: string,
  ): Promise<string> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      // Generate embedding
      const embeddings = await aiRouter.embed([content], 'embedding');
      const vector = embeddings[0];

      if (!vector || vector.length === 0) {
        throw new Error('Failed to generate embedding');
      }

      // Store in vector DB
      await vectorStore.upsert(
        [
          {
            id,
            values: vector,
            metadata: {
              ...metadata,
              content: content.slice(0, 10_000), // Store content in metadata for retrieval
              timestamp: Date.now(),
            },
          },
        ],
        namespace,
      );

      logger.info('Stored long-term memory', { id, namespace, contentLength: content.length });
      return id;
    } catch (err) {
      logger.error('Failed to store long-term memory', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async recallLongTerm(
    query: string,
    topK: number = 5,
    filter?: Record<string, unknown>,
    namespace?: string,
  ): Promise<RecallResult[]> {
    try {
      // Generate query embedding
      const embeddings = await aiRouter.embed([query], 'embedding');
      const queryVector = embeddings[0];

      if (!queryVector || queryVector.length === 0) {
        throw new Error('Failed to generate query embedding');
      }

      // Search vector DB
      const results = await vectorStore.query(queryVector, {
        topK,
        filter,
        includeMetadata: true,
        namespace,
      });

      return results.map((r) => ({
        id: r.id,
        content: (r.metadata.content as string) ?? '',
        score: r.score,
        metadata: r.metadata,
      }));
    } catch (err) {
      logger.error('Failed to recall long-term memory', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async forgetLongTerm(id: string, namespace?: string): Promise<void> {
    try {
      await vectorStore.delete([id], namespace);
      logger.info('Deleted long-term memory', { id, namespace });
    } catch (err) {
      logger.error('Failed to forget long-term memory', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Workspace context
  // -----------------------------------------------------------------------

  async getWorkspaceContext(workspaceId: string): Promise<{
    recentInteractions: unknown[];
    relevantMemories: RecallResult[];
    contextSummary: string;
  }> {
    const namespace = `ws_${workspaceId}`;

    // Fetch recent interactions from short-term memory
    const recentKey = `${this.contextPrefix}${workspaceId}:recent`;
    let recentInteractions: unknown[] = [];
    try {
      const data = await this.redis.lrange(recentKey, 0, 19);
      recentInteractions = data.map((d) => {
        try {
          return JSON.parse(d);
        } catch {
          return d;
        }
      });
    } catch (err) {
      logger.warn('Failed to fetch recent interactions', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fetch relevant long-term memories
    let relevantMemories: RecallResult[] = [];
    try {
      // Use a general workspace query to get the most relevant recent memories
      relevantMemories = await this.recallLongTerm(
        'recent workspace activity and key context',
        10,
        { workspaceId: { $eq: workspaceId } },
        namespace,
      );
    } catch (err) {
      logger.warn('Failed to fetch relevant memories', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Build context summary
    const summaryParts: string[] = [];
    if (recentInteractions.length > 0) {
      summaryParts.push(`Recent interactions: ${recentInteractions.length} items`);
    }
    if (relevantMemories.length > 0) {
      summaryParts.push(
        `Relevant memories:\n${relevantMemories
          .slice(0, 5)
          .map((m) => `- ${m.content.slice(0, 100)}`)
          .join('\n')}`,
      );
    }

    return {
      recentInteractions,
      relevantMemories,
      contextSummary: summaryParts.length > 0
        ? summaryParts.join('\n\n')
        : 'No prior context available for this workspace.',
    };
  }

  // -----------------------------------------------------------------------
  // Context management
  // -----------------------------------------------------------------------

  async addToRecentInteractions(
    workspaceId: string,
    interaction: { type: string; content: string; userId: string; timestamp: number },
  ): Promise<void> {
    const key = `${this.contextPrefix}${workspaceId}:recent`;
    try {
      await this.redis.lpush(key, JSON.stringify(interaction));
      await this.redis.ltrim(key, 0, 49); // Keep last 50
      await this.redis.expire(key, 86_400); // 24 hour TTL
    } catch (err) {
      logger.warn('Failed to add recent interaction', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async summarizeContext(messages: LLMMessage[]): Promise<string> {
    if (messages.length === 0) return '';

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    try {
      const response = await aiRouter.chat(
        [
          {
            role: 'user',
            content: `Summarize the following conversation concisely, preserving key decisions, questions, and context. Keep it under 500 words.\n\n${conversationText}`,
          },
        ],
        {
          temperature: 0.3,
          maxTokens: 1024,
        },
        'fast_response',
      );

      return response.content;
    } catch (err) {
      logger.error('Failed to summarize context', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback: manual truncation
      return messages
        .slice(-5)
        .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
        .join('\n');
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  async destroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // Already disconnected
    }
  }
}

export const memoryManager = new AIMemoryManager();
