'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  GripVertical,
  Plus,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  ChevronDown,
  ChevronRight,
  Layers,
  Zap,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { TaskDetail } from './task-detail';
import {
  useTasks,
  useSprints,
  useMoveTask,
  useUpdateTask,
  useCreateTask,
  type Task,
  type TaskPriority,
  type TaskFilters,
  type Sprint,
} from '@/hooks/use-projects';

interface BacklogViewProps {
  projectId: string;
  filters: TaskFilters;
}

const PRIORITY_CONFIG: Record<TaskPriority, { icon: React.ReactNode; color: string }> = {
  critical: { icon: <Flame className="h-3 w-3" />, color: 'text-red-500' },
  high: { icon: <ArrowUp className="h-3 w-3" />, color: 'text-orange-500' },
  medium: { icon: <Minus className="h-3 w-3" />, color: 'text-blue-500' },
  low: { icon: <ArrowDown className="h-3 w-3" />, color: 'text-surface-400' },
};

const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21];

export function BacklogView({ projectId, filters }: BacklogViewProps) {
  const { data: allTasksData, isLoading: tasksLoading } = useTasks(projectId, {
    ...filters,
    limit: 500,
  });
  const { data: sprints = [], isLoading: sprintsLoading } = useSprints(projectId);
  const moveTask = useMoveTask();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set(['backlog']));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [editingPoints, setEditingPoints] = useState<string | null>(null);

  const allTasks = allTasksData?.tasks ?? [];

  // Backlog tasks (no sprint)
  const backlogTasks = useMemo(
    () => allTasks.filter((t) => !t.sprintId).sort((a, b) => a.position - b.position),
    [allTasks]
  );

  // Tasks grouped by sprint
  const sprintTasks = useMemo(() => {
    const map = new Map<string, Task[]>();
    sprints.forEach((s) => {
      map.set(
        s.id,
        allTasks
          .filter((t) => t.sprintId === s.id)
          .sort((a, b) => a.position - b.position)
      );
    });
    return map;
  }, [allTasks, sprints]);

  const toggleSection = (id: string) => {
    setExpandedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId && destination.index === source.index) return;

      const targetSprintId = destination.droppableId === 'backlog' ? null : destination.droppableId;
      updateTask.mutate({
        id: draggableId,
        sprintId: targetSprintId,
      });
      moveTask.mutate({
        id: draggableId,
        status: 'backlog',
        position: destination.index,
      });
    },
    [updateTask, moveTask]
  );

  const handleBulkMoveToSprint = (sprintId: string) => {
    selectedIds.forEach((id) => {
      updateTask.mutate({ id, sprintId });
    });
    setSelectedIds(new Set());
  };

  const handleBulkSetPriority = (priority: TaskPriority) => {
    selectedIds.forEach((id) => {
      updateTask.mutate({ id, priority });
    });
    setSelectedIds(new Set());
  };

  const handleQuickPoints = (taskId: string, points: number) => {
    updateTask.mutate({ id: taskId, storyPoints: points });
    setEditingPoints(null);
  };

  const handleAddTask = (sprintId?: string) => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate(
      {
        projectId,
        title: newTaskTitle.trim(),
        status: 'backlog',
        sprintId,
      },
      {
        onSuccess: () => {
          setNewTaskTitle('');
          setAddingInSection(null);
        },
      }
    );
  };

  const isLoading = tasksLoading || sprintsLoading;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const activeSprints = sprints.filter((s) => s.status !== 'completed');

  const renderTaskRow = (task: Task, index: number, droppableId: string) => (
    <Draggable key={task.id} draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'flex items-center gap-2 border-b border-surface-100 bg-white px-3 py-2 transition-colors dark:border-surface-800 dark:bg-surface-900',
            snapshot.isDragging && 'shadow-lg ring-2 ring-brand-500/30',
            selectedIds.has(task.id) && 'bg-brand-50/50 dark:bg-brand-950/20'
          )}
        >
          {/* Drag handle */}
          <div {...provided.dragHandleProps} className="cursor-grab text-surface-300 hover:text-surface-500">
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selectedIds.has(task.id)}
            onChange={() => toggleSelect(task.id)}
            className="h-3.5 w-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
          />

          {/* Key */}
          <span className="min-w-[64px] rounded bg-surface-100 px-1.5 py-0.5 text-center text-[10px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
            {task.key}
          </span>

          {/* Priority */}
          <span className={PRIORITY_CONFIG[task.priority].color}>
            {PRIORITY_CONFIG[task.priority].icon}
          </span>

          {/* Title */}
          <span
            onClick={() => setSelectedTaskId(task.id)}
            className="flex-1 cursor-pointer truncate text-sm text-surface-800 hover:text-brand-600 dark:text-surface-200"
          >
            {task.title}
          </span>

          {/* Labels */}
          {task.labels.length > 0 && (
            <div className="hidden items-center gap-1 md:flex">
              {task.labels.slice(0, 2).map((l) => (
                <span
                  key={l.id}
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
                  style={{ backgroundColor: l.color }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}

          {/* Story points - quick edit */}
          <div className="relative">
            <button
              onClick={() => setEditingPoints(editingPoints === task.id ? null : task.id)}
              className={cn(
                'flex h-6 min-w-[28px] items-center justify-center rounded text-xs font-semibold transition-colors',
                task.storyPoints !== undefined && task.storyPoints !== null
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300'
                  : 'bg-surface-100 text-surface-400 hover:bg-surface-200 dark:bg-surface-700'
              )}
            >
              {task.storyPoints ?? '--'}
            </button>
            {editingPoints === task.id && (
              <div className="absolute right-0 top-full z-20 mt-1 flex gap-1 rounded-lg border border-surface-200 bg-white p-1.5 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                {STORY_POINT_OPTIONS.map((pts) => (
                  <button
                    key={pts}
                    onClick={() => handleQuickPoints(task.id, pts)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
                      task.storyPoints === pts
                        ? 'bg-brand-600 text-white'
                        : 'hover:bg-surface-100 dark:hover:bg-surface-700'
                    )}
                  >
                    {pts}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee */}
          {task.assigneeId && (
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[8px] font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300"
              title={task.assigneeName}
            >
              {task.assigneeAvatar ? (
                <img src={task.assigneeAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                getInitials(task.assigneeName || '?')
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );

  return (
    <>
      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-brand-50 px-4 py-2 dark:bg-brand-950/30">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-surface-500">Move to:</span>
            {activeSprints.map((s) => (
              <button
                key={s.id}
                onClick={() => handleBulkMoveToSprint(s.id)}
                className="rounded-md bg-white px-2 py-1 text-xs shadow-sm hover:bg-surface-50 dark:bg-surface-800 dark:hover:bg-surface-700"
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-surface-500">Priority:</span>
            {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof PRIORITY_CONFIG[TaskPriority]][]).map(
              ([p, cfg]) => (
                <button
                  key={p}
                  onClick={() => handleBulkSetPriority(p)}
                  className={cn('rounded-md bg-white p-1.5 shadow-sm hover:bg-surface-50 dark:bg-surface-800', cfg.color)}
                >
                  {cfg.icon}
                </button>
              )
            )}
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-brand-600 hover:underline">
            Clear
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {/* Sprint Sections */}
          {activeSprints.map((sprint) => {
            const sTasks = sprintTasks.get(sprint.id) || [];
            const isExpanded = expandedSprints.has(sprint.id);
            const totalPoints = sTasks.reduce((s, t) => s + (t.storyPoints || 0), 0);

            return (
              <div key={sprint.id} className="rounded-xl border border-surface-200 dark:border-surface-700">
                <button
                  onClick={() => toggleSection(sprint.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-surface-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-surface-400" />
                  )}
                  <Layers className="h-4 w-4 text-brand-500" />
                  <span className="font-semibold text-surface-800 dark:text-surface-200">
                    {sprint.name}
                  </span>
                  <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                    {sTasks.length} tasks
                  </span>
                  <span className="text-xs text-surface-400">
                    {totalPoints} pts
                  </span>
                  <span
                    className={cn(
                      'ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium',
                      sprint.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-surface-100 text-surface-500 dark:bg-surface-800'
                    )}
                  >
                    {sprint.status}
                  </span>
                </button>

                {isExpanded && (
                  <Droppable droppableId={sprint.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'border-t border-surface-200 dark:border-surface-700',
                          snapshot.isDraggingOver && 'bg-brand-50/30 dark:bg-brand-950/10',
                          sTasks.length === 0 && 'min-h-[48px]'
                        )}
                      >
                        {sTasks.map((task, index) =>
                          renderTaskRow(task, index, sprint.id)
                        )}
                        {provided.placeholder}
                        {sTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex h-12 items-center justify-center text-xs text-surface-400">
                            Drag tasks here to add to sprint
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                )}
              </div>
            );
          })}

          {/* Backlog Section */}
          <div className="rounded-xl border border-surface-200 dark:border-surface-700">
            <button
              onClick={() => toggleSection('backlog')}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {expandedSprints.has('backlog') ? (
                <ChevronDown className="h-4 w-4 text-surface-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-surface-400" />
              )}
              <Zap className="h-4 w-4 text-surface-500" />
              <span className="font-semibold text-surface-800 dark:text-surface-200">
                Backlog
              </span>
              <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                {backlogTasks.length} tasks
              </span>
            </button>

            {expandedSprints.has('backlog') && (
              <Droppable droppableId="backlog">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'border-t border-surface-200 dark:border-surface-700',
                      snapshot.isDraggingOver && 'bg-brand-50/30 dark:bg-brand-950/10'
                    )}
                  >
                    {backlogTasks.map((task, index) =>
                      renderTaskRow(task, index, 'backlog')
                    )}
                    {provided.placeholder}
                    {backlogTasks.length === 0 && !snapshot.isDraggingOver && (
                      <div className="flex h-12 items-center justify-center text-xs text-surface-400">
                        No items in backlog
                      </div>
                    )}

                    {/* Add task */}
                    {addingInSection === 'backlog' ? (
                      <div className="border-t border-surface-100 px-3 py-2 dark:border-surface-800">
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="Task title..."
                            className="input flex-1 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddTask(undefined);
                              if (e.key === 'Escape') setAddingInSection(null);
                            }}
                          />
                          <button
                            onClick={() => handleAddTask(undefined)}
                            disabled={!newTaskTitle.trim() || createTask.isPending}
                            className="btn-primary px-3 text-xs"
                          >
                            Add
                          </button>
                          <button onClick={() => setAddingInSection(null)} className="btn-ghost px-2 text-xs">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingInSection('backlog');
                          setNewTaskTitle('');
                        }}
                        className="flex w-full items-center gap-1.5 border-t border-surface-100 px-4 py-2 text-xs text-surface-400 hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800/50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create task
                      </button>
                    )}
                  </div>
                )}
              </Droppable>
            )}
          </div>
        </div>
      </DragDropContext>

      {selectedTaskId && (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </>
  );
}
