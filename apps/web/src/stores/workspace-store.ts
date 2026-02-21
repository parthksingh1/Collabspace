'use client';

import { create } from 'zustand';
import { api } from '@/lib/api-client';

interface Workspace {
  id: string;
  name: string;
  orgId: string;
  description: string;
  visibility: 'public' | 'private';
  createdAt: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;

  fetchWorkspaces: () => Promise<void>;
  setCurrentWorkspace: (workspace: Workspace) => void;
  createWorkspace: (data: { name: string; description: string; visibility: string }) => Promise<Workspace>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  isLoading: false,

  fetchWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const workspaces = await api.get<Workspace[]>('/workspaces');
      set({ workspaces, isLoading: false });
      if (!get().currentWorkspace && workspaces.length > 0) {
        set({ currentWorkspace: workspaces[0] });
      }
    } catch {
      // Fallback demo workspace when API is unavailable
      const demoWorkspaces: Workspace[] = [
        {
          id: '00000000-0000-0000-0000-000000000003',
          name: 'Default Workspace',
          orgId: '00000000-0000-0000-0000-000000000001',
          description: 'Your first workspace',
          visibility: 'private',
          createdAt: new Date().toISOString(),
        },
      ];
      set({ workspaces: demoWorkspaces, isLoading: false });
      if (!get().currentWorkspace) {
        set({ currentWorkspace: demoWorkspaces[0] });
      }
    }
  },

  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),

  createWorkspace: async (data) => {
    const workspace = await api.post<Workspace>('/workspaces', data);
    set((state) => ({ workspaces: [...state.workspaces, workspace] }));
    return workspace;
  },

  updateWorkspace: async (id, data) => {
    const updated = await api.put<Workspace>(`/workspaces/${id}`, data);
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? updated : w)),
      currentWorkspace: state.currentWorkspace?.id === id ? updated : state.currentWorkspace,
    }));
  },

  deleteWorkspace: async (id) => {
    await api.delete(`/workspaces/${id}`);
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      currentWorkspace: state.currentWorkspace?.id === id ? null : state.currentWorkspace,
    }));
  },
}));
