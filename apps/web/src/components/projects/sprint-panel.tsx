'use client';

import { useState, useMemo } from 'react';
import {
  Calendar,
  Target,
  Play,
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  useSprint,
  useSprints,
  useStartSprint,
  useCompleteSprint,
  useTasks,
  type Sprint,
  type TaskStatus,
} from '@/hooks/use-projects';

interface SprintPanelProps {
  projectId: string;
  sprintId: string;
}

const STATUS_COLORS: Record<TaskStatus, { bg: string; label: string }> = {
  backlog: { bg: 'bg-surface-300', label: 'Backlog' },
  todo: { bg: 'bg-blue-400', label: 'To Do' },
  in_progress: { bg: 'bg-amber-400', label: 'In Progress' },
  in_review: { bg: 'bg-amber-500', label: 'In Review' },
  done: { bg: 'bg-green-500', label: 'Done' },
};

export function SprintPanel({ projectId, sprintId }: SprintPanelProps) {
  const { data: sprint, isLoading: sprintLoading } = useSprint(sprintId);
  const { data: sprintsData } = useSprints(projectId);
  const { data: tasksData } = useTasks(projectId, { sprintId });
  const startSprint = useStartSprint();
  const completeSprint = useCompleteSprint();

  const [activeChart, setActiveChart] = useState<'burndown' | 'velocity'>('burndown');
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const tasks = tasksData?.tasks ?? [];
  const sprints = sprintsData ?? [];

  // Compute status distribution
  const statusDistribution = useMemo(() => {
    const dist: Record<TaskStatus, number> = {
      backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 0,
    };
    tasks.forEach((t) => { dist[t.status]++; });
    return dist;
  }, [tasks]);

  const totalTasks = tasks.length;
  const completedTasks = statusDistribution.done;
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Days remaining
  const daysRemaining = useMemo(() => {
    if (!sprint?.endDate) return null;
    const end = new Date(sprint.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [sprint]);

  // Velocity data from past sprints
  const velocityData = useMemo(() => {
    if (sprint?.velocityData && sprint.velocityData.length > 0) return sprint.velocityData;
    return sprints
      .filter((s) => s.status === 'completed')
      .slice(-5)
      .map((s) => ({ sprintName: s.name, points: s.taskIds.length * 3 })); // fallback
  }, [sprint, sprints]);

  const avgVelocity = useMemo(() => {
    if (velocityData.length === 0) return 0;
    return Math.round(velocityData.reduce((s, v) => s + v.points, 0) / velocityData.length);
  }, [velocityData]);

  if (sprintLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!sprint) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <Target className="h-8 w-8 text-surface-300" />
        <p className="text-sm text-surface-500">Sprint not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sprint Info Card */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">
              {sprint.name}
            </h3>
            {sprint.goal && (
              <p className="mt-1 text-sm text-surface-500">{sprint.goal}</p>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-surface-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' - '}
                {new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {daysRemaining !== null && sprint.status === 'active' && (
                <span className={cn(
                  'flex items-center gap-1 font-medium',
                  daysRemaining <= 2 ? 'text-red-500' : daysRemaining <= 5 ? 'text-amber-500' : 'text-surface-500'
                )}>
                  <Clock className="h-3.5 w-3.5" />
                  {daysRemaining} days remaining
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                sprint.status === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : sprint.status === 'completed'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400'
              )}
            >
              {sprint.status === 'active' ? 'Active' : sprint.status === 'completed' ? 'Completed' : 'Planned'}
            </span>
            {sprint.status === 'planned' && (
              <button
                onClick={() => setShowStartDialog(true)}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <Play className="h-3.5 w-3.5" />
                Start Sprint
              </button>
            )}
            {sprint.status === 'active' && (
              <button
                onClick={() => setShowCompleteDialog(true)}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete Sprint
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-surface-500">Progress</span>
            <span className="font-medium text-surface-700 dark:text-surface-300">
              {completedTasks} / {totalTasks} tasks ({completionPercent}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        {/* Status breakdown */}
        <div className="mt-4 flex gap-3">
          {(Object.entries(STATUS_COLORS) as [TaskStatus, typeof STATUS_COLORS[TaskStatus]][]).map(
            ([status, config]) => {
              const count = statusDistribution[status];
              if (count === 0) return null;
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', config.bg)} />
                  <span className="text-xs text-surface-500">{config.label}</span>
                  <span className="text-xs font-semibold text-surface-700 dark:text-surface-300">
                    {count}
                  </span>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-0.5 dark:bg-surface-800">
            <button
              onClick={() => setActiveChart('burndown')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeChart === 'burndown'
                  ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                  : 'text-surface-500 hover:text-surface-700'
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Burndown
            </button>
            <button
              onClick={() => setActiveChart('velocity')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeChart === 'velocity'
                  ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                  : 'text-surface-500 hover:text-surface-700'
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Velocity
            </button>
          </div>
        </div>

        {activeChart === 'burndown' ? (
          <div className="h-64">
            {sprint.burndownData && sprint.burndownData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sprint.burndownData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-surface-200 dark:stroke-surface-700" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    className="text-[10px] fill-surface-400"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis className="text-[10px] fill-surface-400" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid var(--color-surface-200)',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ideal"
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                    name="Ideal"
                  />
                  <Line
                    type="monotone"
                    dataKey="remaining"
                    stroke="#14b8a6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#14b8a6' }}
                    name="Remaining"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-surface-400">
                Burndown data will appear once the sprint starts
              </div>
            )}
          </div>
        ) : (
          <div className="h-64">
            {velocityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-surface-200 dark:stroke-surface-700" />
                  <XAxis dataKey="sprintName" className="text-[10px] fill-surface-400" tick={{ fontSize: 10 }} />
                  <YAxis className="text-[10px] fill-surface-400" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid var(--color-surface-200)',
                      fontSize: '12px',
                    }}
                  />
                  <ReferenceLine
                    y={avgVelocity}
                    stroke="#f59e0b"
                    strokeDasharray="5 5"
                    label={{ value: `Avg: ${avgVelocity}`, fontSize: 10, fill: '#f59e0b' }}
                  />
                  <Bar
                    dataKey="points"
                    fill="#14b8a6"
                    radius={[4, 4, 0, 0]}
                    name="Story Points"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-surface-400">
                Complete sprints to see velocity data
              </div>
            )}
          </div>
        )}
      </div>

      {/* Start Sprint Dialog */}
      {showStartDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowStartDialog(false)} />
          <div className="relative w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-2xl dark:bg-surface-900">
            <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Start Sprint
            </h3>
            <p className="mt-2 text-sm text-surface-500">
              This will activate &quot;{sprint.name}&quot; with {totalTasks} tasks.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowStartDialog(false)} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={() => {
                  startSprint.mutate(
                    { id: sprint.id, startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal },
                    { onSuccess: () => setShowStartDialog(false) }
                  );
                }}
                disabled={startSprint.isPending}
                className="btn-primary px-4 py-2 text-sm"
              >
                {startSprint.isPending ? 'Starting...' : 'Start Sprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Sprint Dialog */}
      {showCompleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCompleteDialog(false)} />
          <div className="relative w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-2xl dark:bg-surface-900">
            <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Complete Sprint
            </h3>
            <p className="mt-2 text-sm text-surface-500">
              {completedTasks} of {totalTasks} tasks completed.
              {totalTasks - completedTasks > 0 && (
                <> {totalTasks - completedTasks} incomplete tasks will be moved to the backlog.</>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowCompleteDialog(false)} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={() => {
                  completeSprint.mutate(
                    { id: sprint.id },
                    { onSuccess: () => setShowCompleteDialog(false) }
                  );
                }}
                disabled={completeSprint.isPending}
                className="btn-primary px-4 py-2 text-sm"
              >
                {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
