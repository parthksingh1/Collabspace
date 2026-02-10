'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useTheme } from '@/lib/theme-context';
import { usePresenceStore } from '@/stores/presence-store';
import { cn } from '@/lib/utils';
import { Loader2, Map, MapPinOff } from 'lucide-react';

// ─── Language config ──────────────────────────────────────────────

const LANGUAGE_CONFIGS: Record<string, { tabSize: number; insertSpaces: boolean }> = {
  python: { tabSize: 4, insertSpaces: true },
  javascript: { tabSize: 2, insertSpaces: true },
  typescript: { tabSize: 2, insertSpaces: true },
  go: { tabSize: 4, insertSpaces: false },
  rust: { tabSize: 4, insertSpaces: true },
  java: { tabSize: 4, insertSpaces: true },
  c: { tabSize: 4, insertSpaces: true },
  cpp: { tabSize: 4, insertSpaces: true },
  csharp: { tabSize: 4, insertSpaces: true },
  ruby: { tabSize: 2, insertSpaces: true },
  html: { tabSize: 2, insertSpaces: true },
  css: { tabSize: 2, insertSpaces: true },
  json: { tabSize: 2, insertSpaces: true },
  yaml: { tabSize: 2, insertSpaces: true },
  markdown: { tabSize: 2, insertSpaces: true },
};

// ─── Collaborative cursor decoration ─────────────────────────────

interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  position: { lineNumber: number; column: number };
}

function createCursorDecoration(
  cursor: RemoteCursor,
  monaco: typeof Monaco
): Monaco.editor.IModelDeltaDecoration {
  return {
    range: new monaco.Range(
      cursor.position.lineNumber,
      cursor.position.column,
      cursor.position.lineNumber,
      cursor.position.column
    ),
    options: {
      className: `remote-cursor-${cursor.userId}`,
      beforeContentClassName: `remote-cursor-widget`,
      hoverMessage: { value: cursor.name },
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  };
}

// ─── Props ────────────────────────────────────────────────────────

interface MonacoEditorProps {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  onCursorChange?: (position: { lineNumber: number; column: number }) => void;
  onRun?: () => void;
  remoteCursors?: RemoteCursor[];
  readOnly?: boolean;
  className?: string;
}

export function MonacoCodeEditor({
  value,
  language,
  onChange,
  onCursorChange,
  onRun,
  remoteCursors = [],
  readOnly = false,
  className,
}: MonacoEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const [showMinimap, setShowMinimap] = useState(true);

  // Apply remote cursor decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || remoteCursors.length === 0) return;

    const model = editor.getModel();
    if (!model) return;

    const decorations = remoteCursors.map((cursor) =>
      createCursorDecoration(cursor, monaco)
    );

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      decorations
    );

    // Inject dynamic styles for cursor colors
    let styleEl = document.getElementById('remote-cursor-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'remote-cursor-styles';
      document.head.appendChild(styleEl);
    }

    const cssRules = remoteCursors
      .map(
        (cursor) => `
          .remote-cursor-${cursor.userId} {
            background-color: ${cursor.color}33;
          }
          .remote-cursor-${cursor.userId}::before {
            content: '${cursor.name}';
            position: absolute;
            top: -18px;
            left: 0;
            background: ${cursor.color};
            color: white;
            font-size: 11px;
            padding: 1px 6px;
            border-radius: 3px;
            white-space: nowrap;
            pointer-events: none;
            z-index: 10;
          }
          .remote-cursor-${cursor.userId}::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 2px;
            height: 100%;
            background: ${cursor.color};
          }
        `
      )
      .join('\n');

    styleEl.textContent = cssRules;
  }, [remoteCursors]);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Custom themes
      monaco.editor.defineTheme('collabspace-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'C586C0' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'type', foreground: '4EC9B0' },
        ],
        colors: {
          'editor.background': '#0f172a',
          'editor.foreground': '#e2e8f0',
          'editorCursor.foreground': '#5eead4',
          'editor.lineHighlightBackground': '#1e293b',
          'editor.selectionBackground': '#14b8a633',
          'editorLineNumber.foreground': '#475569',
          'editorLineNumber.activeForeground': '#94a3b8',
          'editor.inactiveSelectionBackground': '#14b8a61a',
        },
      });

      monaco.editor.defineTheme('collabspace-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'AF00DB' },
          { token: 'string', foreground: 'A31515' },
          { token: 'number', foreground: '098658' },
          { token: 'type', foreground: '267F99' },
        ],
        colors: {
          'editor.background': '#ffffff',
          'editor.foreground': '#1e293b',
          'editorCursor.foreground': '#14b8a6',
          'editor.lineHighlightBackground': '#f8fafc',
          'editor.selectionBackground': '#14b8a633',
          'editorLineNumber.foreground': '#94a3b8',
          'editorLineNumber.activeForeground': '#475569',
        },
      });

      editor.updateOptions({
        theme: resolvedTheme === 'dark' ? 'collabspace-dark' : 'collabspace-light',
      });

      // Keybinding: Ctrl+Enter to run
      editor.addAction({
        id: 'run-code',
        label: 'Run Code',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          onRun?.();
        },
      });

      // Keybinding: Ctrl+S to save (prevent default)
      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          // Save handled by auto-save / parent
        },
      });

      // Cursor position broadcasting
      editor.onDidChangeCursorPosition((e) => {
        onCursorChange?.({
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        });
      });

      // Language config
      const langConfig = LANGUAGE_CONFIGS[language] || { tabSize: 2, insertSpaces: true };
      const model = editor.getModel();
      if (model) {
        model.updateOptions({
          tabSize: langConfig.tabSize,
          insertSpaces: langConfig.insertSpaces,
        });
      }

      editor.focus();
    },
    [language, onCursorChange, onRun, resolvedTheme]
  );

  const handleChange: OnChange = useCallback(
    (val) => {
      if (val !== undefined) {
        onChange?.(val);
      }
    },
    [onChange]
  );

  // Theme sync
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.updateOptions({
        theme: resolvedTheme === 'dark' ? 'collabspace-dark' : 'collabspace-light',
      });
    }
  }, [resolvedTheme]);

  // Minimap toggle
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.updateOptions({ minimap: { enabled: showMinimap } });
    }
  }, [showMinimap]);

  return (
    <div className={cn('relative flex flex-col h-full', className)}>
      {/* Minimap toggle */}
      <button
        onClick={() => setShowMinimap(!showMinimap)}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-surface-800/60 hover:bg-surface-700/80 text-surface-300 transition-colors"
        title={showMinimap ? 'Hide minimap' : 'Show minimap'}
      >
        {showMinimap ? <Map className="w-3.5 h-3.5" /> : <MapPinOff className="w-3.5 h-3.5" />}
      </button>

      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleEditorMount}
        theme={resolvedTheme === 'dark' ? 'collabspace-dark' : 'collabspace-light'}
        options={{
          readOnly,
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          minimap: { enabled: showMinimap },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          renderLineHighlight: 'all',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 12, bottom: 12 },
          wordWrap: 'off',
          tabSize: LANGUAGE_CONFIGS[language]?.tabSize || 2,
          insertSpaces: LANGUAGE_CONFIGS[language]?.insertSpaces ?? true,
          formatOnPaste: true,
          formatOnType: true,
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showClasses: true,
            showFunctions: true,
            showVariables: true,
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-surface-950">
            <div className="flex items-center gap-2 text-surface-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading editor...</span>
            </div>
          </div>
        }
      />
    </div>
  );
}

export default MonacoCodeEditor;
