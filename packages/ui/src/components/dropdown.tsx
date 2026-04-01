'use client';

import React from 'react';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  onClick?: () => void;
}

export interface DropdownSeparator {
  type: 'separator';
}

export type DropdownEntry = DropdownItem | DropdownSeparator;

function isSeparator(entry: DropdownEntry): entry is DropdownSeparator {
  return 'type' in entry && entry.type === 'separator';
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownEntry[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, items, align = 'left', className = '' }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Keyboard navigation
  const actionableItems = items.filter(
    (item) => !isSeparator(item) && !item.disabled,
  ) as DropdownItem[];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < actionableItems.length - 1 ? prev + 1 : 0,
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : actionableItems.length - 1,
        );
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0 && actionableItems[activeIndex]) {
          actionableItems[activeIndex].onClick?.();
          setOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`} onKeyDown={handleKeyDown}>
      <div
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(-1);
        }}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </div>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={`absolute z-50 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((entry, index) => {
            if (isSeparator(entry)) {
              return <div key={`sep-${index}`} className="my-1 border-t border-gray-100" />;
            }

            const actionIndex = actionableItems.indexOf(entry);
            const isActive = actionIndex === activeIndex;

            return (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  entry.disabled
                    ? 'cursor-not-allowed text-gray-300'
                    : entry.danger
                      ? `text-red-600 ${isActive ? 'bg-red-50' : 'hover:bg-red-50'}`
                      : `text-gray-700 ${isActive ? 'bg-gray-100' : 'hover:bg-gray-100'}`
                }`}
                onClick={() => {
                  if (!entry.disabled) {
                    entry.onClick?.();
                    setOpen(false);
                  }
                }}
                onMouseEnter={() => setActiveIndex(actionIndex)}
              >
                {entry.icon && <span className="h-4 w-4 shrink-0">{entry.icon}</span>}
                <span className="flex-1">{entry.label}</span>
                {entry.shortcut && (
                  <span className="ml-4 text-xs text-gray-400">{entry.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
