'use client';

import { useEffect, useState } from 'react';
import { X, Keyboard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Shortcut = { action: string; keys: string[]; scope: string };

const SHORTCUTS: Shortcut[] = [
  // General
  { action: 'Open command palette', keys: ['Ctrl', 'K'], scope: 'General' },
  { action: 'Show keyboard shortcuts', keys: ['Ctrl', '/'], scope: 'General' },
  { action: 'Toggle sidebar', keys: ['Ctrl', '\\'], scope: 'General' },
  { action: 'Toggle theme', keys: ['Ctrl', 'Shift', 'T'], scope: 'General' },
  { action: 'Toggle AI Assistant', keys: ['Ctrl', 'Shift', 'A'], scope: 'General' },
  { action: 'Jump to dashboard', keys: ['G', 'D'], scope: 'General' },
  { action: 'Jump to documents', keys: ['G', 'O'], scope: 'General' },
  { action: 'Jump to code', keys: ['G', 'C'], scope: 'General' },
  { action: 'Jump to whiteboard', keys: ['G', 'W'], scope: 'General' },
  { action: 'Jump to projects', keys: ['G', 'P'], scope: 'General' },

  // Documents
  { action: 'New document', keys: ['Ctrl', 'N'], scope: 'Documents' },
  { action: 'Save document', keys: ['Ctrl', 'S'], scope: 'Documents' },
  { action: 'Bold', keys: ['Ctrl', 'B'], scope: 'Documents' },
  { action: 'Italic', keys: ['Ctrl', 'I'], scope: 'Documents' },
  { action: 'Underline', keys: ['Ctrl', 'U'], scope: 'Documents' },
  { action: 'Heading 1', keys: ['Ctrl', 'Alt', '1'], scope: 'Documents' },
  { action: 'Heading 2', keys: ['Ctrl', 'Alt', '2'], scope: 'Documents' },
  { action: 'Toggle presentation mode', keys: ['Ctrl', 'Shift', 'P'], scope: 'Documents' },
  { action: 'Toggle focus mode', keys: ['Ctrl', 'Shift', 'F'], scope: 'Documents' },

  // Code
  { action: 'Run code', keys: ['Ctrl', 'Enter'], scope: 'Code' },
  { action: 'Command palette (editor)', keys: ['F1'], scope: 'Code' },
  { action: 'Toggle comment', keys: ['Ctrl', '/'], scope: 'Code' },
  { action: 'Format document', keys: ['Shift', 'Alt', 'F'], scope: 'Code' },
  { action: 'Go to definition', keys: ['F12'], scope: 'Code' },

  // Whiteboard
  { action: 'Select tool', keys: ['V'], scope: 'Whiteboard' },
  { action: 'Hand (pan)', keys: ['H'], scope: 'Whiteboard' },
  { action: 'Rectangle', keys: ['R'], scope: 'Whiteboard' },
  { action: 'Ellipse', keys: ['O'], scope: 'Whiteboard' },
  { action: 'Text', keys: ['T'], scope: 'Whiteboard' },
  { action: 'Sticky note', keys: ['S'], scope: 'Whiteboard' },
  { action: 'Pen', keys: ['P'], scope: 'Whiteboard' },
  { action: 'Duplicate', keys: ['Ctrl', 'D'], scope: 'Whiteboard' },
  { action: 'Zoom to fit', keys: ['Ctrl', '0'], scope: 'Whiteboard' },

  // Collaboration
  { action: 'Toggle comments', keys: ['Ctrl', 'Shift', 'C'], scope: 'Collaboration' },
  { action: 'Share document', keys: ['Ctrl', 'Alt', 'S'], scope: 'Collaboration' },
  { action: '@Mention someone', keys: ['@'], scope: 'Collaboration' },
];

export function KeyboardShortcutsPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === '/' && !e.shiftKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const isEditing =
          tag === 'INPUT' || tag === 'TEXTAREA' || (target?.isContentEditable ?? false);
        if (!isEditing) {
          e.preventDefault();
          setOpen((v) => !v);
        }
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  const filtered = query.trim()
    ? SHORTCUTS.filter(
        (s) =>
          s.action.toLowerCase().includes(query.toLowerCase()) ||
          s.scope.toLowerCase().includes(query.toLowerCase())
      )
    : SHORTCUTS;

  const grouped = filtered.reduce<Record<string, Shortcut[]>>((acc, s) => {
    (acc[s.scope] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 pt-[10vh] bg-black/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-overlay dark:border-surface-700 dark:bg-surface-900 animate-scale-in">
        <div className="flex items-center justify-between border-b border-surface-200 px-5 py-3.5 dark:border-surface-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-900 dark:text-white">
                Keyboard shortcuts
              </h2>
              <p className="text-2xs text-surface-500">Press Ctrl + / to toggle</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors dark:hover:bg-surface-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-surface-200 px-5 py-3 dark:border-surface-700">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="input pl-9 py-1.5 text-xs"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-5">
          {Object.keys(grouped).length === 0 ? (
            <p className="py-8 text-center text-sm text-surface-500">No shortcuts match.</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-surface-400">
                    {group}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700">
                    {items.map((s, idx) => (
                      <div
                        key={s.action}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 text-xs',
                          idx !== 0 && 'border-t border-surface-100 dark:border-surface-800'
                        )}
                      >
                        <span className="text-surface-700 dark:text-surface-300">{s.action}</span>
                        <div className="flex items-center gap-1">
                          {s.keys.map((k, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <kbd className="rounded-md border border-surface-300 bg-surface-100 px-1.5 py-0.5 font-mono text-2xs text-surface-700 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300">
                                {k}
                              </kbd>
                              {i < s.keys.length - 1 && <span className="text-surface-400">+</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
