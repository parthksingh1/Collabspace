'use client';

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { hoverable = false, padding = 'md', className = '', children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${
        hoverable ? 'transition-shadow duration-200 hover:shadow-md' : ''
      } ${paddingStyles[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function CardHeader({
  title,
  description,
  action,
  className = '',
  children,
  ...rest
}: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between ${className}`} {...rest}>
      <div>
        {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        {children}
      </div>
      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mt-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mt-4 flex items-center justify-end gap-3 border-t border-gray-100 pt-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
