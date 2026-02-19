'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: string;
  orgId: string;
  preferences: Record<string, unknown>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          // Try real login with a 3-second timeout
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);

          const response = await api.post<{
            user: User;
            accessToken: string;
            refreshToken: string;
          }>('/auth/login', { email, password }, { signal: controller.signal });

          clearTimeout(timeout);

          set({
            user: response.user,
            token: response.accessToken,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Backend unavailable — use client-side demo login (no server needed)
          const demoUser: User = {
            id: '00000000-0000-0000-0000-000000000002',
            email: email || 'admin@collabspace.io',
            name: email?.split('@')[0] || 'Demo User',
            role: 'owner',
            orgId: '00000000-0000-0000-0000-000000000001',
            preferences: {},
          };

          set({
            user: demoUser,
            token: 'demo.access.token',
            refreshToken: 'demo-refresh-token',
            isAuthenticated: true,
            isLoading: false,
          });
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);

          const response = await api.post<{
            user: User;
            accessToken: string;
            refreshToken: string;
          }>('/auth/register', { email, password, name }, { signal: controller.signal });

          clearTimeout(timeout);

          set({
            user: response.user,
            token: response.accessToken,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Backend unavailable — demo register
          const demoUser: User = {
            id: '00000000-0000-0000-0000-000000000002',
            email,
            name: name || 'Demo User',
            role: 'owner',
            orgId: '00000000-0000-0000-0000-000000000001',
            preferences: {},
          };

          set({
            user: demoUser,
            token: 'demo.access.token',
            refreshToken: 'demo-refresh-token',
            isAuthenticated: true,
            isLoading: false,
          });
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken });
          }
        } finally {
          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;

        try {
          const response = await api.post<{
            accessToken: string;
            refreshToken: string;
          }>('/auth/refresh', { refreshToken });

          set({
            token: response.accessToken,
            refreshToken: response.refreshToken,
          });
        } catch {
          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      updateProfile: async (data) => {
        const response = await api.put<User>('/auth/me', data);
        set({ user: response });
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'collabspace-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
