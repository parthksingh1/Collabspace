'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User, Bell, Shield, Palette, Keyboard, Globe, Zap,
  ChevronRight, Camera, Loader2, Check, Plug, Key, CreditCard,
  Copy, Eye, EyeOff, Smartphone, Download, QrCode, Plus, Trash2,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/lib/theme-context';
import { useToastStore } from '@/stores/toast-store';
import toast from 'react-hot-toast';

const settingsTabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security & 2FA', icon: Shield },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'language', label: 'Language & Region', icon: Globe },
  { id: 'ai', label: 'AI Preferences', icon: Zap },
];

const INTEGRATIONS = [
  { id: 'slack', name: 'Slack', desc: 'Send notifications to Slack channels', connected: true, color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
  { id: 'github', name: 'GitHub', desc: 'Link PRs to tasks, sync commits', connected: true, color: 'bg-surface-800/10 text-surface-800 dark:text-surface-200' },
  { id: 'linear', name: 'Linear', desc: 'Two-way issue sync', connected: false, color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  { id: 'jira', name: 'Jira', desc: 'Import tickets and sync status', connected: false, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { id: 'google', name: 'Google Drive', desc: 'Embed Drive files into docs', connected: false, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { id: 'figma', name: 'Figma', desc: 'Embed live designs and prototypes', connected: false, color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { id: 'zoom', name: 'Zoom', desc: 'One-click meetings from any doc', connected: false, color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  { id: 'notion', name: 'Notion', desc: 'Import pages and databases', connected: false, color: 'bg-surface-800/10 text-surface-800 dark:text-surface-200' },
];

type ApiKey = { id: string; label: string; prefix: string; created: string; lastUsed: string; scopes: string[] };
const INITIAL_KEYS: ApiKey[] = [
  { id: 'k1', label: 'CI pipeline', prefix: 'cs_live_7Hk2', created: '2026-03-12', lastUsed: '4h ago', scopes: ['read', 'write'] },
  { id: 'k2', label: 'Personal CLI', prefix: 'cs_live_9Qr8', created: '2026-01-20', lastUsed: '2 days ago', scopes: ['read'] },
];

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const addToast = useToastStore((s) => s.addToast);
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

  // 2FA state
  const [twoFaStep, setTwoFaStep] = useState<'idle' | 'setup' | 'verify' | 'enabled'>('idle');
  const [twoFaCode, setTwoFaCode] = useState('');
  const [backupCodesVisible, setBackupCodesVisible] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(INITIAL_KEYS);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newlyCreated, setNewlyCreated] = useState<string | null>(null);
  const [revealNew, setRevealNew] = useState(false);

  // Integrations state
  const [integrations, setIntegrations] = useState(INTEGRATIONS);

  const backupCodes = [
    '7K9M-2JRT-FNLX', '8W3B-VQHY-PC5D', 'A4CD-LRW7-Z2NF',
    'HM62-XT9K-E3VQ', 'J5PR-NGH2-W8LB', 'Q7TY-D4VZ-K3MN',
    'R9BX-2JQL-F6ST', 'V5EC-ZM8P-HKRN',
  ];

  const createApiKey = () => {
    const label = newKeyLabel.trim();
    if (!label) return;
    const id = Math.random().toString(36).slice(2, 10);
    const prefix = 'cs_live_' + Math.random().toString(36).slice(2, 6);
    setApiKeys((k) => [{ id, label, prefix, created: new Date().toISOString().slice(0, 10), lastUsed: 'Never', scopes: ['read', 'write'] }, ...k]);
    setNewlyCreated(`${prefix}${Math.random().toString(36).slice(2, 26)}`);
    setNewKeyLabel('');
    addToast({ title: 'API key created', description: 'Save it now — you won\u2019t see it again.', variant: 'success' });
  };

  const revokeKey = (id: string) => {
    setApiKeys((k) => k.filter((x) => x.id !== id));
    addToast({ title: 'API key revoked', variant: 'success' });
  };

  const toggleIntegration = (id: string) => {
    setIntegrations((list) => list.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)));
    const it = integrations.find((i) => i.id === id);
    if (it) {
      addToast({
        title: it.connected ? `${it.name} disconnected` : `${it.name} connected`,
        variant: 'success',
      });
    }
  };

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
            <div className="space-y-4">
              {/* Password */}
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Password</h2>
                <p className="text-xs text-surface-500 mt-1">Update your password regularly. We recommend using a manager.</p>
                <div className="mt-4 grid gap-3 max-w-md">
                  <input type="password" placeholder="Current password" className="input" />
                  <input type="password" placeholder="New password" className="input" />
                  <input type="password" placeholder="Confirm new password" className="input" />
                </div>
                <button className="btn-primary mt-4 px-4 py-2 text-sm">Update password</button>
              </div>

              {/* 2FA */}
              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Two-Factor Authentication</h2>
                    <p className="text-xs text-surface-500 mt-1">Secure your account with an authenticator app (TOTP).</p>
                  </div>
                  {twoFaStep === 'enabled' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-500">
                      <Check className="h-3 w-3" /> Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2.5 py-1 text-2xs font-semibold text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                      Not enabled
                    </span>
                  )}
                </div>

                {twoFaStep === 'idle' && (
                  <button
                    onClick={() => setTwoFaStep('setup')}
                    className="btn-primary mt-4 px-4 py-2 text-sm flex items-center gap-2"
                  >
                    <Smartphone className="h-4 w-4" /> Enable authenticator app
                  </button>
                )}

                {twoFaStep === 'setup' && (
                  <div className="mt-4 space-y-4">
                    <ol className="list-decimal list-inside space-y-1.5 text-xs text-surface-600 dark:text-surface-400">
                      <li>Open your authenticator app (Google Authenticator, 1Password, Authy).</li>
                      <li>Scan the QR code below (or enter the setup key).</li>
                      <li>Enter the 6-digit code to confirm.</li>
                    </ol>
                    <div className="flex items-start gap-6 rounded-xl border border-surface-200 p-4 dark:border-surface-700">
                      <div className="flex h-36 w-36 items-center justify-center rounded-lg bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-700">
                        <div className="grid h-28 w-28 grid-cols-9 gap-px bg-surface-900 p-1 dark:bg-white">
                          {Array.from({ length: 81 }).map((_, i) => (
                            <span
                              key={i}
                              className={cn(
                                ((i * 7 + 3) % 5 > 1)
                                  ? 'bg-white dark:bg-surface-950'
                                  : 'bg-surface-900 dark:bg-white'
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">Setup key</label>
                          <div className="mt-1 flex items-center gap-2 rounded-md bg-surface-100 px-2 py-1.5 font-mono text-xs text-surface-800 dark:bg-surface-800 dark:text-surface-200">
                            <span className="flex-1 tracking-wider">JBSWY3DPEHPK3PXP</span>
                            <Copy className="h-3 w-3 text-surface-400" />
                          </div>
                        </div>
                        <div>
                          <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">Verification code</label>
                          <input
                            type="text"
                            maxLength={6}
                            value={twoFaCode}
                            onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            className="input mt-1 tracking-[0.4em] font-mono text-center"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setTwoFaStep('idle')}
                            className="btn-secondary px-3 py-1.5 text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={twoFaCode.length !== 6}
                            onClick={() => {
                              setTwoFaStep('enabled');
                              setBackupCodesVisible(true);
                              addToast({ title: '2FA enabled', description: 'Save your backup codes!', variant: 'success' });
                            }}
                            className="btn-primary flex-1 px-3 py-1.5 text-xs"
                          >
                            Verify & enable
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {twoFaStep === 'enabled' && (
                  <div className="mt-4 space-y-3">
                    {backupCodesVisible && (
                      <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/5">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-warning-700 dark:text-warning-500">Save your backup codes</p>
                          <button
                            onClick={() => setBackupCodesVisible(false)}
                            className="text-2xs font-medium text-warning-700 dark:text-warning-500"
                          >
                            Hide
                          </button>
                        </div>
                        <p className="text-xs text-warning-700/80 dark:text-warning-500/80 mb-3">
                          Store these somewhere safe. Each can be used once if you lose your device.
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                          {backupCodes.map((code) => (
                            <code key={code} className="rounded bg-white px-2 py-1 dark:bg-surface-900">{code}</code>
                          ))}
                        </div>
                        <button className="mt-3 flex items-center gap-1 text-xs font-medium text-warning-700 dark:text-warning-500">
                          <Download className="h-3 w-3" /> Download as .txt
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => setTwoFaStep('idle')}
                      className="btn-secondary px-4 py-2 text-xs"
                    >
                      Disable 2FA
                    </button>
                  </div>
                )}
              </div>

              {/* Sessions */}
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Active sessions</h2>
                <p className="text-xs text-surface-500 mt-1">Devices currently signed in to your account.</p>
                <ul className="mt-4 divide-y divide-surface-100 dark:divide-surface-800">
                  {[
                    { device: 'Chrome on macOS', loc: 'San Francisco, CA', time: 'Active now', current: true },
                    { device: 'Safari on iPhone', loc: 'San Francisco, CA', time: '2 hours ago' },
                    { device: 'Firefox on Ubuntu', loc: 'Berlin, DE', time: '3 days ago' },
                  ].map((s) => (
                    <li key={s.device} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-surface-900 dark:text-white flex items-center gap-2">
                          {s.device}
                          {s.current && <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-2xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-500">Current</span>}
                        </p>
                        <p className="text-xs text-surface-500 mt-0.5">{s.loc} · {s.time}</p>
                      </div>
                      {!s.current && (
                        <button className="text-xs font-medium text-danger-600 hover:text-danger-700 dark:text-danger-400">Sign out</button>
                      )}
                    </li>
                  ))}
                </ul>
                <button className="mt-3 text-xs font-medium text-danger-600 hover:text-danger-700 dark:text-danger-400">
                  Sign out of all other sessions
                </button>
              </div>
            </div>
          )}

          {/* API Keys Tab */}
          {activeTab === 'api-keys' && (
            <div className="card p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white">API Keys</h2>
                <p className="text-xs text-surface-500 mt-1">
                  Create keys to access the CollabSpace API programmatically.
                  <Link href="https://docs.collabspace.io/api" className="ml-1 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">View docs</Link>
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Key label (e.g. CI pipeline)"
                  className="input flex-1 max-w-sm"
                  onKeyDown={(e) => e.key === 'Enter' && createApiKey()}
                />
                <button
                  onClick={createApiKey}
                  disabled={!newKeyLabel.trim()}
                  className="btn-primary flex items-center gap-1 px-3 py-2 text-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Create key
                </button>
              </div>

              {newlyCreated && (
                <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/5">
                  <p className="text-sm font-semibold text-warning-700 dark:text-warning-500">New API key</p>
                  <p className="mt-1 text-xs text-warning-700/80 dark:text-warning-500/80">
                    Copy this key now &mdash; you won&apos;t be able to see it again.
                  </p>
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-white px-3 py-2 dark:bg-surface-900">
                    <code className="flex-1 font-mono text-xs text-surface-800 dark:text-surface-200 truncate">
                      {revealNew ? newlyCreated : newlyCreated.slice(0, 10) + '\u2022'.repeat(24)}
                    </code>
                    <button
                      onClick={() => setRevealNew((v) => !v)}
                      className="text-surface-400 hover:text-surface-600 transition-colors"
                      title={revealNew ? 'Hide' : 'Reveal'}
                    >
                      {revealNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(newlyCreated);
                          addToast({ title: 'Copied', variant: 'success' });
                        } catch {
                          // ignore
                        }
                      }}
                      className="text-surface-400 hover:text-surface-600 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => { setNewlyCreated(null); setRevealNew(false); }}
                    className="mt-2 text-2xs font-medium text-warning-700 dark:text-warning-500"
                  >
                    I&apos;ve saved it &mdash; dismiss
                  </button>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-surface-200 dark:border-surface-700">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 dark:bg-surface-800/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400">Label</th>
                      <th className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400">Prefix</th>
                      <th className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400 hidden md:table-cell">Last used</th>
                      <th className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400 hidden md:table-cell">Created</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="border-t border-surface-200 dark:border-surface-700">
                        <td className="px-4 py-2.5 text-xs font-medium text-surface-900 dark:text-white">{k.label}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-surface-600 dark:text-surface-400">{k.prefix}…</td>
                        <td className="px-4 py-2.5 text-xs text-surface-500 hidden md:table-cell">{k.lastUsed}</td>
                        <td className="px-4 py-2.5 text-xs text-surface-500 hidden md:table-cell">{k.created}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => revokeKey(k.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-danger-600 hover:bg-danger-50 transition-colors dark:text-danger-400 dark:hover:bg-danger-500/10"
                          >
                            <Trash2 className="h-3 w-3" /> Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                    {apiKeys.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-surface-500">
                          No API keys yet. Create one above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Integrations</h2>
                <p className="text-xs text-surface-500 mt-1">
                  Connect external services to extend CollabSpace.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {integrations.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-start gap-3 rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900"
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm', i.color)}>
                      {i.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-surface-900 dark:text-white">{i.name}</p>
                        {i.connected && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-success-50 px-1.5 py-0.5 text-2xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-500">
                            <span className="h-1 w-1 rounded-full bg-success-500" /> Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">{i.desc}</p>
                      <button
                        onClick={() => toggleIntegration(i.id)}
                        className={cn(
                          'mt-3 rounded-md px-2.5 py-1 text-2xs font-medium transition-colors',
                          i.connected
                            ? 'border border-surface-200 text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800'
                            : 'bg-surface-900 text-white hover:bg-surface-800 dark:bg-white dark:text-surface-900 dark:hover:bg-surface-100'
                        )}
                      >
                        {i.connected ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Billing Tab (link) */}
          {activeTab === 'billing' && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Billing & Plans</h2>
              <p className="text-xs text-surface-500 mt-1">
                View plans, manage subscriptions, and download invoices.
              </p>
              <Link
                href="/billing"
                className="btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <CreditCard className="h-4 w-4" /> Open Billing
                <ChevronRight className="h-4 w-4" />
              </Link>
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
