import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { DocumentService } from '../services/document.service.js';
import { CommentService } from '../services/comment.service.js';
import { getCollaborationService, getCrdtPersistenceService } from '../kafka/consumer.js';
import { publishDocumentEvent, publishNotificationEvent } from '../kafka/producer.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ── Zod schemas ─────────────────────────────────────────────────────────────

const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  workspaceId: z.string().uuid(),
  template: z.enum(['blank', 'meeting_notes', 'project_brief', 'technical_spec']).optional(),
  settings: z.record(z.unknown()).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  settings: z.record(z.unknown()).optional(),
  collaborators: z.array(z.string().uuid()).optional(),
});

const listDocumentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
});

const exportSchema = z.object({
  format: z.enum(['html', 'md', 'pdf']),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  position: z
    .object({
      from: z.number().int().min(0),
      to: z.number().int().min(0),
      blockId: z.string().optional(),
    })
    .optional(),
  parentId: z.string().uuid().optional(),
});

const listCommentsSchema = z.object({
  includeResolved: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Auth middleware ──────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  userId?: string;
}

function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch (err) {
    const jwtErr = err as jwt.JsonWebTokenError;
    if (jwtErr.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } });
      return;
    }
    res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

export const documentRouter = Router();
const documentService = new DocumentService();
const commentService = new CommentService();

// Wire up comment notification callback
commentService.setNotificationCallback(async (documentId, commentId, mentionedUserIds) => {
  await publishNotificationEvent('mention', mentionedUserIds, { documentId, commentId });
});

// ── POST /documents ─────────────────────────────────────────────────────────

documentRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
      return;
    }

    const doc = await documentService.createDocument(parsed.data, req.userId!);
    await publishDocumentEvent('created', doc.id, req.userId!, { title: doc.title });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    logger.error('Error creating document', { error: (err as Error).message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create document' } });
  }
});

// ── GET /documents ──────────────────────────────────────────────────────────

documentRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = listDocumentsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() },
      });
      return;
    }

    const { workspaceId, page, pageSize, ownerId, search } = parsed.data;
    const result = await documentService.listDocuments(workspaceId, { page, pageSize, ownerId, search });

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Error listing documents', { error: (err as Error).message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list documents' } });
  }
});

// ── GET /documents/:id ──────────────────────────────────────────────────────

documentRouter.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const doc = await documentService.getDocument(req.params.id!);
    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return;
    }

    // Track collaborator
    const collabService = getCollaborationService();
    await collabService.addCollaborator(req.params.id!, req.userId!);

    res.json({
      success: true,
      data: {
        ...doc.meta,
        hasContent: doc.content !== null,
        contentBase64: doc.content ? Buffer.from(doc.content).toString('base64') : null,
      },
    });
  } catch (err) {
    logger.error('Error getting document', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get document' } });
  }
});

// ── PUT /documents/:id ──────────────────────────────────────────────────────

documentRouter.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
      return;
    }

    const doc = await documentService.updateDocument(req.params.id!, parsed.data, req.userId!);
    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return;
    }

    await publishDocumentEvent('updated', doc.id, req.userId!, { fields: Object.keys(parsed.data) });

    res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('Error updating document', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update document' } });
  }
});

// ── DELETE /documents/:id ───────────────────────────────────────────────────

documentRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await documentService.deleteDocument(req.params.id!, req.userId!);
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return;
    }

    await publishDocumentEvent('deleted', req.params.id!, req.userId!);

    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    logger.error('Error deleting document', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete document' } });
  }
});

// ── GET /documents/:id/history ──────────────────────────────────────────────

documentRouter.get('/:id/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const history = await documentService.getVersionHistory(req.params.id!);
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Error getting version history', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get version history' } });
  }
});

// ── POST /documents/:id/restore/:version ────────────────────────────────────

documentRouter.post('/:id/restore/:version', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const version = parseInt(req.params.version!, 10);
    if (isNaN(version) || version < 1) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } });
      return;
    }

    const doc = await documentService.restoreVersion(req.params.id!, version, req.userId!);
    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document or version not found' } });
      return;
    }

    await publishDocumentEvent('restored', doc.id, req.userId!, { restoredVersion: version });

    res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('Error restoring document', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to restore document' } });
  }
});

// ── POST /documents/:id/export ──────────────────────────────────────────────

documentRouter.post('/:id/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid format', details: parsed.error.flatten() },
      });
      return;
    }

    const result = await documentService.exportDocument(req.params.id!, parsed.data.format);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found or empty' } });
      return;
    }

    await publishDocumentEvent('exported', req.params.id!, req.userId!, { format: parsed.data.format });

    res.setHeader('Content-Type', result.mimeType);
    res.send(result.content);
  } catch (err) {
    logger.error('Error exporting document', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to export document' } });
  }
});

// ── POST /documents/:id/comment ─────────────────────────────────────────────

documentRouter.post('/:id/comment', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
      return;
    }

    const comment = await commentService.createComment({
      documentId: req.params.id!,
      content: parsed.data.content,
      authorId: req.userId!,
      position: parsed.data.position,
      parentId: parsed.data.parentId,
    });

    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    const error = err as Error & { statusCode?: number; code?: string };
    if (error.statusCode === 404) {
      res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    logger.error('Error creating comment', { error: error.message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create comment' } });
  }
});

// ── GET /documents/:id/comments ─────────────────────────────────────────────

documentRouter.get('/:id/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = listCommentsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() },
      });
      return;
    }

    const result = await commentService.listComments(req.params.id!, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Error listing comments', { error: (err as Error).message, documentId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list comments' } });
  }
});

// ── POST /documents/:id/comments/:commentId/resolve ─────────────────────────

documentRouter.post('/:id/comments/:commentId/resolve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const comment = await commentService.resolveComment(req.params.commentId!, req.userId!);
    if (!comment) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Comment not found' } });
      return;
    }
    res.json({ success: true, data: comment });
  } catch (err) {
    logger.error('Error resolving comment', { error: (err as Error).message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve comment' } });
  }
});
