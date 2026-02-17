'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useWebSocket } from '@/lib/websocket-context';
import { useEffect, useCallback } from 'react';

// ---- Types ----

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

export interface ProjectMember {
  id: string;
  name: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  workspaceId: string;
  template: 'blank' | 'scrum' | 'kanban' | 'bug_tracking';
  members: ProjectMember[];
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface TaskComment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  reactions: { emoji: string; userIds: string[] }[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface RelatedTask {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  relationship: 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates';
}

export interface Task {
  id: string;
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  labels: TaskLabel[];
  storyPoints?: number;
  dueDate?: string;
  startDate?: string;
  sprintId?: string;
  position: number;
  commentCount: number;
  subtasks: Subtask[];
  relatedTasks: RelatedTask[];
  comments: TaskComment[];
  activityLog: ActivityEntry[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  type: 'status_change' | 'assignee_change' | 'priority_change' | 'comment' | 'created' | 'updated' | 'label_change';
  userId: string;
  userName: string;
  userAvatar?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  content?: string;
  timestamp: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  projectId: string;
  status: 'planned' | 'active' | 'completed';
  startDate: string;
  endDate: string;
  taskIds: string[];
  burndownData: { date: string; remaining: number; ideal: number }[];
  velocityData: { sprintName: string; points: number }[];
}

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assigneeId?: string;
  labels?: string[];
  search?: string;
  sprintId?: string;
  sortBy?: 'position' | 'priority' | 'dueDate' | 'createdAt' | 'title' | 'status' | 'storyPoints';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedTasks {
  tasks: Task[];
  total: number;
  page: number;
  totalPages: number;
}

// ---- Query Keys ----

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...projectKeys.lists(), workspaceId] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (projectId: string, filters: TaskFilters) =>
    [...taskKeys.lists(), projectId, filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export const sprintKeys = {
  all: ['sprints'] as const,
  lists: () => [...sprintKeys.all, 'list'] as const,
  list: (projectId: string) => [...sprintKeys.lists(), projectId] as const,
  details: () => [...sprintKeys.all, 'detail'] as const,
  detail: (id: string) => [...sprintKeys.details(), id] as const,
};

// ---- Project Hooks ----

export function useProjects(
  workspaceId: string,
  options?: Partial<UseQueryOptions<Project[]>>
) {
  return useQuery<Project[]>({
    queryKey: projectKeys.list(workspaceId),
    queryFn: () => api.get<Project[]>(`/workspaces/${workspaceId}/projects`),
    enabled: !!workspaceId,
    ...options,
  });
}

export function useProject(id: string) {
  return useQuery<Project>({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description: string;
      workspaceId: string;
      template: Project['template'];
    }) => api.post<Project>('/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

// ---- Task Hooks ----

export function useTasks(
  projectId: string,
  filters: TaskFilters = {},
  options?: Partial<UseQueryOptions<PaginatedTasks>>
) {
  const { subscribe } = useWebSocket();
  const queryClient = useQueryClient();

  // Real-time task updates
  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribe('task:updated', (payload: unknown) => {
      const data = payload as { projectId: string };
      if (data.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      }
    });
    return unsub;
  }, [projectId, subscribe, queryClient]);

  return useQuery<PaginatedTasks>({
    queryKey: taskKeys.list(projectId, filters),
    queryFn: () =>
      api.get<PaginatedTasks>(`/projects/${projectId}/tasks`, {
        params: {
          status: filters.status?.join(','),
          priority: filters.priority?.join(','),
          assigneeId: filters.assigneeId,
          labels: filters.labels?.join(','),
          search: filters.search,
          sprintId: filters.sprintId,
          sortBy: filters.sortBy || 'position',
          sortOrder: filters.sortOrder || 'asc',
          page: filters.page || 1,
          limit: filters.limit || 200,
        },
      }),
    enabled: !!projectId,
    ...options,
  });
}

export function useTask(id: string) {
  return useQuery<Task>({
    queryKey: taskKeys.detail(id),
    queryFn: () => api.get<Task>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      projectId: string;
      title: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string;
      labels?: string[];
      storyPoints?: number;
      dueDate?: string;
      startDate?: string;
      sprintId?: string;
    }) => api.post<Task>(`/projects/${data.projectId}/tasks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string | null;
      labels?: string[];
      storyPoints?: number | null;
      dueDate?: string | null;
      startDate?: string | null;
      sprintId?: string | null;
    }) => api.patch<Task>(`/tasks/${id}`, data),
    onMutate: async (variables) => {
      // Optimistic update for task detail
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(variables.id) });
      const previous = queryClient.getQueryData<Task>(taskKeys.detail(variables.id));
      if (previous) {
        queryClient.setQueryData(taskKeys.detail(variables.id), {
          ...previous,
          ...variables,
        });
      }
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.detail(variables.id), context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useMoveTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      status: TaskStatus;
      position: number;
    }) => api.patch<Task>(`/tasks/${data.id}/move`, {
      status: data.status,
      position: data.position,
    }),
    onMutate: async (variables) => {
      // Cancel any in-flight queries for task lists
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() });

      // Snapshot all task list queries
      const queryCache = queryClient.getQueryCache();
      const taskListQueries = queryCache.findAll({ queryKey: taskKeys.lists() });
      const snapshots = new Map<string, unknown>();

      taskListQueries.forEach((query) => {
        snapshots.set(JSON.stringify(query.queryKey), query.state.data);
        const data = query.state.data as PaginatedTasks | undefined;
        if (data) {
          const updatedTasks = data.tasks.map((t) =>
            t.id === variables.id
              ? { ...t, status: variables.status, position: variables.position }
              : t
          );
          queryClient.setQueryData(query.queryKey, {
            ...data,
            tasks: updatedTasks,
          });
        }
      });

      return { snapshots };
    },
    onError: (_err, _variables, context) => {
      // Rollback
      if (context?.snapshots) {
        context.snapshots.forEach((data, keyStr) => {
          queryClient.setQueryData(JSON.parse(keyStr), data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// ---- Sprint Hooks ----

export function useSprints(projectId: string) {
  return useQuery<Sprint[]>({
    queryKey: sprintKeys.list(projectId),
    queryFn: () => api.get<Sprint[]>(`/projects/${projectId}/sprints`),
    enabled: !!projectId,
  });
}

export function useSprint(id: string) {
  return useQuery<Sprint>({
    queryKey: sprintKeys.detail(id),
    queryFn: () => api.get<Sprint>(`/sprints/${id}`),
    enabled: !!id,
  });
}

export function useStartSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      startDate: string;
      endDate: string;
      goal?: string;
    }) => api.post<Sprint>(`/sprints/${data.id}/start`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: sprintKeys.lists() });
    },
  });
}

export function useCompleteSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      moveIncompleteToSprintId?: string;
    }) => api.post<Sprint>(`/sprints/${data.id}/complete`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// ---- Utility hook for task subscription ----

export function useTaskRealtimeSync(projectId: string) {
  const { subscribe, joinRoom, leaveRoom } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
    joinRoom(projectId, 'project');

    const unsubUpdated = subscribe('task:updated', (payload: unknown) => {
      const task = payload as Task;
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    });

    const unsubCreated = subscribe('task:created', () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    });

    const unsubDeleted = subscribe('task:deleted', () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    });

    return () => {
      leaveRoom(projectId);
      unsubUpdated();
      unsubCreated();
      unsubDeleted();
    };
  }, [projectId, subscribe, joinRoom, leaveRoom, queryClient]);
}
