'use client';

import { useState, useEffect } from 'react';
import {
  User, Bell, Shield, Palette, Keyboard, Globe, Zap,
  ChevronRight, Camera, Loader2, Check,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/lib/theme-context';
import toast from 'react-hot-toast';

const settingsTabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security & Privacy', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'language', label: 'Language & Region', icon: Globe },
  { id: 'ai', label: 'AI Preferences', icon: Zap },
];

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  // Notification settings state
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [notifTasks, setNotifTasks] = useState(true);
  const [notifDocEdits, setNotifDocEdits] = useState(false);

  // Sync name from store
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const handleSaveProfile = async () => {
    setSaving(true);
    // Simulate save delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Update Zustand store directly
    if (user) {
      setUser({ ...user, name });
    }
    setSaving(false);
    toast.success('Profile updated');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Settings</h1>
      <p className="mt-1 text-sm text-surface-500">Manage your account preferences and workspace settings.</p>

      <div className="mt-6 flex gap-8">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 space-y-0.5">
          {settingsTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-brand-50 text-brand-700 font-medium dark:bg-brand-950 dark:text-brand-300'
                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Profile Information</h2>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                    {user ? getInitials(user.name) : '?'}
                  </div>
                  <button className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft hover:bg-brand-700 transition-colors">
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div>
                  <p className="font-medium text-surface-900 dark:text-white">{user?.name || 'User'}</p>
                  <p className="text-sm text-surface-500">{user?.role || 'member'}</p>
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input max-w-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Email</label>
                  <input type="email" value={email} disabled className="input max-w-sm opacity-60 cursor-not-allowed" />
                  <p className="mt-1 text-xs text-surface-400">Contact support to change your email.</p>
                </div>
              </div>

              <button onClick={handleSaveProfile} disabled={saving || name === user?.name} className="btn-primary px-4 py-2 text-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save changes
              </button>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Notification Preferences</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Email Notifications</p>
                    <p className="text-xs text-surface-500 mt-0.5">Receive email digests for important updates</p>
                  </div>
                  <button
                    onClick={() => setNotifEmail(!notifEmail)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      notifEmail ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      notifEmail ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Push Notifications</p>
                    <p className="text-xs text-surface-500 mt-0.5">Browser and mobile push notifications</p>
                  </div>
                  <button
                    onClick={() => setNotifPush(!notifPush)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      notifPush ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      notifPush ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">@Mentions</p>
                    <p className="text-xs text-surface-500 mt-0.5">Notify when someone mentions you</p>
                  </div>
                  <button
                    onClick={() => setNotifMentions(!notifMentions)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      notifMentions ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      notifMentions ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Task Assignments</p>
                    <p className="text-xs text-surface-500 mt-0.5">Notify when tasks are assigned to you</p>
                  </div>
                  <button
                    onClick={() => setNotifTasks(!notifTasks)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      notifTasks ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      notifTasks ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Document Edits</p>
                    <p className="text-xs text-surface-500 mt-0.5">Notify when shared documents are edited</p>
                  </div>
                  <button
                    onClick={() => setNotifDocEdits(!notifDocEdits)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      notifDocEdits ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      notifDocEdits ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Appearance</h2>
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">Theme</label>
                <div className="flex gap-3">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32',
                        theme === t
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                          : 'border-surface-200 hover:border-surface-300 dark:border-surface-700 dark:hover:border-surface-600'
                      )}
                    >
                      <div className={cn(
                        'h-16 w-full rounded-lg',
                        t === 'light' && 'bg-white border border-surface-200',
                        t === 'dark' && 'bg-surface-900 border border-surface-700',
                        t === 'system' && 'bg-gradient-to-r from-white to-surface-900 border border-surface-300'
                      )} />
                      <span className="text-sm font-medium text-surface-700 dark:text-surface-300 capitalize">{t}</span>
                      {theme === t && <Check className="h-4 w-4 text-brand-500" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">Font Size</label>
                <div className="flex gap-2">
                  {(['Small', 'Default', 'Large'] as const).map((size) => (
                    <button
                      key={size}
                      className={cn(
                        'rounded-lg border-2 px-4 py-2 text-sm transition-all',
                        size === 'Default'
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400'
                          : 'border-surface-200 hover:border-surface-300 dark:border-surface-700 text-surface-600 dark:text-surface-400'
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">Sidebar Position</label>
                <div className="flex gap-2">
                  {(['Left', 'Right'] as const).map((pos) => (
                    <button
                      key={pos}
                      className={cn(
                        'rounded-lg border-2 px-4 py-2 text-sm transition-all',
                        pos === 'Left'
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400'
                          : 'border-surface-200 hover:border-surface-300 dark:border-surface-700 text-surface-600 dark:text-surface-400'
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Security & Privacy</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors cursor-pointer">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Change Password</p>
                    <p className="text-xs text-surface-500 mt-0.5">Update your password regularly for security</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-surface-400" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Two-Factor Authentication</p>
                    <p className="text-xs text-surface-500 mt-0.5">Add an extra layer of security</p>
                  </div>
                  <button className="btn-secondary px-3 py-1 text-xs">Enable</button>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors cursor-pointer">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">Active Sessions</p>
                    <p className="text-xs text-surface-500 mt-0.5">Manage devices where you are signed in</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-surface-400" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-white">End-to-End Encryption</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Enabled</p>
                  </div>
                  <Check className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts Tab */}
          {activeTab === 'shortcuts' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Keyboard Shortcuts</h2>
              <div className="space-y-2">
                {[
                  { action: 'Search', keys: ['Ctrl', 'K'] },
                  { action: 'New Document', keys: ['Ctrl', 'N'] },
                  { action: 'Save', keys: ['Ctrl', 'S'] },
                  { action: 'Bold Text', keys: ['Ctrl', 'B'] },
                  { action: 'Italic Text', keys: ['Ctrl', 'I'] },
                  { action: 'Open Command Palette', keys: ['Ctrl', 'Shift', 'P'] },
                  { action: 'Toggle Sidebar', keys: ['Ctrl', '\\'] },
                  { action: 'Switch Theme', keys: ['Ctrl', 'Shift', 'T'] },
                  { action: 'Run Code', keys: ['Ctrl', 'Enter'] },
                  { action: 'Close Tab', keys: ['Ctrl', 'W'] },
                ].map(({ action, keys }) => (
                  <div key={action} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                    <span className="text-sm text-surface-700 dark:text-surface-300">{action}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="rounded-md border border-surface-300 bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-600 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-400">
                            {key}
                          </kbd>
                          {i < keys.length - 1 && <span className="mx-0.5 text-xs text-surface-400">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Language & Region Tab */}
          {activeTab === 'language' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Language & Region</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Language
                  </label>
                  <select className="input max-w-sm">
                    <option value="en">English (US)</option>
                    <option value="en-gb">English (UK)</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                    <option value="zh">Chinese (Simplified)</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Timezone
                  </label>
                  <select className="input max-w-sm">
                    <option value="utc">UTC (Coordinated Universal Time)</option>
                    <option value="est">EST (Eastern Standard Time)</option>
                    <option value="pst">PST (Pacific Standard Time)</option>
                    <option value="ist">IST (India Standard Time)</option>
                    <option value="jst">JST (Japan Standard Time)</option>
                    <option value="gmt">GMT (Greenwich Mean Time)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Date Format
                  </label>
                  <select className="input max-w-sm">
                    <option value="mdy">MM/DD/YYYY</option>
                    <option value="dmy">DD/MM/YYYY</option>
                    <option value="ymd">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* AI Tab */}
          {activeTab === 'ai' && (
            <div className="card p-6 space-y-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">AI Preferences</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Primary AI Model
                  </label>
                  <select className="input max-w-sm">
                    <option value="gemini-pro">Gemini 2.5 Pro (Default)</option>
                    <option value="gemini-flash">Gemini 2.5 Flash (Fast)</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    AI Suggestions
                  </label>
                  <div className="space-y-2.5">
                    {[
                      'Show inline completions while typing',
                      'Suggest task breakdowns automatically',
                      'Predict potential merge conflicts',
                      'Auto-generate commit messages',
                    ].map((label) => (
                      <label key={label} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                        <span className="text-sm text-surface-700 dark:text-surface-300">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
