'use client';

import { useState } from 'react';
import {
  Bell, MessageSquare, UserPlus, GitPullRequest, AlertCircle,
  Sparkles, FolderKanban, Trash2,
  CheckCheck, FileText,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'comment' | 'mention' | 'assignment' | 'status_change' | 'invitation' | 'ai_suggestion' | 'system';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
}

const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  comment: { icon: MessageSquare, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950' },
  mention: { icon: FileText, color: 'text-brand-500 bg-brand-50 dark:bg-brand-950' },
  assignment: { icon: FolderKanban, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950' },
  status_change: { icon: GitPullRequest, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950' },
  invitation: { icon: UserPlus, color: 'text-brand-500 bg-brand-50 dark:bg-brand-950' },
  ai_suggestion: { icon: Sparkles, color: 'text-brand-500 bg-brand-50 dark:bg-brand-950' },
  system: { icon: AlertCircle, color: 'text-surface-500 bg-surface-100 dark:bg-surface-800' },
};

const mockNotifications: Notification[] = [
  { id: '1', type: 'comment', title: 'Sarah Chen commented', body: 'Great analysis on the API architecture doc! I have a few suggestions for the caching layer.', read: false, createdAt: '2026-04-13T04:30:00Z' },
  { id: '2', type: 'assignment', title: 'Task assigned to you', body: 'PROJ-42: Implement WebSocket sharding strategy', read: false, createdAt: '2026-04-13T03:15:00Z' },
  { id: '3', type: 'ai_suggestion', title: 'AI Sprint Suggestion', body: 'Based on team velocity, consider moving PROJ-45 to the next sprint.', read: false, createdAt: '2026-04-13T02:00:00Z' },
  { id: '4', type: 'mention', title: 'Alex mentioned you', body: '@parth can you review the CRDT integration PR?', read: true, createdAt: '2026-04-12T18:00:00Z' },
  { id: '5', type: 'status_change', title: 'Sprint completed', body: 'Sprint "v2.0" completed with 34/38 tasks done.', read: true, createdAt: '2026-04-12T15:00:00Z' },
  { id: '6', type: 'invitation', title: 'New member joined', body: 'Taylor Brooks accepted your invitation and joined the workspace.', read: true, createdAt: '2026-04-12T10:00:00Z' },
  { id: '7', type: 'system', title: 'System update', body: 'CollabSpace v2.1 deployed with improved real-time performance.', read: true, createdAt: '2026-04-11T08:00:00Z' },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Group by date
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const groups: { label: string; items: Notification[] }[] = [];
  const todayItems = filtered.filter((n) => new Date(n.createdAt).toDateString() === today);
  const yesterdayItems = filtered.filter((n) => new Date(n.createdAt).toDateString() === yesterday);
  const olderItems = filtered.filter((n) => {
    const d = new Date(n.createdAt).toDateString();
    return d !== today && d !== yesterday;
  });

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-surface-500">{unreadCount} unread notifications.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="btn-ghost gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-surface-200 dark:border-surface-700">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            filter === 'all'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
          )}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
            filter === 'unread'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
          )}
        >
          Unread
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-2xs font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification List */}
      <div className="mt-4 space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="text-2xs font-medium uppercase tracking-wider text-surface-400 mb-2">{group.label}</h3>
            <div className="space-y-1">
              {group.items.map((notif) => {
                const config = typeConfig[notif.type] || typeConfig.system;
                const Icon = config.icon;
                return (
                  <div
                    key={notif.id}
                    onClick={() => markAsRead(notif.id)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl p-4 transition-colors cursor-pointer',
                      notif.read
                        ? 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
                        : 'bg-brand-50/40 hover:bg-brand-50/60 dark:bg-brand-950/20 dark:hover:bg-brand-950/30'
                    )}
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', config.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm text-surface-900 dark:text-white', !notif.read && 'font-semibold')}>{notif.title}</p>
                        {!notif.read && <span className="h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
                      </div>
                      <p className="mt-0.5 text-sm text-surface-500 line-clamp-2">{notif.body}</p>
                      <p className="mt-1 text-xs text-surface-400">{formatRelativeTime(notif.createdAt)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                      className="shrink-0 rounded-lg p-1.5 text-surface-400 opacity-0 group-hover:opacity-100 hover:bg-surface-200 hover:text-danger-500 transition-all dark:hover:bg-surface-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Bell className="mx-auto h-12 w-12 text-surface-300 dark:text-surface-600" />
            <p className="mt-3 text-sm text-surface-500">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
