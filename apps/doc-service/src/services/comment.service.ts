import { query } from '../utils/db.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateCommentInput {
  documentId: string;
  content: string;
  authorId: string;
  position?: { from: number; to: number; blockId?: string };
  parentId?: string;
}

export interface CommentRow {
  id: string;
  document_id: string;
  content: string;
  author_id: string;
  position: { from: number; to: number; blockId?: string } | null;
  parent_id: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Comment {
  id: string;
  documentId: string;
  content: string;
  authorId: string;
  position: { from: number; to: number; blockId?: string } | null;
  parentId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

export interface CommentThread {
  root: Comment;
  replies: Comment[];
  replyCount: number;
}

// ── Mention parsing ─────────────────────────────────────────────────────────

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function parseMentions(content: string): Array<{ name: string; userId: string }> {
  const mentions: Array<{ name: string; userId: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(content)) !== null) {
    mentions.push({
      name: match[1]!,
      userId: match[2]!,
    });
  }

  return mentions;
}

// ── Service ───���──────────────────────────────��────────────────────────────────

export class CommentService {
  private notificationCallback:
    | ((documentId: string, commentId: string, mentionedUserIds: string[]) => Promise<void>)
    | null = null;

  setNotificationCallback(
    cb: (documentId: string, commentId: string, mentionedUserIds: string[]) => Promise<void>,
  ): void {
    this.notificationCallback = cb;
  }

  // ── Create ────────���───────────────────────────────────────────────────────

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const { documentId, content, authorId, position, parentId } = input;

    // Validate parent exists if specified
    if (parentId) {
      const parentResult = await query<CommentRow>(
        `SELECT id FROM document_comments WHERE id = $1 AND document_id = $2`,
        [parentId, documentId],
      );
      if (parentResult.rows.length === 0) {
        throw Object.assign(new Error('Parent comment not found'), { statusCode: 404, code: 'PARENT_NOT_FOUND' });
      }
    }

    const result = await query<CommentRow>(
      `INSERT INTO document_comments (document_id, content, author_id, position, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        documentId,
        content,
        authorId,
        position ? JSON.stringify(position) : null,
        parentId ?? null,
      ],
    );

    const comment = this.rowToComment(result.rows[0]!);

    // Parse mentions and trigger notifications
    const mentions = parseMentions(content);
    if (mentions.length > 0 && this.notificationCallback) {
      const mentionedUserIds = mentions.map((m) => m.userId);
      this.notificationCallback(documentId, comment.id, mentionedUserIds).catch((err) => {
        logger.error('Failed to send mention notifications', { error: (err as Error).message });
      });
    }

    logger.info('Comment created', {
      commentId: comment.id,
      documentId,
      authorId,
      isReply: !!parentId,
      mentionCount: mentions.length,
    });

    return comment;
  }

  // ── Read ────────��─────────────────────────────────────────────────────────

  async getComment(commentId: string): Promise<Comment | null> {
    const result = await query<CommentRow>(
      `SELECT * FROM document_comments WHERE id = $1`,
      [commentId],
    );

    if (result.rows.length === 0) return null;
    return this.rowToComment(result.rows[0]!);
  }

  // ── List comments with threads ─────────��──────────────────────────────────

  async listComments(
    documentId: string,
    options: { includeResolved?: boolean; page?: number; pageSize?: number } = {},
  ): Promise<{ threads: CommentThread[]; total: number }> {
    const { includeResolved = false, page = 1, pageSize = 50 } = options;
    const offset = (page - 1) * pageSize;

    // Get root comments (those without a parent)
    const resolvedClause = includeResolved ? '' : 'AND resolved = FALSE';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM document_comments
       WHERE document_id = $1 AND parent_id IS NULL ${resolvedClause}`,
      [documentId],
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const rootResult = await query<CommentRow>(
      `SELECT * FROM document_comments
       WHERE document_id = $1 AND parent_id IS NULL ${resolvedClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [documentId, pageSize, offset],
    );

    if (rootResult.rows.length === 0) {
      return { threads: [], total };
    }

    // Get all replies for these root comments
    const rootIds = rootResult.rows.map((r) => r.id);
    const repliesResult = await query<CommentRow>(
      `SELECT * FROM document_comments
       WHERE parent_id = ANY($1)
       ORDER BY created_at ASC`,
      [rootIds],
    );

    // Group replies by parent
    const repliesByParent = new Map<string, Comment[]>();
    for (const row of repliesResult.rows) {
      const parentId = row.parent_id!;
      if (!repliesByParent.has(parentId)) {
        repliesByParent.set(parentId, []);
      }
      repliesByParent.get(parentId)!.push(this.rowToComment(row));
    }

    const threads: CommentThread[] = rootResult.rows.map((row) => {
      const root = this.rowToComment(row);
      const replies = repliesByParent.get(root.id) ?? [];
      return {
        root,
        replies,
        replyCount: replies.length,
      };
    });

    return { threads, total };
  }

  // ── Update ─────���──────────────────────────────────────────────────────────

  async updateComment(commentId: string, content: string, userId: string): Promise<Comment | null> {
    const result = await query<CommentRow>(
      `UPDATE document_comments SET content = $1
       WHERE id = $2 AND author_id = $3
       RETURNING *`,
      [content, commentId, userId],
    );

    if (result.rows.length === 0) return null;

    logger.info('Comment updated', { commentId, userId });
    return this.rowToComment(result.rows[0]!);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM document_comments WHERE id = $1 AND author_id = $2`,
      [commentId, userId],
    );
    const deleted = (result.rowCount ?? 0) > 0;

    if (deleted) {
      logger.info('Comment deleted', { commentId, userId });
    }

    return deleted;
  }

  // ── Resolve / Unresolve ───────────��────────────────────────���──────────────

  async resolveComment(commentId: string, userId: string): Promise<Comment | null> {
    const result = await query<CommentRow>(
      `UPDATE document_comments
       SET resolved = TRUE, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2 AND parent_id IS NULL
       RETURNING *`,
      [userId, commentId],
    );

    if (result.rows.length === 0) return null;

    logger.info('Comment resolved', { commentId, userId });
    return this.rowToComment(result.rows[0]!);
  }

  async unresolveComment(commentId: string): Promise<Comment | null> {
    const result = await query<CommentRow>(
      `UPDATE document_comments
       SET resolved = FALSE, resolved_by = NULL, resolved_at = NULL
       WHERE id = $1 AND parent_id IS NULL
       RETURNING *`,
      [commentId],
    );

    if (result.rows.length === 0) return null;

    logger.info('Comment unresolved', { commentId });
    return this.rowToComment(result.rows[0]!);
  }

  // ── Helpers ────────────────────────────────────���──────────────────────────

  private rowToComment(row: CommentRow): Comment {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      authorId: row.author_id,
      position: row.position,
      parentId: row.parent_id,
      resolved: row.resolved,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
