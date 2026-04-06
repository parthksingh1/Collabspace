'use client';

import { useEffect, useRef } from 'react';

export interface KeyboardShortcut {
  /** The key to listen for (e.g., 'k', 'Enter', 'Escape'). */
  key: string;
  /** Require Ctrl (Windows/Linux) or Cmd (macOS). */
  ctrlOrCmd?: boolean;
  /** Require Shift. */
  shift?: boolean;
  /** Require Alt/Option. */
  alt?: boolean;
  /** Handler to call when the shortcut is triggered. */
  handler: (event: KeyboardEvent) => void;
  /** Whether the shortcut is currently enabled. Default: true. */
  enabled?: boolean;
  /** Prevent default browser behavior. Default: true. */
  preventDefault?: boolean;
}

/**
 * Register a keyboard shortcut. Supports Ctrl/Cmd, Shift, Alt modifiers.
 *
 * @example
 * useKeyboardShortcut({
 *   key: 'k',
 *   ctrlOrCmd: true,
 *   handler: () => setCommandPaletteOpen(true),
 * });
 */
export function useKeyboardShortcut(shortcut: KeyboardShortcut): void {
  const handlerRef = useRef(shortcut.handler);
  handlerRef.current = shortcut.handler;

  useEffect(() => {
    if (shortcut.enabled === false) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Check modifiers
      const ctrlOrCmd = shortcut.ctrlOrCmd ? (e.metaKey || e.ctrlKey) : true;
      const shift = shortcut.shift ? e.shiftKey : !e.shiftKey || !shortcut.shift;
      const alt = shortcut.alt ? e.altKey : !e.altKey || !shortcut.alt;

      if (
        e.key.toLowerCase() === shortcut.key.toLowerCase() &&
        ctrlOrCmd &&
        shift &&
        alt
      ) {
        if (shortcut.preventDefault !== false) {
          e.preventDefault();
        }
        handlerRef.current(e);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcut.key, shortcut.ctrlOrCmd, shortcut.shift, shortcut.alt, shortcut.enabled, shortcut.preventDefault]);
}

/**
 * Register multiple keyboard shortcuts.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;

        const ctrlOrCmd = shortcut.ctrlOrCmd ? (e.metaKey || e.ctrlKey) : true;
        const shift = shortcut.shift ? e.shiftKey : !e.shiftKey || !shortcut.shift;
        const alt = shortcut.alt ? e.altKey : !e.altKey || !shortcut.alt;

        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlOrCmd &&
          shift &&
          alt
        ) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.handler(e);
          break;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
