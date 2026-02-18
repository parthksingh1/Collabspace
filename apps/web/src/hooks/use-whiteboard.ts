'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useWebSocket } from '@/lib/websocket-context';
import { useWorkspaceStore } from '@/stores/workspace-store';

// ─── Types ────────────────────────────────────────────────────────

export type ShapeType =
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'freehand'
  | 'connector';

export interface BoardElement {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  points?: number[];
  connectorStart?: { elementId: string; anchor: string };
  connectorEnd?: { elementId: string; anchor: string };
  locked: boolean;
  groupId?: string;
  zIndex: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  thumbnail?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  collaboratorCount: number;
  elementCount: number;
}

export interface BoardCollaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number };
}

// ─── Query Keys ───────────────────────────────────────────────────

const boardKeys = {
  all: ['boards'] as const,
  list: (workspaceId: string) => [...boardKeys.all, 'list', workspaceId] as const,
  detail: (id: string) => [...boardKeys.all, 'detail', id] as const,
  elements: (boardId: string) => [...boardKeys.all, 'elements', boardId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────

export function useBoards(workspaceId?: string) {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const wsId = workspaceId || currentWorkspace?.id || '';

  return useQuery({
    queryKey: boardKeys.list(wsId),
    queryFn: () => api.get<Board[]>(`/workspaces/${wsId}/boards`),
    enabled: !!wsId,
    staleTime: 30_000,
  });
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: boardKeys.detail(id),
    queryFn: () =>
      api.get<Board & { elements: BoardElement[]; collaborators: BoardCollaborator[] }>(
        `/boards/${id}`
      ),
    enabled: !!id,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  return useMutation({
    mutationFn: (data: { name: string }) =>
      api.post<Board>(`/workspaces/${currentWorkspace?.id}/boards`, data),
    onSuccess: () => {
      if (currentWorkspace) {
        queryClient.invalidateQueries({ queryKey: boardKeys.list(currentWorkspace.id) });
      }
    },
  });
}

export function useUpdateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string }) =>
      api.patch<Board>(`/boards/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(boardKeys.detail(updated.id), (old: unknown) =>
        old ? { ...(old as object), ...updated } : updated
      );
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  return useMutation({
    mutationFn: (id: string) => api.delete(`/boards/${id}`),
    onSuccess: () => {
      if (currentWorkspace) {
        queryClient.invalidateQueries({ queryKey: boardKeys.list(currentWorkspace.id) });
      }
    },
  });
}

export function useBoardElements(boardId: string) {
  const { subscribe, send, joinRoom, leaveRoom } = useWebSocket();
  const queryClient = useQueryClient();
  const [elements, setElements] = useState<BoardElement[]>([]);

  const query = useQuery({
    queryKey: boardKeys.elements(boardId),
    queryFn: () => api.get<BoardElement[]>(`/boards/${boardId}/elements`),
    enabled: !!boardId,
  });

  useEffect(() => {
    if (query.data) setElements(query.data);
  }, [query.data]);

  useEffect(() => {
    if (!boardId) return;
    joinRoom(boardId, 'board');

    const unsubAdd = subscribe('board:element:add', (payload) => {
      const data = payload as { boardId: string; element: BoardElement };
      if (data.boardId === boardId) {
        setElements((prev) => [...prev, data.element]);
      }
    });

    const unsubUpdate = subscribe('board:element:update', (payload) => {
      const data = payload as { boardId: string; element: BoardElement };
      if (data.boardId === boardId) {
        setElements((prev) =>
          prev.map((el) => (el.id === data.element.id ? data.element : el))
        );
      }
    });

    const unsubDelete = subscribe('board:element:delete', (payload) => {
      const data = payload as { boardId: string; elementId: string };
      if (data.boardId === boardId) {
        setElements((prev) => prev.filter((el) => el.id !== data.elementId));
      }
    });

    return () => {
      leaveRoom(boardId);
      unsubAdd();
      unsubUpdate();
      unsubDelete();
    };
  }, [boardId, joinRoom, leaveRoom, subscribe]);

  const addElement = useCallback(
    async (element: Omit<BoardElement, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
      const created = await api.post<BoardElement>(`/boards/${boardId}/elements`, element);
      setElements((prev) => [...prev, created]);
      send({
        type: 'board:element:add',
        payload: { boardId, element: created },
        roomId: boardId,
        timestamp: Date.now(),
      });
      return created;
    },
    [boardId, send]
  );

  const updateElement = useCallback(
    async (elementId: string, updates: Partial<BoardElement>) => {
      const updated = await api.patch<BoardElement>(
        `/boards/${boardId}/elements/${elementId}`,
        updates
      );
      setElements((prev) => prev.map((el) => (el.id === elementId ? updated : el)));
      send({
        type: 'board:element:update',
        payload: { boardId, element: updated },
        roomId: boardId,
        timestamp: Date.now(),
      });
      return updated;
    },
    [boardId, send]
  );

  const deleteElement = useCallback(
    async (elementId: string) => {
      await api.delete(`/boards/${boardId}/elements/${elementId}`);
      setElements((prev) => prev.filter((el) => el.id !== elementId));
      send({
        type: 'board:element:delete',
        payload: { boardId, elementId },
        roomId: boardId,
        timestamp: Date.now(),
      });
    },
    [boardId, send]
  );

  const broadcastCursor = useCallback(
    (cursor: { x: number; y: number }) => {
      send({
        type: 'board:cursor',
        payload: { boardId, cursor },
        roomId: boardId,
        timestamp: Date.now(),
      });
    },
    [boardId, send]
  );

  return {
    elements,
    isLoading: query.isLoading,
    error: query.error,
    addElement,
    updateElement,
    deleteElement,
    broadcastCursor,
    refetch: query.refetch,
  };
}

export function useExportBoard() {
  return useMutation({
    mutationFn: async (data: { boardId: string; format: 'png' | 'svg' | 'pdf' }) => {
      const blob = await api.post<Blob>(`/boards/${data.boardId}/export`, {
        format: data.format,
      });
      return blob;
    },
  });
}
