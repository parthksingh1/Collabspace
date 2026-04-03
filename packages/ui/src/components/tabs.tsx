'use client';

import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'underline' | 'pills';
  children: React.ReactNode;
  className?: string;
}

export interface TabPanelProps {
  tabId: string;
  activeTab: string;
  lazy?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'underline',
  children,
  className = '',
}: TabsProps) {
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});
  const tabsContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (variant === 'underline' && activeRef.current && tabsContainerRef.current) {
      const container = tabsContainerRef.current.getBoundingClientRect();
      const active = activeRef.current.getBoundingClientRect();
      setIndicatorStyle({
        left: active.left - container.left,
        width: active.width,
      });
    }
  }, [activeTab, variant]);

  const baseTabClass =
    variant === 'underline'
      ? 'relative px-4 py-2.5 text-sm font-medium transition-colors duration-150'
      : 'px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150';

  const activeTabClass =
    variant === 'underline'
      ? 'text-blue-600'
      : 'bg-blue-100 text-blue-700';

  const inactiveTabClass =
    variant === 'underline'
      ? 'text-gray-500 hover:text-gray-700'
      : 'text-gray-600 hover:bg-gray-100';

  return (
    <div className={className}>
      <div
        ref={tabsContainerRef}
        className={`relative flex ${variant === 'underline' ? 'border-b border-gray-200' : 'gap-1 rounded-lg bg-gray-50 p-1'}`}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              disabled={tab.disabled}
              className={`${baseTabClass} ${isActive ? activeTabClass : inactiveTabClass} ${
                tab.disabled ? 'cursor-not-allowed opacity-50' : ''
              } flex items-center gap-2`}
              onClick={() => {
                if (!tab.disabled) onTabChange(tab.id);
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}

        {variant === 'underline' && (
          <div
            className="absolute bottom-0 h-0.5 bg-blue-600 transition-all duration-200"
            style={indicatorStyle}
          />
        )}
      </div>

      <div className="mt-4">{children}</div>
    </div>
  );
}

export function TabPanel({
  tabId,
  activeTab,
  lazy = true,
  children,
  className = '',
}: TabPanelProps) {
  const [hasBeenActive, setHasBeenActive] = React.useState(tabId === activeTab);
  const isActive = tabId === activeTab;

  React.useEffect(() => {
    if (isActive) setHasBeenActive(true);
  }, [isActive]);

  // Lazy: don't render until first activation
  if (lazy && !hasBeenActive) return null;

  return (
    <div
      id={`tabpanel-${tabId}`}
      role="tabpanel"
      hidden={!isActive}
      className={className}
    >
      {children}
    </div>
  );
}
