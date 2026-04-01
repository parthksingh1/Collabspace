'use client';

import React from 'react';

const inputVariants = {
  default:
    'border-gray-300 focus:border-blue-500 focus:ring-blue-500',
  error:
    'border-red-500 focus:border-red-500 focus:ring-red-500',
} as const;

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: keyof typeof inputVariants;
  inputSize?: 'sm' | 'md' | 'lg';
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  prefixText?: string;
  suffixText?: string;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    variant,
    inputSize = 'md',
    prefixIcon,
    suffixIcon,
    prefixText,
    suffixText,
    fullWidth = false,
    className = '',
    id: providedId,
    disabled,
    ...rest
  },
  ref,
) {
  const id = providedId ?? React.useId();
  const resolvedVariant = error ? 'error' : (variant ?? 'default');

  const sizeClasses = {
    sm: 'py-1.5 text-sm',
    md: 'py-2 text-sm',
    lg: 'py-3 text-base',
  };

  const inputClasses = [
    'block rounded-lg border bg-white shadow-sm transition-colors duration-150',
    'placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-offset-0',
    'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
    inputVariants[resolvedVariant],
    sizeClasses[inputSize],
    prefixIcon || prefixText ? 'pl-10' : 'pl-3',
    suffixIcon || suffixText ? 'pr-10' : 'pr-3',
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={fullWidth ? 'w-full' : 'inline-block'}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {(prefixIcon || prefixText) && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            {prefixIcon ?? (
              <span className="text-sm text-gray-500">{prefixText}</span>
            )}
          </div>
        )}

        <input
          ref={ref}
          id={id}
          disabled={disabled}
          className={inputClasses}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : helperText ? `${id}-helper` : undefined
          }
          {...rest}
        />

        {(suffixIcon || suffixText) && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            {suffixIcon ?? (
              <span className="text-sm text-gray-500">{suffixText}</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={`${id}-helper`} className="mt-1.5 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
});
