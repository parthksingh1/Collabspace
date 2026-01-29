import { query, transaction } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { publishSprintEvent } from '../kafka/producer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SprintStatus = 'planning' | 'active' | 'completed';

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  status: SprintStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateSprintData {
  name: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
}

export interface UpdateSprintData {
  name?: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
}

export interface BurndownDataPoint {
  date: string;
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
  idealRemaining: number;
}

export interface VelocityMetrics {
  sprintId: string;
  sprintName: string;
  totalPoints: number;
  completedPoints: number;
  completionRate: number;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createSprint(
  projectId: string,
  data: CreateSprintData,
  userId: string,
  workspaceId: string,
): Promise<Sprint> {
  // Validate project exists
  const projectCheck = await query(
    `SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  if (projectCheck.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Validate dates
  if (data.start_date && data.end_date) {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (end <= start) {
      throw new BadRequestError('End date must be after start date');
    }
  }

  const result = await query<Sprint>(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, 'planning')
     RETURNING *`,
    [
      projectId,
      data.name,
      data.goal ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
    ],
  );

  const sprint = result.rows[0];

  await publishSprintEvent({
    type: 'sprint.created',
    sprintId: sprint.id,
    projectId,
    userId,
    workspaceId,
    data: { name: sprint.name },
  });

  logger.info('Sprint created', { sprintId: sprint.id, projectId });
  return sprint;
}

export async function getSprint(id: string): Promise<Sprint> {
  const result = await query<Sprint>(
    `SELECT * FROM sprints WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Sprint not found');
  }

  return result.rows[0];
}

export async function listSprints(
  projectId: string,
  page = 1,
  limit = 20,
): Promise<{ sprints: Sprint[]; total: number }> {
  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM sprints WHERE project_id = $1`,
    [projectId],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query<Sprint>(
    `SELECT * FROM sprints WHERE project_id = $1
     ORDER BY CASE status
       WHEN 'active' THEN 0
       WHEN 'planning' THEN 1
       WHEN 'completed' THEN 2
     END, created_at DESC
     LIMIT $2 OFFSET $3`,
    [projectId, limit, offset],
  );

  return { sprints: result.rows, total };
}

export async function updateSprint(
  id: string,
  updates: UpdateSprintData,
  userId: string,
  workspaceId: string,
): Promise<Sprint> {
  // Verify sprint exists
  const existing = await getSprint(id);

  if (existing.status === 'completed') {
    throw new BadRequestError('Cannot update a completed sprint');
  }

  // Validate dates
  if (updates.start_date || updates.end_date) {
    const startDate = updates.start_date ? new Date(updates.start_date) : (existing.start_date ? new Date(existing.start_date) : null);
    const endDate = updates.end_date ? new Date(updates.end_date) : (existing.end_date ? new Date(existing.end_date) : null);
    if (startDate && endDate && endDate <= startDate) {
      throw new BadRequestError('End date must be after start date');
    }
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }

  if (updates.goal !== undefined) {
    setClauses.push(`goal = $${paramIndex++}`);
    params.push(updates.goal);
  }

  if (updates.start_date !== undefined) {
    setClauses.push(`start_date = $${paramIndex++}`);
    params.push(updates.start_date);
  }

  if (updates.end_date !== undefined) {
    setClauses.push(`end_date = $${paramIndex++}`);
    params.push(updates.end_date);
  }

  if (setClauses.length === 0) {
    return existing;
  }

  params.push(id);
  const result = await query<Sprint>(
    `UPDATE sprints SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params,
  );

  const updated = result.rows[0];

  await publishSprintEvent({
    type: 'sprint.updated',
    sprintId: id,
    projectId: updated.project_id,
    userId,
    workspaceId,
    data: { name: updated.name, updates: Object.keys(updates) },
  });

  return updated;
}

export async function startSprint(
  id: string,
  userId: string,
  workspaceId: string,
): Promise<Sprint> {
  const sprint = await getSprint(id);

  if (sprint.status !== 'planning') {
    throw new BadRequestError(`Cannot start sprint in "${sprint.status}" status. Only "planning" sprints can be started.`);
  }

  if (!sprint.start_date || !sprint.end_date) {
    throw new BadRequestError('Sprint must have start and end dates before starting');
  }

  // Check no other active sprint for this project
  const activeCheck = await query<{ id: string }>(
    `SELECT id FROM sprints WHERE project_id = $1 AND status = 'active' AND id != $2`,
    [sprint.project_id, id],
  );

  if (activeCheck.rows.length > 0) {
    throw new BadRequestError('Another sprint is already active for this project. Complete it first.');
  }

  const result = await query<Sprint>(
    `UPDATE sprints SET status = 'active' WHERE id = $1 RETURNING *`,
    [id],
  );

  const updated = result.rows[0];

  // Move tasks in this sprint to "todo" if they are in "backlog"
  await query(
    `UPDATE tasks SET status = 'todo'
     WHERE sprint_id = $1 AND status = 'backlog' AND deleted_at IS NULL`,
    [id],
  );

  await publishSprintEvent({
    type: 'sprint.started',
    sprintId: id,
    projectId: updated.project_id,
    userId,
    workspaceId,
    data: { name: updated.name, startDate: updated.start_date, endDate: updated.end_date },
  });

  logger.info('Sprint started', { sprintId: id });
  return updated;
}

export async function completeSprint(
  id: string,
  moveIncompleteTo: 'backlog' | 'next_sprint',
  nextSprintId: string | undefined,
  userId: string,
  workspaceId: string,
): Promise<Sprint> {
  const sprint = await getSprint(id);

  if (sprint.status !== 'active') {
    throw new BadRequestError(`Cannot complete sprint in "${sprint.status}" status. Only "active" sprints can be completed.`);
  }

  return transaction(async (client) => {
    // Complete the sprint
    const result = await client.query<Sprint>(
      `UPDATE sprints SET status = 'completed' WHERE id = $1 RETURNING *`,
      [id],
    );

    const completed = result.rows[0];

    // Handle incomplete tasks
    const incompleteTasks = await client.query<{ id: string; title: string }>(
      `SELECT id, title FROM tasks WHERE sprint_id = $1 AND status != 'done' AND deleted_at IS NULL`,
      [id],
    );

    if (incompleteTasks.rows.length > 0) {
      if (moveIncompleteTo === 'next_sprint' && nextSprintId) {
        // Verify next sprint exists and is in planning
        const nextSprint = await client.query<{ id: string; status: string }>(
          `SELECT id, status FROM sprints WHERE id = $1`,
          [nextSprintId],
        );
        if (nextSprint.rows.length === 0) {
          throw new NotFoundError('Next sprint not found');
        }
        if (nextSprint.rows[0].status === 'completed') {
          throw new BadRequestError('Cannot move tasks to a completed sprint');
        }

        await client.query(
          `UPDATE tasks SET sprint_id = $1
           WHERE sprint_id = $2 AND status != 'done' AND deleted_at IS NULL`,
          [nextSprintId, id],
        );

        logger.info('Moved incomplete tasks to next sprint', {
          from: id,
          to: nextSprintId,
          count: incompleteTasks.rows.length,
        });
      } else {
        // Move to backlog
        await client.query(
          `UPDATE tasks SET sprint_id = NULL, status = 'backlog'
           WHERE sprint_id = $1 AND status != 'done' AND deleted_at IS NULL`,
          [id],
        );

        logger.info('Moved incomplete tasks to backlog', {
          sprintId: id,
          count: incompleteTasks.rows.length,
        });
      }
    }

    await publishSprintEvent({
      type: 'sprint.completed',
      sprintId: id,
      projectId: completed.project_id,
      userId,
      workspaceId,
      data: {
        name: completed.name,
        incompleteTaskCount: incompleteTasks.rows.length,
        moveIncompleteTo,
      },
    });

    return completed;
  });
}

export async function getBurndownData(sprintId: string): Promise<BurndownDataPoint[]> {
  const sprint = await getSprint(sprintId);

  if (!sprint.start_date || !sprint.end_date) {
    throw new BadRequestError('Sprint must have start and end dates for burndown data');
  }

  // Get total story points for this sprint
  const totalResult = await query<{ total_points: string }>(
    `SELECT COALESCE(SUM(story_points), 0) as total_points
     FROM tasks WHERE sprint_id = $1 AND deleted_at IS NULL`,
    [sprintId],
  );
  const totalPoints = parseInt(totalResult.rows[0].total_points, 10);

  // Get tasks completed per day (based on activity log)
  const completedByDay = await query<{ date: string; points: string }>(
    `SELECT DATE(ta.created_at) as date,
            COALESCE(SUM(t.story_points), 0) as points
     FROM task_activity ta
     JOIN tasks t ON ta.task_id = t.id
     WHERE t.sprint_id = $1
       AND ta.action = 'status_changed'
       AND ta.new_value = 'done'
     GROUP BY DATE(ta.created_at)
     ORDER BY date`,
    [sprintId],
  );

  const completedMap = new Map<string, number>();
  for (const row of completedByDay.rows) {
    completedMap.set(row.date, parseInt(row.points, 10));
  }

  // Build burndown data for each day in sprint
  const startDate = new Date(sprint.start_date);
  const endDate = new Date(sprint.end_date);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const burndown: BurndownDataPoint[] = [];

  let cumulativeCompleted = 0;
  const today = new Date();

  for (let i = 0; i <= totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const completedToday = completedMap.get(dateStr) ?? 0;
    cumulativeCompleted += completedToday;

    const idealRemaining = totalPoints - (totalPoints * i / totalDays);

    // Only include actual data up to today
    if (date <= today) {
      burndown.push({
        date: dateStr,
        totalPoints,
        completedPoints: cumulativeCompleted,
        remainingPoints: totalPoints - cumulativeCompleted,
        idealRemaining: Math.round(idealRemaining * 10) / 10,
      });
    } else {
      burndown.push({
        date: dateStr,
        totalPoints,
        completedPoints: -1, // Indicates future date
        remainingPoints: -1,
        idealRemaining: Math.round(idealRemaining * 10) / 10,
      });
    }
  }

  return burndown;
}

export async function getVelocityMetrics(
  projectId: string,
  sprintCount = 6,
): Promise<VelocityMetrics[]> {
  // Verify project exists
  const projectCheck = await query(
    `SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  if (projectCheck.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Get completed sprints with their story point totals
  const result = await query<{
    sprint_id: string;
    sprint_name: string;
    total_points: string;
    completed_points: string;
  }>(
    `SELECT
       s.id as sprint_id,
       s.name as sprint_name,
       COALESCE(SUM(t.story_points), 0) as total_points,
       COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points
     FROM sprints s
     LEFT JOIN tasks t ON t.sprint_id = s.id AND t.deleted_at IS NULL
     WHERE s.project_id = $1 AND s.status = 'completed'
     GROUP BY s.id, s.name, s.created_at
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [projectId, sprintCount],
  );

  return result.rows.map((row) => {
    const total = parseInt(row.total_points, 10);
    const completed = parseInt(row.completed_points, 10);
    return {
      sprintId: row.sprint_id,
      sprintName: row.sprint_name,
      totalPoints: total,
      completedPoints: completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }).reverse(); // Chronological order
}
