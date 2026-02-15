'use client';

import { useWhiteboardStore } from '@/stores/whiteboard-store';
import { FILL_COLORS, STROKE_COLORS, STICKY_COLORS } from './types';
import {
  AlignLeft, AlignCenter, AlignRight, Trash2, Copy, Eye, EyeOff,
  Lock, Unlock, ArrowUp, ArrowDown, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function ColorSwatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-6 w-6 rounded-md border-2 transition-all hover:scale-110',
        active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-surface-200 dark:border-surface-700'
      )}
      style={{ backgroundColor: color }}
    />
  );
}

function TransparentSwatch({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative h-6 w-6 rounded-md border-2 transition-all hover:scale-110 overflow-hidden',
        active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-surface-200 dark:border-surface-700'
      )}
    >
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="h-[140%] w-0.5 rotate-45 bg-red-500" />
      </span>
    </button>
  );
}

export function PropertiesPanel() {
  const {
    elements, selectedIds, updateElements, deleteElements, duplicateElements,
    bringToFront, sendToBack,
    defaultFill, defaultStroke, defaultStrokeWidth, defaultOpacity,
    setDefaultFill, setDefaultStroke, setDefaultStrokeWidth, setDefaultOpacity,
  } = useWhiteboardStore();

  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const isSticky = selected.length > 0 && selected[0].type === 'sticky';
  const isText = selected.length > 0 && selected[0].type === 'text';

  // When nothing selected → show defaults
  const activeEl = selected[0];
  const fill = activeEl?.fill ?? defaultFill;
  const stroke = activeEl?.stroke ?? defaultStroke;
  const strokeWidth = activeEl?.strokeWidth ?? defaultStrokeWidth;
  const opacity = activeEl?.opacity ?? defaultOpacity;
  const fontSize = activeEl?.fontSize ?? 14;
  const textAlign = activeEl?.textAlign ?? 'center';

  const setFill = (color: string) => {
    if (selected.length > 0) updateElements(selectedIds, { fill: color });
    else setDefaultFill(color);
  };
  const setStroke = (color: string) => {
    if (selected.length > 0) updateElements(selectedIds, { stroke: color });
    else setDefaultStroke(color);
  };
  const setStrokeWidth = (w: number) => {
    if (selected.length > 0) updateElements(selectedIds, { strokeWidth: w });
    else setDefaultStrokeWidth(w);
  };
  const setOpacity = (o: number) => {
    if (selected.length > 0) updateElements(selectedIds, { opacity: o });
    else setDefaultOpacity(o);
  };

  const setFontSize = (size: number) => {
    if (selected.length > 0) updateElements(selectedIds, { fontSize: size });
  };
  const setTextAlign = (align: 'left' | 'center' | 'right') => {
    if (selected.length > 0) updateElements(selectedIds, { textAlign: align });
  };

  const toggleLock = () => {
    if (selected.length === 0) return;
    const allLocked = selected.every((e) => e.locked);
    updateElements(selectedIds, { locked: !allLocked });
  };

  const toggleVisibility = () => {
    if (selected.length === 0) return;
    const allVisible = selected.every((e) => e.visible !== false);
    updateElements(selectedIds, { visible: !allVisible });
  };

  const palette = isSticky ? STICKY_COLORS : FILL_COLORS;

  return (
    <div className="flex h-full w-64 flex-col border-l border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3 dark:border-surface-700">
        <div>
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white">
            {selected.length === 0 ? 'Style defaults' : selected.length === 1 ? 'Element' : `${selected.length} selected`}
          </h3>
          {selected.length > 0 && (
            <p className="text-2xs text-surface-400 capitalize mt-0.5">
              {selected.length === 1 ? selected[0].type : 'Multi-select'}
            </p>
          )}
        </div>
      </div>

      {/* Actions (only when selected) */}
      {selected.length > 0 && (
        <div className="flex items-center gap-0.5 border-b border-surface-200 px-2 py-1.5 dark:border-surface-700">
          <button onClick={() => duplicateElements(selectedIds)} className="btn-ghost rounded-md p-1.5" title="Duplicate (Ctrl+D)">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => bringToFront(selectedIds)} className="btn-ghost rounded-md p-1.5" title="Bring to front">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => sendToBack(selectedIds)} className="btn-ghost rounded-md p-1.5" title="Send to back">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleLock} className="btn-ghost rounded-md p-1.5" title="Lock/unlock">
            {selected.every((e) => e.locked) ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button onClick={toggleVisibility} className="btn-ghost rounded-md p-1.5" title="Hide/show">
            {selected.every((e) => e.visible !== false) ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => deleteElements(selectedIds)}
            className="btn-ghost rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Position / Size */}
        {selected.length === 1 && activeEl && activeEl.type !== 'connector' && (
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">
              Position &amp; size
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <span className="text-2xs text-surface-400">X</span>
                <input
                  type="number"
                  value={Math.round(activeEl.x)}
                  onChange={(e) => updateElements([activeEl.id], { x: parseFloat(e.target.value) || 0 })}
                  className="input py-1 text-xs"
                />
              </div>
              <div>
                <span className="text-2xs text-surface-400">Y</span>
                <input
                  type="number"
                  value={Math.round(activeEl.y)}
                  onChange={(e) => updateElements([activeEl.id], { y: parseFloat(e.target.value) || 0 })}
                  className="input py-1 text-xs"
                />
              </div>
              <div>
                <span className="text-2xs text-surface-400">W</span>
                <input
                  type="number"
                  value={Math.round(activeEl.width)}
                  onChange={(e) => updateElements([activeEl.id], { width: parseFloat(e.target.value) || 0 })}
                  className="input py-1 text-xs"
                />
              </div>
              <div>
                <span className="text-2xs text-surface-400">H</span>
                <input
                  type="number"
                  value={Math.round(activeEl.height)}
                  onChange={(e) => updateElements([activeEl.id], { height: parseFloat(e.target.value) || 0 })}
                  className="input py-1 text-xs"
                />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xs text-surface-400">Rotation</span>
              <input
                type="number"
                value={Math.round(activeEl.rotation)}
                onChange={(e) => updateElements([activeEl.id], { rotation: parseFloat(e.target.value) || 0 })}
                className="input py-1 text-xs"
              />
            </div>
          </div>
        )}

        {/* Fill */}
        <div>
          <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">
            {isSticky ? 'Sticky color' : 'Fill'}
          </label>
          <div className="mt-2 grid grid-cols-8 gap-1.5">
            {!isSticky && (
              <TransparentSwatch active={fill === 'transparent'} onClick={() => setFill('transparent')} />
            )}
            {palette.map((c) => (
              <ColorSwatch key={c} color={c} active={fill === c} onClick={() => setFill(c)} />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={fill === 'transparent' ? '#ffffff' : fill}
              onChange={(e) => setFill(e.target.value)}
              className="h-7 w-8 cursor-pointer rounded border border-surface-200 dark:border-surface-700"
            />
            <input
              type="text"
              value={fill}
              onChange={(e) => setFill(e.target.value)}
              className="input py-1 text-xs flex-1 font-mono"
            />
          </div>
        </div>

        {/* Stroke */}
        {!isSticky && (
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">Stroke</label>
            <div className="mt-2 grid grid-cols-8 gap-1.5">
              <TransparentSwatch active={stroke === 'transparent'} onClick={() => setStroke('transparent')} />
              {STROKE_COLORS.map((c) => (
                <ColorSwatch key={c} color={c} active={stroke === c} onClick={() => setStroke(c)} />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={stroke === 'transparent' ? '#000000' : stroke}
                onChange={(e) => setStroke(e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-surface-200 dark:border-surface-700"
              />
              <input
                type="text"
                value={stroke}
                onChange={(e) => setStroke(e.target.value)}
                className="input py-1 text-xs flex-1 font-mono"
              />
            </div>
            {/* Width */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xs text-surface-400">Width</span>
                <span className="text-2xs font-medium text-surface-600 dark:text-surface-400 tabular-nums">{strokeWidth}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          </div>
        )}

        {/* Text props */}
        {(isText || isSticky || (activeEl?.text !== undefined)) && selected.length > 0 && (
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">Text</label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-surface-400 w-10">Size</span>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="flex-1 accent-brand-500"
                />
                <span className="text-2xs font-medium text-surface-600 dark:text-surface-400 w-8 tabular-nums text-right">{fontSize}</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-surface-200 p-0.5 dark:border-surface-700">
                <button
                  onClick={() => setTextAlign('left')}
                  className={cn('flex-1 flex h-7 items-center justify-center rounded transition-colors',
                    textAlign === 'left' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800')}
                >
                  <AlignLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setTextAlign('center')}
                  className={cn('flex-1 flex h-7 items-center justify-center rounded transition-colors',
                    textAlign === 'center' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800')}
                >
                  <AlignCenter className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setTextAlign('right')}
                  className={cn('flex-1 flex h-7 items-center justify-center rounded transition-colors',
                    textAlign === 'right' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800')}
                >
                  <AlignRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Opacity */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-2xs font-medium uppercase tracking-wider text-surface-400">Opacity</label>
            <span className="text-2xs font-medium text-surface-600 dark:text-surface-400 tabular-nums">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
            className="w-full accent-brand-500"
          />
        </div>

        {/* Layers panel */}
        <div>
          <label className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-surface-400">
            <Layers className="h-3 w-3" />
            Layers
          </label>
          <div className="mt-2 space-y-0.5 max-h-52 overflow-y-auto scrollbar-thin">
            {[...elements].sort((a, b) => b.zIndex - a.zIndex).slice(0, 20).map((e) => {
              const isSelected = selectedIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => useWhiteboardStore.setState({ selectedIds: [e.id] })}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left',
                    isSelected
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                      : 'text-surface-600 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-800'
                  )}
                >
                  <span
                    className="h-3 w-3 rounded-sm border border-surface-300 dark:border-surface-600 shrink-0"
                    style={{ backgroundColor: e.fill !== 'transparent' ? e.fill : 'white' }}
                  />
                  <span className="capitalize truncate flex-1">
                    {e.type}
                    {e.text ? ` · ${e.text.slice(0, 12)}` : ''}
                  </span>
                  {e.locked && <Lock className="h-2.5 w-2.5 text-surface-400" />}
                  {e.visible === false && <EyeOff className="h-2.5 w-2.5 text-surface-400" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
