'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, Code2, PenTool, FolderKanban,
  Sparkles, Settings, Users, BarChart3, ArrowRight,
  Hash, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIStore } from '@/stores/ai-store';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: typeof Search;
  section: string;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const router = useRouter();
  const { toggleSidebar: openAI, sendMessage } = useAIStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = [
    // AI Commands
    { id: 'ai-ask', label: 'Ask AI...', description: 'Chat with AI assistant', icon: Sparkles, section: 'AI Commands', action: () => { openAI(); setOpen(false); }, keywords: ['ai', 'chat', 'help'] },
    { id: 'ai-summarize', label: 'Summarize Document', description: 'AI summarizes the current doc', icon: Sparkles, section: 'AI Commands', action: () => { sendMessage('Summarize the current document'); openAI(); setOpen(false); }, keywords: ['summarize', 'tldr'] },
    { id: 'ai-review', label: 'Review Code', description: 'AI reviews code for issues', icon: Sparkles, section: 'AI Commands', action: () => { sendMessage('Review the current code for bugs and improvements'); openAI(); setOpen(false); }, keywords: ['review', 'audit'] },
    { id: 'ai-plan', label: 'Plan Sprint', description: 'AI plans your next sprint', icon: Sparkles, section: 'AI Commands', action: () => { sendMessage('Help me plan the next sprint based on the backlog'); openAI(); setOpen(false); }, keywords: ['sprint', 'plan'] },
    { id: 'ai-generate', label: 'Generate Code', description: 'AI generates code from description', icon: Sparkles, section: 'AI Commands', action: () => { openAI(); setOpen(false); }, keywords: ['generate', 'write'] },

    // Navigation
    { id: 'nav-home', label: 'Dashboard', icon: BarChart3, section: 'Navigation', action: () => { router.push('/'); setOpen(false); }, keywords: ['home', 'dashboard'] },
    { id: 'nav-docs', label: 'Documents', icon: FileText, section: 'Navigation', action: () => { router.push('/documents'); setOpen(false); }, keywords: ['docs', 'documents'] },
    { id: 'nav-code', label: 'Code', icon: Code2, section: 'Navigation', action: () => { router.push('/code'); setOpen(false); }, keywords: ['code', 'editor'] },
    { id: 'nav-boards', label: 'Whiteboards', icon: PenTool, section: 'Navigation', action: () => { router.push('/boards'); setOpen(false); }, keywords: ['board', 'whiteboard', 'canvas'] },
    { id: 'nav-projects', label: 'Projects', icon: FolderKanban, section: 'Navigation', action: () => { router.push('/projects'); setOpen(false); }, keywords: ['project', 'tasks', 'kanban'] },
    { id: 'nav-team', label: 'Team', icon: Users, section: 'Navigation', action: () => { router.push('/team'); setOpen(false); }, keywords: ['team', 'members'] },
    { id: 'nav-settings', label: 'Settings', icon: Settings, section: 'Navigation', action: () => { router.push('/settings'); setOpen(false); }, keywords: ['settings', 'preferences'] },

    // Quick Actions
    { id: 'new-doc', label: 'New Document', description: 'Create a new document', icon: FileText, section: 'Quick Actions', action: () => { router.push('/documents?new=true'); setOpen(false); }, keywords: ['create', 'new', 'document'] },
    { id: 'new-code', label: 'New Code File', description: 'Create a new code file', icon: Code2, section: 'Quick Actions', action: () => { router.push('/code?new=true'); setOpen(false); }, keywords: ['create', 'new', 'code'] },
    { id: 'new-board', label: 'New Whiteboard', description: 'Create a new whiteboard', icon: PenTool, section: 'Quick Actions', action: () => { router.push('/boards?new=true'); setOpen(false); }, keywords: ['create', 'new', 'board'] },
    { id: 'new-task', label: 'New Task', description: 'Create a new task', icon: FolderKanban, section: 'Quick Actions', action: () => { router.push('/projects?new=true'); setOpen(false); }, keywords: ['create', 'new', 'task'] },
  ];

  const filtered = query.trim()
    ? commands.filter((cmd) => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some((kw) => kw.includes(q))
        );
      })
    : commands;

  // Group by section
  const sections = new Map<string, CommandItem[]>();
  for (const cmd of filtered) {
    const existing = sections.get(cmd.section) || [];
    existing.push(cmd);
    sections.set(cmd.section, existing);
  }

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const flatItems = Array.from(sections.values()).flat();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flatItems[selectedIndex]?.action();
      }
    },
    [sections, selectedIndex]
  );

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-lg animate-scale-in rounded-2xl border border-surface-200 bg-white shadow-elevated dark:border-surface-700 dark:bg-surface-900">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-surface-200 px-4 dark:border-surface-700">
          <Search className="h-5 w-5 shrink-0 text-surface-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent py-4 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none dark:text-white"
            placeholder="Type a command or search..."
          />
          <kbd className="rounded bg-surface-100 px-1.5 py-0.5 text-2xs font-mono text-surface-400 dark:bg-surface-800">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto scrollbar-thin p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-surface-400">
              No results found for &quot;{query}&quot;
            </div>
          )}

          {Array.from(sections.entries()).map(([section, items]) => (
            <div key={section} className="mb-2">
              <div className="px-2 py-1.5 text-2xs font-medium uppercase tracking-wider text-surface-400">
                {section}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const isSelected = flatIndex === selectedIndex;
                const currentIndex = flatIndex;
                flatIndex++;
                const isAISection = section === 'AI Commands';
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-100'
                        : 'text-surface-700 hover:bg-surface-50 dark:text-surface-300 dark:hover:bg-surface-800/50'
                    )}
                  >
                    <Icon className={cn(
                      'h-4 w-4 shrink-0',
                      isAISection ? 'text-brand-500' : 'opacity-60'
                    )} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{item.label}</span>
                      {item.description && (
                        <span className="ml-2 text-xs text-surface-400">{item.description}</span>
                      )}
                    </div>
                    {isSelected && <ArrowRight className="h-3.5 w-3.5 text-surface-400" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-surface-200 px-4 py-2 text-2xs text-surface-400 dark:border-surface-700">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="rounded bg-surface-100 px-1 dark:bg-surface-800">&uarr;&darr;</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="rounded bg-surface-100 px-1 dark:bg-surface-800">&crarr;</kbd> Select</span>
          </div>
          <span>CollabSpace AI</span>
        </div>
      </div>
    </div>
  );
}
