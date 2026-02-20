'use client';

import { create } from 'zustand';

interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number; anchor?: number; head?: number };
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: number;
}

interface PresenceState {
  users: Map<string, PresenceUser>;
  roomId: string | null;

  setRoomPresence: (roomId: string, users: PresenceUser[]) => void;
  updateUser: (userId: string, data: Partial<PresenceUser>) => void;
  removeUser: (userId: string) => void;
  clearRoom: () => void;
  getOnlineUsers: () => PresenceUser[];
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  users: new Map(),
  roomId: null,

  setRoomPresence: (roomId, users) => {
    const map = new Map<string, PresenceUser>();
    users.forEach((u) => map.set(u.id, u));
    set({ roomId, users: map });
  },

  updateUser: (userId, data) => {
    set((state) => {
      const newUsers = new Map(state.users);
      const existing = newUsers.get(userId);
      if (existing) {
        newUsers.set(userId, { ...existing, ...data });
      } else {
        newUsers.set(userId, {
          id: userId,
          name: 'Unknown',
          color: '#14b8a6',
          status: 'online',
          lastSeen: Date.now(),
          ...data,
        } as PresenceUser);
      }
      return { users: newUsers };
    });
  },

  removeUser: (userId) => {
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.delete(userId);
      return { users: newUsers };
    });
  },

  clearRoom: () => set({ users: new Map(), roomId: null }),

  getOnlineUsers: () => Array.from(get().users.values()).filter((u) => u.status !== 'offline'),
}));
