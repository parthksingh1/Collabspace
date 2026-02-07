'use client';

import { useState } from 'react';
import {
  UserPlus, Search, MoreHorizontal, Shield, Mail,
  Crown, Eye, Edit3, Trash2, Check, X,
} from 'lucide-react';
import { cn, getInitials, generateColor } from '@/lib/utils';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'pending' | 'deactivated';
  lastSeen: string;
  avatar?: string;
}

const mockMembers: Member[] = [
  { id: '1', name: 'Parth Kumar Singh', email: 'parth@collabspace.io', role: 'owner', status: 'active', lastSeen: 'Now' },
  { id: '2', name: 'Sarah Chen', email: 'sarah@collabspace.io', role: 'admin', status: 'active', lastSeen: '5m ago' },
  { id: '3', name: 'Alex Rivera', email: 'alex@collabspace.io', role: 'member', status: 'active', lastSeen: '1h ago' },
  { id: '4', name: 'Jordan Kim', email: 'jordan@collabspace.io', role: 'member', status: 'active', lastSeen: '3h ago' },
  { id: '5', name: 'Taylor Brooks', email: 'taylor@company.com', role: 'viewer', status: 'pending', lastSeen: 'Invited' },
  { id: '6', name: 'Morgan Lee', email: 'morgan@collabspace.io', role: 'member', status: 'active', lastSeen: '1d ago' },
];

const roleConfig = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950' },
  admin: { label: 'Admin', icon: Shield, color: 'text-brand-600 bg-brand-50 dark:text-brand-400 dark:bg-brand-950' },
  member: { label: 'Member', icon: Edit3, color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-surface-600 bg-surface-100 dark:text-surface-400 dark:bg-surface-800' },
};

export default function TeamPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');

  const filtered = mockMembers.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Team</h1>
          <p className="mt-1 text-sm text-surface-500">{mockMembers.length} members in your workspace.</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary gap-2 px-4 py-2 text-sm">
          <UserPlus className="h-4 w-4" />
          Invite member
        </button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md animate-scale-in rounded-2xl border border-surface-200 bg-white p-6 shadow-elevated dark:border-surface-700 dark:bg-surface-900 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Invite Team Member</h2>
              <button onClick={() => setShowInvite(false)} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="input"
                placeholder="colleague@company.com"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                className="input"
              >
                <option value="admin">Admin -- Full access</option>
                <option value="member">Member -- Can edit</option>
                <option value="viewer">Viewer -- Read only</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowInvite(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
              <button className="btn-primary gap-2 px-4 py-2 text-sm">
                <Mail className="h-4 w-4" /> Send invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Search by name or email..."
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {/* Members Table */}
      <div className="mt-4 card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200 text-left dark:border-surface-700">
              <th className="px-4 py-3 text-2xs font-medium uppercase tracking-wider text-surface-500">Member</th>
              <th className="px-4 py-3 text-2xs font-medium uppercase tracking-wider text-surface-500">Role</th>
              <th className="px-4 py-3 text-2xs font-medium uppercase tracking-wider text-surface-500">Status</th>
              <th className="px-4 py-3 text-2xs font-medium uppercase tracking-wider text-surface-500">Last seen</th>
              <th className="px-4 py-3 text-2xs font-medium uppercase tracking-wider text-surface-500 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
            {filtered.map((member) => {
              const role = roleConfig[member.role];
              const RoleIcon = role.icon;
              return (
                <tr key={member.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: generateColor(member.id) }}
                      >
                        {getInitials(member.name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900 dark:text-white">{member.name}</p>
                        <p className="text-xs text-surface-500">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', role.color)}>
                      <RoleIcon className="h-3 w-3" />
                      {role.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs',
                      member.status === 'active' && 'text-emerald-600 dark:text-emerald-400',
                      member.status === 'pending' && 'text-amber-600 dark:text-amber-400',
                      member.status === 'deactivated' && 'text-surface-400',
                    )}>
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        member.status === 'active' && 'bg-emerald-500',
                        member.status === 'pending' && 'bg-amber-500',
                        member.status === 'deactivated' && 'bg-surface-300 dark:bg-surface-600',
                      )} />
                      {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-surface-500">{member.lastSeen}</span>
                  </td>
                  <td className="px-4 py-3">
                    {member.role !== 'owner' && (
                      <button className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 transition-colors">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-surface-500">No members match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
