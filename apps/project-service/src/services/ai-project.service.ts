import { query } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubtaskSuggestion {
  title: string;
  description: string;
  estimatedPoints: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  labels: string[];
}

export interface PrioritySuggestion {
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  reasoning: string;
}

export interface SprintPlan {
  sprintName: string;
  sprintGoal: string;
  tasks: Array<{
    taskId: string;
    taskKey: string;
    title: string;
    storyPoints: number;
    priority: string;
    reason: string;
  }>;
  totalPoints: number;
  estimatedVelocity: number;
}

export interface ProjectReport {
  summary: string;
  completedTasks: number;
  inProgressTasks: number;
  totalTasks: number;
  completionRate: number;
  averageVelocity: number;
  blockers: string[];
  highlights: string[];
  recommendations: string[];
}

export interface DeliveryPrediction {
  estimatedDate: string;
  confidence: number;
  remainingPoints: number;
  averageVelocity: number;
  sprintsRemaining: number;
  risks: string[];
}

// ---------------------------------------------------------------------------
// AI service client
// ---------------------------------------------------------------------------

async function callAiService<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const url = `${config.aiServiceUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('AI service request failed', { endpoint, status: response.status, body: errorBody });
      throw new BadRequestError(`AI service returned error: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error('AI service call failed', { endpoint, message: (err as Error).message });
    throw new BadRequestError('AI service is unavailable. Please try again later.');
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function breakdownTask(
  taskId: string,
): Promise<SubtaskSuggestion[]> {
  const taskResult = await query<{
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    priority: string;
    labels: string[];
  }>(
    `SELECT id, title, description, project_id, priority, labels
     FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );

  if (taskResult.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = taskResult.rows[0];

  try {
    const aiResult = await callAiService<{ subtasks: SubtaskSuggestion[] }>(
      '/ai/project/breakdown-task',
      {
        title: task.title,
        description: task.description,
        priority: task.priority,
        labels: task.labels,
      },
    );
    return aiResult.subtasks;
  } catch {
    // Fallback: generate basic subtask suggestions
    logger.warn('AI service unavailable, generating fallback subtask breakdown');

    const basePriority = task.priority as SubtaskSuggestion['priority'];
    return [
      {
        title: `Research and plan: ${task.title}`,
        description: `Investigate requirements and create implementation plan for "${task.title}"`,
        estimatedPoints: 2,
        priority: basePriority,
        labels: task.labels,
      },
      {
        title: `Implement: ${task.title}`,
        description: `Core implementation work for "${task.title}"`,
        estimatedPoints: 5,
        priority: basePriority,
        labels: task.labels,
      },
      {
        title: `Write tests: ${task.title}`,
        description: `Add unit and integration tests for "${task.title}"`,
        estimatedPoints: 3,
        priority: basePriority,
        labels: task.labels,
      },
      {
        title: `Review and polish: ${task.title}`,
        description: `Code review, documentation, and final polish for "${task.title}"`,
        estimatedPoints: 1,
        priority: 'low',
        labels: task.labels,
      },
    ];
  }
}

export async function suggestPriority(
  taskId: string,
): Promise<PrioritySuggestion> {
  const taskResult = await query<{
    id: string;
    title: string;
    description: string | null;
    labels: string[];
    due_date: string | null;
  }>(
    `SELECT id, title, description, labels, due_date
     FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );

  if (taskResult.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const task = taskResult.rows[0];

  try {
    return await callAiService<PrioritySuggestion>(
      '/ai/project/suggest-priority',
      {
        title: task.title,
        description: task.description,
        labels: task.labels,
        dueDate: task.due_date,
      },
    );
  } catch {
    // Fallback heuristic-based priority suggestion
    logger.warn('AI service unavailable, using heuristic priority suggestion');

    const titleLower = (task.title + ' ' + (task.description ?? '')).toLowerCase();
    let priority: PrioritySuggestion['suggestedPriority'] = 'medium';
    let reasoning = 'Default priority based on standard assessment';
    let confidence = 0.5;

    // Keyword-based heuristics
    const criticalKeywords = ['crash', 'outage', 'data loss', 'security vulnerability', 'production down', 'p0'];
    const highKeywords = ['bug', 'broken', 'error', 'urgent', 'blocker', 'regression', 'p1'];
    const lowKeywords = ['nice to have', 'refactor', 'cleanup', 'documentation', 'cosmetic', 'minor'];

    if (criticalKeywords.some((k) => titleLower.includes(k))) {
      priority = 'critical';
      reasoning = 'Task description contains critical/severity keywords';
      confidence = 0.8;
    } else if (highKeywords.some((k) => titleLower.includes(k))) {
      priority = 'high';
      reasoning = 'Task description contains high-priority keywords';
      confidence = 0.7;
    } else if (lowKeywords.some((k) => titleLower.includes(k))) {
      priority = 'low';
      reasoning = 'Task description suggests low-priority work';
      confidence = 0.6;
    }

    // Due date proximity
    if (task.due_date) {
      const daysUntilDue = Math.ceil(
        (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDue <= 1) {
        priority = 'critical';
        reasoning = 'Task is due within 24 hours';
        confidence = 0.9;
      } else if (daysUntilDue <= 3) {
        priority = priority === 'critical' ? 'critical' : 'high';
        reasoning = `Task is due in ${daysUntilDue} days`;
        confidence = Math.max(confidence, 0.75);
      }
    }

    // Labels
    if (task.labels.includes('bug') || task.labels.includes('crash')) {
      priority = priority === 'critical' ? 'critical' : 'high';
      confidence = Math.max(confidence, 0.7);
    }

    return { suggestedPriority: priority, confidence, reasoning };
  }
}

export async function planSprint(
  projectId: string,
  targetPoints?: number,
): Promise<SprintPlan> {
  // Verify project exists
  const projectResult = await query<{ id: string; name: string; key: string }>(
    `SELECT id, name, key FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  if (projectResult.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Calculate average velocity from completed sprints
  const velocityResult = await query<{ avg_velocity: string }>(
    `SELECT COALESCE(AVG(completed_points), 0) as avg_velocity FROM (
       SELECT COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points
       FROM sprints s
       LEFT JOIN tasks t ON t.sprint_id = s.id AND t.deleted_at IS NULL
       WHERE s.project_id = $1 AND s.status = 'completed'
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 5
     ) sub`,
    [projectId],
  );

  const avgVelocity = Math.round(parseFloat(velocityResult.rows[0].avg_velocity)) || 20;
  const sprintCapacity = targetPoints ?? avgVelocity;

  // Get backlog tasks sorted by priority
  const backlogTasks = await query<{
    id: string;
    key: string;
    title: string;
    story_points: number | null;
    priority: string;
    labels: string[];
  }>(
    `SELECT id, key, title, story_points, priority, labels
     FROM tasks
     WHERE project_id = $1
       AND sprint_id IS NULL
       AND status IN ('backlog', 'todo')
       AND deleted_at IS NULL
     ORDER BY
       CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
       position ASC
     LIMIT 50`,
    [projectId],
  );

  try {
    return await callAiService<SprintPlan>(
      '/ai/project/plan-sprint',
      {
        projectName: projectResult.rows[0].name,
        backlogTasks: backlogTasks.rows,
        averageVelocity: avgVelocity,
        targetPoints: sprintCapacity,
      },
    );
  } catch {
    // Fallback: simple greedy sprint planning
    logger.warn('AI service unavailable, using greedy sprint planning');

    const plannedTasks: SprintPlan['tasks'] = [];
    let totalPoints = 0;

    for (const task of backlogTasks.rows) {
      const points = task.story_points ?? 3; // Default estimate
      if (totalPoints + points <= sprintCapacity) {
        plannedTasks.push({
          taskId: task.id,
          taskKey: task.key,
          title: task.title,
          storyPoints: points,
          priority: task.priority,
          reason: `Priority: ${task.priority}, ${points} story points`,
        });
        totalPoints += points;
      }
    }

    // Count completed sprints for naming
    const sprintCountResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sprints WHERE project_id = $1`,
      [projectId],
    );
    const sprintNum = parseInt(sprintCountResult.rows[0].count, 10) + 1;

    return {
      sprintName: `Sprint ${sprintNum}`,
      sprintGoal: `Complete ${plannedTasks.length} priority tasks (${totalPoints} points)`,
      tasks: plannedTasks,
      totalPoints,
      estimatedVelocity: avgVelocity,
    };
  }
}

export async function generateReport(
  projectId: string,
  startDate?: string,
  endDate?: string,
): Promise<ProjectReport> {
  const projectResult = await query<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  if (projectResult.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const dateFilter = startDate && endDate
    ? `AND t.updated_at BETWEEN '${startDate}' AND '${endDate}'`
    : '';

  // Get task statistics
  const statsResult = await query<{
    status: string;
    count: string;
    total_points: string;
  }>(
    `SELECT status, COUNT(*) as count, COALESCE(SUM(story_points), 0) as total_points
     FROM tasks t
     WHERE project_id = $1 AND deleted_at IS NULL ${dateFilter}
     GROUP BY status`,
    [projectId],
  );

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  const statusBreakdown: Record<string, number> = {};

  for (const row of statsResult.rows) {
    const count = parseInt(row.count, 10);
    totalTasks += count;
    statusBreakdown[row.status] = count;
    if (row.status === 'done') completedTasks = count;
    if (row.status === 'in_progress') inProgressTasks = count;
  }

  // Get average velocity
  const velocityResult = await query<{ avg_velocity: string }>(
    `SELECT COALESCE(AVG(completed_points), 0) as avg_velocity FROM (
       SELECT COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points
       FROM sprints s
       LEFT JOIN tasks t ON t.sprint_id = s.id AND t.deleted_at IS NULL
       WHERE s.project_id = $1 AND s.status = 'completed'
       GROUP BY s.id
     ) sub`,
    [projectId],
  );

  const averageVelocity = Math.round(parseFloat(velocityResult.rows[0].avg_velocity));

  // Find blockers (tasks that block others)
  const blockersResult = await query<{ title: string; key: string }>(
    `SELECT DISTINCT t.title, t.key
     FROM tasks t
     JOIN task_relationships tr ON t.id = tr.source_task_id AND tr.type = 'blocks'
     WHERE t.project_id = $1 AND t.status != 'done' AND t.deleted_at IS NULL
     LIMIT 10`,
    [projectId],
  );

  const blockers = blockersResult.rows.map((r) => `${r.key}: ${r.title}`);

  // Find overdue tasks
  const overdueResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM tasks
     WHERE project_id = $1 AND due_date < CURRENT_DATE AND status != 'done' AND deleted_at IS NULL`,
    [projectId],
  );
  const overdueCount = parseInt(overdueResult.rows[0].count, 10);

  try {
    return await callAiService<ProjectReport>(
      '/ai/project/generate-report',
      {
        projectName: projectResult.rows[0].name,
        statusBreakdown,
        totalTasks,
        completedTasks,
        inProgressTasks,
        averageVelocity,
        blockers,
        overdueCount,
      },
    );
  } catch {
    // Fallback: generate report from data
    logger.warn('AI service unavailable, generating report from data');

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const highlights: string[] = [];
    if (completionRate >= 80) highlights.push(`Strong completion rate of ${completionRate}%`);
    if (averageVelocity > 0) highlights.push(`Average velocity: ${averageVelocity} points per sprint`);
    if (completedTasks > 0) highlights.push(`${completedTasks} tasks completed`);

    const recommendations: string[] = [];
    if (overdueCount > 0) recommendations.push(`Address ${overdueCount} overdue tasks`);
    if (blockers.length > 0) recommendations.push(`Resolve ${blockers.length} blocking issues`);
    if (inProgressTasks > completedTasks) recommendations.push('Consider reducing work in progress');
    if (completionRate < 50) recommendations.push('Review sprint planning - completion rate is below 50%');

    return {
      summary: `Project "${projectResult.rows[0].name}" has ${totalTasks} total tasks. ${completedTasks} completed, ${inProgressTasks} in progress. Completion rate: ${completionRate}%.`,
      completedTasks,
      inProgressTasks,
      totalTasks,
      completionRate,
      averageVelocity,
      blockers,
      highlights,
      recommendations,
    };
  }
}

export async function predictDelivery(projectId: string): Promise<DeliveryPrediction> {
  const projectResult = await query<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  if (projectResult.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Get remaining story points
  const remainingResult = await query<{ remaining_points: string }>(
    `SELECT COALESCE(SUM(story_points), 0) as remaining_points
     FROM tasks
     WHERE project_id = $1 AND status != 'done' AND deleted_at IS NULL`,
    [projectId],
  );
  const remainingPoints = parseInt(remainingResult.rows[0].remaining_points, 10);

  // Get velocity data
  const velocityResult = await query<{ completed_points: string; sprint_duration_days: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points,
       EXTRACT(DAY FROM (s.end_date::timestamp - s.start_date::timestamp)) as sprint_duration_days
     FROM sprints s
     LEFT JOIN tasks t ON t.sprint_id = s.id AND t.deleted_at IS NULL
     WHERE s.project_id = $1 AND s.status = 'completed' AND s.start_date IS NOT NULL AND s.end_date IS NOT NULL
     GROUP BY s.id, s.start_date, s.end_date
     ORDER BY s.created_at DESC
     LIMIT 5`,
    [projectId],
  );

  const velocities = velocityResult.rows.map((r) => parseInt(r.completed_points, 10));
  const sprintDurations = velocityResult.rows.map((r) => parseInt(r.sprint_duration_days, 10));

  const averageVelocity = velocities.length > 0
    ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
    : 20; // Default assumption

  const avgSprintDays = sprintDurations.length > 0
    ? Math.round(sprintDurations.reduce((a, b) => a + b, 0) / sprintDurations.length)
    : 14; // Default 2-week sprints

  // Calculate prediction
  const sprintsRemaining = averageVelocity > 0
    ? Math.ceil(remainingPoints / averageVelocity)
    : remainingPoints > 0 ? 999 : 0;

  const daysRemaining = sprintsRemaining * avgSprintDays;
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + daysRemaining);

  // Assess confidence
  let confidence = 0.5;
  if (velocities.length >= 3) confidence += 0.2; // More data = more confidence
  if (velocities.length >= 5) confidence += 0.1;

  // Check velocity stability (coefficient of variation)
  if (velocities.length >= 2) {
    const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const variance = velocities.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / velocities.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    if (cv < 0.2) confidence += 0.15; // Very stable
    else if (cv > 0.5) confidence -= 0.15; // Very unstable
  }

  confidence = Math.min(Math.max(confidence, 0.1), 0.95);

  // Identify risks
  const risks: string[] = [];

  if (velocities.length < 3) {
    risks.push('Insufficient velocity data for reliable prediction');
  }

  // Check for increasing unfinished tasks
  const unresolvedResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM tasks
     WHERE project_id = $1 AND status = 'backlog' AND story_points IS NULL AND deleted_at IS NULL`,
    [projectId],
  );
  const unestimated = parseInt(unresolvedResult.rows[0].count, 10);
  if (unestimated > 0) {
    risks.push(`${unestimated} backlog tasks have no story point estimates`);
  }

  // Check for blockers
  const blockerResult = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT source_task_id) as count
     FROM task_relationships tr
     JOIN tasks t ON tr.source_task_id = t.id
     WHERE t.project_id = $1 AND tr.type = 'blocks' AND t.status != 'done' AND t.deleted_at IS NULL`,
    [projectId],
  );
  const blockerCount = parseInt(blockerResult.rows[0].count, 10);
  if (blockerCount > 0) {
    risks.push(`${blockerCount} blocking tasks may delay delivery`);
  }

  const overdueResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM tasks
     WHERE project_id = $1 AND due_date < CURRENT_DATE AND status != 'done' AND deleted_at IS NULL`,
    [projectId],
  );
  if (parseInt(overdueResult.rows[0].count, 10) > 0) {
    risks.push(`${overdueResult.rows[0].count} overdue tasks indicate schedule slippage`);
  }

  return {
    estimatedDate: estimatedDate.toISOString().split('T')[0],
    confidence: Math.round(confidence * 100) / 100,
    remainingPoints,
    averageVelocity,
    sprintsRemaining,
    risks,
  };
}
