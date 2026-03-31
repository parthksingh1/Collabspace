'use client';

import React from 'react';

const sizeStyles = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
} as const;

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  away: 'bg-yellow-500',
  busy: 'bg-red-500',
} as const;

const statusSizes = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
} as const;

export type AvatarSize = keyof typeof sizeStyles;
export type AvatarStatus = keyof typeof statusColors;

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
  style?: React.CSSProperties;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-orange-500',
    'bg-sky-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { src, alt, name, size = 'md', status, className = '', style },
  ref,
) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = src && !imgError;
  const displayName = alt ?? name ?? 'User';

  return (
    <div ref={ref} className={`relative inline-flex shrink-0 ${className}`} style={style}>
      {showImage ? (
        <img
          src={src}
          alt={displayName}
          className={`${sizeStyles[size]} rounded-full object-cover ring-2 ring-white`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`${sizeStyles[size]} ${name ? getColorFromName(name) : 'bg-gray-400'} flex items-center justify-center rounded-full font-medium text-white ring-2 ring-white`}
          role="img"
          aria-label={displayName}
        >
          {name ? getInitials(name) : '?'}
        </div>
      )}

      {status && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full ring-2 ring-white ${statusColors[status]} ${statusSizes[size]}`}
          aria-label={status}
        />
      )}
    </div>
  );
});
