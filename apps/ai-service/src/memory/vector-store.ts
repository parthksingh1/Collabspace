import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: Record<string, unknown>;
}

export interface VectorQueryResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorQueryOptions {
  topK: number;
  filter?: Record<string, unknown>;
  includeMetadata?: boolean;
  namespace?: string;
}

// ---------------------------------------------------------------------------
// VectorStore — Pinecone abstraction
// ---------------------------------------------------------------------------

export class VectorStore {
  private apiKey: string;
  private indexHost: string;
  private indexName: string;

  constructor() {
    this.apiKey = config.pineconeApiKey;
    this.indexName = config.pineconeIndexName;
    // Pinecone index host is typically: <index-name>-<project-id>.svc.<environment>.pinecone.io
    this.indexHost = `https://${this.indexName}-${config.pineconeEnvironment}.svc.${config.pineconeEnvironment}.pinecone.io`;
  }

  private async pineconeRequest(
    path: string,
    method: string,
    body?: unknown,
    namespace?: string,
  ): Promise<unknown> {
    const url = `${this.indexHost}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Pinecone API error ${response.status}: ${errText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  // -----------------------------------------------------------------------
  // Upsert vectors
  // -----------------------------------------------------------------------

  async upsert(vectors: VectorRecord[], namespace?: string): Promise<number> {
    if (vectors.length === 0) return 0;

    // Pinecone has a limit of 100 vectors per upsert
    const batchSize = 100;
    let totalUpserted = 0;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);

      const pineconeVectors = batch.map((v) => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata,
      }));

      try {
        const result = (await this.pineconeRequest('/vectors/upsert', 'POST', {
          vectors: pineconeVectors,
          namespace: namespace ?? '',
        })) as { upsertedCount?: number };

        totalUpserted += result?.upsertedCount ?? batch.length;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Vector upsert batch failed', {
          error: errorMsg,
          batchIndex: i,
          batchSize: batch.length,
        });

        // If Pinecone is unavailable, use in-memory fallback
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
          logger.warn('Pinecone unavailable, using in-memory fallback for upsert');
          this.inMemoryUpsert(batch, namespace);
          totalUpserted += batch.length;
        } else {
          throw err;
        }
      }
    }

    logger.debug(`Upserted ${totalUpserted} vectors`, { namespace });
    return totalUpserted;
  }

  // -----------------------------------------------------------------------
  // Query vectors
  // -----------------------------------------------------------------------

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryResult[]> {
    const namespace = options.namespace ?? '';

    try {
      const body: Record<string, unknown> = {
        vector,
        topK: options.topK,
        includeMetadata: options.includeMetadata ?? true,
        namespace,
      };

      if (options.filter) {
        body.filter = options.filter;
      }

      const result = (await this.pineconeRequest('/query', 'POST', body)) as {
        matches?: {
          id: string;
          score: number;
          metadata?: Record<string, unknown>;
        }[];
      };

      return (result.matches ?? []).map((m) => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata ?? {},
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Vector query failed', { error: errorMsg, namespace });

      // Fallback to in-memory search
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
        logger.warn('Pinecone unavailable, using in-memory fallback for query');
        return this.inMemoryQuery(vector, options);
      }

      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Delete vectors
  // -----------------------------------------------------------------------

  async delete(ids: string[], namespace?: string): Promise<void> {
    if (ids.length === 0) return;

    const batchSize = 1000;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);

      try {
        await this.pineconeRequest('/vectors/delete', 'POST', {
          ids: batch,
          namespace: namespace ?? '',
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Vector delete failed', { error: errorMsg, count: batch.length });

        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
          this.inMemoryDelete(batch, namespace);
        } else {
          throw err;
        }
      }
    }

    logger.debug(`Deleted ${ids.length} vectors`, { namespace });
  }

  async deleteByFilter(filter: Record<string, unknown>, namespace?: string): Promise<void> {
    try {
      await this.pineconeRequest('/vectors/delete', 'POST', {
        filter,
        namespace: namespace ?? '',
        deleteAll: false,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Vector delete by filter failed', { error: errorMsg });
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // In-memory fallback (for development / when Pinecone is unavailable)
  // -----------------------------------------------------------------------

  private inMemoryStore: Map<string, Map<string, VectorRecord>> = new Map();

  private getNamespaceStore(namespace?: string): Map<string, VectorRecord> {
    const ns = namespace ?? '__default__';
    let store = this.inMemoryStore.get(ns);
    if (!store) {
      store = new Map();
      this.inMemoryStore.set(ns, store);
    }
    return store;
  }

  private inMemoryUpsert(vectors: VectorRecord[], namespace?: string): void {
    const store = this.getNamespaceStore(namespace);
    for (const v of vectors) {
      store.set(v.id, v);
    }
  }

  private inMemoryQuery(vector: number[], options: VectorQueryOptions): VectorQueryResult[] {
    const store = this.getNamespaceStore(options.namespace);
    const results: { id: string; score: number; metadata: Record<string, unknown> }[] = [];

    for (const [id, record] of store) {
      // Check metadata filter
      if (options.filter && !this.matchesFilter(record.metadata, options.filter)) {
        continue;
      }

      const score = this.cosineSimilarity(vector, record.values);
      results.push({ id, score, metadata: record.metadata });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.topK);
  }

  private inMemoryDelete(ids: string[], namespace?: string): void {
    const store = this.getNamespaceStore(namespace);
    for (const id of ids) {
      store.delete(id);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  private matchesFilter(metadata: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null) {
        // Handle Pinecone filter operators ($eq, $in, etc.)
        const ops = value as Record<string, unknown>;
        const metaValue = metadata[key];

        if ('$eq' in ops && metaValue !== ops.$eq) return false;
        if ('$ne' in ops && metaValue === ops.$ne) return false;
        if ('$in' in ops && Array.isArray(ops.$in) && !ops.$in.includes(metaValue)) return false;
        if ('$gt' in ops && typeof metaValue === 'number' && typeof ops.$gt === 'number' && metaValue <= ops.$gt)
          return false;
        if ('$lt' in ops && typeof metaValue === 'number' && typeof ops.$lt === 'number' && metaValue >= ops.$lt)
          return false;
      } else {
        if (metadata[key] !== value) return false;
      }
    }
    return true;
  }
}

export const vectorStore = new VectorStore();
