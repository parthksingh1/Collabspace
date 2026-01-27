import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../utils/validation.js';
import { BadRequestError } from '../utils/errors.js';
import * as projectService from '../services/project.service.js';
import * as aiProjectService from '../services/ai-project.service.js';

export const projectRouter = Router();

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

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  key: z.string().min(2).max(10).regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Key must start with a letter and contain only letters and numbers'),
  workspace_id: z.string().uuid().optional(),
  template: z.enum(['blank', 'scrum', 'kanban', 'bug_tracking']).optional(),
  settings: z.object({
    defaultAssignee: z.string().uuid().nullable().optional(),
    statuses: z.array(z.string()).optional(),
    priorities: z.array(z.string()).optional(),
  }).optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  settings: z.object({
    defaultAssignee: z.string().uuid().nullable().optional(),
    statuses: z.array(z.string()).optional(),
    priorities: z.array(z.string()).optional(),
  }).optional(),
});

const ListProjectsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /projects
projectRouter.post(
  '/',
  validateBody(CreateProjectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspace_id ?? getWorkspaceId(req);
      const project = await projectService.createProject(
        { ...req.body, workspace_id: workspaceId },
        userId,
      );
      res.status(201).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  },
);

// GET /projects
projectRouter.get(
  '/',
  validateQuery(ListProjectsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const { page, limit, search } = req.query as z.infer<typeof ListProjectsSchema>;
      const result = await projectService.listProjects(workspaceId, page, limit, search);
      res.json({
        success: true,
        data: result.projects,
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

// GET /projects/:id
projectRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await projectService.getProject(req.params.id);
    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

// PUT /projects/:id
projectRouter.put(
  '/:id',
  validateBody(UpdateProjectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const project = await projectService.updateProject(req.params.id, req.body, userId);
      res.json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /projects/:id
projectRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    await projectService.deleteProject(req.params.id, userId);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// AI routes (nested under projects)
// ---------------------------------------------------------------------------

// POST /projects/:id/ai/plan-sprint
projectRouter.post(
  '/:id/ai/plan-sprint',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetPoints = req.body.targetPoints as number | undefined;
      const plan = await aiProjectService.planSprint(req.params.id, targetPoints);
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  },
);

// POST /projects/:id/ai/report
projectRouter.post(
  '/:id/ai/report',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate } = req.body as { startDate?: string; endDate?: string };
      const report = await aiProjectService.generateReport(req.params.id, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },
);

// POST /projects/:id/ai/predict-delivery
projectRouter.post(
  '/:id/ai/predict-delivery',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prediction = await aiProjectService.predictDelivery(req.params.id);
      res.json({ success: true, data: prediction });
    } catch (err) {
      next(err);
    }
  },
);
