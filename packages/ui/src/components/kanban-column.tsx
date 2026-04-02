'use client';

import React from 'react';

export interface KanbanTask {
  id: string;
  title: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  assignee?: { name: string; avatar?: string };
  labels?: Array<{ text: string; color: string }>;
  storyPoints?: number;
  commentCount?: number;
}

export interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: KanbanTask[];
  count?: number;
  color?: string;
  onTaskClick?: (task: KanbanTask) => void;
  onAddTask?: () => void;
  onDragStart?: (taskId: string, columnId: string) => void;
  onDragOver?: (e: React.DragEvent, columnId: string) => void;
  onDrop?: (e: React.DragEvent, columnId: string) => void;
  className?: string;
}

const priorityColors = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function KanbanColumn({
  id,
  title,
  tasks,
  count,
  color = '#6B7280',
  onTaskClick,
  onAddTask,
  onDragStart,
  onDragOver,
  onDrop,
  className = '',
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-xl bg-gray-50 ${
        isDragOver ? 'ring-2 ring-blue-400' : ''
      } ${className}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver?.(e, id);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop?.(e, id);
      }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-200 px-1.5 text-xs font-medium text-gray-600">
            {count ?? tasks.length}
          </span>
        </div>
        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus:outline-none"
            aria-label="Add task"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
            </svg>
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', task.id);
              onDragStart?.(task.id, id);
            }}
            onClick={() => onTaskClick?.(task)}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTaskClick?.(task);
              }
            }}
          >
            {/* Labels */}
            {task.labels && task.labels.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {task.labels.map((label, i) => (
                  <span
                    key={i}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.text}
                  </span>
                ))}
              </div>
            )}

            {/* Title */}
            <p className="text-sm font-medium text-gray-800">{task.title}</p>

            {/* Footer */}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Priority */}
                {task.priority && (
                  <span
                    className={`h-2 w-2 rounded-full ${priorityColors[task.priority]}`}
                    title={task.priority}
                  />
                )}

                {/* Story points */}
                {task.storyPoints !== undefined && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {task.storyPoints} SP
                  </span>
                )}

                {/* Comment count */}
                {task.commentCount !== undefined && task.commentCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 01.75.75v8.5a.75.75 0 01-.75.75h-3.19l-3.06 2.29L5 12H1.75a.75.75 0 01-.75-.75v-8.5z" />
                    </svg>
                    {task.commentCount}
                  </span>
                )}
              </div>

              {/* Assignee */}
              {task.assignee && (
                <div title={task.assignee.name}>
                  {task.assignee.avatar ? (
                    <img
                      src={task.assignee.avatar}
                      alt={task.assignee.name}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-300 text-[9px] font-medium text-white">
                      {getInitials(task.assignee.name)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
