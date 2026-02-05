'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { AISidebar } from '@/components/ai/ai-sidebar';
import { CommandPalette } from '@/components/ai/command-palette';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAIStore } from '@/stores/ai-store';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { fetchWorkspaces } = useWorkspaceStore();
  const { sidebarOpen: aiSidebarOpen } = useAIStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait a tick for Zustand to rehydrate persisted auth state
    const timer = setTimeout(() => {
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchWorkspaces();
  }, [ready, isAuthenticated, router, fetchWorkspaces]);

  // While rehydrating, show a brief loading state (not a redirect)
  if (!ready || !isAuthenticated || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <span className="text-surface-500">Loading workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-950">
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto scrollbar-thin">
          <div className="mx-auto max-w-[1600px] p-6">{children}</div>
        </main>
      </div>

      {/* AI Sidebar */}
      {aiSidebarOpen && <AISidebar />}

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette />
    </div>
  );
}
