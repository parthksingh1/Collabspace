'use client';

import React from 'react';

const variantStyles = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 disabled:bg-blue-300',
  secondary:
    'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400',
  outline:
    'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400 disabled:border-gray-200 disabled:text-gray-300',
  ghost:
    'bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400 disabled:text-gray-300',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 disabled:bg-red-300',
} as const;

const sizeStyles = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
} as const;

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    as?: 'button';
  };

type ButtonAsAnchor = ButtonBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    as: 'a';
  };

type ButtonAsSpan = ButtonBaseProps &
  Omit<React.HTMLAttributes<HTMLSpanElement>, keyof ButtonBaseProps> & {
    as: 'span';
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor | ButtonAsSpan;

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? 'h-4 w-4'}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement | HTMLSpanElement,
  ButtonProps
>(function Button(props, ref) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    children,
    as,
    ...rest
  } = props;

  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed';

  const classes = [
    baseClasses,
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? 'w-full' : '',
    loading ? 'cursor-wait' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );

  if (as === 'a') {
    const anchorProps = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={classes}
        {...anchorProps}
      >
        {content}
      </a>
    );
  }

  if (as === 'span') {
    const spanProps = rest as React.HTMLAttributes<HTMLSpanElement>;
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={classes}
        {...spanProps}
      >
        {content}
      </span>
    );
  }

  const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={buttonProps.type ?? 'button'}
      className={classes}
      disabled={loading || buttonProps.disabled}
      {...buttonProps}
    >
      {content}
    </button>
  );
});
