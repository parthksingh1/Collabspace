'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronsUpDown, Check, Plus, Settings, Search, Building2, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '@/stores/auth-store';

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspaceStore();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = workspaces.filter((w) =>
    w.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2.5 rounded-lg transition-colors w-full',
          !collapsed && 'hover:bg-surface-50 dark:hover:bg-surface-900 px-2 py-1.5',
          collapsed && 'justify-center p-1.5 hover:bg-surface-100 dark:hover:bg-surface-800'
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-900 dark:bg-surface-100">
          <span className="text-xs font-bold text-white dark:text-surface-900">
            {currentWorkspace?.name?.[0]?.toUpperCase() || 'C'}
          </span>
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">
                {currentWorkspace?.name || 'CollabSpace'}
              </p>
              <p className="text-2xs text-surface-400 truncate">{user?.email}</p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-surface-400 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-overlay dark:border-surface-700 dark:bg-surface-900 animate-slide-down',
            collapsed ? 'left-full ml-2 top-0' : 'left-0 right-0'
          )}
        >
          {/* Search */}
          <div className="border-b border-surface-200 p-2 dark:border-surface-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find workspace..."
                className="input pl-8 py-1 text-xs w-full"
              />
            </div>
          </div>

          {/* Workspace list */}
          <div className="max-h-64 overflow-y-auto scrollbar-thin py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-surface-500">No matching workspace.</p>
            ) : (
              filtered.map((ws) => {
                const active = currentWorkspace?.id === ws.id;
                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setCurrentWorkspace(ws);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-100 dark:hover:bg-surface-800',
                      active && 'bg-surface-50 dark:bg-surface-800/60'
                    )}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-200 text-2xs font-bold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {ws.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-surface-900 dark:text-white">
                        {ws.name}
                      </p>
                      <p className="truncate text-2xs text-surface-500 capitalize">
                        {ws.visibility}
                      </p>
                    </div>
                    {active && <Check className="h-3.5 w-3.5 text-brand-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Quick actions */}
          <div className="border-t border-surface-200 p-1 dark:border-surface-700">
            <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs text-surface-600 transition-colors hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800">
              <Plus className="h-3.5 w-3.5" /> Create workspace
            </button>
            <Link
              href="/team"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs text-surface-600 transition-colors hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
            >
              <Building2 className="h-3.5 w-3.5" /> Manage members
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs text-surface-600 transition-colors hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
            >
              <Settings className="h-3.5 w-3.5" /> Workspace settings
            </Link>
            <Link
              href="/billing"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/30"
            >
              <Sparkles className="h-3.5 w-3.5" /> Upgrade plan
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
