import { query, transaction } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors.js';
import { publishProjectEvent } from '../kafka/producer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  description: string | null;
  workspace_id: string;
  owner_id: string;
  settings: ProjectSettings;
  task_counter: number;
  key: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectSettings {
  defaultAssignee: string | null;
  statuses: string[];
  priorities: string[];
  template: string;
  labels?: Array<{ name: string; color: string }>;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  workspace_id: string;
  key: string;
  template?: 'blank' | 'scrum' | 'kanban' | 'bug_tracking';
  settings?: Partial<ProjectSettings>;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  settings?: Partial<ProjectSettings>;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const PROJECT_TEMPLATES: Record<string, { settings: Partial<ProjectSettings>; labels: Array<{ name: string; color: string }> }> = {
  blank: {
    settings: {
      statuses: ['backlog', 'todo', 'in_progress', 'review', 'done'],
      priorities: ['critical', 'high', 'medium', 'low'],
    },
    labels: [],
  },
  scrum: {
    settings: {
      statuses: ['backlog', 'todo', 'in_progress', 'review', 'done'],
      priorities: ['critical', 'high', 'medium', 'low'],
    },
    labels: [
      { name: 'story', color: '#22c55e' },
      { name: 'task', color: '#3b82f6' },
      { name: 'bug', color: '#ef4444' },
      { name: 'spike', color: '#f59e0b' },
      { name: 'epic', color: '#8b5cf6' },
    ],
  },
  kanban: {
    settings: {
      statuses: ['backlog', 'todo', 'in_progress', 'review', 'done'],
      priorities: ['critical', 'high', 'medium', 'low'],
    },
    labels: [
      { name: 'feature', color: '#22c55e' },
      { name: 'improvement', color: '#3b82f6' },
      { name: 'bug', color: '#ef4444' },
      { name: 'chore', color: '#6b7280' },
    ],
  },
  bug_tracking: {
    settings: {
      statuses: ['backlog', 'todo', 'in_progress', 'review', 'done'],
      priorities: ['critical', 'high', 'medium', 'low'],
    },
    labels: [
      { name: 'crash', color: '#dc2626' },
      { name: 'data-loss', color: '#b91c1c' },
      { name: 'ui', color: '#3b82f6' },
      { name: 'performance', color: '#f59e0b' },
      { name: 'security', color: '#7c3aed' },
      { name: 'regression', color: '#ec4899' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const PROJECT_CACHE_TTL = 600;

async function invalidateProjectCache(projectId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`project:${projectId}`);
  } catch (err) {
    logger.warn('Redis cache invalidation failed', { projectId, message: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createProject(data: CreateProjectData, userId: string): Promise<Project> {
  // Validate key uniqueness within workspace
  const existing = await query<{ id: string }>(
    `SELECT id FROM projects WHERE workspace_id = $1 AND key = $2 AND deleted_at IS NULL`,
    [data.workspace_id, data.key.toUpperCase()],
  );
  if (existing.rows.length > 0) {
    throw new ConflictError(`Project key "${data.key}" already exists in this workspace`);
  }

  const template = PROJECT_TEMPLATES[data.template ?? 'blank'];
  const settings: ProjectSettings = {
    defaultAssignee: null,
    statuses: ['backlog', 'todo', 'in_progress', 'review', 'done'],
    priorities: ['critical', 'high', 'medium', 'low'],
    template: data.template ?? 'blank',
    ...template.settings,
    ...(data.settings ?? {}),
  };

  const result = await transaction(async (client) => {
    const projResult = await client.query<Project>(
      `INSERT INTO projects (name, description, workspace_id, owner_id, settings, key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        data.description ?? null,
        data.workspace_id,
        userId,
        JSON.stringify(settings),
        data.key.toUpperCase(),
      ],
    );

    const project = projResult.rows[0];

    // Create default labels from template
    for (const label of template.labels) {
      await client.query(
        `INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3)`,
        [project.id, label.name, label.color],
      );
    }

    return project;
  });

  await publishProjectEvent({
    type: 'project.created',
    projectId: result.id,
    userId,
    workspaceId: data.workspace_id,
    data: { name: result.name, key: result.key, template: data.template ?? 'blank' },
    timestamp: new Date().toISOString(),
  });

  logger.info('Project created', { projectId: result.id, workspaceId: data.workspace_id });
  return result;
}

export async function getProject(id: string): Promise<Project & { labels: Array<{ id: string; name: string; color: string }> }> {
  // Try cache
  try {
    const redis = getRedis();
    const cached = await redis.get(`project:${id}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch { /* ignore cache errors */ }

  const result = await query<Project>(
    `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const labelsResult = await query<{ id: string; name: string; color: string }>(
    `SELECT id, name, color FROM labels WHERE project_id = $1 ORDER BY name`,
    [id],
  );

  const projectWithLabels = { ...result.rows[0], labels: labelsResult.rows };

  // Cache
  try {
    const redis = getRedis();
    await redis.set(`project:${id}`, JSON.stringify(projectWithLabels), 'EX', PROJECT_CACHE_TTL);
  } catch { /* ignore cache errors */ }

  return projectWithLabels;
}

export async function listProjects(
  workspaceId: string,
  page = 1,
  limit = 20,
  search?: string,
): Promise<{ projects: Project[]; total: number }> {
  const offset = (page - 1) * limit;
  let whereClause = 'workspace_id = $1 AND deleted_at IS NULL';
  const params: unknown[] = [workspaceId];

  if (search) {
    params.push(`%${search}%`);
    whereClause += ` AND (name ILIKE $${params.length} OR key ILIKE $${params.length})`;
  }

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM projects WHERE ${whereClause}`,
    params,
  );

  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit, offset);
  const result = await query<Project>(
    `SELECT * FROM projects WHERE ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { projects: result.rows, total };
}

export async function updateProject(id: string, updates: UpdateProjectData, userId: string): Promise<Project> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }

  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }

  if (updates.settings !== undefined) {
    setClauses.push(`settings = settings || $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(updates.settings));
  }

  if (setClauses.length === 0) {
    const current = await getProject(id);
    return current;
  }

  params.push(id);
  const result = await query<Project>(
    `UPDATE projects SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  await invalidateProjectCache(id);

  await publishProjectEvent({
    type: 'project.updated',
    projectId: id,
    userId,
    workspaceId: result.rows[0].workspace_id,
    data: { updates: Object.keys(updates) },
    timestamp: new Date().toISOString(),
  });

  return result.rows[0];
}

export async function deleteProject(id: string, userId: string): Promise<void> {
  const result = await query<Project>(
    `UPDATE projects SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  await invalidateProjectCache(id);

  await publishProjectEvent({
    type: 'project.deleted',
    projectId: id,
    userId,
    workspaceId: result.rows[0].workspace_id,
    data: { name: result.rows[0].name },
    timestamp: new Date().toISOString(),
  });

  logger.info('Project soft deleted', { projectId: id });
}

export async function getNextTaskNumber(projectId: string): Promise<{ counter: number; key: string }> {
  const result = await query<{ task_counter: number; key: string }>(
    `UPDATE projects SET task_counter = task_counter + 1
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING task_counter, key`,
    [projectId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const { task_counter, key } = result.rows[0];
  return { counter: task_counter, key: `${key}-${task_counter}` };
}
