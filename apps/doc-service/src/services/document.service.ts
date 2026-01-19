import * as Y from 'yjs';
import { query, getClient } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  title: string;
  workspaceId: string;
  template?: string;
  settings?: Record<string, unknown>;
}

export interface DocumentRow {
  id: string;
  title: string;
  workspace_id: string;
  owner_id: string;
  content_snapshot: Buffer | null;
  version: number;
  collaborators: string[];
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DocumentMeta {
  id: string;
  title: string;
  workspaceId: string;
  ownerId: string;
  version: number;
  collaborators: string[];
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VersionEntry {
  id: string;
  version: number;
  userId: string;
  createdAt: string;
  isSnapshot: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, (doc: Y.Doc) => void> = {
  blank: () => {
    // Empty document
  },
  meeting_notes: (doc: Y.Doc) => {
    const text = doc.getText('content');
    text.insert(0, '# Meeting Notes\n\n## Date: \n\n## Attendees\n- \n\n## Agenda\n1. \n\n## Action Items\n- [ ] \n\n## Notes\n');
  },
  project_brief: (doc: Y.Doc) => {
    const text = doc.getText('content');
    text.insert(0, '# Project Brief\n\n## Overview\n\n## Goals\n- \n\n## Timeline\n\n## Resources\n\n## Risks\n\n## Success Metrics\n');
  },
  technical_spec: (doc: Y.Doc) => {
    const text = doc.getText('content');
    text.insert(0, '# Technical Specification\n\n## Summary\n\n## Background\n\n## Detailed Design\n\n## API Changes\n\n## Database Changes\n\n## Testing Strategy\n\n## Rollout Plan\n');
  },
};

// ── Document Service ──────────────────────────────────────────────────────────

export class DocumentService {
  // ── Create ────────────────────────────────────────────────────────────────

  async createDocument(data: CreateDocumentInput, userId: string): Promise<DocumentMeta> {
    const doc = new Y.Doc();

    // Apply template if specified
    const templateFn = TEMPLATES[data.template ?? 'blank'];
    if (templateFn) {
      templateFn(doc);
    }

    const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc));

    const result = await query<DocumentRow>(
      `INSERT INTO documents (title, workspace_id, owner_id, content_snapshot, collaborators, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.title,
        data.workspaceId,
        userId,
        snapshot,
        [userId],
        JSON.stringify(data.settings ?? {}),
      ],
    );

    const row = result.rows[0]!;

    // Create initial snapshot record
    await query(
      `INSERT INTO document_snapshots (document_id, snapshot_data, version)
       VALUES ($1, $2, $3)`,
      [row.id, snapshot, 1],
    );

    // Cache in Redis
    const redis = getRedis();
    await redis.setex(`doc:${row.id}:meta`, 3600, JSON.stringify(this.rowToMeta(row)));

    logger.info('Document created', { documentId: row.id, userId, template: data.template });

    return this.rowToMeta(row);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getDocument(id: string): Promise<{ meta: DocumentMeta; content: Uint8Array | null } | null> {
    // Try cache first
    const redis = getRedis();
    const cached = await redis.get(`doc:${id}:meta`);
    let meta: DocumentMeta | null = null;

    if (cached) {
      try {
        meta = JSON.parse(cached) as DocumentMeta;
      } catch {
        // Ignore cache parse errors
      }
    }

    const result = await query<DocumentRow>(
      `SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    meta = this.rowToMeta(row);

    // Update cache
    await redis.setex(`doc:${id}:meta`, 3600, JSON.stringify(meta));

    return {
      meta,
      content: row.content_snapshot ? new Uint8Array(row.content_snapshot) : null,
    };
  }

  // ── Update metadata ───────────────────────────────────────────────────────

  async updateDocument(
    id: string,
    updates: { title?: string; settings?: Record<string, unknown>; collaborators?: string[] },
    userId: string,
  ): Promise<DocumentMeta | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIdx++}`);
      params.push(updates.title);
    }
    if (updates.settings !== undefined) {
      setClauses.push(`settings = $${paramIdx++}`);
      params.push(JSON.stringify(updates.settings));
    }
    if (updates.collaborators !== undefined) {
      setClauses.push(`collaborators = $${paramIdx++}`);
      params.push(updates.collaborators);
    }

    if (setClauses.length === 0) return null;

    params.push(id);

    const result = await query<DocumentRow>(
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`,
      params,
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    const meta = this.rowToMeta(row);

    // Invalidate cache
    const redis = getRedis();
    await redis.setex(`doc:${id}:meta`, 3600, JSON.stringify(meta));

    logger.info('Document metadata updated', { documentId: id, userId, fields: Object.keys(updates) });
    return meta;
  }

  // ── Apply CRDT update ─────────────────────────────────────────────────────

  async applyUpdate(documentId: string, update: Uint8Array, userId: string): Promise<number> {
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
        throw new Error(`Document not found: ${documentId}`);
      }

      const newVersion = versionResult.rows[0]!.version;

      // Store the update
      await client.query(
        `INSERT INTO document_updates (document_id, update_data, user_id, version)
         VALUES ($1, $2, $3, $4)`,
        [documentId, Buffer.from(update), userId, newVersion],
      );

      // Check if we need to compact (create a new snapshot)
      const updateCountResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM document_updates
         WHERE document_id = $1 AND version > (
           SELECT COALESCE(MAX(version), 0) FROM document_snapshots WHERE document_id = $1
         )`,
        [documentId],
      );

      const updatesSinceSnapshot = parseInt(updateCountResult.rows[0]!.count, 10);

      if (updatesSinceSnapshot >= config.snapshotThreshold) {
        await this.compactDocument(client, documentId, newVersion);
      }

      await client.query('COMMIT');

      logger.debug('Document update applied', { documentId, userId, version: newVersion });
      return newVersion;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteDocument(id: string, userId: string): Promise<boolean> {
    const result = await query(
      `UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if ((result.rowCount ?? 0) === 0) return false;

    // Invalidate cache
    const redis = getRedis();
    await redis.del(`doc:${id}:meta`, `doc:${id}:content`);

    logger.info('Document soft-deleted', { documentId: id, userId });
    return true;
  }

  // ── Version history ───────────────────────────────────────────────────────

  async getVersionHistory(documentId: string): Promise<VersionEntry[]> {
    // Get both updates and snapshots, merged and sorted
    const updates = await query<{ id: string; version: number; user_id: string; created_at: Date }>(
      `SELECT id, version, user_id, created_at FROM document_updates
       WHERE document_id = $1 ORDER BY version DESC LIMIT 100`,
      [documentId],
    );

    const snapshots = await query<{ id: string; version: number; created_at: Date }>(
      `SELECT id, version, created_at FROM document_snapshots
       WHERE document_id = $1 ORDER BY version DESC`,
      [documentId],
    );

    const snapshotVersions = new Set(snapshots.rows.map((s) => s.version));

    const entries: VersionEntry[] = updates.rows.map((u) => ({
      id: u.id,
      version: u.version,
      userId: u.user_id,
      createdAt: u.created_at.toISOString(),
      isSnapshot: snapshotVersions.has(u.version),
    }));

    // Add snapshots that don't have a corresponding update (e.g., initial snapshot)
    for (const s of snapshots.rows) {
      if (!entries.some((e) => e.version === s.version)) {
        entries.push({
          id: s.id,
          version: s.version,
          userId: '',
          createdAt: s.created_at.toISOString(),
          isSnapshot: true,
        });
      }
    }

    entries.sort((a, b) => b.version - a.version);
    return entries;
  }

  // ── Restore version ───────────────────────────────────────────────────────

  async restoreVersion(documentId: string, targetVersion: number, userId: string): Promise<DocumentMeta | null> {
    // Find the closest snapshot at or before the target version
    const snapshotResult = await query<{ snapshot_data: Buffer; version: number }>(
      `SELECT snapshot_data, version FROM document_snapshots
       WHERE document_id = $1 AND version <= $2
       ORDER BY version DESC LIMIT 1`,
      [documentId, targetVersion],
    );

    // Reconstruct the Y.Doc at target version
    const doc = new Y.Doc();

    if (snapshotResult.rows.length > 0) {
      const snapshot = snapshotResult.rows[0]!;
      Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot_data));

      // Apply updates between snapshot version and target version
      if (snapshot.version < targetVersion) {
        const updates = await query<{ update_data: Buffer }>(
          `SELECT update_data FROM document_updates
           WHERE document_id = $1 AND version > $2 AND version <= $3
           ORDER BY version ASC`,
          [documentId, snapshot.version, targetVersion],
        );

        for (const u of updates.rows) {
          Y.applyUpdate(doc, new Uint8Array(u.update_data));
        }
      }
    } else {
      // No snapshots; apply all updates up to target version
      const updates = await query<{ update_data: Buffer }>(
        `SELECT update_data FROM document_updates
         WHERE document_id = $1 AND version <= $2
         ORDER BY version ASC`,
        [documentId, targetVersion],
      );

      for (const u of updates.rows) {
        Y.applyUpdate(doc, new Uint8Array(u.update_data));
      }
    }

    // Save the restored state as a new snapshot and update the document
    const restoredState = Buffer.from(Y.encodeStateAsUpdate(doc));

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const versionResult = await client.query<DocumentRow>(
        `UPDATE documents
         SET content_snapshot = $1, version = version + 1
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [restoredState, documentId],
      );

      if (versionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const row = versionResult.rows[0]!;

      // Create a new snapshot for the restored state
      await client.query(
        `INSERT INTO document_snapshots (document_id, snapshot_data, version)
         VALUES ($1, $2, $3)`,
        [documentId, restoredState, row.version],
      );

      await client.query('COMMIT');

      logger.info('Document restored', { documentId, targetVersion, newVersion: row.version, userId });
      return this.rowToMeta(row);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async exportDocument(
    documentId: string,
    format: 'html' | 'md' | 'pdf',
  ): Promise<{ content: string; mimeType: string } | null> {
    const docData = await this.getDocument(documentId);
    if (!docData || !docData.content) return null;

    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, docData.content);

    const textContent = ydoc.getText('content').toString();

    switch (format) {
      case 'md':
        return {
          content: textContent,
          mimeType: 'text/markdown',
        };

      case 'html': {
        // Convert markdown-like content to basic HTML
        const htmlContent = this.markdownToHtml(textContent);
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(docData.meta.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
    code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 5px; overflow-x: auto; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
        return { content: fullHtml, mimeType: 'text/html' };
      }

      case 'pdf':
        // PDF generation would require a library like puppeteer in production;
        // return HTML with a note that it should be rendered to PDF by the client
        return {
          content: JSON.stringify({
            title: docData.meta.title,
            content: textContent,
            format: 'pdf-pending',
            message: 'PDF rendering should be done client-side or via a dedicated rendering service',
          }),
          mimeType: 'application/json',
        };

      default:
        return null;
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async searchDocuments(
    queryStr: string,
    workspaceId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResult<DocumentMeta>> {
    const offset = (page - 1) * pageSize;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM documents
       WHERE workspace_id = $1 AND deleted_at IS NULL AND title ILIKE $2`,
      [workspaceId, `%${queryStr}%`],
    );

    const total = parseInt(countResult.rows[0]!.count, 10);

    const result = await query<DocumentRow>(
      `SELECT * FROM documents
       WHERE workspace_id = $1 AND deleted_at IS NULL AND title ILIKE $2
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [workspaceId, `%${queryStr}%`, pageSize, offset],
    );

    return {
      items: result.rows.map((r) => this.rowToMeta(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── List documents ────────────────────────────────────────────────────────

  async listDocuments(
    workspaceId: string,
    options: { page?: number; pageSize?: number; ownerId?: string; search?: string } = {},
  ): Promise<PaginatedResult<DocumentMeta>> {
    const { page = 1, pageSize = 20, ownerId, search } = options;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['workspace_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [workspaceId];
    let paramIdx = 2;

    if (ownerId) {
      conditions.push(`owner_id = $${paramIdx++}`);
      params.push(ownerId);
    }

    if (search) {
      conditions.push(`title ILIKE $${paramIdx++}`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM documents WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const listParams = [...params, pageSize, offset];
    const result = await query<DocumentRow>(
      `SELECT * FROM documents WHERE ${whereClause} ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      listParams,
    );

    return {
      items: result.rows.map((r) => this.rowToMeta(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Compaction ────────────────────────────────────────────────────────────

  private async compactDocument(
    client: import('pg').PoolClient,
    documentId: string,
    currentVersion: number,
  ): Promise<void> {
    logger.info('Compacting document', { documentId, version: currentVersion });

    // Get the latest snapshot
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

    // Apply all updates since last snapshot
    const updates = await client.query<{ update_data: Buffer }>(
      `SELECT update_data FROM document_updates
       WHERE document_id = $1 AND version > $2
       ORDER BY version ASC`,
      [documentId, baseVersion],
    );

    for (const u of updates.rows) {
      Y.applyUpdate(doc, new Uint8Array(u.update_data));
    }

    const compactedState = Buffer.from(Y.encodeStateAsUpdate(doc));

    // Save new snapshot
    await client.query(
      `INSERT INTO document_snapshots (document_id, snapshot_data, version)
       VALUES ($1, $2, $3)`,
      [documentId, compactedState, currentVersion],
    );

    // Update document's content_snapshot
    await client.query(
      `UPDATE documents SET content_snapshot = $1 WHERE id = $2`,
      [compactedState, documentId],
    );

    // Clean up old updates that are now covered by the snapshot
    // Keep the most recent ones for fine-grained history
    await client.query(
      `DELETE FROM document_updates
       WHERE document_id = $1 AND version <= $2 AND version > $3`,
      [documentId, currentVersion - 10, baseVersion], // Keep the last 10 before the snapshot
    );

    logger.info('Document compacted', { documentId, version: currentVersion, updatesApplied: updates.rowCount });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rowToMeta(row: DocumentRow): DocumentMeta {
    return {
      id: row.id,
      title: row.title,
      workspaceId: row.workspace_id,
      ownerId: row.owner_id,
      version: row.version,
      collaborators: row.collaborators ?? [],
      settings: row.settings ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private markdownToHtml(md: string): string {
    // Basic markdown-to-HTML conversion for export
    let html = md;

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Checkbox lists
    html = html.replace(/<li>\[ \] (.+)<\/li>/g, '<li><input type="checkbox" disabled> $1</li>');
    html = html.replace(/<li>\[x\] (.+)<\/li>/g, '<li><input type="checkbox" checked disabled> $1</li>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs (double newlines)
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  }
}
