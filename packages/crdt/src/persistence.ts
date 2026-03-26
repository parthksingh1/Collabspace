import * as Y from 'yjs';

// ─── Types ─────────────────────────────────────────────────────────

export interface StorageAdapter {
  /** Store a binary update for a document. */
  storeUpdate(documentId: string, update: Uint8Array): Promise<void>;
  /** Get all stored updates for a document. */
  getUpdates(documentId: string): Promise<Uint8Array[]>;
  /** Store a compacted snapshot, replacing all previous updates. */
  storeSnapshot(documentId: string, snapshot: Uint8Array): Promise<void>;
  /** Get the latest snapshot for a document. */
  getSnapshot(documentId: string): Promise<Uint8Array | null>;
  /** Delete all data for a document. */
  deleteDocument(documentId: string): Promise<void>;
  /** Get the number of stored updates (for compaction decision). */
  getUpdateCount(documentId: string): Promise<number>;
}

export interface CRDTPersistenceOptions {
  /** Storage adapter for persisting updates. */
  storage: StorageAdapter;
  /** Debounce interval for persisting updates (ms). Default: 500. */
  debounceMs?: number;
  /** Number of updates before triggering compaction. Default: 100. */
  compactionThreshold?: number;
}

/**
 * Handles durable persistence of CRDT documents.
 * Debounces writes to avoid write storms and periodically compacts updates.
 */
export class CRDTPersistence {
  private readonly storage: StorageAdapter;
  private readonly debounceMs: number;
  private readonly compactionThreshold: number;

  private readonly pendingUpdates: Map<string, Uint8Array[]> = new Map();
  private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly docs: Map<string, Y.Doc> = new Map();

  constructor(options: CRDTPersistenceOptions) {
    this.storage = options.storage;
    this.debounceMs = options.debounceMs ?? 500;
    this.compactionThreshold = options.compactionThreshold ?? 100;
  }

  /**
   * Store an update for a document, debounced to avoid write storms.
   */
  storeUpdate(documentId: string, update: Uint8Array): void {
    // Accumulate pending updates
    const pending = this.pendingUpdates.get(documentId) ?? [];
    pending.push(update);
    this.pendingUpdates.set(documentId, pending);

    // Reset debounce timer
    const existingTimer = this.debounceTimers.get(documentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.flushUpdates(documentId).catch((err) => {
        console.error(`[CRDTPersistence] Failed to flush updates for ${documentId}:`, err);
      });
    }, this.debounceMs);

    this.debounceTimers.set(documentId, timer);
  }

  /**
   * Flush all pending updates for a document to storage.
   */
  private async flushUpdates(documentId: string): Promise<void> {
    const pending = this.pendingUpdates.get(documentId);
    if (!pending || pending.length === 0) return;

    this.pendingUpdates.delete(documentId);
    this.debounceTimers.delete(documentId);

    // Merge all pending updates into one
    const merged = Y.mergeUpdates(pending);
    await this.storage.storeUpdate(documentId, merged);

    // Check if compaction is needed
    const updateCount = await this.storage.getUpdateCount(documentId);
    if (updateCount >= this.compactionThreshold) {
      await this.compact(documentId);
    }
  }

  /**
   * Load a document from storage, applying the snapshot and any subsequent updates.
   */
  async getDocument(documentId: string): Promise<Y.Doc> {
    const existingDoc = this.docs.get(documentId);
    if (existingDoc) return existingDoc;

    const doc = new Y.Doc();

    // Load snapshot first
    const snapshot = await this.storage.getSnapshot(documentId);
    if (snapshot) {
      Y.applyUpdate(doc, snapshot);
    }

    // Apply any updates on top
    const updates = await this.storage.getUpdates(documentId);
    for (const update of updates) {
      Y.applyUpdate(doc, update);
    }

    this.docs.set(documentId, doc);
    return doc;
  }

  /**
   * Get all stored updates for a document (for debugging or migration).
   */
  async getDocumentUpdates(documentId: string): Promise<Uint8Array[]> {
    return this.storage.getUpdates(documentId);
  }

  /**
   * Compact all updates into a single snapshot.
   * This reduces storage size and speeds up document loading.
   */
  async compact(documentId: string): Promise<void> {
    // Flush any pending updates first
    await this.flushUpdates(documentId);

    // Load the full document
    const doc = await this.getDocument(documentId);

    // Encode the full state as a single snapshot
    const snapshot = Y.encodeStateAsUpdate(doc);
    await this.storage.storeSnapshot(documentId, snapshot);
  }

  /**
   * Force flush all pending updates for all documents.
   */
  async flushAll(): Promise<void> {
    const documentIds = Array.from(this.pendingUpdates.keys());
    await Promise.all(documentIds.map((id) => this.flushUpdates(id)));
  }

  /**
   * Remove a document from the in-memory cache.
   */
  unloadDocument(documentId: string): void {
    const doc = this.docs.get(documentId);
    if (doc) {
      doc.destroy();
      this.docs.delete(documentId);
    }

    // Clear any pending timers
    const timer = this.debounceTimers.get(documentId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(documentId);
    }
    this.pendingUpdates.delete(documentId);
  }

  /**
   * Destroy the persistence layer, flushing all pending updates.
   */
  async destroy(): Promise<void> {
    await this.flushAll();

    for (const [, timer] of this.debounceTimers) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingUpdates.clear();

    for (const [, doc] of this.docs) {
      doc.destroy();
    }
    this.docs.clear();
  }
}
