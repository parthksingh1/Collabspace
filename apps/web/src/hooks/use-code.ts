'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useWebSocket } from '@/lib/websocket-context';
import { useWorkspaceStore } from '@/stores/workspace-store';

// ─── Types ────────────────────────────────────────────────────────

export interface CodeFile {
  id: string;
  name: string;
  language: string;
  content: string;
  workspaceId: string;
  parentId: string | null;
  isFolder: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  collaborators: Collaborator[];
}

export interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
}

export interface CodingRoom {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  createdBy: string;
  status: 'waiting' | 'active' | 'finished';
  startTime: string | null;
  endTime: string | null;
  duration: number; // minutes
  problemMarkdown: string;
  testCases: TestCase[];
  participants: RoomParticipant[];
  createdAt: string;
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface RoomParticipant {
  id: string;
  userId: string;
  userName: string;
  avatar?: string;
  score: number;
  submissionCount: number;
  lastSubmissionAt: string | null;
  status: 'joined' | 'coding' | 'submitted' | 'finished';
}

export interface ExecutionResult {
  id: string;
  status: 'success' | 'error' | 'timeout' | 'runtime_error';
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number; // ms
  memoryUsage: number; // bytes
  timestamp: string;
}

export interface SubmissionResult {
  id: string;
  status: 'accepted' | 'wrong_answer' | 'time_limit' | 'runtime_error' | 'compile_error';
  passedTests: number;
  totalTests: number;
  score: number;
  executionTime: number;
  memoryUsage: number;
  details: { testId: string; passed: boolean; output?: string; expected?: string }[];
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  avatar?: string;
  score: number;
  submissionCount: number;
  lastAcceptedAt: string | null;
  rank: number;
}

// ─── Query Keys ───────────────────────────────────────────────────

const codeKeys = {
  all: ['code'] as const,
  files: (workspaceId: string) => [...codeKeys.all, 'files', workspaceId] as const,
  file: (id: string) => [...codeKeys.all, 'file', id] as const,
  rooms: (workspaceId: string) => [...codeKeys.all, 'rooms', workspaceId] as const,
  room: (id: string) => [...codeKeys.all, 'room', id] as const,
  leaderboard: (roomId: string) => [...codeKeys.all, 'leaderboard', roomId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────

export function useCodeFiles(workspaceId?: string) {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const wsId = workspaceId || currentWorkspace?.id || '';

  return useQuery({
    queryKey: codeKeys.files(wsId),
    queryFn: () => api.get<CodeFile[]>(`/workspaces/${wsId}/code-files`),
    enabled: !!wsId,
    staleTime: 30_000,
  });
}

export function useCodeFile(id: string) {
  return useQuery({
    queryKey: codeKeys.file(id),
    queryFn: () => api.get<CodeFile>(`/code-files/${id}`),
    enabled: !!id,
  });
}

export function useCreateCodeFile() {
  const queryClient = useQueryClient();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  return useMutation({
    mutationFn: (data: {
      name: string;
      language: string;
      parentId?: string;
      isFolder?: boolean;
      content?: string;
    }) =>
      api.post<CodeFile>(`/workspaces/${currentWorkspace?.id}/code-files`, data),
    onSuccess: () => {
      if (currentWorkspace) {
        queryClient.invalidateQueries({ queryKey: codeKeys.files(currentWorkspace.id) });
      }
    },
  });
}

export function useUpdateCodeFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; language?: string; content?: string; parentId?: string | null }) =>
      api.patch<CodeFile>(`/code-files/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(codeKeys.file(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: codeKeys.files(updated.workspaceId) });
    },
  });
}

export function useDeleteCodeFile() {
  const queryClient = useQueryClient();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  return useMutation({
    mutationFn: (id: string) => api.delete(`/code-files/${id}`),
    onSuccess: () => {
      if (currentWorkspace) {
        queryClient.invalidateQueries({ queryKey: codeKeys.files(currentWorkspace.id) });
      }
    },
  });
}

export function useExecuteCode() {
  return useMutation({
    mutationFn: (data: { fileId: string; language: string; code: string; stdin?: string }) =>
      api.post<ExecutionResult>('/code/execute', data),
  });
}

export function useCodingRooms(workspaceId?: string) {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const wsId = workspaceId || currentWorkspace?.id || '';

  return useQuery({
    queryKey: codeKeys.rooms(wsId),
    queryFn: () => api.get<CodingRoom[]>(`/workspaces/${wsId}/coding-rooms`),
    enabled: !!wsId,
  });
}

export function useCodingRoom(id: string) {
  return useQuery({
    queryKey: codeKeys.room(id),
    queryFn: () => api.get<CodingRoom>(`/coding-rooms/${id}`),
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useCreateCodingRoom() {
  const queryClient = useQueryClient();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  return useMutation({
    mutationFn: (data: {
      name: string;
      description: string;
      duration: number;
      problemMarkdown: string;
      testCases: { input: string; expectedOutput: string; isHidden: boolean }[];
    }) =>
      api.post<CodingRoom>(`/workspaces/${currentWorkspace?.id}/coding-rooms`, data),
    onSuccess: () => {
      if (currentWorkspace) {
        queryClient.invalidateQueries({ queryKey: codeKeys.rooms(currentWorkspace.id) });
      }
    },
  });
}

export function useSubmitSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { roomId: string; language: string; code: string }) =>
      api.post<SubmissionResult>(`/coding-rooms/${data.roomId}/submit`, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: codeKeys.leaderboard(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: codeKeys.room(variables.roomId) });
    },
  });
}

export function useLeaderboard(roomId: string) {
  const { subscribe } = useWebSocket();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  const query = useQuery({
    queryKey: codeKeys.leaderboard(roomId),
    queryFn: () => api.get<LeaderboardEntry[]>(`/coding-rooms/${roomId}/leaderboard`),
    enabled: !!roomId,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (query.data) {
      setEntries(query.data);
    }
  }, [query.data]);

  useEffect(() => {
    if (!roomId) return;

    const unsub = subscribe('leaderboard:update', (payload) => {
      const data = payload as { roomId: string; entries: LeaderboardEntry[] };
      if (data.roomId === roomId) {
        setEntries(data.entries);
      }
    });

    return unsub;
  }, [roomId, subscribe]);

  return {
    ...query,
    data: entries.length > 0 ? entries : query.data,
  };
}

export function useCodeCollaboration(fileId: string) {
  const { subscribe, send, joinRoom, leaveRoom } = useWebSocket();

  useEffect(() => {
    if (!fileId) return;
    joinRoom(fileId, 'code');
    return () => leaveRoom(fileId);
  }, [fileId, joinRoom, leaveRoom]);

  const broadcastCursor = useCallback(
    (position: { lineNumber: number; column: number }) => {
      send({
        type: 'code:cursor',
        payload: { fileId, position },
        roomId: fileId,
        timestamp: Date.now(),
      });
    },
    [fileId, send]
  );

  const broadcastChange = useCallback(
    (changes: unknown) => {
      send({
        type: 'code:change',
        payload: { fileId, changes },
        roomId: fileId,
        timestamp: Date.now(),
      });
    },
    [fileId, send]
  );

  return { subscribe, broadcastCursor, broadcastChange };
}
