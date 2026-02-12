'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskCard } from './task-card';
import { TaskDetail } from './task-detail';
import {
  useTasks,
  useMoveTask,
  useCreateTask,
  type Task,
  type TaskStatus,
  type TaskFilters,
} from '@/hooks/use-projects';

interface KanbanBoardProps {
  projectId: string;
  filters: TaskFilters;
}

interface ColumnConfig {
  id: TaskStatus;
  title: string;
  color: string;
  dotColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', color: 'bg-surface-100 dark:bg-surface-800/60', dotColor: 'bg-surface-400' },
  { id: 'todo', title: 'To Do', color: 'bg-blue-50 dark:bg-blue-950/20', dotColor: 'bg-blue-400' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-amber-50 dark:bg-amber-950/20', dotColor: 'bg-amber-400' },
  { id: 'in_review', title: 'In Review', color: 'bg-brand-50 dark:bg-brand-950/20', dotColor: 'bg-brand-400' },
  { id: 'done', title: 'Done', color: 'bg-green-50 dark:bg-green-950/20', dotColor: 'bg-green-500' },
];

export function KanbanBoard({ projectId, filters }: KanbanBoardProps) {
  const { data, isLoading, error } = useTasks(projectId, filters);
  const moveTask = useMoveTask();
  const createTask = useCreateTask();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const tasks = data?.tasks ?? [];

  // Group tasks by status
  const columnTasks = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    tasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    // Sort each column by position
    Object.values(grouped).forEach((col) =>
      col.sort((a, b) => a.position - b.position)
    );
    return grouped;
  }, [tasks]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      )
        return;

      const newStatus = destination.droppableId as TaskStatus;
      moveTask.mutate({
        id: draggableId,
        status: newStatus,
        position: destination.index,
      });
    },
    [moveTask]
  );

  const handleAddTask = useCallback(
    (status: TaskStatus) => {
      if (!newTaskTitle.trim()) return;
      createTask.mutate(
        {
          projectId,
          title: newTaskTitle.trim(),
          status,
        },
        {
          onSuccess: () => {
            setNewTaskTitle('');
            setAddingToColumn(null);
          },
        }
      );
    },
    [newTaskTitle, projectId, createTask]
  );

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-220px)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm text-surface-500">Loading board...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-220px)] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500">Failed to load tasks</p>
          <p className="mt-1 text-xs text-surface-400">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {COLUMNS.map((column) => {
            const colTasks = columnTasks[column.id];
            return (
              <div
                key={column.id}
                className={cn(
                  'flex w-72 flex-shrink-0 flex-col rounded-xl',
                  column.color
                )}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 rounded-full', column.dotColor)} />
                    <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                      {column.title}
                    </h3>
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/60 px-1.5 text-xs font-medium text-surface-500 dark:bg-surface-700/60 dark:text-surface-400">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setAddingToColumn(column.id);
                      setNewTaskTitle('');
                    }}
                    className="rounded-md p-1 text-surface-400 transition-colors hover:bg-white/60 hover:text-surface-600 dark:hover:bg-surface-700/60"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'flex-1 space-y-2 px-2 pb-2 transition-colors',
                        snapshot.isDraggingOver && 'bg-brand-50/50 dark:bg-brand-950/10',
                        colTasks.length === 0 && !snapshot.isDraggingOver && 'min-h-[80px]'
                      )}
                    >
                      {colTasks.map((task, index) => (
                        <Draggable
                          key={task.id}
                          draggableId={task.id}
                          index={index}
                        >
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              style={{
                                ...dragProvided.draggableProps.style,
                                transition: dragSnapshot.isDragging
                                  ? undefined
                                  : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
                              }}
                            >
                              <TaskCard
                                task={task}
                                onClick={(t) => setSelectedTaskId(t.id)}
                                isDragging={dragSnapshot.isDragging}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {/* Empty column message */}
                      {colTasks.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex h-20 items-center justify-center">
                          <p className="text-xs text-surface-400">
                            Drag tasks here
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>

                {/* Add task at bottom */}
                {addingToColumn === column.id ? (
                  <div className="px-2 pb-2">
                    <div className="rounded-lg border border-brand-300 bg-white p-2 shadow-sm dark:border-brand-700 dark:bg-surface-800">
                      <input
                        autoFocus
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Task title..."
                        className="w-full border-none bg-transparent text-sm outline-none placeholder:text-surface-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTask(column.id);
                          if (e.key === 'Escape') setAddingToColumn(null);
                        }}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleAddTask(column.id)}
                          disabled={!newTaskTitle.trim() || createTask.isPending}
                          className="btn-primary px-2.5 py-1 text-xs"
                        >
                          {createTask.isPending ? 'Adding...' : 'Add'}
                        </button>
                        <button
                          onClick={() => setAddingToColumn(null)}
                          className="btn-ghost px-2.5 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAddingToColumn(column.id);
                      setNewTaskTitle('');
                    }}
                    className="mx-2 mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-surface-400 transition-colors hover:bg-white/60 hover:text-surface-600 dark:hover:bg-surface-700/60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Task Detail Slide-over */}
      {selectedTaskId && (
        <TaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}
