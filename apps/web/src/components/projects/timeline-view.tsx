'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskDetail } from './task-detail';
import { useTasks, type Task, type TaskStatus, type TaskFilters } from '@/hooks/use-projects';

interface TimelineViewProps {
  projectId: string;
  filters: TaskFilters;
  sprintBoundaries?: { name: string; startDate: string; endDate: string }[];
}

type ZoomLevel = 'day' | 'week' | 'month';

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'bg-surface-300 dark:bg-surface-600',
  todo: 'bg-surface-400 dark:bg-surface-500',
  in_progress: 'bg-brand-400',
  in_review: 'bg-amber-400',
  done: 'bg-emerald-500',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function formatHeaderDate(date: Date, zoom: ZoomLevel): string {
  if (zoom === 'day')
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  if (zoom === 'week')
    return `W${getWeekNumber(date)} - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - oneJan.getTime()) / 86400000) + oneJan.getDay() + 1) / 7);
}

function getStepSize(zoom: ZoomLevel): number {
  if (zoom === 'day') return 1;
  if (zoom === 'week') return 7;
  return 30;
}

function getColumnWidth(zoom: ZoomLevel): number {
  if (zoom === 'day') return 48;
  if (zoom === 'week') return 100;
  return 140;
}

export function TimelineView({ projectId, filters, sprintBoundaries = [] }: TimelineViewProps) {
  const { data, isLoading, error } = useTasks(projectId, { ...filters, limit: 500 });
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tasks = data?.tasks ?? [];

  // Calculate timeline range
  const { timelineStart, timelineEnd, columns } = useMemo(() => {
    const now = new Date();
    let earliest = addDays(now, -14);
    let latest = addDays(now, 60);

    tasks.forEach((t) => {
      if (t.startDate) {
        const sd = new Date(t.startDate);
        if (sd < earliest) earliest = addDays(sd, -7);
      }
      if (t.dueDate) {
        const dd = new Date(t.dueDate);
        if (dd > latest) latest = addDays(dd, 14);
      }
    });

    const step = getStepSize(zoom);
    const cols: Date[] = [];
    let current = new Date(earliest);
    while (current <= latest) {
      cols.push(new Date(current));
      current = addDays(current, step);
    }

    return { timelineStart: earliest, timelineEnd: latest, columns: cols };
  }, [tasks, zoom]);

  const colWidth = getColumnWidth(zoom);
  const totalWidth = columns.length * colWidth;

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current && columns.length > 0) {
      const today = new Date();
      const daysFromStart = diffDays(today, timelineStart);
      const step = getStepSize(zoom);
      const colIndex = Math.floor(daysFromStart / step);
      const scrollPos = colIndex * colWidth - scrollRef.current.clientWidth / 3;
      scrollRef.current.scrollLeft = Math.max(0, scrollPos);
    }
  }, [columns.length, timelineStart, zoom, colWidth]);

  const todayOffset = useMemo(() => {
    const today = new Date();
    const days = diffDays(today, timelineStart);
    const step = getStepSize(zoom);
    return (days / step) * colWidth;
  }, [timelineStart, zoom, colWidth]);

  // Filter tasks with dates
  const timelineTasks = useMemo(() => {
    return tasks.filter((t) => t.startDate || t.dueDate);
  }, [tasks]);

  const getTaskBar = useCallback(
    (task: Task) => {
      const start = task.startDate ? new Date(task.startDate) : task.dueDate ? addDays(new Date(task.dueDate), -3) : new Date();
      const end = task.dueDate ? new Date(task.dueDate) : addDays(start, 5);
      const step = getStepSize(zoom);

      const startOffset = (diffDays(start, timelineStart) / step) * colWidth;
      const duration = Math.max(1, diffDays(end, start) / step) * colWidth;

      return { left: startOffset, width: Math.max(duration, colWidth / 2) };
    },
    [timelineStart, zoom, colWidth]
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-red-500">Failed to load timeline</p>
      </div>
    );
  }

  return (
    <>
      {/* Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-surface-600 dark:text-surface-400">
            {timelineTasks.length} tasks with dates
          </span>
          {tasks.length - timelineTasks.length > 0 && (
            <span className="text-xs text-surface-400">
              ({tasks.length - timelineTasks.length} without dates hidden)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (scrollRef.current) {
                const today = new Date();
                const daysFromStart = diffDays(today, timelineStart);
                const step = getStepSize(zoom);
                const colIndex = daysFromStart / step;
                scrollRef.current.scrollLeft = colIndex * colWidth - scrollRef.current.clientWidth / 3;
              }
            }}
            className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Today
          </button>
          <div className="flex items-center rounded-lg border border-surface-200 dark:border-surface-700">
            {(['day', 'week', 'month'] as ZoomLevel[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  z === zoom
                    ? 'bg-brand-600 text-white'
                    : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                )}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="overflow-hidden rounded-xl border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
        {/* Tasks without dates fallback */}
        {timelineTasks.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <CalendarDays className="h-8 w-8 text-surface-300" />
            <p className="text-sm text-surface-500">No tasks have start or due dates</p>
            <p className="text-xs text-surface-400">Set dates on tasks to see them on the timeline</p>
          </div>
        ) : (
          <div className="flex">
            {/* Left column: task names */}
            <div className="w-56 flex-shrink-0 border-r border-surface-200 dark:border-surface-700">
              <div className="h-10 border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800">
                Task
              </div>
              {timelineTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className="flex h-10 cursor-pointer items-center border-b border-surface-100 px-3 hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800/50"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', STATUS_COLORS[task.status])} />
                    <span className="truncate text-xs font-medium text-surface-700 dark:text-surface-300">
                      {task.title}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: timeline grid */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto scrollbar-thin">
              <div style={{ width: totalWidth, minWidth: '100%' }} className="relative">
                {/* Header row */}
                <div className="sticky top-0 z-10 flex h-10 border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800">
                  {columns.map((date, i) => {
                    const isToday =
                      date.toDateString() === new Date().toDateString() ||
                      (zoom !== 'day' &&
                        date <= new Date() &&
                        addDays(date, getStepSize(zoom)) > new Date());
                    return (
                      <div
                        key={i}
                        style={{ width: colWidth, minWidth: colWidth }}
                        className={cn(
                          'flex-shrink-0 border-r border-surface-100 px-1 py-2 text-center text-[10px] font-medium text-surface-400 dark:border-surface-800',
                          isToday && 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                        )}
                      >
                        {formatHeaderDate(date, zoom)}
                      </div>
                    );
                  })}
                </div>

                {/* Task bars */}
                {timelineTasks.map((task) => {
                  const bar = getTaskBar(task);
                  return (
                    <div
                      key={task.id}
                      className="relative flex h-10 items-center border-b border-surface-100 dark:border-surface-800"
                    >
                      {/* Background grid lines */}
                      <div className="absolute inset-0 flex">
                        {columns.map((_, i) => (
                          <div
                            key={i}
                            style={{ width: colWidth, minWidth: colWidth }}
                            className="border-r border-surface-50 dark:border-surface-800/50"
                          />
                        ))}
                      </div>

                      {/* Task bar */}
                      <div
                        onClick={() => setSelectedTaskId(task.id)}
                        style={{ left: bar.left, width: bar.width }}
                        className={cn(
                          'absolute top-2 z-[2] h-6 cursor-pointer rounded-md shadow-sm transition-shadow hover:shadow-md',
                          STATUS_COLORS[task.status]
                        )}
                        title={`${task.key}: ${task.title}`}
                      >
                        <span className="block truncate px-2 py-0.5 text-[10px] font-medium text-white">
                          {task.key}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Today line */}
                <div
                  className="absolute bottom-0 top-0 z-[5] w-px bg-red-500"
                  style={{ left: todayOffset }}
                >
                  <div className="absolute -left-2 -top-0 rounded-b bg-red-500 px-1 py-0.5 text-[8px] font-bold text-white">
                    TODAY
                  </div>
                </div>

                {/* Sprint boundaries */}
                {sprintBoundaries.map((sprint, i) => {
                  const startDays = diffDays(new Date(sprint.startDate), timelineStart);
                  const endDays = diffDays(new Date(sprint.endDate), timelineStart);
                  const step = getStepSize(zoom);
                  const startPx = (startDays / step) * colWidth;
                  const endPx = (endDays / step) * colWidth;
                  return (
                    <div key={i}>
                      <div
                        className="absolute bottom-0 top-0 z-[3] w-px border-l border-dashed border-brand-300 dark:border-brand-700"
                        style={{ left: startPx }}
                      />
                      <div
                        className="absolute bottom-0 top-0 z-[3] w-px border-l border-dashed border-brand-300 dark:border-brand-700"
                        style={{ left: endPx }}
                      />
                      <div
                        className="absolute top-0 z-[4] rounded-b bg-brand-100 px-1 text-[8px] font-medium text-brand-600 dark:bg-brand-950/40 dark:text-brand-400"
                        style={{ left: startPx + 2 }}
                      >
                        {sprint.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-sm', STATUS_COLORS[status as TaskStatus])} />
            <span className="text-[10px] text-surface-500">{label}</span>
          </div>
        ))}
      </div>

      {selectedTaskId && (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </>
  );
}
