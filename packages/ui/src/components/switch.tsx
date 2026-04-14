'use client';

import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';

export type SwitchSize = 'sm' | 'md' | 'lg';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: SwitchSize;
  label?: string;
  description?: string;
}

const sizes: Record<SwitchSize, { track: string; thumb: string; translate: string }> = {
  sm: { track: 'h-4 w-7', thumb: 'h-3 w-3', translate: 'peer-checked:translate-x-3' },
  md: { track: 'h-5 w-9', thumb: 'h-4 w-4', translate: 'peer-checked:translate-x-4' },
  lg: { track: 'h-6 w-11', thumb: 'h-5 w-5', translate: 'peer-checked:translate-x-5' },
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { size = 'md', label, description, className = '', disabled, ...rest },
  ref
) {
  const s = sizes[size];
  return (
    <label className={`inline-flex items-start gap-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`}>
      <span className="relative inline-flex shrink-0 items-center">
        <input ref={ref} type="checkbox" disabled={disabled} className="peer sr-only" {...rest} />
        <span
          className={`${s.track} rounded-full bg-surface-300 transition-colors peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 dark:bg-surface-700`}
        />
        <span
          className={`absolute left-0.5 top-1/2 ${s.thumb} -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${s.translate}`}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col leading-tight">
          {label && <span className="text-sm font-medium text-surface-900 dark:text-white">{label}</span>}
          {description && <span className="text-xs text-surface-500 dark:text-surface-400">{description}</span>}
        </span>
      )}
    </label>
  );
});
