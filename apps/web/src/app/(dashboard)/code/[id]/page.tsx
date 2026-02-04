'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Play, Square, Share2, ChevronLeft, ChevronRight, ChevronDown,
  Pencil, Check, X, Terminal, Loader2, FileText, Folder,
  FolderOpen, Search, Settings, GitBranch, Bell, AlertCircle,
  Maximize2, Trash2, Plus, FileCode2, Sun, Moon, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';

// ---- File Tree ----
interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  language?: string;
  children?: FileNode[];
  content?: string;
}

const FILE_TREE: FileNode[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'middleware',
        name: 'middleware',
        type: 'folder',
        children: [
          { id: 'auth-middleware.ts', name: 'auth-middleware.ts', type: 'file', language: 'typescript' },
          { id: 'rate-limiter.ts', name: 'rate-limiter.ts', type: 'file', language: 'typescript' },
        ],
      },
      {
        id: 'routes',
        name: 'routes',
        type: 'folder',
        children: [
          { id: 'api-gateway.ts', name: 'api-gateway.ts', type: 'file', language: 'typescript' },
        ],
      },
      {
        id: 'utils',
        name: 'utils',
        type: 'folder',
        children: [
          { id: 'utils.ts', name: 'utils.ts', type: 'file', language: 'typescript' },
          { id: 'logger.ts', name: 'logger.ts', type: 'file', language: 'typescript' },
        ],
      },
    ],
  },
  { id: 'package.json', name: 'package.json', type: 'file', language: 'json' },
  { id: 'tsconfig.json', name: 'tsconfig.json', type: 'file', language: 'json' },
  { id: 'README.md', name: 'README.md', type: 'file', language: 'markdown' },
];

// ---- Demo file contents ----
const FILE_CONTENTS: Record<string, string> = {
  'auth-middleware.ts': `import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RateLimiter } from './rate-limiter';
import { logger } from '../utils/logger';

interface AuthPayload {
  userId: string;
  orgId: string;
  role: 'admin' | 'member' | 'viewer';
  iat: number;
  exp: number;
}

const rateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'api:rl:',
});

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing auth token' },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as AuthPayload;

    const isAllowed = rateLimiter.check(payload.userId);
    if (!isAllowed) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
      return;
    }

    (req as any).user = {
      id: payload.userId,
      orgId: payload.orgId,
      role: payload.role,
    };

    logger.info('Request authenticated', {
      userId: payload.userId,
      method: req.method,
      path: req.path,
    });

    next();
  } catch (err) {
    logger.warn('Invalid auth token', { error: (err as Error).message });
    res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Token expired or invalid' },
    });
  }
}`,
  'rate-limiter.ts': `import Redis from 'ioredis';

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export class RateLimiter {
  private redis: Redis;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async check(userId: string): Promise<boolean> {
    const key = \`\${this.config.keyPrefix}\${userId}\`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.pexpire(key, this.config.windowMs);
    }

    return count <= this.config.maxRequests;
  }

  async reset(userId: string): Promise<void> {
    const key = \`\${this.config.keyPrefix}\${userId}\`;
    await this.redis.del(key);
  }
}`,
  'api-gateway.ts': `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { authMiddleware } from '../middleware/auth-middleware';
import { logger } from '../utils/logger';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(compression());
app.use(express.json());

app.use('/api', authMiddleware);

const SERVICES = {
  auth: 'http://localhost:4002',
  doc: 'http://localhost:4003',
  code: 'http://localhost:4004',
  board: 'http://localhost:4005',
  project: 'http://localhost:4006',
};

Object.entries(SERVICES).forEach(([name, target]) => {
  app.use(\`/api/\${name}\`, (req, res, next) => {
    logger.info('Proxying request', { service: name, path: req.path });
    next();
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(\`API Gateway listening on port \${PORT}\`);
});`,
  'utils.ts': `export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}`,
  'logger.ts': `interface LogContext {
  [key: string]: any;
}

class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('ERROR', message, context);
  }

  private log(level: string, message: string, context?: LogContext): void {
    console.log(JSON.stringify({
      level,
      message,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  }
}

export const logger = new Logger('api-gateway');`,
  'package.json': `{
  "name": "@collabspace/api-gateway",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "ioredis": "^5.3.0",
    "jsonwebtoken": "^9.0.0"
  }
}`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}`,
  'README.md': `# API Gateway

Central entry point for all CollabSpace services.

## Setup

\`\`\`bash
npm install
npm run dev
\`\`\``,
};

// File icon by extension
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const colorMap: Record<string, string> = {
    ts: 'text-blue-500',
    tsx: 'text-blue-400',
    js: 'text-amber-500',
    jsx: 'text-amber-400',
    json: 'text-amber-600',
    md: 'text-surface-400',
    py: 'text-emerald-500',
    go: 'text-cyan-500',
    rs: 'text-orange-600',
  };
  return colorMap[ext || ''] || 'text-surface-400';
}

// File Tree Item Component
function FileTreeItem({
  node,
  depth,
  activeFile,
  onFileSelect,
}: {
  node: FileNode;
  depth: number;
  activeFile: string;
  onFileSelect: (file: FileNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs text-surface-400 hover:bg-surface-800/50 transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform shrink-0', expanded && 'rotate-90')} />
          {expanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" /> : <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onFileSelect={onFileSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileSelect(node)}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        activeFile === node.name
          ? 'bg-brand-500/20 text-brand-300'
          : 'text-surface-400 hover:bg-surface-800/50 hover:text-surface-200'
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <FileCode2 className={cn('h-3.5 w-3.5 shrink-0', getFileIcon(node.name))} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// Tab Component
interface Tab {
  id: string;
  name: string;
  language: string;
  content: string;
  modified: boolean;
}

export default function CodeEditorPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const addToast = useToastStore((s) => s.addToast);

  // Multi-tab state
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', name: 'auth-middleware.ts', language: 'typescript', content: FILE_CONTENTS['auth-middleware.ts'], modified: false },
    { id: '2', name: 'api-gateway.ts', language: 'typescript', content: FILE_CONTENTS['api-gateway.ts'], modified: false },
    { id: '3', name: 'utils.ts', language: 'typescript', content: FILE_CONTENTS['utils.ts'], modified: false },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');

  // Editor state
  const [showFileTree, setShowFileTree] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState<'output' | 'terminal' | 'problems'>('output');
  const [isRunning, setIsRunning] = useState(false);
  const [outputLines, setOutputLines] = useState<{ text: string; type: 'info' | 'error' | 'success' | 'system' }[]>([]);
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');
  const [wordWrap, setWordWrap] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputLines]);

  // Update tab content
  const updateTabContent = useCallback((content: string) => {
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, content, modified: true } : t));
  }, [activeTabId]);

  // Save file
  const handleSave = useCallback(() => {
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, modified: false } : t));
    addToast({ title: 'Saved', description: `${activeTab.name} saved successfully`, variant: 'success' });
  }, [activeTabId, activeTab.name, addToast]);

  // Run code
  const handleRun = useCallback(() => {
    setIsRunning(true);
    setShowTerminal(true);
    setTerminalTab('output');
    setOutputLines([
      { text: '> npm run build', type: 'system' },
      { text: 'Compiling TypeScript...', type: 'info' },
    ]);

    setTimeout(() => {
      setOutputLines((prev) => [...prev, { text: '✓ Compiled successfully (0.42s)', type: 'success' }]);
    }, 400);

    setTimeout(() => {
      setOutputLines((prev) => [...prev, { text: '', type: 'info' }, { text: '> node dist/index.js', type: 'system' }]);
    }, 700);

    setTimeout(() => {
      setOutputLines((prev) => [
        ...prev,
        { text: '[INFO] Server listening on port 4002', type: 'info' },
        { text: '[INFO] Health check ready at /api/health', type: 'info' },
        { text: '[INFO] Rate limiter initialized: 100 req/min', type: 'info' },
        { text: '', type: 'info' },
        { text: '✓ Process completed in 1.24s', type: 'success' },
        { text: '  Memory: 24.1 MB · CPU: 0.8%', type: 'info' },
      ]);
      setIsRunning(false);
    }, 1200);
  }, []);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setOutputLines((prev) => [...prev, { text: '', type: 'info' }, { text: '✗ Process terminated by user', type: 'error' }]);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = activeTab.content.substring(0, start) + '  ' + activeTab.content.substring(end);
      updateTabContent(newValue);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [activeTab.content, updateTabContent, handleSave]);

  // Open file from tree
  const handleFileSelect = useCallback((file: FileNode) => {
    const existingTab = tabs.find((t) => t.name === file.name);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }
    const newTab: Tab = {
      id: `tab-${Date.now()}`,
      name: file.name,
      language: file.language || 'plaintext',
      content: FILE_CONTENTS[file.name] || `// ${file.name}\n// File content...`,
      modified: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs]);

  // Close tab
  const closeTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const idx = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
    }
  }, [tabs, activeTabId]);

  const lineCount = activeTab.content.split('\n').length;
  const isDark = editorTheme === 'dark';

  // Syntax highlight class for a line
  const colorizeLine = (line: string): string => {
    if (line.includes('//')) return 'text-emerald-500';
    if (line.includes('import') || line.includes('export') || line.includes('const ') || line.includes('let ') || line.includes('function')) return '';
    return '';
  };

  return (
    <div className="flex flex-col h-screen bg-surface-50 dark:bg-surface-950">
      {/* Header */}
      <header className="flex items-center justify-between px-3 h-12 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/code')}
            className="btn-ghost rounded-lg p-1.5"
            title="Back to files"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-surface-200 dark:bg-surface-700" />

          <button
            onClick={() => setShowFileTree(!showFileTree)}
            className={cn('btn-ghost rounded-lg p-1.5', showFileTree && 'text-brand-600 dark:text-brand-400')}
            title="Toggle Explorer"
          >
            <FileText className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={cn('btn-ghost rounded-lg p-1.5', searchOpen && 'text-brand-600 dark:text-brand-400')}
            title="Search files"
          >
            <Search className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-surface-200 dark:bg-surface-700 mx-1" />

          <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
            {activeTab.name}
            {activeTab.modified && <span className="ml-1 text-amber-500">●</span>}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={() => setEditorTheme(isDark ? 'light' : 'dark')}
            className="btn-ghost rounded-lg p-1.5"
            title="Toggle editor theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Word wrap */}
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={cn('btn-ghost rounded-lg p-1.5', wordWrap && 'text-brand-600 dark:text-brand-400')}
            title="Toggle word wrap"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Font size */}
          <div className="flex items-center rounded-lg border border-surface-200 dark:border-surface-700">
            <button
              onClick={() => setFontSize((s) => Math.max(10, s - 1))}
              className="px-2 py-1 text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            >
              -
            </button>
            <span className="px-2 text-xs text-surface-600 dark:text-surface-400 tabular-nums w-6 text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
              className="px-2 py-1 text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            >
              +
            </button>
          </div>

          <div className="w-px h-5 bg-surface-200 dark:bg-surface-700 mx-1" />

          <button onClick={handleSave} className="btn-secondary px-3 py-1.5 text-xs gap-1.5" title="Save (Ctrl+S)">
            <Check className="w-3.5 h-3.5" /> Save
          </button>

          {!isRunning ? (
            <button onClick={handleRun} className="btn-primary px-3 py-1.5 text-xs gap-1.5">
              <Play className="w-3.5 h-3.5" /> Run
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-3 py-1.5 text-xs gap-1.5 inline-flex items-center rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
            >
              <Square className="w-3.5 h-3.5 fill-current" /> Stop
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - File Explorer */}
        {showFileTree && (
          <aside className="w-56 shrink-0 flex flex-col border-r border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 dark:border-surface-700">
              <span className="text-2xs font-semibold uppercase tracking-wider text-surface-500">Explorer</span>
              <button className="rounded p-0.5 text-surface-400 hover:text-surface-600 hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors" title="New file">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {searchOpen && (
              <div className="px-2 py-2 border-b border-surface-200 dark:border-surface-700">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files..."
                  className="input text-xs py-1.5"
                  autoFocus
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin py-2 bg-surface-900">
              {FILE_TREE.map((node) => (
                <FileTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  activeFile={activeTab.name}
                  onFileSelect={handleFileSelect}
                />
              ))}
            </div>

            {/* Status bar in sidebar */}
            <div className="border-t border-surface-200 dark:border-surface-700 px-3 py-2 flex items-center gap-2 text-2xs text-surface-500 bg-surface-50 dark:bg-surface-900">
              <GitBranch className="h-3 w-3" />
              <span>main</span>
              <span className="ml-auto flex items-center gap-1">
                <span className="status-online" />
                Synced
              </span>
            </div>
          </aside>
        )}

        {/* Editor + Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center bg-surface-100 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 overflow-x-auto scrollbar-thin">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 text-xs border-r border-surface-200 dark:border-surface-700 transition-colors relative',
                  activeTabId === tab.id
                    ? 'bg-white dark:bg-surface-950 text-surface-900 dark:text-white'
                    : 'text-surface-500 hover:text-surface-700 hover:bg-white/50 dark:hover:bg-surface-800'
                )}
              >
                {activeTabId === tab.id && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand-500" />
                )}
                <FileCode2 className={cn('w-3.5 h-3.5', getFileIcon(tab.name))} />
                <span>{tab.name}</span>
                {tab.modified && <span className="text-amber-500 text-xs">●</span>}
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className="ml-1 rounded p-0.5 hover:bg-surface-200 dark:hover:bg-surface-700 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
            ))}
            <button className="px-3 py-2 text-surface-400 hover:text-surface-600" title="New tab">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Editor area */}
          <div className={cn('flex-1 flex overflow-hidden', isDark ? 'bg-[#1e1e1e]' : 'bg-white')}>
            {/* Line numbers */}
            <div className={cn(
              'select-none text-right shrink-0 font-mono pt-3 pb-3',
              isDark ? 'text-surface-600 bg-[#1e1e1e]' : 'text-surface-400 bg-surface-50',
            )} style={{ fontSize: `${fontSize - 2}px`, lineHeight: `${fontSize * 1.5}px`, paddingLeft: '12px', paddingRight: '12px' }}>
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Code area */}
            <div className="flex-1 relative overflow-hidden">
              <textarea
                ref={textareaRef}
                value={activeTab.content}
                onChange={(e) => updateTabContent(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                className={cn(
                  'w-full h-full resize-none outline-none font-mono pt-3 pb-3 px-4',
                  isDark ? 'bg-[#1e1e1e] text-[#d4d4d4] caret-white' : 'bg-white text-surface-900 caret-brand-500',
                  wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto',
                )}
                style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px`, tabSize: 2 }}
              />

              {/* Minimap */}
              <div className="absolute top-0 right-0 bottom-0 w-16 bg-surface-900/30 pointer-events-none border-l border-surface-700/30">
                <div className="p-1">
                  <div className="h-1 bg-brand-500/30 rounded mb-0.5" />
                  <div className="h-0.5 bg-surface-500/20 rounded mb-0.5" />
                  <div className="h-0.5 bg-surface-500/20 rounded mb-0.5" />
                  <div className="h-1 bg-blue-500/30 rounded mb-0.5" />
                  <div className="h-0.5 bg-surface-500/20 rounded mb-0.5" />
                  <div className="h-0.5 bg-surface-500/20 rounded mb-0.5" />
                  <div className="h-2 bg-amber-500/30 rounded mb-0.5" />
                  <div className="h-0.5 bg-surface-500/20 rounded mb-0.5" />
                  <div className="h-1 bg-emerald-500/30 rounded mb-0.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Terminal */}
          {showTerminal && (
            <div className="border-t-2 border-surface-200 dark:border-surface-700 bg-[#0d1117] flex flex-col" style={{ height: '240px' }}>
              {/* Terminal tabs */}
              <div className="flex items-center justify-between border-b border-surface-700/50 px-2">
                <div className="flex items-center">
                  {(['output', 'terminal', 'problems'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTerminalTab(tab)}
                      className={cn(
                        'px-3 py-2 text-xs capitalize transition-colors relative',
                        terminalTab === tab
                          ? 'text-white'
                          : 'text-surface-500 hover:text-surface-300'
                      )}
                    >
                      {terminalTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
                      {tab}
                      {tab === 'problems' && (
                        <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-2xs px-1.5 py-0.5">2</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setOutputLines([])}
                    className="rounded p-1 text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
                    title="Clear"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setShowTerminal(false)}
                    className="rounded p-1 text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
                    title="Close panel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Terminal content */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-3 font-mono text-xs text-surface-200">
                {terminalTab === 'output' && (
                  <>
                    {outputLines.length === 0 && (
                      <div className="text-surface-500">
                        <span className="text-brand-400">$</span> Click <span className="text-white">Run</span> to execute the code
                      </div>
                    )}
                    {outputLines.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          'leading-relaxed',
                          line.type === 'error' && 'text-red-400',
                          line.type === 'success' && 'text-emerald-400',
                          line.type === 'info' && 'text-surface-300',
                          line.type === 'system' && 'text-brand-300',
                        )}
                      >
                        {line.text || '\u00A0'}
                      </div>
                    ))}
                    {isRunning && (
                      <div className="flex items-center gap-2 text-surface-400 mt-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Running...</span>
                        <span className="inline-block w-2 h-3 bg-surface-300 animate-cursor-blink" />
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </>
                )}
                {terminalTab === 'terminal' && (
                  <div>
                    <div className="text-emerald-400">user@collabspace:~/project$ <span className="inline-block w-2 h-3 bg-surface-300 animate-cursor-blink ml-1" /></div>
                  </div>
                )}
                {terminalTab === 'problems' && (
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2 text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-amber-300">Warning</span> · auth-middleware.ts:48
                        <p className="text-surface-400 text-2xs mt-0.5">'any' type is unsafe — consider using a specific type</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-amber-300">Warning</span> · api-gateway.ts:23
                        <p className="text-surface-400 text-2xs mt-0.5">Unused variable: 'next'</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <footer className="flex items-center justify-between px-3 h-6 bg-brand-600 text-white text-2xs shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" /> main
          </span>
          <span>Ln 1, Col 1</span>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="capitalize">{activeTab.language}</span>
          <span>{lineCount} lines</span>
          {!showTerminal && (
            <button onClick={() => setShowTerminal(true)} className="flex items-center gap-1 hover:bg-brand-700 rounded px-1.5 py-0.5 transition-colors">
              <Terminal className="w-3 h-3" /> Show panel
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
