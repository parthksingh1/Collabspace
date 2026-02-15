'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useWhiteboardStore } from '@/stores/whiteboard-store';
import type { WhiteboardElement, ResizeHandle, AnchorSide } from './types';

// ─── Constants ──────────────────────────────────────────────────
const GRID_SIZE = 20;
const HANDLE_SIZE = 10;
const SNAP_THRESHOLD = 6;
const ANCHOR_SNAP_DISTANCE = 40;
const ROTATION_HANDLE_OFFSET = 28;

// ─── Helpers ────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getElementBounds(e: WhiteboardElement) {
  return { x: e.x, y: e.y, width: e.width, height: e.height };
}

function getAnchorPoint(e: WhiteboardElement, side: AnchorSide): { x: number; y: number } {
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  switch (side) {
    case 'top': return { x: cx, y: e.y };
    case 'right': return { x: e.x + e.width, y: cy };
    case 'bottom': return { x: cx, y: e.y + e.height };
    case 'left': return { x: e.x, y: cy };
  }
}

function getAnchors(e: WhiteboardElement) {
  return [
    { side: 'top' as AnchorSide, ...getAnchorPoint(e, 'top') },
    { side: 'right' as AnchorSide, ...getAnchorPoint(e, 'right') },
    { side: 'bottom' as AnchorSide, ...getAnchorPoint(e, 'bottom') },
    { side: 'left' as AnchorSide, ...getAnchorPoint(e, 'left') },
  ];
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function pointInEllipse(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx === 0 || ry === 0) return false;
  return ((px - cx) ** 2) / (rx ** 2) + ((py - cy) ** 2) / (ry ** 2) <= 1;
}

function hitTestElement(e: WhiteboardElement, px: number, py: number): boolean {
  if (e.type === 'ellipse') return pointInEllipse(px, py, e.x, e.y, e.width, e.height);
  if (e.type === 'line' || e.type === 'arrow') {
    // Line from (x,y) to (x+width, y+height) — check distance to segment
    const dx = e.width;
    const dy = e.height;
    const len = Math.hypot(dx, dy);
    if (len === 0) return false;
    const t = Math.max(0, Math.min(1, ((px - e.x) * dx + (py - e.y) * dy) / (len * len)));
    const cx = e.x + t * dx;
    const cy = e.y + t * dy;
    return Math.hypot(px - cx, py - cy) < 8;
  }
  if (e.type === 'pen' && e.points && e.points.length >= 4) {
    for (let i = 0; i < e.points.length - 2; i += 2) {
      const x1 = e.x + e.points[i];
      const y1 = e.y + e.points[i + 1];
      const x2 = e.x + e.points[i + 2];
      const y2 = e.y + e.points[i + 3];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
      const cx = x1 + t * dx;
      const cy = y1 + t * dy;
      if (Math.hypot(px - cx, py - cy) < 8) return true;
    }
    return false;
  }
  return pointInRect(px, py, e.x, e.y, e.width, e.height);
}

// Detect which resize handle (if any) is at point
function getHandleAt(
  e: WhiteboardElement,
  px: number,
  py: number,
  zoom: number
): ResizeHandle | null {
  const hs = HANDLE_SIZE / zoom;
  const cx = e.x + e.width / 2;
  const handles: { h: ResizeHandle; x: number; y: number }[] = [
    { h: 'nw', x: e.x, y: e.y },
    { h: 'n', x: cx, y: e.y },
    { h: 'ne', x: e.x + e.width, y: e.y },
    { h: 'e', x: e.x + e.width, y: e.y + e.height / 2 },
    { h: 'se', x: e.x + e.width, y: e.y + e.height },
    { h: 's', x: cx, y: e.y + e.height },
    { h: 'sw', x: e.x, y: e.y + e.height },
    { h: 'w', x: e.x, y: e.y + e.height / 2 },
    { h: 'rotate', x: cx, y: e.y - ROTATION_HANDLE_OFFSET / zoom },
  ];
  for (const h of handles) {
    if (Math.abs(px - h.x) <= hs && Math.abs(py - h.y) <= hs) return h.h;
  }
  return null;
}

// Shape recognition for freehand — detect if closed path resembles rectangle or circle
function recognizeShape(
  points: number[]
): { type: 'rectangle' | 'ellipse'; x: number; y: number; width: number; height: number } | null {
  if (points.length < 20) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 30 || h < 30) return null;

  // Check if path is roughly closed (start ≈ end)
  const startX = points[0], startY = points[1];
  const endX = points[points.length - 2], endY = points[points.length - 1];
  const closureDist = Math.hypot(endX - startX, endY - startY);
  if (closureDist > Math.max(w, h) * 0.25) return null;

  // Measure how well points fit to an ellipse vs rectangle
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = w / 2;
  const ry = h / 2;
  let ellipseError = 0;
  let rectError = 0;
  const samples = Math.min(40, points.length / 2);
  for (let s = 0; s < samples; s++) {
    const i = Math.floor((s / samples) * points.length / 2) * 2;
    const px = points[i];
    const py = points[i + 1];
    const dEllipse = Math.abs(((px - cx) ** 2) / (rx ** 2) + ((py - cy) ** 2) / (ry ** 2) - 1);
    ellipseError += dEllipse;
    const dRect = Math.min(
      Math.abs(px - minX), Math.abs(px - maxX),
      Math.abs(py - minY), Math.abs(py - maxY)
    ) / Math.max(w, h);
    rectError += dRect;
  }
  ellipseError /= samples;
  rectError /= samples;

  if (ellipseError < 0.2 && ellipseError < rectError * 0.8) {
    return { type: 'ellipse', x: minX, y: minY, width: w, height: h };
  }
  if (rectError < 0.1) {
    return { type: 'rectangle', x: minX, y: minY, width: w, height: h };
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────

interface CanvasProps {
  className?: string;
}

export function Canvas({ className }: CanvasProps) {
  const store = useWhiteboardStore();
  const {
    elements, selectedIds, activeTool, viewport,
    defaultFill, defaultStroke, defaultStrokeWidth, defaultOpacity, defaultFontSize,
    showGrid, snapToGrid,
    addElement, updateElements, deleteElements,
    setSelected, clearSelection, setTool, setViewport, pushHistory,
  } = store;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Interaction state
  const [draft, setDraft] = useState<WhiteboardElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'create' | 'move' | 'resize' | 'rotate' | 'select-box'>('none');
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [selectBox, setSelectBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ elementId: string; side: AnchorSide } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [initialStates, setInitialStates] = useState<Map<string, WhiteboardElement>>(new Map());

  const zoom = viewport.zoom;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Space key for panning
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setSpacePressed(true);
        e.preventDefault();
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingTextId) return;
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        deleteElements(selectedIds);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        store.redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        store.duplicateElements(selectedIds);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        store.selectAll();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        store.copy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        store.paste();
      }
      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey) {
        const map: Record<string, string> = {
          v: 'select', h: 'hand', r: 'rectangle', o: 'ellipse',
          l: 'line', a: 'arrow', c: 'connector', t: 'text',
          s: 'sticky', p: 'pen', e: 'eraser',
        };
        if (map[e.key]) {
          e.preventDefault();
          setTool(map[e.key] as never);
        }
        if (e.key === 'Escape') {
          clearSelection();
          setTool('select');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, editingTextId, deleteElements, setTool, clearSelection, store]);

  // Convert screen to world
  const toWorld = useCallback((sx: number, sy: number): { x: number; y: number } => {
    return { x: (sx - viewport.x) / zoom, y: (sy - viewport.y) / zoom };
  }, [viewport.x, viewport.y, zoom]);

  // Elements sorted by zIndex for rendering
  const sorted = useMemo(
    () => [...elements].sort((a, b) => a.zIndex - b.zIndex),
    [elements]
  );

  const elementsById = useMemo(() => {
    const map = new Map<string, WhiteboardElement>();
    for (const e of elements) map.set(e.id, e);
    return map;
  }, [elements]);

  // ─── Rendering ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, size.w, size.h);

    // Apply viewport transform
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(zoom, zoom);

    // Dotted grid
    if (showGrid) {
      const gridStep = GRID_SIZE;
      const startX = Math.floor(-viewport.x / zoom / gridStep) * gridStep - gridStep;
      const startY = Math.floor(-viewport.y / zoom / gridStep) * gridStep - gridStep;
      const endX = startX + size.w / zoom + gridStep * 2;
      const endY = startY + size.h / zoom + gridStep * 2;
      ctx.fillStyle = '#d4d4d8';
      const dotSize = 1.2 / zoom;
      for (let x = startX; x < endX; x += gridStep) {
        for (let y = startY; y < endY; y += gridStep) {
          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Render each element
    const drawList = draft ? [...sorted, draft] : sorted;
    for (const el of drawList) {
      if (el.visible === false) continue;
      renderElement(ctx, el, elementsById);
    }

    // Selection outlines + handles
    for (const id of selectedIds) {
      const el = elementsById.get(id);
      if (el) renderSelectionOutline(ctx, el, zoom);
    }

    // Alignment guides
    if (guides.v.length || guides.h.length) {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      for (const x of guides.v) {
        ctx.beginPath();
        ctx.moveTo(x, -viewport.y / zoom);
        ctx.lineTo(x, (-viewport.y + size.h) / zoom);
        ctx.stroke();
      }
      for (const y of guides.h) {
        ctx.beginPath();
        ctx.moveTo(-viewport.x / zoom, y);
        ctx.lineTo((-viewport.x + size.w) / zoom, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Hover anchor highlight (for connector tool)
    if (hoverAnchor) {
      const el = elementsById.get(hoverAnchor.elementId);
      if (el) {
        const p = getAnchorPoint(el, hoverAnchor.side);
        ctx.fillStyle = '#20af9c';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Show all anchors when connector tool is active and hovering over shapes
    if (activeTool === 'connector' || activeTool === 'arrow') {
      for (const el of sorted) {
        if (el.type === 'connector' || el.type === 'line' || el.type === 'arrow' || el.type === 'pen') continue;
        for (const a of getAnchors(el)) {
          ctx.fillStyle = hoverAnchor?.elementId === el.id && hoverAnchor?.side === a.side ? '#20af9c' : '#cbd5e1';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          ctx.arc(a.x, a.y, 5 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // Selection box (screen space)
    if (selectBox) {
      const x = Math.min(selectBox.x, selectBox.x + selectBox.w);
      const y = Math.min(selectBox.y, selectBox.y + selectBox.h);
      const w = Math.abs(selectBox.w);
      const h = Math.abs(selectBox.h);
      ctx.fillStyle = 'rgba(32, 175, 156, 0.1)';
      ctx.strokeStyle = '#20af9c';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [size, sorted, elementsById, selectedIds, viewport, zoom, showGrid, draft, selectBox, hoverAnchor, activeTool, guides]);

  // ─── Rendering helpers ───

  function renderElement(ctx: CanvasRenderingContext2D, el: WhiteboardElement, allElsById: Map<string, WhiteboardElement>) {
    ctx.save();
    ctx.globalAlpha = el.opacity;

    // Rotation around center
    if (el.rotation && el.type !== 'connector' && el.type !== 'line' && el.type !== 'arrow' && el.type !== 'pen') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.lineWidth = el.strokeWidth;
    ctx.strokeStyle = el.stroke;
    ctx.fillStyle = el.fill;

    if (el.type === 'rectangle') {
      roundRect(ctx, el.x, el.y, el.width, el.height, 8);
      if (el.fill !== 'transparent') ctx.fill();
      if (el.strokeWidth > 0 && el.stroke !== 'transparent') ctx.stroke();
      drawText(ctx, el);
    } else if (el.type === 'sticky') {
      // Subtle shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.10)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      roundRect(ctx, el.x, el.y, el.width, el.height, 4);
      ctx.fill();
      ctx.restore();
      drawText(ctx, el, 12);
    } else if (el.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, Math.abs(el.width) / 2, Math.abs(el.height) / 2, 0, 0, Math.PI * 2);
      if (el.fill !== 'transparent') ctx.fill();
      if (el.strokeWidth > 0) ctx.stroke();
      drawText(ctx, el);
    } else if (el.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(el.x + el.width / 2, el.y);
      ctx.lineTo(el.x + el.width, el.y + el.height);
      ctx.lineTo(el.x, el.y + el.height);
      ctx.closePath();
      if (el.fill !== 'transparent') ctx.fill();
      if (el.strokeWidth > 0) ctx.stroke();
      drawText(ctx, el);
    } else if (el.type === 'line' || el.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x + el.width, el.y + el.height);
      ctx.stroke();
      if (el.type === 'arrow') drawArrowhead(ctx, el.x, el.y, el.x + el.width, el.y + el.height, el.stroke, el.strokeWidth);
    } else if (el.type === 'connector') {
      const src = el.sourceId ? allElsById.get(el.sourceId) : null;
      const tgt = el.targetId ? allElsById.get(el.targetId) : null;
      if (src && tgt && el.sourceAnchor && el.targetAnchor) {
        drawConnector(ctx, src, tgt, el.sourceAnchor, el.targetAnchor, el.stroke, el.strokeWidth);
      }
    } else if (el.type === 'pen' && el.points && el.points.length >= 4) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(el.x + el.points[0], el.y + el.points[1]);
      for (let i = 2; i < el.points.length; i += 2) {
        ctx.lineTo(el.x + el.points[i], el.y + el.points[i + 1]);
      }
      ctx.stroke();
    } else if (el.type === 'text') {
      drawText(ctx, el, 0, true);
    }
    ctx.restore();
  }

  function drawText(ctx: CanvasRenderingContext2D, el: WhiteboardElement, padding = 8, anchorLeft = false) {
    if (!el.text) return;
    const fontSize = el.fontSize || 14;
    ctx.fillStyle = el.textColor || '#18181b';
    ctx.font = `${fontSize}px ${el.fontFamily || 'Inter, system-ui, sans-serif'}`;
    ctx.textBaseline = 'middle';
    const lines = el.text.split('\n');
    const lineHeight = fontSize * 1.4;
    const totalH = lines.length * lineHeight;
    const startY = el.y + el.height / 2 - totalH / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const yy = startY + i * lineHeight;
      if (anchorLeft || el.textAlign === 'left') {
        ctx.textAlign = 'left';
        ctx.fillText(line, el.x + padding, yy);
      } else if (el.textAlign === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(line, el.x + el.width - padding, yy);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(line, el.x + el.width / 2, yy);
      }
    }
  }

  function drawArrowhead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, sw: number) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 8 + sw * 1.5;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawConnector(
    ctx: CanvasRenderingContext2D,
    src: WhiteboardElement,
    tgt: WhiteboardElement,
    srcSide: AnchorSide,
    tgtSide: AnchorSide,
    color: string,
    sw: number,
  ) {
    const p1 = getAnchorPoint(src, srcSide);
    const p2 = getAnchorPoint(tgt, tgtSide);
    // Orthogonal routing with a midpoint
    ctx.strokeStyle = color;
    ctx.lineWidth = sw;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);

    // Route based on side orientations
    const horizontal = srcSide === 'left' || srcSide === 'right';
    if (horizontal) {
      const midX = (p1.x + p2.x) / 2;
      ctx.lineTo(midX, p1.y);
      ctx.lineTo(midX, p2.y);
    } else {
      const midY = (p1.y + p2.y) / 2;
      ctx.lineTo(p1.x, midY);
      ctx.lineTo(p2.x, midY);
    }
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Arrowhead
    const beforeP2 = horizontal ? { x: p1.x + (p2.x - p1.x) / 2, y: p2.y } : { x: p2.x, y: p1.y + (p2.y - p1.y) / 2 };
    drawArrowhead(ctx, beforeP2.x, beforeP2.y, p2.x, p2.y, color, sw);
  }

  function renderSelectionOutline(ctx: CanvasRenderingContext2D, el: WhiteboardElement, z: number) {
    if (el.type === 'connector') return;
    const b = getElementBounds(el);
    const pad = 4 / z;
    ctx.save();
    ctx.strokeStyle = '#20af9c';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([]);
    if (el.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, Math.abs(b.width) / 2 + pad, Math.abs(b.height) / 2 + pad, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    }

    // Handles
    const hs = HANDLE_SIZE / z;
    const handleFill = '#ffffff';
    const handleStroke = '#20af9c';
    const positions: { x: number; y: number }[] = [
      { x: b.x, y: b.y },
      { x: b.x + b.width / 2, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height / 2 },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x + b.width / 2, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
      { x: b.x, y: b.y + b.height / 2 },
    ];
    ctx.fillStyle = handleFill;
    ctx.strokeStyle = handleStroke;
    ctx.lineWidth = 1.5 / z;
    for (const p of positions) {
      ctx.beginPath();
      ctx.rect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      ctx.fill();
      ctx.stroke();
    }

    // Rotation handle
    const rx = b.x + b.width / 2;
    const ry = b.y - ROTATION_HANDLE_OFFSET / z;
    ctx.beginPath();
    ctx.moveTo(b.x + b.width / 2, b.y);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx, ry, hs * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ─── Interaction Logic ───

  const getMouse = (e: React.MouseEvent | MouseEvent): { sx: number; sy: number; wx: number; wy: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { sx: 0, sy: 0, wx: 0, wy: 0 };
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = toWorld(sx, sy);
    return { sx, sy, wx: x, wy: y };
  };

  const findHitElement = useCallback((wx: number, wy: number): WhiteboardElement | null => {
    // Reverse z-order for hit test (top first)
    const list = [...elements].sort((a, b) => b.zIndex - a.zIndex);
    for (const el of list) {
      if (el.visible === false || el.locked) continue;
      if (hitTestElement(el, wx, wy)) return el;
    }
    return null;
  }, [elements]);

  // Check if near an anchor of any shape
  const findAnchor = useCallback((wx: number, wy: number) => {
    for (const el of elements) {
      if (el.type === 'connector' || el.type === 'line' || el.type === 'arrow' || el.type === 'pen') continue;
      for (const a of getAnchors(el)) {
        if (Math.hypot(wx - a.x, wy - a.y) < ANCHOR_SNAP_DISTANCE / zoom) {
          return { elementId: el.id, side: a.side, x: a.x, y: a.y };
        }
      }
    }
    return null;
  }, [elements, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editingTextId) return;
    const { sx, sy, wx, wy } = getMouse(e);
    setDragStart({ x: sx, y: sy });

    // Pan with middle mouse or space+click
    if (e.button === 1 || spacePressed || activeTool === 'hand') {
      setDragMode('pan');
      return;
    }

    // Check for resize handle if single selection
    if (activeTool === 'select' && selectedIds.length === 1) {
      const sel = elementsById.get(selectedIds[0]);
      if (sel && sel.type !== 'connector') {
        const handle = getHandleAt(sel, wx, wy, zoom);
        if (handle) {
          setDragMode(handle === 'rotate' ? 'rotate' : 'resize');
          setActiveHandle(handle);
          const map = new Map<string, WhiteboardElement>();
          for (const e2 of elements) map.set(e2.id, { ...e2 });
          setInitialStates(map);
          return;
        }
      }
    }

    // Select tool: hit test
    if (activeTool === 'select') {
      const hit = findHitElement(wx, wy);
      if (hit) {
        if (e.shiftKey) store.toggleSelection(hit.id);
        else if (!selectedIds.includes(hit.id)) setSelected([hit.id]);
        setDragMode('move');
        const map = new Map<string, WhiteboardElement>();
        for (const e2 of elements) map.set(e2.id, { ...e2 });
        setInitialStates(map);
      } else {
        if (!e.shiftKey) clearSelection();
        setDragMode('select-box');
        setSelectBox({ x: sx, y: sy, w: 0, h: 0 });
      }
      return;
    }

    // Eraser
    if (activeTool === 'eraser') {
      const hit = findHitElement(wx, wy);
      if (hit) deleteElements([hit.id]);
      return;
    }

    // Text tool
    if (activeTool === 'text') {
      const id = `text-${Date.now()}`;
      const newEl: WhiteboardElement = {
        id, type: 'text',
        x: wx, y: wy, width: 200, height: 40, rotation: 0,
        fill: 'transparent', stroke: 'transparent', strokeWidth: 0, opacity: 1,
        text: '', fontSize: defaultFontSize, textAlign: 'left', textColor: defaultStroke,
        zIndex: Math.max(0, ...elements.map((x) => x.zIndex)) + 1,
      };
      addElement(newEl);
      setSelected([id]);
      setEditingTextId(id);
      setTool('select');
      return;
    }

    // Connector tool
    if (activeTool === 'connector') {
      const anchor = findAnchor(wx, wy);
      if (anchor) {
        setDragMode('create');
        setDraft({
          id: 'draft',
          type: 'connector',
          x: anchor.x, y: anchor.y, width: 0, height: 0, rotation: 0,
          fill: 'transparent', stroke: defaultStroke, strokeWidth: defaultStrokeWidth, opacity: 1,
          sourceId: anchor.elementId, sourceAnchor: anchor.side,
          targetId: null, targetAnchor: 'left',
          zIndex: Math.max(0, ...elements.map((x) => x.zIndex)) + 1,
        });
      }
      return;
    }

    // Shape creation tools
    if (['rectangle', 'ellipse', 'triangle', 'line', 'arrow', 'sticky', 'pen'].includes(activeTool)) {
      setDragMode('create');
      const maxZ = Math.max(0, ...elements.map((x) => x.zIndex));
      const id = `${activeTool}-${Date.now()}`;

      if (activeTool === 'pen') {
        setDraft({
          id, type: 'pen',
          x: 0, y: 0, width: 0, height: 0, rotation: 0,
          fill: 'transparent', stroke: defaultStroke, strokeWidth: defaultStrokeWidth, opacity: defaultOpacity,
          points: [wx, wy],
          zIndex: maxZ + 1,
        });
        return;
      }

      if (activeTool === 'sticky') {
        setDraft({
          id, type: 'sticky',
          x: wx, y: wy, width: 0, height: 0, rotation: 0,
          fill: '#fef3c7', stroke: 'transparent', strokeWidth: 0, opacity: defaultOpacity,
          text: '', fontSize: 14, textAlign: 'left', textColor: '#78350f',
          zIndex: maxZ + 1,
        });
        return;
      }

      setDraft({
        id, type: activeTool as 'rectangle',
        x: wx, y: wy, width: 0, height: 0, rotation: 0,
        fill: activeTool === 'line' || activeTool === 'arrow' ? 'transparent' : defaultFill,
        stroke: defaultStroke, strokeWidth: defaultStrokeWidth, opacity: defaultOpacity,
        zIndex: maxZ + 1,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { sx, sy, wx, wy } = getMouse(e);

    // Update hover anchor when connector tool
    if (activeTool === 'connector' || activeTool === 'arrow') {
      const a = findAnchor(wx, wy);
      setHoverAnchor(a ? { elementId: a.elementId, side: a.side } : null);
    }

    if (!dragStart) return;

    const dxScreen = sx - dragStart.x;
    const dyScreen = sy - dragStart.y;
    const dxWorld = dxScreen / zoom;
    const dyWorld = dyScreen / zoom;

    if (dragMode === 'pan') {
      setViewport({ ...viewport, x: viewport.x + dxScreen, y: viewport.y + dyScreen });
      setDragStart({ x: sx, y: sy });
      return;
    }

    if (dragMode === 'select-box') {
      setSelectBox({ x: dragStart.x, y: dragStart.y, w: dxScreen, h: dyScreen });
      return;
    }

    if (dragMode === 'move' && initialStates.size > 0) {
      // Compute new positions + find alignment
      const moved = new Map<string, WhiteboardElement>();
      for (const id of selectedIds) {
        const init = initialStates.get(id);
        if (!init) continue;
        moved.set(id, { ...init, x: init.x + dxWorld, y: init.y + dyWorld });
      }

      // Alignment guides
      const vs: number[] = [];
      const hs: number[] = [];
      for (const el of moved.values()) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const targets = [el.x, cx, el.x + el.width];
        const tH = [el.y, cy, el.y + el.height];
        for (const other of elements) {
          if (selectedIds.includes(other.id) || other.type === 'connector') continue;
          const ocx = other.x + other.width / 2;
          const ocy = other.y + other.height / 2;
          const oV = [other.x, ocx, other.x + other.width];
          const oH = [other.y, ocy, other.y + other.height];
          for (const t of targets) for (const o of oV) {
            if (Math.abs(t - o) < SNAP_THRESHOLD / zoom) vs.push(o);
          }
          for (const t of tH) for (const o of oH) {
            if (Math.abs(t - o) < SNAP_THRESHOLD / zoom) hs.push(o);
          }
        }
      }
      setGuides({ v: Array.from(new Set(vs)), h: Array.from(new Set(hs)) });

      // Apply snap to grid
      const snapFn = (v: number) => snapToGrid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v;
      for (const [id, m] of moved) {
        updateElements([id], { x: snapFn(m.x), y: snapFn(m.y) });
      }
      return;
    }

    if (dragMode === 'resize' && activeHandle && selectedIds.length === 1) {
      const init = initialStates.get(selectedIds[0]);
      if (!init) return;
      let { x, y, width, height } = init;
      const h = activeHandle;
      if (h.includes('e')) width = init.width + dxWorld;
      if (h.includes('s')) height = init.height + dyWorld;
      if (h.includes('w')) { x = init.x + dxWorld; width = init.width - dxWorld; }
      if (h.includes('n')) { y = init.y + dyWorld; height = init.height - dyWorld; }
      // Prevent negative
      if (width < 20) width = 20;
      if (height < 20) height = 20;
      updateElements([init.id], { x, y, width, height });
      return;
    }

    if (dragMode === 'rotate' && selectedIds.length === 1) {
      const init = initialStates.get(selectedIds[0]);
      if (!init) return;
      const cx = init.x + init.width / 2;
      const cy = init.y + init.height / 2;
      const angle = (Math.atan2(wy - cy, wx - cx) * 180) / Math.PI + 90;
      updateElements([init.id], { rotation: angle });
      return;
    }

    if (dragMode === 'create' && draft) {
      if (draft.type === 'pen') {
        setDraft({ ...draft, points: [...(draft.points || []), wx, wy] });
        return;
      }
      if (draft.type === 'connector') {
        const anchor = findAnchor(wx, wy);
        setHoverAnchor(anchor ? { elementId: anchor.elementId, side: anchor.side } : null);
        setDraft({
          ...draft,
          width: wx - draft.x,
          height: wy - draft.y,
          targetId: anchor?.elementId || null,
          targetAnchor: anchor?.side || 'left',
        });
        return;
      }
      if (draft.type === 'line' || draft.type === 'arrow') {
        setDraft({ ...draft, width: wx - draft.x, height: wy - draft.y });
        return;
      }
      // Rectangle-like
      const x = Math.min(draft.x, wx);
      const y = Math.min(draft.y, wy);
      const w = Math.abs(wx - draft.x);
      const h = Math.abs(wy - draft.y);
      setDraft({ ...draft, x, y, width: w, height: h });
    }
  };

  const handleMouseUp = () => {
    if (dragMode === 'pan') {
      setDragMode('none');
      setDragStart(null);
      return;
    }

    if (dragMode === 'select-box' && selectBox) {
      const wx1 = (Math.min(selectBox.x, selectBox.x + selectBox.w) - viewport.x) / zoom;
      const wy1 = (Math.min(selectBox.y, selectBox.y + selectBox.h) - viewport.y) / zoom;
      const wx2 = (Math.max(selectBox.x, selectBox.x + selectBox.w) - viewport.x) / zoom;
      const wy2 = (Math.max(selectBox.y, selectBox.y + selectBox.h) - viewport.y) / zoom;
      const hit = elements.filter((e) => {
        if (e.type === 'connector' || e.locked) return false;
        return e.x >= wx1 && e.y >= wy1 && e.x + e.width <= wx2 && e.y + e.height <= wy2;
      }).map((e) => e.id);
      setSelected(hit);
      setSelectBox(null);
      setDragMode('none');
      setDragStart(null);
      return;
    }

    if (dragMode === 'move') {
      pushHistory();
    }
    if (dragMode === 'resize' || dragMode === 'rotate') {
      pushHistory();
    }

    if (dragMode === 'create' && draft) {
      if (draft.type === 'connector') {
        if (draft.targetId && draft.sourceId && draft.targetId !== draft.sourceId) {
          addElement(draft);
        }
      } else if (draft.type === 'pen') {
        // Shape recognition
        const recognized = draft.points ? recognizeShape(draft.points) : null;
        if (recognized) {
          const id = `${recognized.type}-${Date.now()}`;
          addElement({
            id,
            type: recognized.type,
            x: recognized.x,
            y: recognized.y,
            width: recognized.width,
            height: recognized.height,
            rotation: 0,
            fill: defaultFill,
            stroke: defaultStroke,
            strokeWidth: defaultStrokeWidth,
            opacity: defaultOpacity,
            zIndex: draft.zIndex,
          });
        } else if (draft.points && draft.points.length > 4) {
          // Normalize: compute bounds, store as relative
          const pts = draft.points;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let i = 0; i < pts.length; i += 2) {
            minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
            minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
          }
          const relPts: number[] = [];
          for (let i = 0; i < pts.length; i += 2) {
            relPts.push(pts[i] - minX, pts[i + 1] - minY);
          }
          addElement({
            ...draft,
            x: minX, y: minY,
            width: maxX - minX, height: maxY - minY,
            points: relPts,
          });
        }
      } else if (draft.type === 'line' || draft.type === 'arrow') {
        if (Math.abs(draft.width) > 5 || Math.abs(draft.height) > 5) addElement(draft);
      } else if (draft.type === 'sticky') {
        const w = Math.max(draft.width || 0, 140);
        const h = Math.max(draft.height || 0, 100);
        const newEl = { ...draft, width: w, height: h };
        addElement(newEl);
        setSelected([newEl.id]);
        setEditingTextId(newEl.id);
      } else if (draft.width > 5 && draft.height > 5) {
        addElement(draft);
      }
    }

    setDraft(null);
    setDragMode('none');
    setDragStart(null);
    setActiveHandle(null);
    setInitialStates(new Map());
    setGuides({ v: [], h: [] });
    setHoverAnchor(null);
  };

  // Zoom with ctrl/cmd+wheel, pan otherwise
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const { sx, sy } = getMouse(e);
      const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
      // Zoom centered on mouse
      const wx = (sx - viewport.x) / zoom;
      const wy = (sy - viewport.y) / zoom;
      const newX = sx - wx * newZoom;
      const newY = sy - wy * newZoom;
      setViewport({ x: newX, y: newY, zoom: newZoom });
    } else {
      setViewport({ ...viewport, x: viewport.x - e.deltaX, y: viewport.y - e.deltaY });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const { wx, wy } = getMouse(e);
    const hit = findHitElement(wx, wy);
    if (hit && (hit.type === 'rectangle' || hit.type === 'ellipse' || hit.type === 'triangle' || hit.type === 'sticky' || hit.type === 'text')) {
      setSelected([hit.id]);
      setEditingTextId(hit.id);
    }
  };

  // Render inline text editor
  const editingEl = editingTextId ? elementsById.get(editingTextId) : null;
  const editorStyle = useMemo(() => {
    if (!editingEl) return {} as React.CSSProperties;
    return {
      position: 'absolute' as const,
      left: editingEl.x * zoom + viewport.x,
      top: editingEl.y * zoom + viewport.y,
      width: Math.max(editingEl.width, 120) * zoom,
      height: Math.max(editingEl.height, 40) * zoom,
      fontSize: (editingEl.fontSize || 14) * zoom,
      textAlign: (editingEl.textAlign || 'center') as 'left' | 'center' | 'right',
      background: editingEl.type === 'sticky' ? editingEl.fill : 'transparent',
      color: editingEl.textColor || '#18181b',
      padding: editingEl.type === 'sticky' ? `${8 * zoom}px` : undefined,
      border: '2px solid #20af9c',
      outline: 'none',
      resize: 'none' as const,
      borderRadius: editingEl.type === 'sticky' ? 4 : 8,
      fontFamily: editingEl.fontFamily || 'Inter, sans-serif',
      lineHeight: 1.4,
    };
  }, [editingEl, zoom, viewport]);

  useEffect(() => {
    if (editingTextId && textEditRef.current) {
      textEditRef.current.focus();
      textEditRef.current.select();
    }
  }, [editingTextId]);

  // Context menu
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { wx, wy } = getMouse(e);
    const hit = findHitElement(wx, wy);
    if (hit) {
      if (!selectedIds.includes(hit.id)) setSelected([hit.id]);
      setMenu({ x: e.clientX, y: e.clientY });
    }
  };

  useEffect(() => {
    const close = () => setMenu(null);
    if (menu) {
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [menu]);

  const cursorStyle = (() => {
    if (spacePressed || dragMode === 'pan') return 'grabbing';
    if (activeTool === 'hand') return 'grab';
    if (activeTool === 'select') return 'default';
    if (activeTool === 'text') return 'text';
    if (activeTool === 'eraser') return 'cell';
    return 'crosshair';
  })();

  return (
    <div
      ref={containerRef}
      className={'relative w-full h-full overflow-hidden bg-surface-50 dark:bg-surface-900 ' + (className || '')}
      style={{ cursor: cursorStyle }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className="absolute inset-0"
      />

      {/* Inline text editor */}
      {editingEl && (
        <textarea
          ref={textEditRef}
          style={editorStyle}
          defaultValue={editingEl.text || ''}
          onBlur={(e) => {
            updateElements([editingEl.id], { text: e.currentTarget.value });
            pushHistory();
            setEditingTextId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditingTextId(null);
              e.currentTarget.blur();
            }
            if (e.key === 'Enter' && !e.shiftKey && editingEl.type === 'text') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      )}

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-xl border border-surface-200 bg-white py-1 shadow-elevated dark:border-surface-700 dark:bg-surface-900"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Duplicate', shortcut: 'Ctrl+D', fn: () => store.duplicateElements(selectedIds) },
            { label: 'Copy', shortcut: 'Ctrl+C', fn: () => store.copy() },
            { label: 'Bring to front', fn: () => store.bringToFront(selectedIds) },
            { label: 'Send to back', fn: () => store.sendToBack(selectedIds) },
            { label: 'Delete', shortcut: 'Del', fn: () => deleteElements(selectedIds), danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.fn(); setMenu(null); }}
              className={
                'flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors ' +
                (item.danger
                  ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
                  : 'text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800')
              }
            >
              <span>{item.label}</span>
              {item.shortcut && <span className="text-2xs text-surface-400">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
