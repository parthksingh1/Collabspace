'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Focus, Presentation, Minimize2, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DocMode = 'normal' | 'focus' | 'presentation';

export interface FocusPresentationModeProps {
  /** The rendered document content (editor). */
  children: React.ReactNode;
  /** Title shown in presentation mode top bar. */
  title?: string;
  /** Number of sections the viewer can page through in presentation mode.
   *  If provided, enables arrow-key paging and shows a progress bar. */
  slideCount?: number;
  /** Current mode (controlled). If omitted, component is uncontrolled. */
  mode?: DocMode;
  onModeChange?: (mode: DocMode) => void;
}

export function FocusPresentationMode({
  children,
  title,
  slideCount,
  mode: controlledMode,
  onModeChange,
}: FocusPresentationModeProps) {
  const [internalMode, setInternalMode] = useState<DocMode>('normal');
  const mode = controlledMode ?? internalMode;
  const setMode = useCallback(
    (m: DocMode) => {
      if (!controlledMode) setInternalMode(m);
      onModeChange?.(m);
    },
    [controlledMode, onModeChange]
  );
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target?.isContentEditable ?? false);

      if (isMod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setMode(mode === 'focus' ? 'normal' : 'focus');
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setMode(mode === 'presentation' ? 'normal' : 'presentation');
      } else if (e.key === 'Escape' && (mode === 'focus' || mode === 'presentation')) {
        setMode('normal');
      } else if (mode === 'presentation' && !isEditing && slideCount && slideCount > 0) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          setSlide((s) => Math.min(slideCount - 1, s + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setSlide((s) => Math.max(0, s - 1));
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, setMode, slideCount]);

  // Lock body scroll in presentation mode
  useEffect(() => {
    if (mode === 'presentation') {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mode]);

  if (mode === 'presentation') {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-surface-950 animate-fade-in">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-surface-200 px-6 py-3 dark:border-surface-800">
          <div className="flex items-center gap-3">
            <Presentation className="h-4 w-4 text-brand-500" />
            <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">
              {title ?? 'Document'}
            </p>
            <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-semibold text-brand-600 dark:text-brand-400">
              Presenting
            </span>
          </div>
          <div className="flex items-center gap-2">
            {slideCount && slideCount > 0 && (
              <>
                <button
                  onClick={() => setSlide((s) => Math.max(0, s - 1))}
                  disabled={slide === 0}
                  className="btn-ghost rounded-md p-1.5 disabled:opacity-40"
                  title="Previous (Left arrow)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs tabular-nums text-surface-500">
                  {slide + 1} / {slideCount}
                </span>
                <button
                  onClick={() => setSlide((s) => Math.min(slideCount - 1, s + 1))}
                  disabled={slide === slideCount - 1}
                  className="btn-ghost rounded-md p-1.5 disabled:opacity-40"
                  title="Next (Right arrow)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="mx-2 h-4 w-px bg-surface-200 dark:bg-surface-800" />
              </>
            )}
            <button
              onClick={() => setMode('normal')}
              className="flex items-center gap-1.5 rounded-md bg-surface-100 px-2.5 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-200 transition-colors dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
            >
              <X className="h-3.5 w-3.5" /> Exit
              <kbd className="ml-1 rounded bg-surface-200 px-1 py-0.5 font-mono text-2xs text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                Esc
              </kbd>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {slideCount && slideCount > 0 && (
          <div className="h-0.5 w-full bg-surface-100 dark:bg-surface-800">
            <div
              className="h-full bg-brand-500 transition-[width] duration-300"
              style={{ width: `${((slide + 1) / slideCount) * 100}%` }}
            />
          </div>
        )}

        {/* Slide */}
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl px-8 py-12">
            <div className="prose prose-lg dark:prose-invert max-w-none text-xl leading-relaxed">
              {children}
            </div>
          </div>
        </div>

        {/* Bottom hint */}
        <div className="flex items-center justify-center gap-6 border-t border-surface-200 px-6 py-2 text-2xs text-surface-400 dark:border-surface-800">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-surface-300 bg-surface-50 px-1 font-mono dark:border-surface-700 dark:bg-surface-900">&larr;</kbd>
            <kbd className="rounded border border-surface-300 bg-surface-50 px-1 font-mono dark:border-surface-700 dark:bg-surface-900">&rarr;</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-surface-300 bg-surface-50 px-1 font-mono dark:border-surface-700 dark:bg-surface-900">Esc</kbd>
            Exit
          </span>
        </div>
      </div>
    );
  }

  if (mode === 'focus') {
    return (
      <div className="relative">
        {/* Floating exit */}
        <div className="fixed right-6 top-6 z-50 flex items-center gap-1.5">
          <button
            onClick={() => setMode('presentation')}
            className="flex items-center gap-1.5 rounded-full border border-surface-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-surface-700 shadow-soft backdrop-blur hover:bg-white transition-colors dark:border-surface-700 dark:bg-surface-900/80 dark:text-surface-300 dark:hover:bg-surface-900"
            title="Presentation mode (Ctrl+Shift+P)"
          >
            <Presentation className="h-3.5 w-3.5" /> Present
          </button>
          <button
            onClick={() => setMode('normal')}
            className="flex items-center gap-1.5 rounded-full border border-surface-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-surface-700 shadow-soft backdrop-blur hover:bg-white transition-colors dark:border-surface-700 dark:bg-surface-900/80 dark:text-surface-300 dark:hover:bg-surface-900"
          >
            <Minimize2 className="h-3.5 w-3.5" /> Exit focus
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Mode toggles (normal) */}
      <div className="absolute right-0 top-0 z-10 flex items-center gap-1">
        <button
          onClick={() => setMode('focus')}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors dark:hover:bg-surface-800 dark:hover:text-surface-300"
          title="Focus mode (Ctrl+Shift+F)"
        >
          <Focus className="h-3.5 w-3.5" /> Focus
        </button>
        <button
          onClick={() => setMode('presentation')}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors dark:hover:bg-surface-800 dark:hover:text-surface-300"
          title="Present (Ctrl+Shift+P)"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Present
        </button>
      </div>
      {children}
    </div>
  );
}

export function useDocumentMode() {
  const [mode, setMode] = useState<DocMode>('normal');
  return { mode, setMode };
}

/** Compact toggle group that can live inside a document toolbar. */
export function ModeToggles({ value, onChange }: { value: DocMode; onChange: (m: DocMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-surface-200 bg-white p-0.5 dark:border-surface-700 dark:bg-surface-900">
      {(
        [
          { id: 'normal', icon: Minimize2, label: 'Normal' },
          { id: 'focus', icon: Focus, label: 'Focus' },
          { id: 'presentation', icon: Presentation, label: 'Present' },
        ] as const
      ).map((o) => {
        const Icon = o.icon;
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            )}
            title={o.label}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
