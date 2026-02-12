'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, Search, Moon, Sun, Sparkles, Wifi, WifiOff,
  ChevronDown, LogOut, User, Settings, HelpCircle, ExternalLink,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useAIStore } from '@/stores/ai-store';
import { useTheme } from '@/lib/theme-context';
import { useWebSocket } from '@/lib/websocket-context';

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { toggleSidebar: toggleAI } = useAIStore();
  const { resolvedTheme, setTheme } = useTheme();
  const { connected, latency } = useWebSocket();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-surface-200 bg-white/80 backdrop-blur-md px-4 dark:border-surface-800 dark:bg-surface-950/80">
      {/* Left */}
      <div className="flex items-center">
        <button
          className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-400 transition-all hover:border-surface-300 hover:shadow-soft dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700"
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search or run a command...</span>
          <span className="sm:hidden">Search...</span>
          <kbd className="ml-3 hidden sm:inline rounded bg-surface-100 px-1.5 py-0.5 text-2xs font-mono text-surface-400 dark:bg-surface-800">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-0.5">
        {/* Connection indicator */}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
            connected ? 'text-success-700 dark:text-success-500' : 'text-danger-700 dark:text-danger-500'
          )}
          title={connected ? `Connected (${latency}ms)` : 'Reconnecting...'}
        >
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 animate-pulse" />}
          <span className="hidden md:inline">{connected ? `${latency}ms` : 'Offline'}</span>
        </div>

        <div className="mx-1 h-5 w-px bg-surface-200 dark:bg-surface-800" />

        {/* AI toggle */}
        <button
          onClick={toggleAI}
          className="btn-ghost rounded-lg p-2 text-brand-600 dark:text-brand-400"
          title="AI Assistant"
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </button>

        {/* Theme */}
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="btn-ghost rounded-lg p-2"
          title="Toggle theme"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-[18px] w-[18px] text-amber-400" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="btn-ghost relative rounded-lg p-2"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-600 text-2xs font-bold text-white ring-2 ring-white dark:ring-surface-950">
              3
            </span>
          </button>

          {notifOpen && (
            <div className="dropdown absolute right-0 top-full mt-2 w-80 z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
                <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Notifications</h3>
                <button className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin divide-y divide-surface-100 dark:divide-surface-800">
                {[
                  { title: 'Sarah commented on "API Design Doc"', time: '2m ago', read: false },
                  { title: 'Alex assigned you CS-42', time: '15m ago', read: false },
                  { title: 'Sprint "v2.1" starts tomorrow', time: '1h ago', read: false },
                ].map((notif, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-50 cursor-pointer dark:hover:bg-surface-800/50',
                      !notif.read && 'bg-brand-50/30 dark:bg-brand-950/10'
                    )}
                  >
                    {!notif.read && <div className="mt-1.5 status-dot bg-brand-500" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-700 dark:text-surface-300 leading-snug">{notif.title}</p>
                      <p className="mt-1 text-xs text-surface-400">{notif.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-surface-100 dark:border-surface-800 p-2">
                <button
                  onClick={() => { setNotifOpen(false); router.push('/notifications'); }}
                  className="w-full rounded-lg py-2 text-center text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors dark:hover:bg-surface-800"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mx-1 h-5 w-px bg-surface-200 dark:bg-surface-800" />

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
              {user ? getInitials(user.name) : '?'}
            </div>
            <ChevronDown className="h-3 w-3 text-surface-400" />
          </button>

          {profileOpen && (
            <div className="dropdown absolute right-0 top-full mt-2 w-56 z-50">
              <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
                <p className="text-sm font-medium text-surface-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-surface-400 truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { setProfileOpen(false); router.push('/settings/profile'); }} className="dropdown-item w-full">
                  <User className="h-4 w-4" /> Profile
                </button>
                <button onClick={() => { setProfileOpen(false); router.push('/settings'); }} className="dropdown-item w-full">
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button className="dropdown-item w-full">
                  <HelpCircle className="h-4 w-4" /> Help & Docs
                  <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
                </button>
              </div>
              <div className="border-t border-surface-100 dark:border-surface-800 py-1">
                <button onClick={handleLogout} className="dropdown-item w-full text-danger-500 hover:text-danger-700 hover:bg-danger-50 dark:hover:bg-danger-500/5">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
