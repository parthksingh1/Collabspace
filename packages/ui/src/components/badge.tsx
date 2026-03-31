'use client';

import React from 'react';

const colorStyles = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-800',
  teal: 'bg-teal-100 text-teal-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  amber: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
} as const;

const dotColorStyles = {
  gray: 'bg-gray-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
} as const;

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
} as const;

export type BadgeColor = keyof typeof colorStyles;
export type BadgeSize = keyof typeof sizeStyles;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  size?: BadgeSize;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    color = 'gray',
    size = 'md',
    dot = false,
    removable = false,
    onRemove,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  return (
    <span
      ref={ref}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colorStyles[color]} ${sizeStyles[size]} ${className}`}
      {...rest}
    >
      {dot && (
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColorStyles[color]}`} />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-black/10 focus:outline-none"
          aria-label="Remove"
        >
          <svg className="h-2.5 w-2.5" viewBox="0 0 8 8" fill="currentColor">
            <path d="M1.172 1.172a.4.4 0 01.566 0L4 3.434l2.263-2.262a.4.4 0 11.565.566L4.566 4l2.262 2.263a.4.4 0 11-.565.565L4 4.566 1.738 6.828a.4.4 0 11-.566-.565L3.434 4 1.172 1.738a.4.4 0 010-.566z" />
          </svg>
        </button>
      )}
    </span>
  );
});
