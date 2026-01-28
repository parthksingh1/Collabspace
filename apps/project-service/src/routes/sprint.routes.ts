import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../utils/validation.js';
import { BadRequestError } from '../utils/errors.js';
import * as sprintService from '../services/sprint.service.js';

export const sprintRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
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
// Schemas
// ---------------------------------------------------------------------------

const CreateSprintSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().max(2000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
});

const UpdateSprintSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  goal: z.string().max(2000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const CompleteSprintSchema = z.object({
  move_incomplete_to: z.enum(['backlog', 'next_sprint']),
  next_sprint_id: z.string().uuid().optional(),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /projects/:projectId/sprints — create sprint
sprintRouter.post(
  '/projects/:projectId/sprints',
  validateBody(CreateSprintSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const sprint = await sprintService.createSprint(
        req.params.projectId,
        req.body,
        userId,
        workspaceId,
      );
      res.status(201).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },
);

// GET /projects/:projectId/sprints — list sprints
sprintRouter.get(
  '/projects/:projectId/sprints',
  validateQuery(PaginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query as z.infer<typeof PaginationSchema>;
      const result = await sprintService.listSprints(req.params.projectId, page, limit);
      res.json({
        success: true,
        data: result.sprints,
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

// PUT /sprints/:id — update sprint
sprintRouter.put(
  '/:id',
  validateBody(UpdateSprintSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const sprint = await sprintService.updateSprint(req.params.id, req.body, userId, workspaceId);
      res.json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },
);

// POST /sprints/:id/start — start sprint
sprintRouter.post(
  '/:id/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const sprint = await sprintService.startSprint(req.params.id, userId, workspaceId);
      res.json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },
);

// POST /sprints/:id/complete — complete sprint
sprintRouter.post(
  '/:id/complete',
  validateBody(CompleteSprintSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const sprint = await sprintService.completeSprint(
        req.params.id,
        req.body.move_incomplete_to,
        req.body.next_sprint_id,
        userId,
        workspaceId,
      );
      res.json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },
);

// GET /sprints/:id/burndown — burndown chart data
sprintRouter.get(
  '/:id/burndown',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await sprintService.getBurndownData(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// GET /sprints/:id/velocity — velocity metrics
sprintRouter.get(
  '/:id/velocity',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sprint = await sprintService.getSprint(req.params.id);
      const sprintCount = req.query.count ? parseInt(req.query.count as string, 10) : 6;
      const data = await sprintService.getVelocityMetrics(sprint.project_id, sprintCount);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);
