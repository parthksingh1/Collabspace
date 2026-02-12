'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Code2, PenTool, FolderKanban, LayoutDashboard, Settings,
  ChevronLeft, ChevronRight, Plus, Search, Sparkles,
  Users, BarChart3, ChevronsUpDown, MessageCircle,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAIStore } from '@/stores/ai-store';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const mainNavItems: { href: string; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/code', label: 'Code', icon: Code2 },
  { href: '/boards', label: 'Whiteboard', icon: PenTool },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/chat', label: 'Chat', icon: MessageCircle, badge: 5 },
];

const bottomNavItems = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspaceStore();
  const { user } = useAuthStore();
  const { toggleSidebar: toggleAI } = useAIStore();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'flex flex-col bg-white border-r border-surface-200 transition-all duration-200 ease-out',
        'dark:bg-surface-950 dark:border-surface-800',
        collapsed ? 'w-[60px]' : 'w-[248px]'
      )}
    >
      {/* Workspace Selector */}
      <div className={cn('flex items-center h-[var(--header-height)] border-b border-surface-200 dark:border-surface-800', collapsed ? 'justify-center px-2' : 'px-3')}>
        <button className={cn(
          'flex items-center gap-2.5 rounded-lg transition-colors w-full',
          !collapsed && 'hover:bg-surface-50 dark:hover:bg-surface-900 px-2 py-1.5'
        )}>
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
      </div>

      {/* Search + AI */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 space-y-1">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg border border-surface-200 bg-surface-50 px-2.5 py-[7px] text-[13px] text-surface-400 transition-colors hover:border-surface-300 hover:bg-surface-100 dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700"
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="rounded bg-surface-200/80 px-1.5 py-0.5 text-2xs font-mono text-surface-400 dark:bg-surface-800">
              Ctrl K
            </kbd>
          </button>
        </div>
      )}

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        <div className="space-y-px">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  active ? 'sidebar-item-active' : 'sidebar-item',
                  collapsed && 'justify-center px-0'
                )}
                title={collapsed ? item.label : undefined}
              >
                <div className="relative shrink-0">
                  <Icon className={cn('h-[18px] w-[18px]', active ? 'text-brand-600 dark:text-brand-400' : '')} />
                  {item.badge != null && item.badge > 0 && collapsed && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Workspaces Section */}
        {!collapsed && workspaces.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-2xs font-semibold uppercase tracking-widest text-surface-400">
                Workspaces
              </span>
              <button className="rounded p-0.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-px">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => setCurrentWorkspace(ws)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-[6px] text-[13px] transition-colors text-left',
                    currentWorkspace?.id === ws.id
                      ? 'bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-white'
                      : 'text-surface-500 hover:bg-surface-50 hover:text-surface-700 dark:hover:bg-surface-800/50 dark:hover:text-surface-300'
                  )}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-200 text-2xs font-bold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                    {ws.name[0].toUpperCase()}
                  </div>
                  <span className="truncate">{ws.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Quick Access */}
        {!collapsed && (
          <div className="mt-6 px-2">
            <button
              onClick={toggleAI}
              className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2.5 text-[13px] text-brand-700 transition-all hover:bg-brand-50 hover:border-brand-400 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-400 dark:hover:bg-brand-950/50"
            >
              <Sparkles className="h-4 w-4" />
              <div className="flex-1 text-left">
                <span className="font-medium">AI Assistant</span>
                <p className="text-2xs text-brand-600/70 dark:text-brand-400/60 mt-0.5">Ask anything or run agents</p>
              </div>
            </button>
          </div>
        )}
      </nav>

      {/* Bottom Nav */}
      <div className="border-t border-surface-200 dark:border-surface-800 px-2 py-2">
        <div className="space-y-px">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  active ? 'sidebar-item-active' : 'sidebar-item',
                  collapsed && 'justify-center px-0'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <button
          onClick={onToggle}
          className="mt-1 flex w-full items-center justify-center rounded-lg py-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors dark:hover:bg-surface-800"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
