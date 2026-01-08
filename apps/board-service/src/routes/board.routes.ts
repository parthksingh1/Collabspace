import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../utils/validation.js';
import { BadRequestError } from '../utils/errors.js';
import * as boardService from '../services/board.service.js';
import * as elementService from '../services/element.service.js';
import * as exportService from '../services/export.service.js';
import * as aiBoardService from '../services/ai-board.service.js';

export const boardRouter = Router();

// ---------------------------------------------------------------------------
// Helper: extract user/workspace from headers (set by API gateway)
// ---------------------------------------------------------------------------

function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) throw new BadRequestError('Missing X-User-Id header');
  return userId;
}

function getWorkspaceId(req: Request): string {
  const wsId = req.headers['x-workspace-id'] as string;
  if (!wsId) throw new BadRequestError('Missing X-Workspace-Id header');
  return wsId;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateBoardSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  workspace_id: z.string().uuid().optional(),
  settings: z.object({
    background: z.string().optional(),
    gridEnabled: z.boolean().optional(),
    gridSize: z.number().int().min(5).max(100).optional(),
    snapToGrid: z.boolean().optional(),
    showMinimap: z.boolean().optional(),
  }).optional(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().min(0.1).max(10),
  }).optional(),
});

const UpdateBoardSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  settings: z.object({
    background: z.string().optional(),
    gridEnabled: z.boolean().optional(),
    gridSize: z.number().int().min(5).max(100).optional(),
    snapToGrid: z.boolean().optional(),
    showMinimap: z.boolean().optional(),
  }).optional(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().min(0.1).max(10),
  }).optional(),
  thumbnail_url: z.string().url().optional(),
});

const ListBoardsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'title']).default('updated_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

const ElementPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  rotation: z.number().default(0),
});

const ElementStyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontSize: z.number().min(1).optional(),
  fontFamily: z.string().optional(),
  textAlign: z.string().optional(),
  borderRadius: z.number().min(0).optional(),
  dashPattern: z.array(z.number()).optional(),
  arrowHead: z.enum(['none', 'arrow', 'diamond', 'circle']).optional(),
  arrowTail: z.enum(['none', 'arrow', 'diamond', 'circle']).optional(),
}).optional();

const AddElementSchema = z.object({
  type: z.enum([
    'rectangle', 'ellipse', 'triangle', 'line', 'arrow', 'text',
    'sticky_note', 'image', 'freehand', 'connector', 'group', 'frame',
  ]),
  position: ElementPositionSchema,
  style: ElementStyleSchema,
  properties: z.record(z.unknown()).optional(),
  z_index: z.number().int().optional(),
  group_id: z.string().uuid().optional(),
  locked: z.boolean().optional(),
});

const AddElementsSchema = z.object({
  elements: z.array(AddElementSchema).min(1).max(100),
});

const UpdateElementSchema = z.object({
  position: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().min(1).optional(),
    height: z.number().min(1).optional(),
    rotation: z.number().optional(),
  }).optional(),
  style: ElementStyleSchema,
  properties: z.record(z.unknown()).optional(),
  z_index: z.number().int().optional(),
  group_id: z.string().uuid().nullable().optional(),
  locked: z.boolean().optional(),
});

const ExportSchema = z.object({
  format: z.enum(['png', 'svg', 'pdf']),
  width: z.number().int().min(100).max(8192).optional(),
  height: z.number().int().min(100).max(8192).optional(),
  scale: z.number().min(0.5).max(4).optional(),
  background: z.string().optional(),
  padding: z.number().int().min(0).max(200).optional(),
});

const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const AiGenerateSchema = z.object({
  prompt: z.string().min(3).max(2000),
});

// ---------------------------------------------------------------------------
// Board CRUD routes
// ---------------------------------------------------------------------------

// POST /boards — create whiteboard
boardRouter.post(
  '/',
  validateBody(CreateBoardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspace_id ?? getWorkspaceId(req);
      const board = await boardService.createBoard(
        { ...req.body, workspace_id: workspaceId },
        userId,
      );
      res.status(201).json({ success: true, data: board });
    } catch (err) {
      next(err);
    }
  },
);

// GET /boards — list boards in workspace (paginated)
boardRouter.get(
  '/',
  validateQuery(ListBoardsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const { page, limit, search, sort_by, sort_order } = req.query as z.infer<typeof ListBoardsSchema>;
      const result = await boardService.listBoards({
        workspace_id: workspaceId,
        page,
        limit,
        search,
        sort_by,
        sort_order,
      });
      res.json({
        success: true,
        data: result.boards,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /boards/:id — get board with elements
boardRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const board = await boardService.getBoard(req.params.id);
    res.json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
});

// PUT /boards/:id — update board metadata
boardRouter.put(
  '/:id',
  validateBody(UpdateBoardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const board = await boardService.updateBoard(req.params.id, req.body, userId);
      res.json({ success: true, data: board });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /boards/:id — soft delete
boardRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    await boardService.deleteBoard(req.params.id, userId);
    res.json({ success: true, message: 'Board deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Element routes
// ---------------------------------------------------------------------------

// POST /boards/:id/elements — add element(s)
boardRouter.post(
  '/:id/elements',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const boardId = req.params.id;

      // Support both single element and batch
      if (Array.isArray(req.body.elements)) {
        const parsed = AddElementsSchema.parse(req.body);
        const elements = await elementService.addElements(boardId, parsed.elements, userId);
        res.status(201).json({ success: true, data: elements });
      } else {
        const parsed = AddElementSchema.parse(req.body);
        const element = await elementService.addElement(boardId, parsed, userId);
        res.status(201).json({ success: true, data: element });
      }
    } catch (err) {
      next(err);
    }
  },
);

// PUT /boards/:id/elements/:elementId — update element
boardRouter.put(
  '/:id/elements/:elementId',
  validateBody(UpdateElementSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const element = await elementService.updateElement(
        req.params.id,
        req.params.elementId,
        req.body,
        userId,
      );
      res.json({ success: true, data: element });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /boards/:id/elements/:elementId — delete element
boardRouter.delete(
  '/:id/elements/:elementId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      await elementService.deleteElement(req.params.id, req.params.elementId, userId);
      res.json({ success: true, message: 'Element deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Export route
// ---------------------------------------------------------------------------

// POST /boards/:id/export — export as PNG/SVG/PDF
boardRouter.post(
  '/:id/export',
  validateBody(ExportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await exportService.exportBoard(req.params.id, req.body);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.buffer.length);
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// History route
// ---------------------------------------------------------------------------

// GET /boards/:id/history — version history
boardRouter.get(
  '/:id/history',
  validateQuery(HistoryQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query as z.infer<typeof HistoryQuerySchema>;
      const result = await boardService.getBoardHistory(req.params.id, page, limit);
      res.json({
        success: true,
        data: result.snapshots,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AI routes
// ---------------------------------------------------------------------------

// POST /boards/:id/ai/generate — AI diagram generation from prompt
boardRouter.post(
  '/:id/ai/generate',
  validateBody(AiGenerateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const boardId = req.params.id;

      const result = await aiBoardService.promptToDiagram(req.body.prompt);

      // Add generated elements to the board
      if (result.elements.length > 0) {
        const elements = await elementService.addElements(boardId, result.elements, userId);
        res.status(201).json({
          success: true,
          data: {
            elements,
            description: result.description,
            diagramType: result.diagramType,
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            elements: [],
            description: result.description,
            diagramType: result.diagramType,
          },
        });
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /boards/:id/ai/to-code — convert diagram to code
boardRouter.post(
  '/:id/ai/to-code',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await aiBoardService.diagramToCode(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// POST /boards/:id/ai/suggest-layout — suggest layout improvements
boardRouter.post(
  '/:id/ai/suggest-layout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await aiBoardService.suggestLayout(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// POST /boards/:id/ai/recognize — recognize handwriting
boardRouter.post(
  '/:id/ai/recognize',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const elementIds = req.body.elementIds as string[] | undefined;
      const result = await aiBoardService.recognizeHandwriting(req.params.id, elementIds);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
