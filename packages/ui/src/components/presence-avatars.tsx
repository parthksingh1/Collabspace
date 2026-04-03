'use client';

import React from 'react';

export interface PresenceUser {
  userId: string;
  name: string;
  avatar?: string | null;
  color: string;
  isTyping?: boolean;
}

export interface PresenceAvatarsProps {
  users: PresenceUser[];
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: { avatar: 'h-6 w-6 text-[10px]', overlap: '-ml-1.5' },
  md: { avatar: 'h-8 w-8 text-xs', overlap: '-ml-2' },
  lg: { avatar: 'h-10 w-10 text-sm', overlap: '-ml-2.5' },
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function PresenceAvatars({
  users,
  maxVisible = 5,
  size = 'md',
  className = '',
}: PresenceAvatarsProps) {
  const styles = sizeStyles[size];
  const visible = users.slice(0, maxVisible);
  const overflowCount = Math.max(0, users.length - maxVisible);

  return (
    <div className={`flex items-center ${className}`}>
      {visible.map((user, index) => (
        <div
          key={user.userId}
          className={`relative ${index > 0 ? styles.overlap : ''}`}
          title={`${user.name}${user.isTyping ? ' (typing...)' : ''}`}
          style={{ zIndex: visible.length - index }}
        >
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className={`${styles.avatar} rounded-full object-cover ring-2 ring-white`}
              style={{ boxShadow: `0 0 0 2px ${user.color}` }}
            />
          ) : (
            <div
              className={`${styles.avatar} flex items-center justify-center rounded-full font-medium text-white ring-2 ring-white`}
              style={{ backgroundColor: user.color }}
            >
              {getInitials(user.name)}
            </div>
          )}

          {/* Typing indicator */}
          {user.isTyping && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" />
            </span>
          )}
        </div>
      ))}

      {overflowCount > 0 && (
        <div
          className={`${styles.avatar} ${styles.overlap} flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600 ring-2 ring-white`}
          style={{ zIndex: 0 }}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
