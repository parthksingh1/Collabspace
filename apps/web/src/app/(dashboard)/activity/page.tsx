'use client';

import { useMemo, useState } from 'react';
import {
  FileText, PenTool, FolderKanban, Code2, MessageCircle, GitCommit,
  UserPlus, Trash2, Edit3, Check, AtSign, Calendar, Filter,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

type Scope = 'all' | 'docs' | 'boards' | 'code' | 'projects' | 'chat';
type EventType =
  | 'doc.edited' | 'doc.created' | 'doc.commented'
  | 'board.updated' | 'board.created'
  | 'code.pushed' | 'code.reviewed'
  | 'task.completed' | 'task.assigned' | 'task.created'
  | 'chat.mention'
  | 'member.joined';

type Event = {
  id: string;
  type: EventType;
  actor: { name: string; email: string };
  target: string;
  context?: string;
  timestamp: string;
  scope: Exclude<Scope, 'all'>;
};

const MOCK_EVENTS: Event[] = [
  { id: '1', type: 'doc.edited', actor: { name: 'Sarah Lin', email: 'sarah@co.io' }, target: 'API Architecture v2', context: 'Added authentication flow section', timestamp: '2m ago', scope: 'docs' },
  { id: '2', type: 'task.completed', actor: { name: 'Alex Ramirez', email: 'alex@co.io' }, target: 'CS-142 · Implement auth middleware', timestamp: '12m ago', scope: 'projects' },
  { id: '3', type: 'chat.mention', actor: { name: 'Priya Desai', email: 'priya@co.io' }, target: 'You', context: 'in #engineering — "can you review?"', timestamp: '18m ago', scope: 'chat' },
  { id: '4', type: 'code.pushed', actor: { name: 'Jordan Wu', email: 'jordan@co.io' }, target: 'feat/rate-limiter', context: '3 files changed · +127 / -41', timestamp: '24m ago', scope: 'code' },
  { id: '5', type: 'board.updated', actor: { name: 'Sarah Lin', email: 'sarah@co.io' }, target: 'System Design Whiteboard', context: '8 new elements', timestamp: '41m ago', scope: 'boards' },
  { id: '6', type: 'task.assigned', actor: { name: 'Marcus Okoye', email: 'marcus@co.io' }, target: 'CS-145 · Add audit logs', context: 'Assigned to you', timestamp: '1h ago', scope: 'projects' },
  { id: '7', type: 'doc.commented', actor: { name: 'Liam Chen', email: 'liam@co.io' }, target: 'Q2 Planning Doc', context: '\u201cShould we split this into two sprints?\u201d', timestamp: '2h ago', scope: 'docs' },
  { id: '8', type: 'code.reviewed', actor: { name: 'Alex Ramirez', email: 'alex@co.io' }, target: 'PR #342 · Rate limit persistence', context: 'Approved with 2 suggestions', timestamp: '3h ago', scope: 'code' },
  { id: '9', type: 'member.joined', actor: { name: 'Nina Patel', email: 'nina@co.io' }, target: 'CollabSpace Inc.', context: 'Joined as Engineer', timestamp: '5h ago', scope: 'projects' },
  { id: '10', type: 'doc.created', actor: { name: 'Sarah Lin', email: 'sarah@co.io' }, target: 'Onboarding Runbook', timestamp: 'Yesterday', scope: 'docs' },
  { id: '11', type: 'board.created', actor: { name: 'Priya Desai', email: 'priya@co.io' }, target: 'User Journey Map', timestamp: 'Yesterday', scope: 'boards' },
  { id: '12', type: 'task.created', actor: { name: 'Jordan Wu', email: 'jordan@co.io' }, target: 'CS-148 · Billing webhook handler', timestamp: 'Yesterday', scope: 'projects' },
  { id: '13', type: 'code.pushed', actor: { name: 'Marcus Okoye', email: 'marcus@co.io' }, target: 'main', context: 'v2.1.4 released · 12 commits', timestamp: '2 days ago', scope: 'code' },
  { id: '14', type: 'doc.edited', actor: { name: 'Liam Chen', email: 'liam@co.io' }, target: 'Security Playbook', context: 'Updated incident response steps', timestamp: '2 days ago', scope: 'docs' },
];

const ICONS: Record<EventType, { icon: typeof FileText; color: string }> = {
  'doc.edited': { icon: Edit3, color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  'doc.created': { icon: FileText, color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  'doc.commented': { icon: MessageCircle, color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  'board.updated': { icon: PenTool, color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
  'board.created': { icon: PenTool, color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
  'code.pushed': { icon: GitCommit, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  'code.reviewed': { icon: Code2, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  'task.completed': { icon: Check, color: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  'task.assigned': { icon: UserPlus, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  'task.created': { icon: FolderKanban, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  'chat.mention': { icon: AtSign, color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  'member.joined': { icon: UserPlus, color: 'bg-info-500/10 text-info-600 dark:text-info-400' },
};

const VERBS: Record<EventType, string> = {
  'doc.edited': 'edited',
  'doc.created': 'created document',
  'doc.commented': 'commented on',
  'board.updated': 'updated',
  'board.created': 'created board',
  'code.pushed': 'pushed to',
  'code.reviewed': 'reviewed',
  'task.completed': 'completed',
  'task.assigned': 'assigned',
  'task.created': 'created task',
  'chat.mention': 'mentioned',
  'member.joined': 'joined',
};

const SCOPES: { id: Scope; label: string; icon: typeof FileText }[] = [
  { id: 'all', label: 'All', icon: Filter },
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'boards', label: 'Boards', icon: PenTool },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
];

export default function ActivityPage() {
  const [scope, setScope] = useState<Scope>('all');

  const filtered = useMemo(
    () => MOCK_EVENTS.filter((e) => scope === 'all' || e.scope === scope),
    [scope]
  );

  // Group by time window
  const groups = useMemo(() => {
    const today: Event[] = [];
    const yesterday: Event[] = [];
    const earlier: Event[] = [];
    for (const e of filtered) {
      if (/ago$/.test(e.timestamp)) today.push(e);
      else if (e.timestamp === 'Yesterday') yesterday.push(e);
      else earlier.push(e);
    }
    return { today, yesterday, earlier };
  }, [filtered]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Activity</h1>
        <p className="mt-1 text-sm text-surface-500">
          Everything happening across your workspace — filter by scope or jump to the source.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 border-b border-surface-200 pb-4 dark:border-surface-700">
        {SCOPES.map((s) => {
          const Icon = s.icon;
          const active = scope === s.id;
          const count = s.id === 'all' ? MOCK_EVENTS.length : MOCK_EVENTS.filter((e) => e.scope === s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
              <span className={cn('rounded-full px-1.5 text-2xs tabular-nums', active ? 'bg-white/20' : 'bg-surface-200 dark:bg-surface-700')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {groups.today.length > 0 && (
          <ActivitySection title="Today" events={groups.today} />
        )}
        {groups.yesterday.length > 0 && (
          <ActivitySection title="Yesterday" events={groups.yesterday} />
        )}
        {groups.earlier.length > 0 && (
          <ActivitySection title="Earlier this week" events={groups.earlier} />
        )}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-surface-300 p-12 text-center dark:border-surface-700">
            <p className="text-sm text-surface-500">No activity in this scope yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivitySection({ title, events }: { title: string; events: Event[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="h-3.5 w-3.5 text-surface-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400">{title}</h2>
      </div>
      <ul className="relative space-y-0">
        <span className="absolute left-[18px] top-4 bottom-4 w-px bg-surface-200 dark:bg-surface-800" aria-hidden />
        {events.map((e) => {
          const meta = ICONS[e.type];
          const Icon = meta.icon;
          return (
            <li key={e.id} className="relative flex items-start gap-3 py-3 pl-0">
              <div className={cn('relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-surface-50 dark:ring-surface-950', meta.color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 rounded-lg px-3 py-2 hover:bg-surface-100/60 dark:hover:bg-surface-800/40 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-surface-700 dark:text-surface-300 leading-snug">
                    <span className="font-medium text-surface-900 dark:text-white">{e.actor.name}</span>{' '}
                    <span className="text-surface-500">{VERBS[e.type]}</span>{' '}
                    <span className="font-medium text-surface-900 dark:text-white">{e.target}</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[9px] font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {getInitials(e.actor.name)}
                    </div>
                    <span className="text-2xs text-surface-400 whitespace-nowrap">{e.timestamp}</span>
                  </div>
                </div>
                {e.context && (
                  <p className="mt-0.5 text-xs text-surface-500 dark:text-surface-400 leading-relaxed truncate">
                    {e.context}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
