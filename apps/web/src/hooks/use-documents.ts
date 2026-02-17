'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from '@/lib/api-client';

// ---- Types ----

export interface DocumentCollaborator {
  id: string;
  name: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface Document {
  id: string;
  title: string;
  content: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
  collaborators: DocumentCollaborator[];
  editorCount: number;
  wordCount: number;
  isStarred: boolean;
}

export interface DocumentFilters {
  search?: string;
  filter?: 'recent' | 'created_by_me' | 'shared_with_me';
  sortBy?: 'updatedAt' | 'title' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedDocuments {
  documents: Document[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CommentReply {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  replies: CommentReply[];
  selectionStart?: number;
  selectionEnd?: number;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  changeSummary: string;
  wordCount: number;
}

// ---- Query Keys ----

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (workspaceId: string, filters: DocumentFilters) =>
    [...documentKeys.lists(), workspaceId, filters] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: string) => [...documentKeys.details(), id] as const,
  comments: (documentId: string) =>
    [...documentKeys.all, 'comments', documentId] as const,
  history: (documentId: string) =>
    [...documentKeys.all, 'history', documentId] as const,
};

// ---- Hooks ----

export function useDocuments(
  workspaceId: string,
  filters: DocumentFilters = {},
  options?: Partial<UseQueryOptions<PaginatedDocuments>>
) {
  return useQuery<PaginatedDocuments>({
    queryKey: documentKeys.list(workspaceId, filters),
    queryFn: () =>
      api.get<PaginatedDocuments>(`/workspaces/${workspaceId}/documents`, {
        params: {
          search: filters.search,
          filter: filters.filter,
          sortBy: filters.sortBy || 'updatedAt',
          sortOrder: filters.sortOrder || 'desc',
          page: filters.page || 1,
          limit: filters.limit || 20,
        },
      }),
    enabled: !!workspaceId,
    ...options,
  });
}

export function useDocument(id: string) {
  return useQuery<Document>({
    queryKey: documentKeys.detail(id),
    queryFn: () => api.get<Document>(`/documents/${id}`),
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      workspaceId: string;
      content?: string;
    }) => api.post<Document>('/documents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      content?: string;
    }) => api.patch<Document>(`/documents/${id}`, data),
    onSuccess: (data) => {
      queryClient.setQueryData(documentKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

export function useDocumentComments(documentId: string) {
  return useQuery<DocumentComment[]>({
    queryKey: documentKeys.comments(documentId),
    queryFn: () =>
      api.get<DocumentComment[]>(`/documents/${documentId}/comments`),
    enabled: !!documentId,
    refetchInterval: 10_000,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      documentId: string;
      content: string;
      selectionStart?: number;
      selectionEnd?: number;
      parentId?: string;
    }) =>
      api.post<DocumentComment>(
        `/documents/${data.documentId}/comments`,
        data
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.comments(variables.documentId),
      });
    },
  });
}

export function useResolveComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      commentId,
    }: {
      documentId: string;
      commentId: string;
    }) =>
      api.patch<DocumentComment>(
        `/documents/${documentId}/comments/${commentId}/resolve`
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.comments(variables.documentId),
      });
    },
  });
}

export function useDocumentHistory(documentId: string) {
  return useQuery<DocumentVersion[]>({
    queryKey: documentKeys.history(documentId),
    queryFn: () =>
      api.get<DocumentVersion[]>(`/documents/${documentId}/versions`),
    enabled: !!documentId,
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      versionId,
    }: {
      documentId: string;
      versionId: string;
    }) =>
      api.post<Document>(
        `/documents/${documentId}/versions/${versionId}/restore`
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(documentKeys.detail(data.id), data);
      queryClient.invalidateQueries({
        queryKey: documentKeys.history(data.id),
      });
    },
  });
}
