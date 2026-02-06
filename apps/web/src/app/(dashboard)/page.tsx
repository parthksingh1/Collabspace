'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText, Code2, PenTool, FolderKanban, Plus,
  Clock, TrendingUp, Sparkles, ArrowRight, Users,
  CheckCircle2, AlertCircle, ArrowUpRight, Zap,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

/* ---------- Demo data ---------- */

const quickActions = [
  { label: 'Document', href: '/documents', icon: FileText, desc: 'Rich text editor' },
  { label: 'Code File', href: '/code', icon: Code2, desc: 'Collaborative IDE' },
  { label: 'Whiteboard', href: '/boards', icon: PenTool, desc: 'Infinite canvas' },
  { label: 'Project', href: '/projects', icon: FolderKanban, desc: 'Task boards' },
];

const recentItems = [
  { type: 'document', title: 'API Architecture Design', href: '/documents/demo-1', updatedAt: '2026-04-13T04:30:00Z', collaborators: 3, status: 'active' },
  { type: 'code', title: 'auth-middleware.ts', href: '/code/demo-1', updatedAt: '2026-04-13T03:45:00Z', collaborators: 1, status: 'active' },
  { type: 'board', title: 'System Design Whiteboard', href: '/boards/demo-1', updatedAt: '2026-04-13T02:00:00Z', collaborators: 5, status: 'idle' },
  { type: 'document', title: 'Sprint v2.1 Planning', href: '/documents/demo-2', updatedAt: '2026-04-12T18:00:00Z', collaborators: 4, status: 'idle' },
  { type: 'code', title: 'websocket-gateway.ts', href: '/code/demo-2', updatedAt: '2026-04-12T15:00:00Z', collaborators: 2, status: 'idle' },
];

const myTasks = [
  { key: 'CS-42', title: 'Implement WebSocket sharding', priority: 'high', status: 'in_progress' },
  { key: 'CS-38', title: 'Add rate limiting to API gateway', priority: 'critical', status: 'review' },
  { key: 'CS-55', title: 'Set up Kafka consumers', priority: 'medium', status: 'todo' },
  { key: 'CS-61', title: 'Write load testing scenarios', priority: 'low', status: 'todo' },
];

const aiInsights = [
  { text: 'CS-38 has been in review for 3 days. Consider following up with the reviewer.', type: 'action' as const, icon: AlertCircle },
  { text: 'Sprint v2.1 is on track -- 82% completion probability by April 18.', type: 'insight' as const, icon: TrendingUp },
  { text: '3 unresolved comments on "API Architecture". Review before design meeting.', type: 'reminder' as const, icon: Clock },
];

const collaborators = [
  { name: 'Sarah Lin', initials: 'SL', color: 'bg-brand-500', status: 'Editing API Architecture' },
  { name: 'James Ruiz', initials: 'JR', color: 'bg-blue-500', status: 'In code review' },
  { name: 'Maria Kim', initials: 'MK', color: 'bg-emerald-500', status: 'On whiteboard' },
  { name: 'Alex Reed', initials: 'AR', color: 'bg-amber-500', status: 'Viewing tasks' },
  { name: 'Chris Patel', initials: 'CP', color: 'bg-red-500', status: 'Idle' },
];

const stats = [
  { label: 'Documents', value: 12, icon: FileText, href: '/documents' },
  { label: 'Code Files', value: 8, icon: Code2, href: '/code' },
  { label: 'Boards', value: 5, icon: PenTool, href: '/boards' },
  { label: 'Tasks', value: 42, icon: FolderKanban, href: '/projects' },
];

const priorityConfig: Record<string, { dot: string; border: string }> = {
  critical: { dot: 'bg-red-500', border: 'border-l-red-500' },
  high: { dot: 'bg-orange-500', border: 'border-l-orange-500' },
  medium: { dot: 'bg-blue-500', border: 'border-l-blue-500' },
  low: { dot: 'bg-surface-400', border: 'border-l-surface-300' },
};

const typeIcons: Record<string, typeof FileText> = {
  document: FileText, code: Code2, board: PenTool, task: FolderKanban,
};

const statusStyles: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  todo: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
};

/* ---------- Helpers ---------- */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const SPRINT_DONE = 28;
const SPRINT_TOTAL = 42;
const SPRINT_PCT = Math.round((SPRINT_DONE / SPRINT_TOTAL) * 100);

/* ---------- Component ---------- */

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-white">
          {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}
        </h1>
        <p className="mt-1 text-sm text-surface-500">Here&apos;s what&apos;s happening in your workspace.</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <div className="card-hover group p-4 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-100 text-surface-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600 dark:bg-surface-800 dark:text-surface-400 dark:group-hover:bg-brand-950 dark:group-hover:text-brand-400">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <span className="text-2xl font-semibold text-surface-900 dark:text-white">{stat.value}</span>
                </div>
                <p className="text-sm text-surface-500">{stat.label}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} href={action.href}>
              <div className="card-hover group p-4 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-100 text-surface-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600 dark:bg-surface-800 dark:text-surface-400 dark:group-hover:bg-brand-950 dark:group-hover:text-brand-400">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <Plus className="h-4 w-4 text-surface-300 transition-colors group-hover:text-brand-500 dark:text-surface-600" />
                </div>
                <p className="text-sm font-medium text-surface-900 dark:text-white">New {action.label}</p>
                <p className="text-xs text-surface-400 mt-0.5">{action.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Sprint Progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-semibold text-surface-900 dark:text-white">Sprint v2.1 Progress</h2>
            <span className="badge-brand text-2xs">Active</span>
          </div>
          <span className="text-sm font-medium text-surface-900 dark:text-white">
            {SPRINT_DONE}/{SPRINT_TOTAL} tasks
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
            style={{ width: `${SPRINT_PCT}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-surface-400">
            {SPRINT_TOTAL - SPRINT_DONE} tasks remaining
          </span>
          <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
            {SPRINT_PCT}% complete
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent Activity -- wider */}
        <div className="card p-0 lg:col-span-3 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-surface-400" />
              <h2 className="text-sm font-semibold text-surface-900 dark:text-white">Recent Activity</h2>
            </div>
            <Link href="/documents" className="text-xs font-medium text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {recentItems.map((item, i) => {
              const Icon = typeIcons[item.type] || FileText;
              return (
                <Link key={i} href={item.href}>
                  <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-50 cursor-pointer dark:hover:bg-surface-900/50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-800">
                      <Icon className="h-4 w-4 text-surface-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-800 dark:text-surface-200 truncate">{item.title}</p>
                      <p className="text-xs text-surface-400 mt-0.5">{formatRelativeTime(item.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'active' && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                      <div className="flex items-center gap-1 text-xs text-surface-400">
                        <Users className="h-3 w-3" /> {item.collaborators}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* My Tasks */}
        <div className="card p-0 lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-surface-400" />
              <h2 className="text-sm font-semibold text-surface-900 dark:text-white">My Tasks</h2>
              <span className="badge-neutral text-2xs">{myTasks.length}</span>
            </div>
            <Link href="/projects" className="text-xs font-medium text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 flex items-center gap-1 transition-colors">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {myTasks.map((task) => {
              const prio = priorityConfig[task.priority];
              return (
                <div key={task.key} className={cn('px-5 py-3 border-l-[3px] transition-colors hover:bg-surface-50 cursor-pointer dark:hover:bg-surface-900/50', prio.border)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xs font-mono text-surface-400">{task.key}</span>
                    <span className={cn('rounded-md px-1.5 py-0.5 text-2xs font-medium', statusStyles[task.status])}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-surface-800 dark:text-surface-200">{task.title}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Collaborators */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-surface-400" />
            <h2 className="text-sm font-semibold text-surface-900 dark:text-white">Active Collaborators</h2>
            <span className="badge-brand text-2xs">{collaborators.length} online</span>
          </div>
          <span className="text-xs text-surface-400">5 team members online</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {collaborators.map((person) => (
            <div
              key={person.name}
              className="flex items-center gap-3 rounded-xl border border-surface-200 p-3 transition-all hover:border-surface-300 hover:shadow-soft cursor-pointer dark:border-surface-800 dark:hover:border-surface-700"
            >
              <div className="relative shrink-0">
                <div
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center text-xs font-medium text-white',
                    person.color
                  )}
                >
                  {person.initials}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-surface-900" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                  {person.name}
                </p>
                <p className="text-2xs text-surface-400 truncate">{person.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/50">
            <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="text-sm font-semibold text-surface-900 dark:text-white">AI Insights</h2>
          <span className="badge-brand text-2xs">Powered by Gemini</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {aiInsights.map((insight, i) => {
            const Icon = insight.icon;
            return (
              <div
                key={i}
                className="group rounded-xl border border-surface-200 p-4 transition-all hover:border-surface-300 hover:shadow-soft cursor-pointer dark:border-surface-800 dark:hover:border-surface-700"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn(
                    'h-4 w-4',
                    insight.type === 'action' && 'text-amber-500',
                    insight.type === 'insight' && 'text-emerald-500',
                    insight.type === 'reminder' && 'text-blue-500',
                  )} />
                  <span className="text-2xs font-semibold uppercase tracking-wider text-surface-400 capitalize">{insight.type}</span>
                </div>
                <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">{insight.text}</p>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity dark:text-brand-400">
                  Take action <ArrowUpRight className="h-3 w-3" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
