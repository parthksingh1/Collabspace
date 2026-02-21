'use client';

import { create } from 'zustand';
import type {
  WhiteboardElement,
  ToolType,
  Viewport,
} from '@/components/whiteboard/types';

// ─── Demo seed data ─────────────────────────────────────────────

const DEMO_ELEMENTS: WhiteboardElement[] = [
  // Title
  {
    id: 'title',
    type: 'text',
    x: 80,
    y: 40,
    width: 500,
    height: 48,
    rotation: 0,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
    text: 'CollabSpace · System Architecture',
    fontSize: 28,
    fontFamily: 'Inter, sans-serif',
    textAlign: 'left',
    textColor: '#18181b',
    zIndex: 0,
  },
  // Web client
  {
    id: 'e-client',
    type: 'rectangle',
    x: 80,
    y: 140,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#e0f2fe',
    stroke: '#0284c7',
    strokeWidth: 2,
    opacity: 1,
    text: 'Web Client\nNext.js · React',
    fontSize: 14,
    textAlign: 'center',
    textColor: '#0c4a6e',
    zIndex: 1,
  },
  // API Gateway
  {
    id: 'e-gateway',
    type: 'rectangle',
    x: 380,
    y: 140,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#dcfce7',
    stroke: '#16a34a',
    strokeWidth: 2,
    opacity: 1,
    text: 'API Gateway\nExpress · Rate Limit',
    fontSize: 14,
    textAlign: 'center',
    textColor: '#14532d',
    zIndex: 2,
  },
  // Auth Service
  {
    id: 'e-auth',
    type: 'rectangle',
    x: 680,
    y: 40,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#fef3c7',
    stroke: '#d97706',
    strokeWidth: 2,
    opacity: 1,
    text: 'Auth Service\nJWT · RBAC',
    fontSize: 14,
    textAlign: 'center',
    textColor: '#78350f',
    zIndex: 3,
  },
  // Doc Service
  {
    id: 'e-doc',
    type: 'rectangle',
    x: 680,
    y: 160,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#fae8ff',
    stroke: '#a21caf',
    strokeWidth: 2,
    opacity: 1,
    text: 'Document Service\nTiptap · Yjs CRDT',
    fontSize: 14,
    textAlign: 'center',
    textColor: '#701a75',
    zIndex: 4,
  },
  // AI Service
  {
    id: 'e-ai',
    type: 'rectangle',
    x: 680,
    y: 280,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#e0f2f1',
    stroke: '#20af9c',
    strokeWidth: 2,
    opacity: 1,
    text: 'AI Service\nGemini · OpenAI',
    fontSize: 14,
    textAlign: 'center',
    textColor: '#134e4a',
    zIndex: 5,
  },
  // Database
  {
    id: 'e-db',
    type: 'ellipse',
    x: 380,
    y: 340,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#fce7f3',
    stroke: '#db2777',
    strokeWidth: 2,
    opacity: 1,
    text: 'PostgreSQL',
    fontSize: 15,
    textAlign: 'center',
    textColor: '#831843',
    zIndex: 6,
  },
  // Redis
  {
    id: 'e-redis',
    type: 'ellipse',
    x: 80,
    y: 340,
    width: 200,
    height: 90,
    rotation: 0,
    fill: '#fecaca',
    stroke: '#dc2626',
    strokeWidth: 2,
    opacity: 1,
    text: 'Redis Cache',
    fontSize: 15,
    textAlign: 'center',
    textColor: '#7f1d1d',
    zIndex: 7,
  },
  // Sticky note
  {
    id: 'e-sticky',
    type: 'sticky',
    x: 940,
    y: 140,
    width: 180,
    height: 140,
    rotation: 2,
    fill: '#fef3c7',
    stroke: '#d97706',
    strokeWidth: 0,
    opacity: 1,
    text: '💡 Remember to\nrate-limit the AI\nendpoints separately',
    fontSize: 14,
    textAlign: 'left',
    textColor: '#78350f',
    zIndex: 8,
  },
  // Connectors
  {
    id: 'conn-1',
    type: 'connector',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1,
    sourceId: 'e-client', targetId: 'e-gateway',
    sourceAnchor: 'right', targetAnchor: 'left',
    zIndex: 9,
  },
  {
    id: 'conn-2',
    type: 'connector',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1,
    sourceId: 'e-gateway', targetId: 'e-auth',
    sourceAnchor: 'right', targetAnchor: 'left',
    zIndex: 10,
  },
  {
    id: 'conn-3',
    type: 'connector',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1,
    sourceId: 'e-gateway', targetId: 'e-doc',
    sourceAnchor: 'right', targetAnchor: 'left',
    zIndex: 11,
  },
  {
    id: 'conn-4',
    type: 'connector',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1,
    sourceId: 'e-gateway', targetId: 'e-ai',
    sourceAnchor: 'right', targetAnchor: 'left',
    zIndex: 12,
  },
  {
    id: 'conn-5',
    type: 'connector',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1,
    sourceId: 'e-doc', targetId: 'e-db',
    sourceAnchor: 'bottom', targetAnchor: 'right',
    zIndex: 13,
  },
  {
    id: 'conn-6',
    type: 'connector',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1,
    sourceId: 'e-gateway', targetId: 'e-redis',
    sourceAnchor: 'bottom', targetAnchor: 'right',
    zIndex: 14,
  },
];

// ─── Store Shape ────────────────────────────────────────────────

interface WhiteboardState {
  // Data
  elements: WhiteboardElement[];
  selectedIds: string[];
  activeTool: ToolType;
  viewport: Viewport;

  // Style defaults used when creating new elements
  defaultFill: string;
  defaultStroke: string;
  defaultStrokeWidth: number;
  defaultOpacity: number;
  defaultFontSize: number;

  // UI toggles
  showGrid: boolean;
  snapToGrid: boolean;
  showMinimap: boolean;

  // History
  history: WhiteboardElement[][];
  historyIndex: number;

  // Clipboard (in-memory)
  clipboard: WhiteboardElement[];

  // Actions - elements
  addElement: (el: WhiteboardElement) => void;
  addElements: (els: WhiteboardElement[]) => void;
  updateElement: (id: string, patch: Partial<WhiteboardElement>) => void;
  updateElements: (ids: string[], patch: Partial<WhiteboardElement>) => void;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;

  // Selection
  setSelected: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Tool / viewport
  setTool: (tool: ToolType) => void;
  setViewport: (viewport: Viewport) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  zoomToFit: (canvasWidth: number, canvasHeight: number) => void;

  // Style defaults
  setDefaultFill: (color: string) => void;
  setDefaultStroke: (color: string) => void;
  setDefaultStrokeWidth: (w: number) => void;
  setDefaultOpacity: (o: number) => void;

  // Toggles
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleMinimap: () => void;

  // History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Clipboard
  copy: () => void;
  paste: () => void;
}

const MAX_HISTORY = 50;

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  elements: DEMO_ELEMENTS,
  selectedIds: [],
  activeTool: 'select',
  viewport: { x: 0, y: 0, zoom: 1 },

  defaultFill: '#ffffff',
  defaultStroke: '#18181b',
  defaultStrokeWidth: 2,
  defaultOpacity: 1,
  defaultFontSize: 16,

  showGrid: true,
  snapToGrid: false,
  showMinimap: true,

  history: [DEMO_ELEMENTS],
  historyIndex: 0,
  clipboard: [],

  // ─── Elements ───

  addElement: (el) => {
    set((state) => ({ elements: [...state.elements, el] }));
    get().pushHistory();
  },

  addElements: (els) => {
    set((state) => ({ elements: [...state.elements, ...els] }));
    get().pushHistory();
  },

  updateElement: (id, patch) => {
    set((state) => ({
      elements: state.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  updateElements: (ids, patch) => {
    set((state) => ({
      elements: state.elements.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)),
    }));
  },

  deleteElements: (ids) => {
    set((state) => ({
      elements: state.elements.filter(
        (e) => !ids.includes(e.id) && e.sourceId !== undefined
          ? !(ids.includes(e.sourceId!) || ids.includes(e.targetId!))
          : !ids.includes(e.id)
      ),
      selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
    }));
    get().pushHistory();
  },

  duplicateElements: (ids) => {
    const { elements } = get();
    const clones = elements
      .filter((e) => ids.includes(e.id))
      .map((e) => ({
        ...e,
        id: `${e.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: e.x + 20,
        y: e.y + 20,
        zIndex: Math.max(0, ...elements.map((x) => x.zIndex)) + 1,
      }));
    set((state) => ({
      elements: [...state.elements, ...clones],
      selectedIds: clones.map((c) => c.id),
    }));
    get().pushHistory();
  },

  bringToFront: (ids) => {
    const { elements } = get();
    const maxZ = Math.max(0, ...elements.map((e) => e.zIndex));
    set({
      elements: elements.map((e, i) =>
        ids.includes(e.id) ? { ...e, zIndex: maxZ + 1 + ids.indexOf(e.id) } : e
      ),
    });
    get().pushHistory();
  },

  sendToBack: (ids) => {
    const { elements } = get();
    const minZ = Math.min(0, ...elements.map((e) => e.zIndex));
    set({
      elements: elements.map((e) =>
        ids.includes(e.id) ? { ...e, zIndex: minZ - 1 - ids.indexOf(e.id) } : e
      ),
    });
    get().pushHistory();
  },

  // ─── Selection ───

  setSelected: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) =>
    set((state) =>
      state.selectedIds.includes(id) ? state : { selectedIds: [...state.selectedIds, id] }
    ),
  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  selectAll: () =>
    set((state) => ({
      selectedIds: state.elements.filter((e) => e.type !== 'connector').map((e) => e.id),
    })),

  // ─── Tool / viewport ───

  setTool: (tool) => set({ activeTool: tool, selectedIds: tool === 'select' ? get().selectedIds : [] }),
  setViewport: (viewport) => set({ viewport }),
  zoomIn: () =>
    set((state) => ({
      viewport: { ...state.viewport, zoom: Math.min(state.viewport.zoom * 1.2, 5) },
    })),
  zoomOut: () =>
    set((state) => ({
      viewport: { ...state.viewport, zoom: Math.max(state.viewport.zoom / 1.2, 0.1) },
    })),
  resetZoom: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),

  zoomToFit: (canvasWidth, canvasHeight) => {
    const { elements } = get();
    if (elements.length === 0) {
      set({ viewport: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of elements) {
      if (e.type === 'connector') continue;
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.width);
      maxY = Math.max(maxY, e.y + e.height);
    }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 80;
    const zoom = Math.min(
      (canvasWidth - padding * 2) / contentW,
      (canvasHeight - padding * 2) / contentH,
      1.5
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    set({
      viewport: {
        zoom,
        x: canvasWidth / 2 - cx * zoom,
        y: canvasHeight / 2 - cy * zoom,
      },
    });
  },

  // ─── Style defaults ───

  setDefaultFill: (color) => set({ defaultFill: color }),
  setDefaultStroke: (color) => set({ defaultStroke: color }),
  setDefaultStrokeWidth: (w) => set({ defaultStrokeWidth: w }),
  setDefaultOpacity: (o) => set({ defaultOpacity: o }),

  // ─── Toggles ───

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),

  // ─── History ───

  pushHistory: () => {
    const { elements, history, historyIndex } = get();
    const snapshot = JSON.parse(JSON.stringify(elements)) as WhiteboardElement[];
    const trimmed = history.slice(0, historyIndex + 1);
    const next = [...trimmed, snapshot];
    // Limit history
    while (next.length > MAX_HISTORY) next.shift();
    set({ history: next, historyIndex: next.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({
      elements: JSON.parse(JSON.stringify(history[newIndex])),
      historyIndex: newIndex,
      selectedIds: [],
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({
      elements: JSON.parse(JSON.stringify(history[newIndex])),
      historyIndex: newIndex,
      selectedIds: [],
    });
  },

  // ─── Clipboard ───

  copy: () => {
    const { elements, selectedIds } = get();
    set({
      clipboard: elements
        .filter((e) => selectedIds.includes(e.id))
        .map((e) => JSON.parse(JSON.stringify(e))),
    });
  },

  paste: () => {
    const { clipboard, elements } = get();
    if (clipboard.length === 0) return;
    const maxZ = Math.max(0, ...elements.map((e) => e.zIndex));
    const now = Date.now();
    const clones = clipboard.map((e, i) => ({
      ...e,
      id: `${e.type}-${now}-${i}`,
      x: e.x + 24,
      y: e.y + 24,
      zIndex: maxZ + 1 + i,
    }));
    set((state) => ({
      elements: [...state.elements, ...clones],
      selectedIds: clones.map((c) => c.id),
    }));
    get().pushHistory();
  },
}));
