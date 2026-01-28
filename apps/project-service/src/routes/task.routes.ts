import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../utils/validation.js';
import { BadRequestError } from '../utils/errors.js';
import * as taskService from '../services/task.service.js';
import * as aiProjectService from '../services/ai-project.service.js';

export const taskRouter = Router();

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

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  assignee_id: z.string().uuid().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  labels: z.array(z.string().max(100)).max(20).optional(),
  story_points: z.number().int().min(0).max(100).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  parent_id: z.string().uuid().optional(),
  sprint_id: z.string().uuid().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(50000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  labels: z.array(z.string().max(100)).max(20).optional(),
  story_points: z.number().int().min(0).max(100).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
  version: z.number().int().min(1),
});

const ChangeStatusSchema = z.object({
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']),
});

const AssignSchema = z.object({
  assignee_id: z.string().uuid().nullable(),
});

const CommentSchema = z.object({
  content: z.string().min(1).max(10000),
});

const MoveTaskSchema = z.object({
  project_id: z.string().uuid().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
});

const ListTasksSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  label: z.string().optional(),
  sprint_id: z.string().uuid().optional(),
  search: z.string().optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'priority', 'due_date', 'position']).default('position'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const AddRelationshipSchema = z.object({
  target_task_id: z.string().uuid(),
  type: z.enum(['blocks', 'is_blocked_by', 'relates_to', 'duplicate_of']),
});

// ---------------------------------------------------------------------------
// Routes mounted under /projects/:projectId/tasks (via project router)
// and /tasks/:id (direct)
// ---------------------------------------------------------------------------

// Note: These routes are mounted at /tasks in index.ts, but some also at /projects/:projectId/tasks
// The project-scoped routes are handled in project.routes.ts via sub-mounting.

// POST /projects/:projectId/tasks — create task
taskRouter.post(
  '/projects/:projectId/tasks',
  validateBody(CreateTaskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await taskService.createTask(req.params.projectId, req.body, userId, workspaceId);
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

// GET /projects/:projectId/tasks — list tasks
taskRouter.get(
  '/projects/:projectId/tasks',
  validateQuery(ListTasksSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = req.query as z.infer<typeof ListTasksSchema>;
      const result = await taskService.listTasks({
        project_id: req.params.projectId,
        ...params,
      });
      res.json({
        success: true,
        data: result.tasks,
        pagination: {
          page: params.page,
          limit: params.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / params.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /tasks/:id — get task with details
taskRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskService.getTask(req.params.id);
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
});

// PUT /tasks/:id — update task
taskRouter.put(
  '/:id',
  validateBody(UpdateTaskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await taskService.updateTask(req.params.id, req.body, userId, workspaceId);
      res.json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /tasks/:id — soft delete
taskRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const workspaceId = getWorkspaceId(req);
    await taskService.deleteTask(req.params.id, userId, workspaceId);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// PUT /tasks/:id/status — change status
taskRouter.put(
  '/:id/status',
  validateBody(ChangeStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await taskService.changeStatus(req.params.id, req.body.status, userId, workspaceId);
      res.json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /tasks/:id/assign — assign/unassign
taskRouter.put(
  '/:id/assign',
  validateBody(AssignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await taskService.assignTask(req.params.id, req.body.assignee_id, userId, workspaceId);
      res.json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

// POST /tasks/:id/comments — add comment
taskRouter.post(
  '/:id/comments',
  validateBody(CommentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const comment = await taskService.addComment(req.params.id, req.body.content, userId, workspaceId);
      res.status(201).json({ success: true, data: comment });
    } catch (err) {
      next(err);
    }
  },
);

// GET /tasks/:id/comments — list comments
taskRouter.get(
  '/:id/comments',
  validateQuery(PaginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query as z.infer<typeof PaginationSchema>;
      const result = await taskService.listComments(req.params.id, page, limit);
      res.json({
        success: true,
        data: result.comments,
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

// PUT /tasks/:id/move — move to different project/sprint
taskRouter.put(
  '/:id/move',
  validateBody(MoveTaskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await taskService.moveTask(
        req.params.id,
        req.body.project_id,
        req.body.sprint_id,
        userId,
        workspaceId,
      );
      res.json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

// POST /tasks/:id/subtasks — create subtask
taskRouter.post(
  '/:id/subtasks',
  validateBody(CreateTaskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await taskService.createSubtask(req.params.id, req.body, userId, workspaceId);
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

// GET /tasks/:id/activity — get task activity log
taskRouter.get(
  '/:id/activity',
  validateQuery(PaginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query as z.infer<typeof PaginationSchema>;
      const result = await taskService.getTaskActivity(req.params.id, page, limit);
      res.json({
        success: true,
        data: result.activities,
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

// POST /tasks/:id/relationships — add relationship
taskRouter.post(
  '/:id/relationships',
  validateBody(AddRelationshipSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const relationship = await taskService.addRelationship(
        req.params.id,
        req.body.target_task_id,
        req.body.type,
        userId,
      );
      res.status(201).json({ success: true, data: relationship });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /tasks/:id/relationships/:relationshipId
taskRouter.delete(
  '/:id/relationships/:relationshipId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await taskService.removeRelationship(req.params.relationshipId);
      res.json({ success: true, message: 'Relationship removed' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AI routes for tasks
// ---------------------------------------------------------------------------

// POST /tasks/:id/ai/breakdown — AI breaks down task into subtasks
taskRouter.post(
  '/:id/ai/breakdown',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subtasks = await aiProjectService.breakdownTask(req.params.id);
      res.json({ success: true, data: subtasks });
    } catch (err) {
      next(err);
    }
  },
);

// POST /tasks/:id/ai/suggest-priority
taskRouter.post(
  '/:id/ai/suggest-priority',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const suggestion = await aiProjectService.suggestPriority(req.params.id);
      res.json({ success: true, data: suggestion });
    } catch (err) {
      next(err);
    }
  },
);
