'use client';

import React from 'react';
import ReactDOM from 'react-dom';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  section?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  recentIds?: string[];
  placeholder?: string;
  onClose: () => void;
  open: boolean;
}

export function CommandPalette({
  items,
  recentIds = [],
  placeholder = 'Type a command or search...',
  onClose,
  open,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Filter items
  const filtered = React.useMemo(() => {
    if (!query.trim()) {
      // Show recent items first, then all
      const recent = recentIds
        .map((id) => items.find((item) => item.id === id))
        .filter(Boolean) as CommandItem[];
      const rest = items.filter((item) => !recentIds.includes(item.id));
      return [...recent, ...rest];
    }

    const lowerQuery = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lowerQuery) ||
        item.description?.toLowerCase().includes(lowerQuery) ||
        item.section?.toLowerCase().includes(lowerQuery),
    );
  }, [items, query, recentIds]);

  // Group by section
  const sections = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>();

    if (!query.trim() && recentIds.length > 0) {
      const recent = filtered.slice(0, recentIds.length);
      if (recent.length > 0) {
        map.set('Recent', recent);
      }
      const rest = filtered.slice(recentIds.length);
      for (const item of rest) {
        const section = item.section ?? 'Commands';
        if (!map.has(section)) map.set(section, []);
        map.get(section)!.push(item);
      }
    } else {
      for (const item of filtered) {
        const section = item.section ?? 'Commands';
        if (!map.has(section)) map.set(section, []);
        map.get(section)!.push(item);
      }
    }

    return map;
  }, [filtered, query, recentIds]);

  // Reset active index on filter change
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Focus input on open
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[activeIndex]) {
            filtered[activeIndex].onSelect();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  // Scroll active item into view
  React.useEffect(() => {
    if (!listRef.current) return;
    const activeElement = listRef.current.querySelector('[data-active="true"]');
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  let flatIndex = -1;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4">
          <svg
            className="h-5 w-5 shrink-0 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full border-0 bg-transparent py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400 sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No results found for &ldquo;{query}&rdquo;
            </p>
          )}

          {Array.from(sections.entries()).map(([sectionName, sectionItems]) => (
            <div key={sectionName}>
              <div className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-gray-400">
                {sectionName}
              </div>
              {sectionItems.map((item) => {
                flatIndex++;
                const isActive = flatIndex === activeIndex;
                const currentIndex = flatIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={isActive}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      item.onSelect();
                      onClose();
                    }}
                    onMouseEnter={() => setActiveIndex(currentIndex)}
                  >
                    {item.icon && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-400">
                        {item.icon}
                      </span>
                    )}
                    <div className="flex-1 truncate">
                      <div className="font-medium">{item.label}</div>
                      {item.description && (
                        <div className="truncate text-xs text-gray-500">
                          {item.description}
                        </div>
                      )}
                    </div>
                    {item.shortcut && (
                      <kbd className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

/**
 * Hook to manage Cmd+K / Ctrl+K command palette toggle.
 */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    open,
    setOpen,
    onClose: () => setOpen(false),
    toggle: () => setOpen((v) => !v),
  };
}
