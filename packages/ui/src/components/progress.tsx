'use client';

import type { HTMLAttributes } from 'react';

export type ProgressSize = 'xs' | 'sm' | 'md' | 'lg';
export type ProgressColor = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: ProgressSize;
  color?: ProgressColor;
  indeterminate?: boolean;
  showLabel?: boolean;
  label?: string;
}

const sizes: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

const colors: Record<ProgressColor, string> = {
  brand: 'bg-gradient-to-r from-brand-500 to-brand-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  neutral: 'bg-surface-500',
};

export function Progress({
  value,
  max = 100,
  size = 'md',
  color = 'brand',
  indeterminate = false,
  showLabel = false,
  label,
  className = '',
  ...rest
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={`w-full ${className}`} {...rest}>
      {(showLabel || label) && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-surface-600 dark:text-surface-400">
            {label ?? 'Progress'}
          </span>
          {showLabel && (
            <span className="text-xs font-medium text-surface-600 tabular-nums dark:text-surface-400">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`${sizes[size]} overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        {indeterminate ? (
          <div
            className={`${colors[color]} h-full w-1/3 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]`}
            style={{ backgroundSize: '200% 100%' }}
          />
        ) : (
          <div
            className={`${colors[color]} h-full rounded-full transition-[width] duration-500 ease-out`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
