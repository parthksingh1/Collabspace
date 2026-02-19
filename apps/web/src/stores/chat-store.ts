'use client';

import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'system';
  reactions?: { emoji: string; users: string[] }[];
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'general' | 'project' | 'direct';
  unreadCount: number;
  lastMessage?: ChatMessage;
  members: { id: string; name: string; avatar?: string; online: boolean }[];
}

interface ChatState {
  channels: ChatChannel[];
  activeChannelId: string;
  messagesByChannel: Record<string, ChatMessage[]>;
  typingUsers: Record<string, string[]>;

  sendMessage: (channelId: string, content: string, type?: ChatMessage['type']) => void;
  switchChannel: (channelId: string) => void;
  markAsRead: (channelId: string) => void;
  addReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
}

// ─── Demo data ────────────────────────────────────────────────────

const MEMBERS = [
  { id: 'u1', name: 'You', avatar: undefined, online: true },
  { id: 'u2', name: 'Sarah Chen', avatar: undefined, online: true },
  { id: 'u3', name: 'Marcus Johnson', avatar: undefined, online: true },
  { id: 'u4', name: 'Emily Park', avatar: undefined, online: false },
  { id: 'u5', name: 'Alex Rivera', avatar: undefined, online: true },
  { id: 'u6', name: 'Jordan Lee', avatar: undefined, online: false },
  { id: 'u7', name: 'Priya Sharma', avatar: undefined, online: true },
];

const now = Date.now();
const min = 60_000;

const DEMO_GENERAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    senderId: 'u2',
    senderName: 'Sarah Chen',
    content: 'Good morning everyone! Just pushed the new authentication flow to staging.',
    timestamp: now - 45 * min,
    type: 'text',
    reactions: [{ emoji: '🎉', users: ['u3', 'u5'] }],
  },
  {
    id: 'msg-2',
    senderId: 'u3',
    senderName: 'Marcus Johnson',
    content: 'Nice work Sarah! I will start testing it after the standup.',
    timestamp: now - 42 * min,
    type: 'text',
  },
  {
    id: 'msg-3',
    senderId: 'u5',
    senderName: 'Alex Rivera',
    content: 'Can someone review my PR for the notification system? It is #247.',
    timestamp: now - 38 * min,
    type: 'text',
    reactions: [{ emoji: '👀', users: ['u2'] }],
  },
  {
    id: 'msg-4',
    senderId: 'u7',
    senderName: 'Priya Sharma',
    content: 'I will take a look at it after lunch, Alex.',
    timestamp: now - 35 * min,
    type: 'text',
  },
  {
    id: 'msg-5',
    senderId: 'u2',
    senderName: 'Sarah Chen',
    content: 'Reminder: sprint retro is at 3 PM today. Please add your notes to the board beforehand.',
    timestamp: now - 28 * min,
    type: 'text',
    reactions: [{ emoji: '👍', users: ['u3', 'u5', 'u7'] }],
  },
  {
    id: 'msg-6',
    senderId: 'u4',
    senderName: 'Emily Park',
    content: 'The new design system tokens are ready for review. I updated the Figma file.',
    timestamp: now - 22 * min,
    type: 'text',
  },
  {
    id: 'msg-7',
    senderId: 'u3',
    senderName: 'Marcus Johnson',
    content: 'Heads up: the CI pipeline might be slow today, infra team is running maintenance.',
    timestamp: now - 18 * min,
    type: 'text',
    reactions: [{ emoji: '😅', users: ['u5'] }],
  },
  {
    id: 'msg-8',
    senderId: 'u5',
    senderName: 'Alex Rivera',
    content: 'Does anyone have experience with the new Zustand v5 middleware? Having some issues with persist.',
    timestamp: now - 12 * min,
    type: 'text',
  },
  {
    id: 'msg-9',
    senderId: 'u7',
    senderName: 'Priya Sharma',
    content: 'Yeah, there is a breaking change in the persist API. Check the migration guide: https://docs.pmnd.rs/zustand/migrations',
    timestamp: now - 10 * min,
    type: 'text',
    reactions: [{ emoji: '🙏', users: ['u5'] }],
  },
  {
    id: 'msg-10',
    senderId: 'u2',
    senderName: 'Sarah Chen',
    content: 'Quick update: the staging deploy is green. All auth tests passing. Ready for QA!',
    timestamp: now - 5 * min,
    type: 'text',
    reactions: [
      { emoji: '🚀', users: ['u3', 'u5', 'u7'] },
      { emoji: '✅', users: ['u3'] },
    ],
  },
  {
    id: 'msg-11',
    senderId: 'u3',
    senderName: 'Marcus Johnson',
    content: 'Awesome! I will kick off the smoke tests now.',
    timestamp: now - 3 * min,
    type: 'text',
  },
];

const DEMO_ENGINEERING_MESSAGES: ChatMessage[] = [
  {
    id: 'eng-1',
    senderId: 'u3',
    senderName: 'Marcus Johnson',
    content: 'Proposed schema changes for the real-time sync feature are in the RFC doc.',
    timestamp: now - 60 * min,
    type: 'text',
  },
  {
    id: 'eng-2',
    senderId: 'u5',
    senderName: 'Alex Rivera',
    content: 'Looks solid. One concern: should we use WebSockets or SSE for the event stream?',
    timestamp: now - 55 * min,
    type: 'text',
  },
  {
    id: 'eng-3',
    senderId: 'u7',
    senderName: 'Priya Sharma',
    content: 'WebSockets give us bidirectional communication, which we need for collaborative editing.',
    timestamp: now - 50 * min,
    type: 'text',
    reactions: [{ emoji: '💯', users: ['u3'] }],
  },
];

const DEMO_DESIGN_MESSAGES: ChatMessage[] = [
  {
    id: 'des-1',
    senderId: 'u4',
    senderName: 'Emily Park',
    content: 'New component library v2 preview is live. Feedback welcome!',
    timestamp: now - 90 * min,
    type: 'text',
  },
  {
    id: 'des-2',
    senderId: 'u6',
    senderName: 'Jordan Lee',
    content: 'The new button variants look great. Love the teal accent.',
    timestamp: now - 85 * min,
    type: 'text',
    reactions: [{ emoji: '💚', users: ['u4'] }],
  },
];

const DEMO_DM_MESSAGES: ChatMessage[] = [
  {
    id: 'dm-1',
    senderId: 'u2',
    senderName: 'Sarah Chen',
    content: 'Hey, do you have a minute to chat about the API design?',
    timestamp: now - 15 * min,
    type: 'text',
  },
  {
    id: 'dm-2',
    senderId: 'u1',
    senderName: 'You',
    content: 'Sure! What is on your mind?',
    timestamp: now - 14 * min,
    type: 'text',
  },
  {
    id: 'dm-3',
    senderId: 'u2',
    senderName: 'Sarah Chen',
    content: 'I was thinking we should add rate limiting to the public endpoints before the launch.',
    timestamp: now - 13 * min,
    type: 'text',
  },
];

const CHANNELS: ChatChannel[] = [
  {
    id: 'ch-general',
    name: 'general',
    type: 'general',
    unreadCount: 3,
    lastMessage: DEMO_GENERAL_MESSAGES[DEMO_GENERAL_MESSAGES.length - 1],
    members: MEMBERS,
  },
  {
    id: 'ch-engineering',
    name: 'engineering',
    type: 'project',
    unreadCount: 2,
    lastMessage: DEMO_ENGINEERING_MESSAGES[DEMO_ENGINEERING_MESSAGES.length - 1],
    members: [MEMBERS[0], MEMBERS[2], MEMBERS[4], MEMBERS[6]],
  },
  {
    id: 'ch-design',
    name: 'design',
    type: 'project',
    unreadCount: 0,
    lastMessage: DEMO_DESIGN_MESSAGES[DEMO_DESIGN_MESSAGES.length - 1],
    members: [MEMBERS[0], MEMBERS[3], MEMBERS[5]],
  },
  {
    id: 'ch-dm-sarah',
    name: 'Sarah Chen',
    type: 'direct',
    unreadCount: 0,
    lastMessage: DEMO_DM_MESSAGES[DEMO_DM_MESSAGES.length - 1],
    members: [MEMBERS[0], MEMBERS[1]],
  },
  {
    id: 'ch-dm-marcus',
    name: 'Marcus Johnson',
    type: 'direct',
    unreadCount: 0,
    lastMessage: undefined,
    members: [MEMBERS[0], MEMBERS[2]],
  },
];

// ─── Store ────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  channels: CHANNELS,
  activeChannelId: 'ch-general',
  messagesByChannel: {
    'ch-general': DEMO_GENERAL_MESSAGES,
    'ch-engineering': DEMO_ENGINEERING_MESSAGES,
    'ch-design': DEMO_DESIGN_MESSAGES,
    'ch-dm-sarah': DEMO_DM_MESSAGES,
    'ch-dm-marcus': [],
  },
  typingUsers: {
    'ch-general': ['Emily Park'],
  },

  sendMessage: (channelId, content, type = 'text') => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'u1',
      senderName: 'You',
      content,
      timestamp: Date.now(),
      type,
      reactions: [],
    };
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: [...(state.messagesByChannel[channelId] ?? []), msg],
      },
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, lastMessage: msg } : ch
      ),
    }));
  },

  switchChannel: (channelId) => {
    set({ activeChannelId: channelId });
    get().markAsRead(channelId);
  },

  markAsRead: (channelId) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: 0 } : ch
      ),
    }));
  },

  addReaction: (channelId, messageId, emoji, userId) => {
    set((state) => {
      const messages = state.messagesByChannel[channelId] ?? [];
      const updatedMessages = messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = msg.reactions ? [...msg.reactions] : [];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing) {
          if (existing.users.includes(userId)) {
            existing.users = existing.users.filter((u) => u !== userId);
            if (existing.users.length === 0) {
              return { ...msg, reactions: reactions.filter((r) => r.emoji !== emoji) };
            }
          } else {
            existing.users = [...existing.users, userId];
          }
          return { ...msg, reactions: [...reactions] };
        }
        return { ...msg, reactions: [...reactions, { emoji, users: [userId] }] };
      });
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updatedMessages,
        },
      };
    });
  },
}));
