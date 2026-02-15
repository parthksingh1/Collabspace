'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastVariant } from '@/stores/toast-store';

const variantConfig: Record<ToastVariant, { icon: typeof CheckCircle2; iconClass: string; barClass: string; bgClass: string }> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    barClass: 'bg-emerald-500',
    bgClass: 'border-emerald-200 dark:border-emerald-800/40',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-red-500',
    barClass: 'bg-red-500',
    bgClass: 'border-red-200 dark:border-red-800/40',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
    barClass: 'bg-amber-500',
    bgClass: 'border-amber-200 dark:border-amber-800/40',
  },
  info: {
    icon: Info,
    iconClass: 'text-blue-500',
    barClass: 'bg-blue-500',
    bgClass: 'border-blue-200 dark:border-blue-800/40',
  },
};

function ToastItem({ id, title, description, variant, duration }: {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
}) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const config = variantConfig[variant];
  const Icon = config.icon;
  const effectiveDuration = duration ?? 4000;

  useEffect(() => {
    // Trigger entrance animation
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => removeToast(id), 200);
  };

  return (
    <div
      className={cn(
        'pointer-events-auto relative w-80 overflow-hidden rounded-xl border bg-white shadow-elevated dark:bg-surface-900 transition-all duration-200',
        config.bgClass,
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0',
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', config.iconClass)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs text-surface-500 leading-relaxed">{description}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Progress bar */}
      {effectiveDuration > 0 && (
        <div className="h-0.5 w-full bg-surface-100 dark:bg-surface-800">
          <div
            className={cn('h-full rounded-r-full', config.barClass)}
            style={{
              animation: `toastProgress ${effectiveDuration}ms linear forwards`,
            }}
          />
        </div>
      )}
      <style jsx>{`
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          duration={toast.duration}
        />
      ))}
    </div>
  );
}
