'use client';

import { create } from 'zustand';
import { api } from '@/lib/api-client';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: { model?: string; tokens?: number; agentType?: string };
}

interface AgentExecution {
  id: string;
  agentType: string;
  goal: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: { action: string; result: string; timestamp: number }[];
  result?: string;
  startedAt: number;
  completedAt?: number;
}

interface AIState {
  messages: AIMessage[];
  isStreaming: boolean;
  currentStreamContent: string;
  activeAgents: AgentExecution[];
  sidebarOpen: boolean;

  sendMessage: (content: string, context?: Record<string, unknown>) => Promise<void>;
  clearMessages: () => void;
  toggleSidebar: () => void;
  runAgent: (type: string, goal: string, context?: Record<string, unknown>) => Promise<AgentExecution>;
  cancelAgent: (executionId: string) => Promise<void>;
}

export const useAIStore = create<AIState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentStreamContent: '',
  activeAgents: [],
  sidebarOpen: false,

  sendMessage: async (content, context) => {
    const userMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      currentStreamContent: '',
    }));

    try {
      let fullContent = '';
      const stream = api.stream('/ai/chat', {
        messages: [...get().messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content }],
        context,
      });

      for await (const chunk of stream) {
        try {
          const parsed = JSON.parse(chunk);
          if (parsed.content) {
            fullContent += parsed.content;
            set({ currentStreamContent: fullContent });
          }
        } catch {
          fullContent += chunk;
          set({ currentStreamContent: fullContent });
        }
      }

      const assistantMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isStreaming: false,
        currentStreamContent: '',
      }));
    } catch (error) {
      const errorMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, errorMessage],
        isStreaming: false,
        currentStreamContent: '',
      }));
    }
  },

  clearMessages: () => set({ messages: [], currentStreamContent: '' }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  runAgent: async (type, goal, context) => {
    const execution = await api.post<AgentExecution>('/ai/agents/run', { type, goal, context });
    set((state) => ({
      activeAgents: [...state.activeAgents, execution],
    }));
    return execution;
  },

  cancelAgent: async (executionId) => {
    await api.post(`/ai/agents/${executionId}/cancel`);
    set((state) => ({
      activeAgents: state.activeAgents.map((a) =>
        a.id === executionId ? { ...a, status: 'cancelled' as const } : a
      ),
    }));
  },
}));
