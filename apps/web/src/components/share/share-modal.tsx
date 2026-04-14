'use client';

import { useEffect, useState } from 'react';
import {
  X, Link as LinkIcon, Copy, Check, Globe, Lock, Users, Mail,
  Eye, Edit2, MessageSquare, Shield, Calendar, Plus, ChevronDown, Trash2,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';

type AccessLevel = 'view' | 'comment' | 'edit';
type LinkVisibility = 'off' | 'workspace' | 'public';

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  resourceKind: 'document' | 'board' | 'project' | 'code';
  resourceId: string;
  resourceTitle: string;
}

type Member = { id: string; name: string; email: string; level: AccessLevel };

const MOCK_MEMBERS: Member[] = [
  { id: '1', name: 'Sarah Lin', email: 'sarah@co.io', level: 'edit' },
  { id: '2', name: 'Alex Ramirez', email: 'alex@co.io', level: 'edit' },
  { id: '3', name: 'Priya Desai', email: 'priya@co.io', level: 'comment' },
  { id: '4', name: 'Marcus Okoye', email: 'marcus@co.io', level: 'view' },
];

const ACCESS_LABELS: Record<AccessLevel, { label: string; icon: typeof Eye; desc: string }> = {
  view: { label: 'Can view', icon: Eye, desc: 'Read-only access' },
  comment: { label: 'Can comment', icon: MessageSquare, desc: 'Can view and add comments' },
  edit: { label: 'Can edit', icon: Edit2, desc: 'Full editing access' },
};

export function ShareModal({
  open,
  onClose,
  resourceKind,
  resourceId,
  resourceTitle,
}: ShareModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [visibility, setVisibility] = useState<LinkVisibility>('workspace');
  const [linkAccess, setLinkAccess] = useState<AccessLevel>('view');
  const [expires, setExpires] = useState<'never' | '24h' | '7d' | '30d'>('never');
  const [members, setMembers] = useState<Member[]>(MOCK_MEMBERS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLevel, setInviteLevel] = useState<AccessLevel>('view');
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://app.collabspace.io/share/${resourceKind}/${resourceId}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      addToast({ title: 'Link copied', variant: 'success' });
    } catch {
      // ignore
    }
  };

  const invite = () => {
    const email = inviteEmail.trim();
    if (!email) return;
    const id = Math.random().toString(36).slice(2);
    setMembers((m) => [
      ...m,
      { id, name: email.split('@')[0], email, level: inviteLevel },
    ]);
    setInviteEmail('');
    addToast({ title: `Invite sent to ${email}`, variant: 'success' });
  };

  const removeMember = (id: string) => setMembers((m) => m.filter((x) => x.id !== id));
  const updateLevel = (id: string, level: AccessLevel) =>
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, level } : x)));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh] backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-overlay dark:border-surface-700 dark:bg-surface-900 animate-scale-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 px-5 py-4 dark:border-surface-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-surface-400">
              <Shield className="h-3 w-3" /> Share
            </div>
            <h2 className="mt-1 text-base font-semibold text-surface-900 dark:text-white truncate">
              {resourceTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors dark:hover:bg-surface-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Invite */}
        <div className="border-b border-surface-200 px-5 py-4 dark:border-surface-700">
          <label className="block text-2xs font-medium uppercase tracking-wider text-surface-400 mb-1.5">
            Invite people
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && invite()}
                placeholder="name@company.com"
                className="input pl-9 py-2 text-sm w-full"
              />
            </div>
            <AccessSelect value={inviteLevel} onChange={setInviteLevel} />
            <button
              onClick={invite}
              disabled={!inviteEmail.trim()}
              className="btn-primary px-3 py-2 text-xs flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Invite
            </button>
          </div>
        </div>

        {/* Members */}
        <div className="max-h-64 overflow-y-auto scrollbar-thin border-b border-surface-200 dark:border-surface-700">
          <div className="px-5 py-3">
            <label className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-surface-400 mb-2">
              <Users className="h-3 w-3" /> People with access ({members.length})
            </label>
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-100/60 transition-colors dark:hover:bg-surface-800/40"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    {getInitials(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                      {m.name}
                    </p>
                    <p className="text-2xs text-surface-500 truncate">{m.email}</p>
                  </div>
                  <AccessSelect value={m.level} onChange={(v) => updateLevel(m.id, v)} />
                  <button
                    onClick={() => removeMember(m.id)}
                    className="rounded-md p-1 text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors dark:hover:bg-danger-500/10"
                    title="Remove access"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Link visibility */}
        <div className="border-b border-surface-200 px-5 py-4 dark:border-surface-700">
          <label className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-surface-400 mb-2">
            <LinkIcon className="h-3 w-3" /> Link access
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <VisibilityOption
              active={visibility === 'off'}
              onClick={() => setVisibility('off')}
              icon={Lock}
              title="Restricted"
              desc="Only invited"
            />
            <VisibilityOption
              active={visibility === 'workspace'}
              onClick={() => setVisibility('workspace')}
              icon={Users}
              title="Workspace"
              desc="Anyone in org"
            />
            <VisibilityOption
              active={visibility === 'public'}
              onClick={() => setVisibility('public')}
              icon={Globe}
              title="Anyone"
              desc="With the link"
            />
          </div>

          {visibility !== 'off' && (
            <div className="mt-3 space-y-2.5">
              {/* URL row */}
              <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                <LinkIcon className="h-3.5 w-3.5 text-surface-400 shrink-0" />
                <code className="flex-1 truncate font-mono text-xs text-surface-700 dark:text-surface-300">
                  {shareUrl}
                </code>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-2xs font-medium text-surface-700 shadow-sm transition-colors hover:bg-surface-100 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-700"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-success-500" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
              </div>

              {/* Options row */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <AccessSelect value={linkAccess} onChange={setLinkAccess} />
                <div className="flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-2.5 py-1 text-xs text-surface-600 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-400">
                  <Calendar className="h-3 w-3" />
                  <select
                    value={expires}
                    onChange={(e) => setExpires(e.target.value as 'never' | '24h' | '7d' | '30d')}
                    className="bg-transparent text-xs outline-none"
                  >
                    <option value="never">Never expires</option>
                    <option value="24h">Expires in 24h</option>
                    <option value="7d">Expires in 7 days</option>
                    <option value="30d">Expires in 30 days</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <p className="text-2xs text-surface-400">
            Changes apply immediately. All access is audit logged.
          </p>
          <button onClick={onClose} className="btn-primary px-4 py-1.5 text-xs">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function VisibilityOption({
  active, onClick, icon: Icon, title, desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Globe;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-start gap-2 rounded-xl border-2 p-3 text-left transition-all',
        active
          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30'
          : 'border-surface-200 hover:border-surface-300 dark:border-surface-700 dark:hover:border-surface-600'
      )}
    >
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', active ? 'text-brand-600 dark:text-brand-400' : 'text-surface-500')} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-surface-900 dark:text-white">{title}</p>
        <p className="text-2xs text-surface-500 truncate">{desc}</p>
      </div>
    </button>
  );
}

function AccessSelect({ value, onChange }: { value: AccessLevel; onChange: (v: AccessLevel) => void }) {
  const [open, setOpen] = useState(false);
  const current = ACCESS_LABELS[value];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs font-medium text-surface-700 hover:border-surface-300 transition-colors dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300"
      >
        <Icon className="h-3 w-3" />
        {current.label}
        <ChevronDown className="h-3 w-3 text-surface-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-surface-200 bg-white shadow-elevated dark:border-surface-700 dark:bg-surface-900">
          {(['view', 'comment', 'edit'] as AccessLevel[]).map((lvl) => {
            const opt = ACCESS_LABELS[lvl];
            const OptIcon = opt.icon;
            return (
              <button
                key={lvl}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(lvl);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-100 dark:hover:bg-surface-800',
                  value === lvl && 'bg-brand-50 dark:bg-brand-950/30'
                )}
              >
                <OptIcon className="h-3.5 w-3.5 mt-0.5 text-surface-500" />
                <div>
                  <p className="text-xs font-medium text-surface-900 dark:text-white">{opt.label}</p>
                  <p className="text-2xs text-surface-500">{opt.desc}</p>
                </div>
                {value === lvl && <Check className="h-3 w-3 text-brand-500 ml-auto mt-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
