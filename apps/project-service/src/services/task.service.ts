import { PoolClient } from 'pg';
import { query, transaction } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { publishTaskEvent } from '../kafka/producer.js';
import { getNextTaskNumber } from './project.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type RelationshipType = 'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicate_of';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  key: string;
  assignee_id: string | null;
  reporter_id: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  story_points: number | null;
  due_date: string | null;
  parent_id: string | null;
  sprint_id: string | null;
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  assignee_id?: string;
  priority?: TaskPriority;
  labels?: string[];
  story_points?: number;
  due_date?: string;
  parent_id?: string;
  sprint_id?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  labels?: string[];
  story_points?: number;
  due_date?: string | null;
  parent_id?: string | null;
  sprint_id?: string | null;
  position?: number;
  version: number; // for optimistic concurrency control
}

export interface TaskListParams {
  project_id: string;
  page: number;
  limit: number;
  status?: TaskStatus;
  assignee_id?: string;
  priority?: TaskPriority;
  label?: string;
  sprint_id?: string;
  parent_id?: string | null;
  search?: string;
  sort_by?: 'created_at' | 'updated_at' | 'priority' | 'due_date' | 'position';
  sort_order?: 'asc' | 'desc';
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface TaskRelationship {
  id: string;
  source_task_id: string;
  target_task_id: string;
  type: RelationshipType;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Status transition validation
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo'],
  todo: ['in_progress', 'backlog'],
  in_progress: ['review', 'todo'],
  review: ['done', 'in_progress'],
  done: ['review', 'todo'],
};

function validateStatusTransition(currentStatus: TaskStatus, newStatus: TaskStatus): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new BadRequestError(
      `Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed transitions: ${allowed?.join(', ') ?? 'none'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Priority sorting weight
// ---------------------------------------------------------------------------

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Activity logging helper
// ---------------------------------------------------------------------------

async function logActivity(
  taskId: string,
  userId: string,
  action: string,
  field?: string,
  oldValue?: string | null,
  newValue?: string | null,
  client?: PoolClient,
): Promise<void> {
  const sql = `INSERT INTO task_activity (task_id, user_id, action, field, old_value, new_value)
               VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [taskId, userId, action, field ?? null, oldValue ?? null, newValue ?? null];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}

// ---------------------------------------------------------------------------
// Cycle detection for task relationships
// ---------------------------------------------------------------------------

async function detectCycle(
  sourceId: string,
  targetId: string,
  relType: RelationshipType,
): Promise<boolean> {
  if (relType !== 'blocks' && relType !== 'is_blocked_by') {
    return false; // Only check for blocking relationships
  }

  // BFS from target to see if we can reach source (would create a cycle)
  const visited = new Set<string>();
  const queue = [targetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const result = await query<{ target_task_id: string }>(
      `SELECT target_task_id FROM task_relationships
       WHERE source_task_id = $1 AND type IN ('blocks', 'is_blocked_by')`,
      [current],
    );

    for (const row of result.rows) {
      queue.push(row.target_task_id);
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createTask(
  projectId: string,
  data: CreateTaskData,
  userId: string,
  workspaceId: string,
): Promise<Task> {
  const { counter, key } = await getNextTaskNumber(projectId);

  // Get max position for ordering
  const posResult = await query<{ max_pos: number | null }>(
    `SELECT MAX(position) as max_pos FROM tasks WHERE project_id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  const position = (posResult.rows[0].max_pos ?? -1) + 1;

  const result = await query<Task>(
    `INSERT INTO tasks (project_id, title, description, key, assignee_id, reporter_id, status, priority, labels, story_points, due_date, parent_id, sprint_id, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      projectId,
      data.title,
      data.description ?? null,
      key,
      data.assignee_id ?? null,
      userId,
      'backlog',
      data.priority ?? 'medium',
      data.labels ?? [],
      data.story_points ?? null,
      data.due_date ?? null,
      data.parent_id ?? null,
      data.sprint_id ?? null,
      position,
    ],
  );

  const task = result.rows[0];

  await logActivity(task.id, userId, 'created');

  if (data.assignee_id) {
    await logActivity(task.id, userId, 'assigned', 'assignee_id', null, data.assignee_id);
  }

  await publishTaskEvent({
    type: 'task.created',
    taskId: task.id,
    projectId,
    userId,
    workspaceId,
    data: {
      title: task.title,
      key: task.key,
      assigneeId: task.assignee_id,
      priority: task.priority,
    },
  });

  logger.info('Task created', { taskId: task.id, key: task.key, projectId });
  return task;
}

export async function getTask(id: string): Promise<Task & {
  subtasks: Task[];
  relationships: TaskRelationship[];
}> {
  const result = await query<Task>(
    `SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = result.rows[0];

  // Fetch subtasks
  const subtasksResult = await query<Task>(
    `SELECT * FROM tasks WHERE parent_id = $1 AND deleted_at IS NULL ORDER BY position ASC`,
    [id],
  );

  // Fetch relationships
  const relResult = await query<TaskRelationship>(
    `SELECT * FROM task_relationships WHERE source_task_id = $1 OR target_task_id = $1`,
    [id],
  );

  return {
    ...task,
    subtasks: subtasksResult.rows,
    relationships: relResult.rows,
  };
}

export async function listTasks(params: TaskListParams): Promise<{ tasks: Task[]; total: number }> {
  const {
    project_id, page, limit, status, assignee_id, priority, label,
    sprint_id, parent_id, search, sort_by = 'position', sort_order = 'asc',
  } = params;

  const offset = (page - 1) * limit;
  const conditions: string[] = ['project_id = $1', 'deleted_at IS NULL'];
  const queryParams: unknown[] = [project_id];
  let paramIndex = 2;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    queryParams.push(status);
  }

  if (assignee_id) {
    conditions.push(`assignee_id = $${paramIndex++}`);
    queryParams.push(assignee_id);
  }

  if (priority) {
    conditions.push(`priority = $${paramIndex++}`);
    queryParams.push(priority);
  }

  if (label) {
    conditions.push(`$${paramIndex++} = ANY(labels)`);
    queryParams.push(label);
  }

  if (sprint_id) {
    conditions.push(`sprint_id = $${paramIndex++}`);
    queryParams.push(sprint_id);
  }

  if (parent_id !== undefined) {
    if (parent_id === null) {
      conditions.push('parent_id IS NULL');
    } else {
      conditions.push(`parent_id = $${paramIndex++}`);
      queryParams.push(parent_id);
    }
  }

  if (search) {
    conditions.push(`(title ILIKE $${paramIndex} OR key ILIKE $${paramIndex})`);
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM tasks WHERE ${whereClause}`,
    queryParams,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Sort
  const allowedSorts = ['created_at', 'updated_at', 'priority', 'due_date', 'position'];
  let orderBy: string;
  if (sort_by === 'priority') {
    orderBy = `CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`;
  } else {
    orderBy = allowedSorts.includes(sort_by) ? sort_by : 'position';
  }
  const order = sort_order === 'desc' ? 'DESC' : 'ASC';

  queryParams.push(limit, offset);
  const result = await query<Task>(
    `SELECT * FROM tasks WHERE ${whereClause}
     ORDER BY ${orderBy} ${order}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    queryParams,
  );

  return { tasks: result.rows, total };
}

export async function updateTask(
  id: string,
  updates: UpdateTaskData,
  userId: string,
  workspaceId: string,
): Promise<Task> {
  return transaction(async (client) => {
    // Fetch current task with version check
    const current = await client.query<Task>(
      `SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (current.rows.length === 0) {
      throw new NotFoundError('Task not found');
    }

    const task = current.rows[0];

    // Optimistic concurrency control
    if (updates.version !== task.version) {
      throw new ConflictError(
        `Task has been modified by another user. Current version: ${task.version}, your version: ${updates.version}`,
      );
    }

    const setClauses: string[] = ['version = version + 1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined && updates.title !== task.title) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(updates.title);
      await logActivity(id, userId, 'updated', 'title', task.title, updates.title, client);
    }

    if (updates.description !== undefined && updates.description !== task.description) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(updates.description);
      await logActivity(id, userId, 'updated', 'description', null, null, client);
    }

    if (updates.priority !== undefined && updates.priority !== task.priority) {
      setClauses.push(`priority = $${paramIndex++}`);
      params.push(updates.priority);
      await logActivity(id, userId, 'updated', 'priority', task.priority, updates.priority, client);
    }

    if (updates.labels !== undefined) {
      setClauses.push(`labels = $${paramIndex++}`);
      params.push(updates.labels);
      await logActivity(id, userId, 'updated', 'labels', task.labels.join(','), updates.labels.join(','), client);
    }

    if (updates.story_points !== undefined) {
      setClauses.push(`story_points = $${paramIndex++}`);
      params.push(updates.story_points);
      await logActivity(id, userId, 'updated', 'story_points', String(task.story_points), String(updates.story_points), client);
    }

    if (updates.due_date !== undefined) {
      setClauses.push(`due_date = $${paramIndex++}`);
      params.push(updates.due_date);
      await logActivity(id, userId, 'updated', 'due_date', task.due_date, updates.due_date, client);
    }

    if (updates.parent_id !== undefined) {
      setClauses.push(`parent_id = $${paramIndex++}`);
      params.push(updates.parent_id);
      await logActivity(id, userId, 'updated', 'parent_id', task.parent_id, updates.parent_id, client);
    }

    if (updates.sprint_id !== undefined) {
      setClauses.push(`sprint_id = $${paramIndex++}`);
      params.push(updates.sprint_id);
      await logActivity(id, userId, 'moved', 'sprint_id', task.sprint_id, updates.sprint_id, client);
    }

    if (updates.position !== undefined) {
      setClauses.push(`position = $${paramIndex++}`);
      params.push(updates.position);
    }

    params.push(id);
    const result = await client.query<Task>(
      `UPDATE tasks SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );

    const updated = result.rows[0];

    await publishTaskEvent({
      type: 'task.updated',
      taskId: id,
      projectId: updated.project_id,
      userId,
      workspaceId,
      data: { key: updated.key, updates: Object.keys(updates).filter((k) => k !== 'version') },
    });

    return updated;
  });
}

export async function deleteTask(id: string, userId: string, workspaceId: string): Promise<void> {
  const result = await query<Task>(
    `UPDATE tasks SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = result.rows[0];

  await logActivity(id, userId, 'deleted');

  await publishTaskEvent({
    type: 'task.deleted',
    taskId: id,
    projectId: task.project_id,
    userId,
    workspaceId,
    data: { key: task.key, title: task.title },
  });

  logger.info('Task soft deleted', { taskId: id, key: task.key });
}

export async function changeStatus(
  id: string,
  newStatus: TaskStatus,
  userId: string,
  workspaceId: string,
): Promise<Task> {
  const current = await query<Task>(
    `SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (current.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = current.rows[0];
  validateStatusTransition(task.status, newStatus);

  const result = await query<Task>(
    `UPDATE tasks SET status = $1, version = version + 1
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [newStatus, id],
  );

  const updated = result.rows[0];

  await logActivity(id, userId, 'status_changed', 'status', task.status, newStatus);

  await publishTaskEvent({
    type: 'task.status_changed',
    taskId: id,
    projectId: updated.project_id,
    userId,
    workspaceId,
    data: {
      key: updated.key,
      title: updated.title,
      oldStatus: task.status,
      newStatus,
      assigneeId: updated.assignee_id,
    },
  });

  return updated;
}

export async function assignTask(
  id: string,
  assigneeId: string | null,
  userId: string,
  workspaceId: string,
): Promise<Task> {
  const current = await query<Task>(
    `SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (current.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = current.rows[0];

  const result = await query<Task>(
    `UPDATE tasks SET assignee_id = $1, version = version + 1
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [assigneeId, id],
  );

  const updated = result.rows[0];

  await logActivity(id, userId, assigneeId ? 'assigned' : 'unassigned', 'assignee_id', task.assignee_id, assigneeId);

  await publishTaskEvent({
    type: assigneeId ? 'task.assigned' : 'task.unassigned',
    taskId: id,
    projectId: updated.project_id,
    userId,
    workspaceId,
    data: {
      key: updated.key,
      title: updated.title,
      oldAssignee: task.assignee_id,
      newAssignee: assigneeId,
    },
  });

  return updated;
}

export async function addComment(
  taskId: string,
  content: string,
  userId: string,
  workspaceId: string,
): Promise<TaskComment> {
  // Verify task exists
  const taskCheck = await query<Task>(
    `SELECT id, project_id, key, title, assignee_id FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );
  if (taskCheck.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = taskCheck.rows[0];

  const result = await query<TaskComment>(
    `INSERT INTO task_comments (task_id, author_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [taskId, userId, content],
  );

  const comment = result.rows[0];

  await logActivity(taskId, userId, 'commented');

  await publishTaskEvent({
    type: 'task.commented',
    taskId,
    projectId: task.project_id,
    userId,
    workspaceId,
    data: {
      key: task.key,
      title: task.title,
      commentId: comment.id,
      assigneeId: task.assignee_id,
    },
  });

  return comment;
}

export async function listComments(
  taskId: string,
  page = 1,
  limit = 50,
): Promise<{ comments: TaskComment[]; total: number }> {
  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM task_comments WHERE task_id = $1`,
    [taskId],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query<TaskComment>(
    `SELECT * FROM task_comments WHERE task_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [taskId, limit, offset],
  );

  return { comments: result.rows, total };
}

export async function moveTask(
  id: string,
  targetProjectId: string | undefined,
  targetSprintId: string | undefined,
  userId: string,
  workspaceId: string,
): Promise<Task> {
  const current = await query<Task>(
    `SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (current.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = current.rows[0];
  const setClauses: string[] = ['version = version + 1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (targetProjectId && targetProjectId !== task.project_id) {
    // Moving to a different project requires a new key
    const { key } = await getNextTaskNumber(targetProjectId);
    setClauses.push(`project_id = $${paramIndex++}`);
    params.push(targetProjectId);
    setClauses.push(`key = $${paramIndex++}`);
    params.push(key);
    setClauses.push(`sprint_id = NULL`); // Remove from sprint when moving projects
    await logActivity(id, userId, 'moved', 'project_id', task.project_id, targetProjectId);
  }

  if (targetSprintId !== undefined) {
    setClauses.push(`sprint_id = $${paramIndex++}`);
    params.push(targetSprintId);
    await logActivity(id, userId, 'moved', 'sprint_id', task.sprint_id, targetSprintId);
  }

  params.push(id);
  const result = await query<Task>(
    `UPDATE tasks SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params,
  );

  const updated = result.rows[0];

  await publishTaskEvent({
    type: 'task.moved',
    taskId: id,
    projectId: updated.project_id,
    userId,
    workspaceId,
    data: {
      key: updated.key,
      fromProject: task.project_id,
      toProject: updated.project_id,
      fromSprint: task.sprint_id,
      toSprint: updated.sprint_id,
    },
  });

  return updated;
}

export async function createSubtask(
  parentTaskId: string,
  data: CreateTaskData,
  userId: string,
  workspaceId: string,
): Promise<Task> {
  const parentTask = await query<Task>(
    `SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [parentTaskId],
  );

  if (parentTask.rows.length === 0) {
    throw new NotFoundError('Parent task not found');
  }

  const parent = parentTask.rows[0];

  return createTask(
    parent.project_id,
    {
      ...data,
      parent_id: parentTaskId,
      sprint_id: data.sprint_id ?? parent.sprint_id ?? undefined,
    },
    userId,
    workspaceId,
  );
}

export async function getTaskActivity(
  taskId: string,
  page = 1,
  limit = 50,
): Promise<{ activities: TaskActivity[]; total: number }> {
  // Verify task
  const taskCheck = await query(
    `SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );
  if (taskCheck.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM task_activity WHERE task_id = $1`,
    [taskId],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query<TaskActivity>(
    `SELECT * FROM task_activity WHERE task_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [taskId, limit, offset],
  );

  return { activities: result.rows, total };
}

export async function addRelationship(
  sourceTaskId: string,
  targetTaskId: string,
  type: RelationshipType,
  userId: string,
): Promise<TaskRelationship> {
  // Verify both tasks exist
  const sourceCheck = await query(`SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL`, [sourceTaskId]);
  const targetCheck = await query(`SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL`, [targetTaskId]);

  if (sourceCheck.rows.length === 0) throw new NotFoundError('Source task not found');
  if (targetCheck.rows.length === 0) throw new NotFoundError('Target task not found');

  if (sourceTaskId === targetTaskId) {
    throw new BadRequestError('A task cannot have a relationship with itself');
  }

  // Check for cycles in blocking relationships
  const hasCycle = await detectCycle(sourceTaskId, targetTaskId, type);
  if (hasCycle) {
    throw new BadRequestError('This relationship would create a dependency cycle');
  }

  // Check for duplicate
  const existing = await query(
    `SELECT id FROM task_relationships WHERE source_task_id = $1 AND target_task_id = $2 AND type = $3`,
    [sourceTaskId, targetTaskId, type],
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('This relationship already exists');
  }

  const result = await query<TaskRelationship>(
    `INSERT INTO task_relationships (source_task_id, target_task_id, type)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [sourceTaskId, targetTaskId, type],
  );

  await logActivity(sourceTaskId, userId, 'relationship_added', 'relationship', null, `${type} -> ${targetTaskId}`);

  return result.rows[0];
}

export async function removeRelationship(relationshipId: string): Promise<void> {
  const result = await query(
    `DELETE FROM task_relationships WHERE id = $1 RETURNING id`,
    [relationshipId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Relationship not found');
  }
}
