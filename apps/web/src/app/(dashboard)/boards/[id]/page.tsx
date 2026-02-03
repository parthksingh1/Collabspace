'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
  Grid3X3, Magnet, Download, Share2, Users, Sparkles,
  MapIcon, MoreHorizontal, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Canvas } from '@/components/whiteboard/canvas';
import { Toolbar } from '@/components/whiteboard/toolbar';
import { PropertiesPanel } from '@/components/whiteboard/properties-panel';
import { useWhiteboardStore } from '@/stores/whiteboard-store';
import { useToastStore } from '@/stores/toast-store';

// ─── Presence demo ─────────────────────────────────────────────
const DEMO_COLLABORATORS = [
  { id: '1', name: 'Sarah Chen', initials: 'SC', color: 'bg-blue-500' },
  { id: '2', name: 'Alex Rivera', initials: 'AR', color: 'bg-emerald-500' },
  { id: '3', name: 'James Kim', initials: 'JK', color: 'bg-amber-500' },
];

// ─── Minimap ────────────────────────────────────────────────────
function Minimap() {
  const elements = useWhiteboardStore((s) => s.elements);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const setViewport = useWhiteboardStore((s) => s.setViewport);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Find content bounds
    let minX = 0, minY = 0, maxX = 1000, maxY = 600;
    if (elements.length > 0) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const e of elements) {
        if (e.type === 'connector') continue;
        minX = Math.min(minX, e.x);
        minY = Math.min(minY, e.y);
        maxX = Math.max(maxX, e.x + e.width);
        maxY = Math.max(maxY, e.y + e.height);
      }
    }
    const pad = 100;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const cw = maxX - minX;
    const ch = maxY - minY;
    const scale = Math.min(W / cw, H / ch);
    const offsetX = (W - cw * scale) / 2 - minX * scale;
    const offsetY = (H - ch * scale) / 2 - minY * scale;

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, W, H);

    // Draw each element as a colored rect
    for (const e of elements) {
      if (e.type === 'connector') continue;
      ctx.fillStyle = e.fill && e.fill !== 'transparent' ? e.fill : '#e4e4e7';
      ctx.fillRect(e.x * scale + offsetX, e.y * scale + offsetY, Math.max(1, e.width * scale), Math.max(1, e.height * scale));
    }

    // Viewport rect
    const vw = window.innerWidth / viewport.zoom;
    const vh = window.innerHeight / viewport.zoom;
    const vx = -viewport.x / viewport.zoom;
    const vy = -viewport.y / viewport.zoom;
    ctx.strokeStyle = '#20af9c';
    ctx.lineWidth = 2;
    ctx.strokeRect(vx * scale + offsetX, vy * scale + offsetY, vw * scale, vh * scale);
  }, [elements, viewport]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Simple click-to-jump
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    let minX = 0, minY = 0, maxX = 1000, maxY = 600;
    if (elements.length > 0) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const el of elements) {
        if (el.type === 'connector') continue;
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }
    }
    const pad = 100;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const cw = maxX - minX;
    const ch = maxY - minY;
    const W = rect.width;
    const H = rect.height;
    const scale = Math.min(W / cw, H / ch);
    const offsetX = (W - cw * scale) / 2 - minX * scale;
    const offsetY = (H - ch * scale) / 2 - minY * scale;

    // World position at click
    const wx = (px - offsetX) / scale;
    const wy = (py - offsetY) / scale;

    // Center viewport on wx, wy
    setViewport({
      x: window.innerWidth / 2 - wx * viewport.zoom,
      y: window.innerHeight / 2 - wy * viewport.zoom,
      zoom: viewport.zoom,
    });
  }, [elements, viewport.zoom, setViewport]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      onClick={handleClick}
      className="cursor-pointer rounded-md border border-surface-200 dark:border-surface-700"
    />
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function WhiteboardPage() {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const {
    viewport, zoomIn, zoomOut, resetZoom,
    showGrid, toggleGrid, snapToGrid, toggleSnap,
    showMinimap, toggleMinimap,
    historyIndex, history, undo, redo,
  } = useWhiteboardStore();

  const [title, setTitle] = useState('System Architecture');
  const [editingTitle, setEditingTitle] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Export to PNG
  const exportPNG = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addToast({ title: 'Exported', description: 'Whiteboard saved as PNG', variant: 'success' });
  }, [title, addToast]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    addToast({ title: 'Link copied', description: 'Share link has been copied to clipboard', variant: 'success' });
  }, [addToast]);

  return (
    <div className="fixed inset-0 flex flex-col bg-surface-50 dark:bg-surface-950">
      {/* Top bar */}
      <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-surface-200 bg-white px-3 dark:border-surface-700 dark:bg-surface-900">
        {/* Left */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/boards')}
            className="btn-ghost rounded-lg p-1.5"
            title="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="h-5 w-px bg-surface-200 dark:bg-surface-700" />
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false);
              }}
              className="rounded-md border border-brand-400 bg-white px-2 py-1 text-sm font-medium outline-none dark:bg-surface-800 dark:text-white"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-surface-900 hover:bg-surface-100 dark:text-white dark:hover:bg-surface-800"
            >
              {title}
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          )}
          <span className="badge-neutral text-2xs">Auto-saved</span>
        </div>

        {/* Center — history + view toggles */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="btn-ghost rounded-lg p-1.5 disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="btn-ghost rounded-lg p-1.5 disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          <div className="h-5 w-px bg-surface-200 mx-1 dark:bg-surface-700" />

          <button
            onClick={toggleGrid}
            className={cn('btn-ghost rounded-lg p-1.5', showGrid && 'text-brand-600 dark:text-brand-400')}
            title={showGrid ? 'Hide grid' : 'Show grid'}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSnap}
            className={cn('btn-ghost rounded-lg p-1.5', snapToGrid && 'text-brand-600 dark:text-brand-400')}
            title={snapToGrid ? 'Disable snap to grid' : 'Snap to grid'}
          >
            <Magnet className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMinimap}
            className={cn('btn-ghost rounded-lg p-1.5', showMinimap && 'text-brand-600 dark:text-brand-400')}
            title={showMinimap ? 'Hide minimap' : 'Show minimap'}
          >
            <MapIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Right — collaborators + actions */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {DEMO_COLLABORATORS.map((u) => (
              <div
                key={u.id}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-2xs font-semibold text-white dark:border-surface-900',
                  u.color
                )}
                title={u.name}
              >
                {u.initials}
              </div>
            ))}
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-surface-100 text-2xs font-semibold text-surface-500 dark:border-surface-900 dark:bg-surface-800">
              +2
            </div>
          </div>

          <div className="h-5 w-px bg-surface-200 dark:bg-surface-700" />

          <button
            onClick={() => setAiOpen(!aiOpen)}
            className={cn('btn-ghost rounded-lg p-1.5', aiOpen && 'text-brand-600')}
            title="AI assistant"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button onClick={exportPNG} className="btn-ghost rounded-lg p-1.5" title="Export PNG">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={copyLink} className="btn-primary gap-1.5 px-3 py-1.5 text-xs">
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Floating left toolbar */}
        <div className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
          <Toolbar />
        </div>

        {/* Canvas */}
        <Canvas className="flex-1" />

        {/* Properties panel */}
        <PropertiesPanel />

        {/* Bottom-left: AI prompt panel */}
        {aiOpen && (
          <div className="absolute bottom-4 left-20 z-10 w-[380px] animate-slide-up rounded-xl border border-surface-200 bg-white p-4 shadow-elevated dark:border-surface-700 dark:bg-surface-900">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950">
                <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-surface-900 dark:text-white">AI Diagram</h4>
                <p className="text-2xs text-surface-400">Generate shapes from a prompt</p>
              </div>
              <button onClick={() => setAiOpen(false)} className="btn-ghost rounded-md p-1 text-surface-400">
                ×
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="e.g. A microservices architecture with API gateway, 3 services, and a database"
              className="input text-sm resize-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-2xs text-surface-400">Powered by Gemini</span>
              <button
                onClick={() => addToast({ title: 'AI generation started', description: 'Diagram will appear in a moment', variant: 'info' })}
                className="btn-primary px-3 py-1.5 text-xs"
              >
                Generate
              </button>
            </div>
          </div>
        )}

        {/* Bottom-right: zoom controls */}
        <div className="absolute bottom-4 right-72 z-10 flex items-center gap-1 rounded-xl border border-surface-200 bg-white p-1 shadow-medium dark:border-surface-700 dark:bg-surface-900">
          <button onClick={zoomOut} className="btn-ghost rounded-lg p-1.5" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={resetZoom}
            className="min-w-[48px] rounded-md px-2 py-1 text-xs font-medium text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800 transition-colors"
            title="Reset zoom"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button onClick={zoomIn} className="btn-ghost rounded-lg p-1.5" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="h-5 w-px bg-surface-200 dark:bg-surface-700" />
          <button
            onClick={() => resetZoom()}
            className="btn-ghost rounded-lg p-1.5"
            title="Fit to screen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Minimap */}
        {showMinimap && (
          <div className="absolute bottom-4 left-20 z-10 rounded-xl border border-surface-200 bg-white/95 p-2 shadow-medium backdrop-blur dark:border-surface-700 dark:bg-surface-900/95" style={{ display: aiOpen ? 'none' : 'block' }}>
            <Minimap />
            <div className="mt-1 flex items-center justify-between px-1">
              <span className="text-2xs text-surface-400">Minimap</span>
              <button onClick={toggleMinimap} className="text-2xs text-surface-400 hover:text-surface-600">
                hide
              </button>
            </div>
          </div>
        )}

        {/* Bottom center: keyboard hints */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-surface-200 bg-white/90 px-4 py-1.5 text-2xs text-surface-500 shadow-soft backdrop-blur dark:border-surface-700 dark:bg-surface-900/90">
          <span>
            <kbd className="font-mono">Space</kbd>+drag to pan · <kbd className="font-mono">Ctrl</kbd>+scroll to zoom · <kbd className="font-mono">Del</kbd> to remove
          </span>
        </div>
      </div>
    </div>
  );
}
