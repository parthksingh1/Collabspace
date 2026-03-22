// ─── Types ─────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

/**
 * Adapter for short-term (Redis-backed) conversation storage.
 */
export interface ShortTermStore {
  /** Store a message in a conversation. */
  push(conversationId: string, message: { role: string; content: string }): Promise<void>;
  /** Get recent messages for a conversation. */
  getRecent(conversationId: string, limit: number): Promise<Array<{ role: string; content: string }>>;
  /** Clear conversation history. */
  clear(conversationId: string): Promise<void>;
  /** Set TTL for a conversation. */
  expire(conversationId: string, ttlSeconds: number): Promise<void>;
}

/**
 * Adapter for long-term (vector DB) memory storage.
 */
export interface LongTermStore {
  /** Store an entry with its embedding. */
  store(entry: MemoryEntry): Promise<void>;
  /** Search for similar entries by embedding vector. */
  search(embedding: number[], topK: number, filter?: Record<string, unknown>): Promise<MemorySearchResult[]>;
  /** Delete an entry by ID. */
  delete(id: string): Promise<void>;
  /** Update access metadata for an entry. */
  touch(id: string): Promise<void>;
}

/**
 * Adapter for generating embeddings.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Adapter for text summarization.
 */
export interface SummarizationProvider {
  summarize(text: string, maxTokens: number): Promise<string>;
}

export interface AIMemoryManagerOptions {
  shortTermStore: ShortTermStore;
  longTermStore: LongTermStore;
  embeddingProvider: EmbeddingProvider;
  summarizationProvider?: SummarizationProvider;
  /** Max messages in short-term memory before summarization. Default: 50. */
  maxShortTermMessages?: number;
  /** TTL for short-term memory entries (seconds). Default: 3600. */
  shortTermTTLSeconds?: number;
}

/**
 * Manages AI memory across short-term (conversation) and long-term (knowledge) stores.
 * Handles context window management with automatic summarization.
 */
export class AIMemoryManager {
  private readonly shortTerm: ShortTermStore;
  private readonly longTerm: LongTermStore;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly summarizationProvider?: SummarizationProvider;
  private readonly maxShortTermMessages: number;
  private readonly shortTermTTLSeconds: number;

  constructor(options: AIMemoryManagerOptions) {
    this.shortTerm = options.shortTermStore;
    this.longTerm = options.longTermStore;
    this.embeddingProvider = options.embeddingProvider;
    this.summarizationProvider = options.summarizationProvider;
    this.maxShortTermMessages = options.maxShortTermMessages ?? 50;
    this.shortTermTTLSeconds = options.shortTermTTLSeconds ?? 3600;
  }

  /**
   * Store content in long-term memory with embeddings.
   */
  async remember(
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const [embedding] = await this.embeddingProvider.embed([content]);
    if (!embedding) throw new Error('Failed to generate embedding');

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const entry: MemoryEntry = {
      id,
      content,
      embedding,
      metadata,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
    };

    await this.longTerm.store(entry);
    return id;
  }

  /**
   * Recall relevant memories based on a query.
   */
  async recall(
    query: string,
    topK: number = 5,
    filter?: Record<string, unknown>,
  ): Promise<MemorySearchResult[]> {
    const [embedding] = await this.embeddingProvider.embed([query]);
    if (!embedding) return [];

    const results = await this.longTerm.search(embedding, topK, filter);

    // Touch accessed entries (fire-and-forget)
    for (const result of results) {
      this.longTerm.touch(result.entry.id).catch(() => {
        /* ignore touch failures */
      });
    }

    return results;
  }

  /**
   * Forget a specific memory by ID.
   */
  async forget(id: string): Promise<void> {
    await this.longTerm.delete(id);
  }

  /**
   * Add a message to short-term conversation memory.
   */
  async addMessage(
    conversationId: string,
    message: { role: string; content: string },
  ): Promise<void> {
    await this.shortTerm.push(conversationId, message);
    await this.shortTerm.expire(conversationId, this.shortTermTTLSeconds);

    // Check if we need to summarize
    const messages = await this.shortTerm.getRecent(conversationId, this.maxShortTermMessages + 10);
    if (messages.length > this.maxShortTermMessages) {
      await this.summarizeAndCompact(conversationId, messages);
    }
  }

  /**
   * Get the current conversation context, optimized for context window.
   */
  async getContext(
    conversationId: string,
    maxMessages: number = 20,
  ): Promise<Array<{ role: string; content: string }>> {
    return this.shortTerm.getRecent(conversationId, maxMessages);
  }

  /**
   * Clear short-term memory for a conversation.
   */
  async clearConversation(conversationId: string): Promise<void> {
    await this.shortTerm.clear(conversationId);
  }

  /**
   * Build a context string combining short-term and long-term memory.
   */
  async buildAugmentedContext(
    conversationId: string,
    currentQuery: string,
    options?: {
      maxConversationMessages?: number;
      maxMemories?: number;
      memoryFilter?: Record<string, unknown>;
    },
  ): Promise<string> {
    const [conversationMessages, relevantMemories] = await Promise.all([
      this.getContext(conversationId, options?.maxConversationMessages ?? 10),
      this.recall(currentQuery, options?.maxMemories ?? 3, options?.memoryFilter),
    ]);

    const parts: string[] = [];

    // Add relevant long-term memories
    if (relevantMemories.length > 0) {
      parts.push('## Relevant Context');
      for (const mem of relevantMemories) {
        parts.push(`- ${mem.entry.content}`);
      }
      parts.push('');
    }

    // Add recent conversation
    if (conversationMessages.length > 0) {
      parts.push('## Recent Conversation');
      for (const msg of conversationMessages) {
        parts.push(`${msg.role}: ${msg.content}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Summarize older messages and compact the conversation.
   */
  private async summarizeAndCompact(
    conversationId: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<void> {
    if (!this.summarizationProvider) return;

    // Take older messages to summarize (keep recent ones)
    const keepCount = Math.floor(this.maxShortTermMessages / 2);
    const toSummarize = messages.slice(0, messages.length - keepCount);

    if (toSummarize.length < 5) return; // Not worth summarizing

    const conversationText = toSummarize
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const summary = await this.summarizationProvider.summarize(conversationText, 500);

    // Store the summary as a long-term memory
    await this.remember(summary, {
      type: 'conversation_summary',
      conversationId,
      messageCount: toSummarize.length,
    });

    // Clear and rebuild short-term memory with summary + recent messages
    await this.shortTerm.clear(conversationId);
    await this.shortTerm.push(conversationId, {
      role: 'system',
      content: `Previous conversation summary: ${summary}`,
    });

    const recentMessages = messages.slice(messages.length - keepCount);
    for (const msg of recentMessages) {
      await this.shortTerm.push(conversationId, msg);
    }
  }
}
