'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, PenTool, Users, Loader2, X } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';

interface Board {
  id: string;
  title: string;
  thumbnailUrl?: string;
  updatedAt: string;
  collaboratorCount: number;
}

export default function BoardsPage() {
  const { currentWorkspace } = useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { data: boards = [], isLoading } = useQuery<Board[]>({
    queryKey: ['boards', currentWorkspace?.id],
    queryFn: () => api.get(`/boards?workspaceId=${currentWorkspace?.id}`),
    enabled: !!currentWorkspace?.id,
  });

  const filtered = boards.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()));

  // Static preview boards for demo
  const demoBoards: Board[] = [
    { id: 'b1', title: 'System Architecture', updatedAt: '2026-04-13T03:00:00Z', collaboratorCount: 4 },
    { id: 'b2', title: 'UI Wireframes v2', updatedAt: '2026-04-12T18:00:00Z', collaboratorCount: 2 },
    { id: 'b3', title: 'Sprint Retrospective', updatedAt: '2026-04-11T10:00:00Z', collaboratorCount: 6 },
    { id: 'b4', title: 'Database Schema Design', updatedAt: '2026-04-10T08:00:00Z', collaboratorCount: 3 },
  ];

  const displayBoards = filtered.length > 0 ? filtered : demoBoards;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Whiteboards</h1>
          <p className="mt-1 text-sm text-surface-500">Infinite canvas for visual collaboration.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary gap-2 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> New Board
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md animate-scale-in rounded-2xl border border-surface-200 bg-white p-6 shadow-elevated dark:border-surface-700 dark:bg-surface-900 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Create Whiteboard</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="input"
              placeholder="Board title..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
              <button className="btn-primary px-4 py-2 text-sm">Create Board</button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mt-6 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
          placeholder="Search boards..."
        />
      </div>

      {/* Board Grid */}
      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayBoards.map((board) => (
            <Link key={board.id} href={`/boards/${board.id}`}>
              <div className="card-hover group overflow-hidden cursor-pointer">
                {/* Thumbnail / Placeholder */}
                <div className="relative h-40 bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-800 dark:to-surface-850 flex items-center justify-center overflow-hidden">
                  <PenTool className="h-12 w-12 text-surface-300 dark:text-surface-600 group-hover:text-brand-400 transition-colors" />
                  {/* Decorative geometric shapes */}
                  <div className="absolute top-4 left-4 h-8 w-16 rounded border-2 border-surface-200/60 dark:border-surface-600/40" />
                  <div className="absolute bottom-6 right-6 h-6 w-6 rounded-full border-2 border-surface-200/60 dark:border-surface-600/40" />
                  <div className="absolute top-8 right-8 h-12 w-0.5 bg-surface-200/60 dark:bg-surface-600/40 rotate-45" />
                  <div className="absolute bottom-4 left-10 h-4 w-10 rounded-sm border-2 border-dashed border-surface-200/50 dark:border-surface-600/30" />
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-sm text-surface-900 dark:text-white truncate">{board.title}</h3>
                  <div className="mt-2 flex items-center justify-between text-xs text-surface-500">
                    <span>{formatRelativeTime(board.updatedAt)}</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {board.collaboratorCount}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && displayBoards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800">
            <PenTool className="h-10 w-10 text-surface-300 dark:text-surface-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-surface-900 dark:text-white">No whiteboards yet</h3>
          <p className="mt-1.5 max-w-sm text-sm text-surface-500">
            Create your first whiteboard to start sketching ideas with your team.
          </p>
        </div>
      )}
    </div>
  );
}
