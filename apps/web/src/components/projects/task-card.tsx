'use client';

import { memo } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  MessageSquare,
  Clock,
  Flame,
} from 'lucide-react';
import { cn, getInitials, truncate } from '@/lib/utils';
import type { Task, TaskPriority } from '@/hooks/use-projects';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  isDragging?: boolean;
}

const priorityConfig: Record<
  TaskPriority,
  { border: string; icon: React.ReactNode; label: string }
> = {
  critical: {
    border: 'border-l-red-500',
    icon: <Flame className="h-3.5 w-3.5 text-red-500" />,
    label: 'Critical',
  },
  high: {
    border: 'border-l-orange-500',
    icon: <ArrowUp className="h-3.5 w-3.5 text-orange-500" />,
    label: 'High',
  },
  medium: {
    border: 'border-l-blue-500',
    icon: <Minus className="h-3.5 w-3.5 text-blue-500" />,
    label: 'Medium',
  },
  low: {
    border: 'border-l-surface-400',
    icon: <ArrowDown className="h-3.5 w-3.5 text-surface-400" />,
    label: 'Low',
  },
};

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const TaskCard = memo(function TaskCard({
  task,
  onClick,
  isDragging = false,
}: TaskCardProps) {
  const priority = priorityConfig[task.priority];
  const overdue = isOverdue(task.dueDate);

  return (
    <div
      onClick={() => onClick(task)}
      className={cn(
        'group cursor-pointer rounded-lg border border-surface-200 bg-white border-l-[3px] p-3 transition-all duration-150',
        'hover:shadow-md hover:-translate-y-0.5',
        'dark:border-surface-700 dark:bg-surface-800',
        priority.border,
        isDragging && 'shadow-xl rotate-[2deg] ring-2 ring-brand-500/30'
      )}
    >
      {/* Top row: key + priority */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center rounded bg-surface-100 px-1.5 py-0.5 text-[11px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
          {task.key}
        </span>
        <span title={priority.label}>{priority.icon}</span>
      </div>

      {/* Title */}
      <p className="mb-2 text-sm font-medium leading-snug text-surface-800 dark:text-surface-100">
        {truncate(task.title, 80)}
      </p>

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="text-[10px] text-surface-400">
              +{task.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: assignee, story points, comments, due date */}
      <div className="flex items-center justify-between text-surface-400 dark:text-surface-500">
        <div className="flex items-center gap-2">
          {/* Assignee avatar */}
          {task.assigneeId && (
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[9px] font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300"
              title={task.assigneeName || 'Assigned'}
            >
              {task.assigneeAvatar ? (
                <img
                  src={task.assigneeAvatar}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                getInitials(task.assigneeName || '?')
              )}
            </div>
          )}

          {/* Story points */}
          {task.storyPoints !== undefined && task.storyPoints !== null && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-surface-100 px-1 text-[10px] font-semibold text-surface-500 dark:bg-surface-700 dark:text-surface-400">
              {task.storyPoints}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Comment count */}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]">
              <MessageSquare className="h-3 w-3" />
              {task.commentCount}
            </span>
          )}

          {/* Due date */}
          {task.dueDate && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-[11px]',
                overdue && 'font-medium text-red-500'
              )}
            >
              {overdue ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
