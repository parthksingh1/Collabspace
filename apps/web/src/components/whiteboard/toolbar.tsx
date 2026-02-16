'use client';

import { useWhiteboardStore } from '@/stores/whiteboard-store';
import type { ToolType } from './types';
import {
  MousePointer2, Hand, Square, Circle, Triangle, Minus,
  MoveUpRight, Spline, Type, StickyNote, Pencil, Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Vertical, floating toolbar on the left side — Miro style.

const tools: { id: ToolType; label: string; icon: typeof MousePointer2; shortcut: string; group: number }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V', group: 0 },
  { id: 'hand', label: 'Hand (pan)', icon: Hand, shortcut: 'H', group: 0 },
  { id: 'rectangle', label: 'Rectangle', icon: Square, shortcut: 'R', group: 1 },
  { id: 'ellipse', label: 'Ellipse', icon: Circle, shortcut: 'O', group: 1 },
  { id: 'triangle', label: 'Triangle', icon: Triangle, shortcut: '', group: 1 },
  { id: 'line', label: 'Line', icon: Minus, shortcut: 'L', group: 2 },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight, shortcut: 'A', group: 2 },
  { id: 'connector', label: 'Smart connector', icon: Spline, shortcut: 'C', group: 2 },
  { id: 'text', label: 'Text', icon: Type, shortcut: 'T', group: 3 },
  { id: 'sticky', label: 'Sticky note', icon: StickyNote, shortcut: 'S', group: 3 },
  { id: 'pen', label: 'Pen (smart shapes)', icon: Pencil, shortcut: 'P', group: 3 },
  { id: 'eraser', label: 'Eraser', icon: Eraser, shortcut: 'E', group: 4 },
];

export function Toolbar() {
  const activeTool = useWhiteboardStore((s) => s.activeTool);
  const setTool = useWhiteboardStore((s) => s.setTool);

  let prevGroup = 0;

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-surface-200 bg-white p-1.5 shadow-elevated dark:border-surface-700 dark:bg-surface-900">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        const needsDivider = tool.group !== prevGroup;
        prevGroup = tool.group;

        return (
          <div key={tool.id} className="flex flex-col gap-1">
            {needsDivider && <div className="mx-1 h-px bg-surface-200 dark:bg-surface-700" />}
            <div className="group relative">
              <button
                onClick={() => setTool(tool.id)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                  isActive
                    ? 'bg-brand-500 text-white shadow-sm scale-[1.03]'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100'
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>

              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs text-surface-700 shadow-medium group-hover:flex dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300">
                <span>{tool.label}</span>
                {tool.shortcut && (
                  <kbd className="rounded bg-surface-100 px-1.5 py-0.5 text-2xs font-mono text-surface-400 dark:bg-surface-800">
                    {tool.shortcut}
                  </kbd>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
