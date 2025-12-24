import { Tool, ToolContext, ToolResult } from './tool-registry.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface TaskData {
  id?: string;
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'review' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  estimate?: number;
  labels?: string[];
  parentId?: string;
  dueDate?: string;
}

export const manageTasksTool: Tool = {
  name: 'manage_tasks',
  description:
    'Create, update, list, or search tasks in the project management service. Supports bulk operations for efficiency.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'update', 'list', 'get', 'bulk_create', 'search'],
        description: 'The action to perform',
      },
      projectId: {
        type: 'string',
        description: 'Project ID (required for most actions)',
      },
      taskId: {
        type: 'string',
        description: 'Task ID (required for get/update)',
      },
      task: {
        type: 'object',
        description: 'Task data for create/update',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          assigneeId: { type: 'string' },
          estimate: { type: 'number' },
          labels: { type: 'array', items: { type: 'string' } },
          parentId: { type: 'string' },
          dueDate: { type: 'string' },
        },
      },
      tasks: {
        type: 'array',
        description: 'Array of task data for bulk_create',
        items: { type: 'object' },
      },
      query: {
        type: 'string',
        description: 'Search query for task search',
      },
      filters: {
        type: 'object',
        description: 'Filters for list/search',
        properties: {
          status: { type: 'string' },
          priority: { type: 'string' },
          assigneeId: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
    required: ['action'],
  },
  agentTypes: ['planner', 'developer', 'meeting'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const action = String(args.action ?? '');
    const projectId = args.projectId ? String(args.projectId) : undefined;
    const taskId = args.taskId ? String(args.taskId) : undefined;
    const task = args.task as TaskData | undefined;
    const tasks = args.tasks as TaskData[] | undefined;
    const query = args.query ? String(args.query) : undefined;
    const filters = args.filters as Record<string, string> | undefined;

    const baseUrl = config.projectServiceUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (context.authToken) {
      headers['Authorization'] = `Bearer ${context.authToken}`;
    }

    try {
      switch (action) {
        case 'create': {
          if (!projectId || !task) {
            return { success: false, data: null, error: 'projectId and task are required for create' };
          }

          const response = await fetch(`${baseUrl}/projects/${projectId}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...task,
              workspaceId: context.workspaceId,
              createdBy: context.userId,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            const errText = await response.text();
            return { success: false, data: null, error: `Create task failed: ${response.status} ${errText}` };
          }

          const created = await response.json();
          return { success: true, data: created };
        }

        case 'update': {
          if (!projectId || !taskId || !task) {
            return { success: false, data: null, error: 'projectId, taskId, and task are required for update' };
          }

          const response = await fetch(`${baseUrl}/projects/${projectId}/tasks/${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(task),
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            const errText = await response.text();
            return { success: false, data: null, error: `Update task failed: ${response.status} ${errText}` };
          }

          const updated = await response.json();
          return { success: true, data: updated };
        }

        case 'get': {
          if (!projectId || !taskId) {
            return { success: false, data: null, error: 'projectId and taskId are required for get' };
          }

          const response = await fetch(`${baseUrl}/projects/${projectId}/tasks/${taskId}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            const errText = await response.text();
            return { success: false, data: null, error: `Get task failed: ${response.status} ${errText}` };
          }

          const taskData = await response.json();
          return { success: true, data: taskData };
        }

        case 'list': {
          if (!projectId) {
            return { success: false, data: null, error: 'projectId is required for list' };
          }

          const url = new URL(`${baseUrl}/projects/${projectId}/tasks`);
          if (filters) {
            for (const [key, value] of Object.entries(filters)) {
              if (value) url.searchParams.set(key, value);
            }
          }

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            const errText = await response.text();
            return { success: false, data: null, error: `List tasks failed: ${response.status} ${errText}` };
          }

          const listData = await response.json();
          return { success: true, data: listData };
        }

        case 'bulk_create': {
          if (!projectId || !tasks || tasks.length === 0) {
            return { success: false, data: null, error: 'projectId and tasks array are required for bulk_create' };
          }

          const results: unknown[] = [];
          const errors: string[] = [];

          // Process in batches of 10
          for (let i = 0; i < tasks.length; i += 10) {
            const batch = tasks.slice(i, i + 10);
            const promises = batch.map(async (t, idx) => {
              try {
                const response = await fetch(`${baseUrl}/projects/${projectId}/tasks`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    ...t,
                    workspaceId: context.workspaceId,
                    createdBy: context.userId,
                  }),
                  signal: AbortSignal.timeout(10_000),
                });

                if (!response.ok) {
                  const errText = await response.text();
                  errors.push(`Task ${i + idx}: ${errText}`);
                  return null;
                }

                return await response.json();
              } catch (err) {
                errors.push(`Task ${i + idx}: ${err instanceof Error ? err.message : String(err)}`);
                return null;
              }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter((r) => r !== null));
          }

          return {
            success: errors.length === 0,
            data: { created: results, totalCreated: results.length, totalRequested: tasks.length },
            error: errors.length > 0 ? errors.join('; ') : undefined,
          };
        }

        case 'search': {
          if (!query) {
            return { success: false, data: null, error: 'query is required for search' };
          }

          const url = new URL(`${baseUrl}/projects/tasks/search`);
          url.searchParams.set('q', query);
          url.searchParams.set('workspaceId', context.workspaceId);
          if (filters) {
            for (const [key, value] of Object.entries(filters)) {
              if (value) url.searchParams.set(key, value);
            }
          }

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            const errText = await response.text();
            return { success: false, data: null, error: `Search tasks failed: ${response.status} ${errText}` };
          }

          const searchData = await response.json();
          return { success: true, data: searchData };
        }

        default:
          return { success: false, data: null, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('manage_tasks tool error', { error: errorMsg, action });
      return { success: false, data: null, error: errorMsg };
    }
  },
};
