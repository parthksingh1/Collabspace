'use client';

import type { HTMLAttributes } from 'react';

export type SkeletonVariant = 'text' | 'rect' | 'circle' | 'line';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  lines?: number;
}

const baseStyle =
  'relative overflow-hidden bg-gradient-to-r from-surface-200 via-surface-100 to-surface-200 bg-[length:200%_100%] animate-[shimmer_1.5s_linear_infinite] dark:from-surface-800 dark:via-surface-700 dark:to-surface-800';

function toSize(v?: number | string): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  lines = 1,
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`} {...rest}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseStyle} h-3 rounded`}
            style={{
              width: i === lines - 1 ? '70%' : '100%',
              ...style,
            }}
          />
        ))}
      </div>
    );
  }

  const shapeCls =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'line'
      ? 'h-1 rounded-full'
      : variant === 'text'
      ? 'h-3 rounded'
      : 'rounded-lg';

  return (
    <div
      className={`${baseStyle} ${shapeCls} ${className}`}
      style={{
        width: toSize(width) ?? (variant === 'text' ? '100%' : undefined),
        height: toSize(height) ?? (variant === 'text' ? undefined : variant === 'line' ? undefined : '100%'),
        ...style,
      }}
      {...rest}
    />
  );
}
