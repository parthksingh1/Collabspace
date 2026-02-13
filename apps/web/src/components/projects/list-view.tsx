'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  Trash2,
  Tag as TagIcon,
} from 'lucide-react';
import { cn, formatRelativeTime, getInitials } from '@/lib/utils';
import { TaskDetail } from './task-detail';
import {
  useTasks,
  useUpdateTask,
  useDeleteTask,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TaskFilters,
} from '@/hooks/use-projects';

interface ListViewProps {
  projectId: string;
  filters: TaskFilters;
}

type SortField = 'key' | 'title' | 'status' | 'priority' | 'assigneeName' | 'storyPoints' | 'dueDate' | 'createdAt';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'backlog', label: 'Backlog', color: 'bg-surface-400' },
  { value: 'todo', label: 'To Do', color: 'bg-blue-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-400' },
  { value: 'in_review', label: 'In Review', color: 'bg-amber-500' },
  { value: 'done', label: 'Done', color: 'bg-green-500' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; icon: React.ReactNode }[] = [
  { value: 'critical', label: 'Critical', icon: <Flame className="h-3 w-3 text-red-500" /> },
  { value: 'high', label: 'High', icon: <ArrowUp className="h-3 w-3 text-orange-500" /> },
  { value: 'medium', label: 'Medium', icon: <Minus className="h-3 w-3 text-blue-500" /> },
  { value: 'low', label: 'Low', icon: <ArrowDown className="h-3 w-3 text-surface-400" /> },
];

const ITEMS_PER_PAGE = 25;

export function ListView({ projectId, filters }: ListViewProps) {
  const { data, isLoading, error } = useTasks(projectId, { ...filters, limit: 500 });
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [page, setPage] = useState(1);

  const tasks = data?.tasks ?? [];

  // Sort tasks
  const sortedTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const getPriorityWeight = (p: TaskPriority) => {
        const w: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return w[p];
      };
      const getStatusWeight = (s: TaskStatus) => {
        const w: Record<TaskStatus, number> = { backlog: 0, todo: 1, in_progress: 2, in_review: 3, done: 4 };
        return w[s];
      };

      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'key': aVal = a.key; bVal = b.key; break;
        case 'title': aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); break;
        case 'status': aVal = getStatusWeight(a.status); bVal = getStatusWeight(b.status); break;
        case 'priority': aVal = getPriorityWeight(a.priority); bVal = getPriorityWeight(b.priority); break;
        case 'assigneeName': aVal = a.assigneeName || 'zzz'; bVal = b.assigneeName || 'zzz'; break;
        case 'storyPoints': aVal = a.storyPoints ?? 999; bVal = b.storyPoints ?? 999; break;
        case 'dueDate': aVal = a.dueDate || '9999'; bVal = b.dueDate || '9999'; break;
        case 'createdAt': aVal = a.createdAt; bVal = b.createdAt; break;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [tasks, sortField, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / ITEMS_PER_PAGE));
  const pageTasks = sortedTasks.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === pageTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageTasks.map((t) => t.id)));
    }
  }, [selectedIds, pageTasks]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkStatusChange = (status: TaskStatus) => {
    selectedIds.forEach((id) => {
      updateTask.mutate({ id, status });
    });
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    selectedIds.forEach((id) => {
      deleteTask.mutate(id);
    });
    setSelectedIds(new Set());
  };

  const handleInlineStatusChange = (taskId: string, status: TaskStatus) => {
    updateTask.mutate({ id: taskId, status });
    setEditingCell(null);
  };

  const handleInlinePriorityChange = (taskId: string, priority: TaskPriority) => {
    updateTask.mutate({ id: taskId, priority });
    setEditingCell(null);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 text-surface-300" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-brand-500" />
    ) : (
      <ChevronDown className="h-3 w-3 text-brand-500" />
    );
  };

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
        <p className="text-sm text-red-500">Failed to load tasks</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <div className="rounded-full bg-surface-100 p-4 dark:bg-surface-800">
          <TagIcon className="h-8 w-8 text-surface-400" />
        </div>
        <p className="text-sm text-surface-500">No tasks found</p>
        <p className="text-xs text-surface-400">Create a task or adjust filters</p>
      </div>
    );
  }

  return (
    <>
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-brand-50 px-4 py-2 dark:bg-brand-950/30">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => handleBulkStatusChange(s.value)}
                className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs shadow-sm hover:bg-surface-50 dark:bg-surface-800 dark:hover:bg-surface-700"
              >
                <span className={cn('h-2 w-2 rounded-full', s.color)} />
                {s.label}
              </button>
            ))}
            <button
              onClick={handleBulkDelete}
              className="ml-2 flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-brand-600 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 dark:border-surface-700">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === pageTasks.length && pageTasks.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
              {([
                { field: 'key' as const, label: 'Key', width: 'w-24' },
                { field: 'title' as const, label: 'Title', width: 'min-w-[200px]' },
                { field: 'status' as const, label: 'Status', width: 'w-32' },
                { field: 'priority' as const, label: 'Priority', width: 'w-28' },
                { field: 'assigneeName' as const, label: 'Assignee', width: 'w-36' },
                { field: 'storyPoints' as const, label: 'Points', width: 'w-20' },
                { field: 'dueDate' as const, label: 'Due Date', width: 'w-28' },
                { field: 'createdAt' as const, label: 'Created', width: 'w-28' },
              ] as const).map(({ field, label, width }) => (
                <th
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={cn(
                    'cursor-pointer select-none px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500',
                    width
                  )}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <SortIcon field={field} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageTasks.map((task) => {
              const status = STATUS_OPTIONS.find((s) => s.value === task.status)!;
              const priority = PRIORITY_OPTIONS.find((p) => p.value === task.priority)!;
              const isSelected = selectedIds.has(task.id);

              return (
                <tr
                  key={task.id}
                  className={cn(
                    'border-b border-surface-100 transition-colors hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800/50',
                    isSelected && 'bg-brand-50/50 dark:bg-brand-950/20'
                  )}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(task.id)}
                      className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-surface-100 px-1.5 py-0.5 text-[11px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                      {task.key}
                    </span>
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2.5 font-medium text-surface-800 hover:text-brand-600 dark:text-surface-200"
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    {task.title}
                  </td>
                  {/* Inline editable status */}
                  <td className="relative px-3 py-2.5">
                    <button
                      onClick={() =>
                        setEditingCell(
                          editingCell?.taskId === task.id && editingCell.field === 'status'
                            ? null
                            : { taskId: task.id, field: 'status' }
                        )
                      }
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <span className={cn('h-2 w-2 rounded-full', status.color)} />
                      {status.label}
                    </button>
                    {editingCell?.taskId === task.id && editingCell.field === 'status' && (
                      <div className="absolute left-0 top-full z-20 mt-0.5 w-40 rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                        {STATUS_OPTIONS.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => handleInlineStatusChange(task.id, s.value)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700"
                          >
                            <span className={cn('h-2 w-2 rounded-full', s.color)} />
                            {s.label}
                            {s.value === task.status && <Check className="ml-auto h-3 w-3 text-brand-500" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Inline editable priority */}
                  <td className="relative px-3 py-2.5">
                    <button
                      onClick={() =>
                        setEditingCell(
                          editingCell?.taskId === task.id && editingCell.field === 'priority'
                            ? null
                            : { taskId: task.id, field: 'priority' }
                        )
                      }
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      {priority.icon}
                      {priority.label}
                    </button>
                    {editingCell?.taskId === task.id && editingCell.field === 'priority' && (
                      <div className="absolute left-0 top-full z-20 mt-0.5 w-36 rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                        {PRIORITY_OPTIONS.map((p) => (
                          <button
                            key={p.value}
                            onClick={() => handleInlinePriorityChange(task.id, p.value)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700"
                          >
                            {p.icon}
                            {p.label}
                            {p.value === task.priority && <Check className="ml-auto h-3 w-3 text-brand-500" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {task.assigneeId ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[9px] font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                          {task.assigneeAvatar ? (
                            <img src={task.assigneeAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                          ) : (
                            getInitials(task.assigneeName || '?')
                          )}
                        </div>
                        <span className="text-xs text-surface-600 dark:text-surface-400">
                          {task.assigneeName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-surface-400">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-surface-600 dark:text-surface-400">
                    {task.storyPoints ?? '--'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-surface-600 dark:text-surface-400">
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '--'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-surface-400">
                    {formatRelativeTime(task.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-200 px-4 py-3 dark:border-surface-700">
            <span className="text-xs text-surface-400">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedTasks.length)} of{' '}
              {sortedTasks.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost p-1.5 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, i, arr) => (
                  <span key={p} className="flex items-center">
                    {i > 0 && arr[i - 1] !== p - 1 && (
                      <span className="px-1 text-xs text-surface-400">...</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-md text-xs',
                        p === page
                          ? 'bg-brand-600 text-white'
                          : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                      )}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost p-1.5 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedTaskId && (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </>
  );
}
