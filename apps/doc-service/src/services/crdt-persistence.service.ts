import * as Y from 'yjs';
import { query, getClient } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingUpdate {
  documentId: string;
  userId: string;
  update: Uint8Array;
  receivedAt: number;
}

interface BatchState {
  updates: PendingUpdate[];
  timer: ReturnType<typeof setTimeout> | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CrdtPersistenceService {
  private batches = new Map<string, BatchState>();
  private isShuttingDown = false;

  // ── Queue an update for debounced persistence ─────────────────────────────

  queueUpdate(documentId: string, userId: string, update: Uint8Array): void {
    if (this.isShuttingDown) {
      logger.warn('Update queued during shutdown, processing immediately', { documentId });
      this.persistBatch(documentId).catch((err) => {
        logger.error('Failed to persist during shutdown', { error: (err as Error).message });
      });
      return;
    }

    let batch = this.batches.get(documentId);
    if (!batch) {
      batch = { updates: [], timer: null };
      this.batches.set(documentId, batch);
    }

    batch.updates.push({
      documentId,
      userId,
      update,
      receivedAt: Date.now(),
    });

    // Reset debounce timer
    if (batch.timer) {
      clearTimeout(batch.timer);
    }

    batch.timer = setTimeout(() => {
      this.persistBatch(documentId).catch((err) => {
        logger.error('Failed to persist batch', {
          documentId,
          error: (err as Error).message,
        });
      });
    }, config.updateBatchWindowMs);
  }

  // ── Persist a batch of updates ────────────────────────────────────────────

  private async persistBatch(documentId: string): Promise<void> {
    const batch = this.batches.get(documentId);
    if (!batch || batch.updates.length === 0) return;

    // Take the updates and clear the batch
    const updates = batch.updates.splice(0);
    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }
    if (batch.updates.length === 0) {
      this.batches.delete(documentId);
    }

    // Merge all updates into one for efficient storage
    const mergedDoc = new Y.Doc();
    for (const { update } of updates) {
      Y.applyUpdate(mergedDoc, update);
    }
    const mergedUpdate = Y.encodeStateAsUpdate(mergedDoc);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Increment version
      const versionResult = await client.query<{ version: number }>(
        `UPDATE documents SET version = version + 1 WHERE id = $1 AND deleted_at IS NULL RETURNING version`,
        [documentId],
      );

      if (versionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.warn('Document not found for batch persist', { documentId });
        return;
      }

      const newVersion = versionResult.rows[0]!.version;

      // Use the last update's userId for attribution
      const lastUserId = updates[updates.length - 1]!.userId;

      // Store the merged update
      await client.query(
        `INSERT INTO document_updates (document_id, update_data, user_id, version)
         VALUES ($1, $2, $3, $4)`,
        [documentId, Buffer.from(mergedUpdate), lastUserId, newVersion],
      );

      // Check if compaction is needed
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM document_updates
         WHERE document_id = $1 AND version > (
           SELECT COALESCE(MAX(version), 0) FROM document_snapshots WHERE document_id = $1
         )`,
        [documentId],
      );

      const updatesSinceSnapshot = parseInt(countResult.rows[0]!.count, 10);

      if (updatesSinceSnapshot >= config.snapshotThreshold) {
        await this.compactToSnapshot(client, documentId, newVersion);
      }

      await client.query('COMMIT');

      logger.debug('Batch persisted', {
        documentId,
        updateCount: updates.length,
        version: newVersion,
        mergedSize: mergedUpdate.length,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Load document (snapshot + subsequent updates) ─────────────────────────

  async loadDocument(documentId: string): Promise<Y.Doc> {
    const doc = new Y.Doc();

    // Try to load from Redis cache first
    const redis = getRedis();
    const cachedState = await redis.getBuffer(`doc:${documentId}:state`);

    if (cachedState) {
      Y.applyUpdate(doc, new Uint8Array(cachedState));
      logger.debug('Document loaded from cache', { documentId });
      return doc;
    }

    // Load latest snapshot
    const snapshotResult = await query<{ snapshot_data: Buffer; version: number }>(
      `SELECT snapshot_data, version FROM document_snapshots
       WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
      [documentId],
    );

    let baseVersion = 0;

    if (snapshotResult.rows.length > 0) {
      const snapshot = snapshotResult.rows[0]!;
      Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot_data));
      baseVersion = snapshot.version;
    }

    // Apply subsequent updates
    const updates = await query<{ update_data: Buffer; version: number }>(
      `SELECT update_data, version FROM document_updates
       WHERE document_id = $1 AND version > $2
       ORDER BY version ASC`,
      [documentId, baseVersion],
    );

    for (const row of updates.rows) {
      Y.applyUpdate(doc, new Uint8Array(row.update_data));
    }

    // Cache the full state in Redis (5 minute TTL)
    const fullState = Y.encodeStateAsUpdate(doc);
    await redis.setex(`doc:${documentId}:state`, 300, Buffer.from(fullState));

    logger.debug('Document loaded from DB', {
      documentId,
      snapshotVersion: baseVersion,
      additionalUpdates: updates.rowCount,
    });

    return doc;
  }

  // ── Create an explicit version snapshot ───────────────────────────────────

  async createSnapshot(documentId: string): Promise<number> {
    const doc = await this.loadDocument(documentId);
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const versionResult = await client.query<{ version: number }>(
        `SELECT version FROM documents WHERE id = $1 AND deleted_at IS NULL`,
        [documentId],
      );

      if (versionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`Document not found: ${documentId}`);
      }

      const version = versionResult.rows[0]!.version;

      await client.query(
        `INSERT INTO document_snapshots (document_id, snapshot_data, version)
         VALUES ($1, $2, $3)`,
        [documentId, state, version],
      );

      // Update the content_snapshot on the document
      await client.query(
        `UPDATE documents SET content_snapshot = $1 WHERE id = $2`,
        [state, documentId],
      );

      await client.query('COMMIT');

      // Invalidate cache
      const redis = getRedis();
      await redis.del(`doc:${documentId}:state`);

      logger.info('Manual snapshot created', { documentId, version });
      return version;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Compaction ────────────────────────────────────────────────────────────

  private async compactToSnapshot(
    client: import('pg').PoolClient,
    documentId: string,
    currentVersion: number,
  ): Promise<void> {
    // Load previous snapshot
    const snapshotResult = await client.query<{ snapshot_data: Buffer; version: number }>(
      `SELECT snapshot_data, version FROM document_snapshots
       WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
      [documentId],
    );

    const doc = new Y.Doc();
    let baseVersion = 0;

    if (snapshotResult.rows.length > 0) {
      const snapshot = snapshotResult.rows[0]!;
      Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot_data));
      baseVersion = snapshot.version;
    }

    // Apply all updates since
    const updates = await client.query<{ update_data: Buffer }>(
      `SELECT update_data FROM document_updates
       WHERE document_id = $1 AND version > $2
       ORDER BY version ASC`,
      [documentId, baseVersion],
    );

    for (const row of updates.rows) {
      Y.applyUpdate(doc, new Uint8Array(row.update_data));
    }

    const compacted = Buffer.from(Y.encodeStateAsUpdate(doc));

    // Insert new snapshot
    await client.query(
      `INSERT INTO document_snapshots (document_id, snapshot_data, version)
       VALUES ($1, $2, $3)`,
      [documentId, compacted, currentVersion],
    );

    // Update document
    await client.query(
      `UPDATE documents SET content_snapshot = $1 WHERE id = $2`,
      [compacted, documentId],
    );

    // Invalidate cache
    const redis = getRedis();
    await redis.del(`doc:${documentId}:state`);

    logger.info('Document compacted to snapshot', {
      documentId,
      version: currentVersion,
      previousSnapshotVersion: baseVersion,
    });
  }

  // ── Flush all pending batches ─────────────────────────────────────────────

  async flushAll(): Promise<void> {
    this.isShuttingDown = true;

    const promises: Promise<void>[] = [];
    for (const [documentId] of this.batches) {
      promises.push(this.persistBatch(documentId));
    }

    await Promise.allSettled(promises);
    logger.info('All pending batches flushed');
  }
}
