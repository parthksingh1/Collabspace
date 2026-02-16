// ─── Whiteboard Type System ──────────────────────────────────────

export type ToolType =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'connector'
  | 'text'
  | 'sticky'
  | 'pen'
  | 'eraser';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

export interface WhiteboardElement {
  id: string;
  type: Exclude<ToolType, 'select' | 'hand' | 'eraser'>;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;

  // Style
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;

  // Text properties
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;

  // Freehand / pen points (relative to element bounds)
  points?: number[];

  // Connector fields
  sourceId?: string | null;
  targetId?: string | null;
  sourceAnchor?: AnchorSide;
  targetAnchor?: AnchorSide;

  // Meta
  locked?: boolean;
  visible?: boolean;
  zIndex: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PresenceCursor {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

export type ResizeHandle =
  | 'nw' | 'n' | 'ne'
  | 'w'         | 'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

// ─── Color palette for quick pickers ─────────────────────────────
export const FILL_COLORS = [
  '#ffffff',
  '#fef3c7', // yellow sticky
  '#e0f2fe', // blue
  '#d1fae5', // green
  '#fce7f3', // pink
  '#f3e8ff', // lavender (kept for sticky variety, not used as brand)
  '#fed7aa', // orange
  '#e5e7eb', // gray
];

export const STROKE_COLORS = [
  '#18181b', // near black
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
];

export const STICKY_COLORS = [
  '#fef3c7', // amber
  '#fecaca', // red
  '#bbf7d0', // green
  '#bfdbfe', // blue
  '#fed7aa', // orange
  '#e9d5ff', // purple (sticky only)
];
