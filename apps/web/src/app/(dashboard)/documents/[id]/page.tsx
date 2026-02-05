'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn, getInitials, generateColor } from '@/lib/utils';
import {
  ArrowLeft,
  Share2,
  MessageSquare,
  Users,
  Check,
  MoreHorizontal,
  Download,
  Copy,
  Trash2,
  X,
  Send,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Image,
  Table,
  AlertCircle,
  Clock,
  ChevronRight,
  History,
  RotateCcw,
  Palette,
  Highlighter,
  RemoveFormatting,
  FileText,
  Hash,
  Sparkles,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'checklist'
  | 'quote'
  | 'code'
  | 'divider'
  | 'callout';

interface Block {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  calloutType?: 'info' | 'warning' | 'success';
}

// ============================================================
// Constants
// ============================================================

const COLLABORATORS = [
  { id: 'u1', name: 'Sarah Chen', color: '#14b8a6' },
  { id: 'u2', name: 'Alex Rivera', color: '#3b82f6' },
  { id: 'u3', name: 'James Kim', color: '#f59e0b' },
  { id: 'u4', name: 'Maya Patel', color: '#22c55e' },
];

const DEMO_COMMENTS = [
  {
    id: 'c1',
    author: 'Alex Rivera',
    content: 'Should we add a section about the GraphQL schema design? I think it would help clarify the dual-API strategy.',
    time: '2 hours ago',
    resolved: false,
  },
  {
    id: 'c2',
    author: 'James Kim',
    content: 'The rate limiting numbers look good. We should also mention the burst allowance for enterprise tier.',
    time: '5 hours ago',
    resolved: false,
  },
  {
    id: 'c3',
    author: 'Sarah Chen',
    content: 'Great overview! I will add the deployment architecture section tomorrow.',
    time: '1 day ago',
    resolved: true,
  },
  {
    id: 'c4',
    author: 'Maya Patel',
    content: 'Can we add error code documentation link in the Error Handling section?',
    time: '2 days ago',
    resolved: false,
  },
];

const DEMO_VERSIONS = [
  { id: 'v1', user: 'Sarah Chen', time: 'Today at 2:30 PM', label: 'Added WebSocket section' },
  { id: 'v2', user: 'Alex Rivera', time: 'Today at 11:15 AM', label: 'Updated rate limiting numbers' },
  { id: 'v3', user: 'James Kim', time: 'Yesterday at 4:45 PM', label: 'Added error handling docs' },
  { id: 'v4', user: 'Sarah Chen', time: 'Yesterday at 10:00 AM', label: 'Initial architecture draft' },
  { id: 'v5', user: 'Maya Patel', time: 'Apr 10 at 3:20 PM', label: 'Created document' },
];

const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Gray', value: '#6b7280' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: '' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fecdd3' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Teal', value: '#99f6e4' },
];

const SLASH_ITEMS: { type: BlockType; label: string; description: string; icon: typeof Type; calloutType?: 'info' | 'warning' | 'success' }[] = [
  { type: 'paragraph', label: 'Text', description: 'Plain text block', icon: Type },
  { type: 'heading1', label: 'Heading 1', description: 'Large section heading', icon: Heading1 },
  { type: 'heading2', label: 'Heading 2', description: 'Medium section heading', icon: Heading2 },
  { type: 'heading3', label: 'Heading 3', description: 'Small section heading', icon: Heading3 },
  { type: 'bullet', label: 'Bullet List', description: 'Unordered list item', icon: List },
  { type: 'numbered', label: 'Numbered List', description: 'Ordered list item', icon: ListOrdered },
  { type: 'checklist', label: 'Checklist', description: 'To-do with checkbox', icon: CheckSquare },
  { type: 'quote', label: 'Quote', description: 'Block quotation', icon: Quote },
  { type: 'code', label: 'Code Block', description: 'Syntax-highlighted code', icon: Code },
  { type: 'divider', label: 'Divider', description: 'Horizontal separator', icon: Minus },
  { type: 'callout', label: 'Info Callout', description: 'Informational notice', icon: AlertCircle, calloutType: 'info' },
  { type: 'callout', label: 'Warning Callout', description: 'Warning notice', icon: AlertCircle, calloutType: 'warning' },
  { type: 'callout', label: 'Success Callout', description: 'Success notice', icon: Sparkles, calloutType: 'success' },
  { type: 'paragraph', label: 'Image', description: 'Embed an image (placeholder)', icon: Image },
  { type: 'paragraph', label: 'Table', description: 'Insert a table (placeholder)', icon: Table },
];

function makeId() {
  return 'b' + Math.random().toString(36).slice(2, 9);
}

function buildInitialBlocks(): Block[] {
  return [
    { id: makeId(), type: 'heading1', content: 'API Architecture Design' },
    { id: makeId(), type: 'paragraph', content: 'A comprehensive overview of the CollabSpace platform API architecture, covering authentication, rate limiting, real-time features, and data access patterns.' },
    { id: makeId(), type: 'heading2', content: 'Overview' },
    { id: makeId(), type: 'paragraph', content: 'The CollabSpace platform uses a hybrid API architecture combining REST and GraphQL endpoints to serve different client needs. REST provides predictable, cacheable endpoints for CRUD operations, while GraphQL enables flexible data fetching for the real-time collaboration interface.' },
    { id: makeId(), type: 'paragraph', content: 'This document outlines the key architectural decisions, implementation patterns, and operational considerations for the API layer.' },
    { id: makeId(), type: 'heading2', content: 'Authentication Layer' },
    { id: makeId(), type: 'paragraph', content: 'All API requests are authenticated via JWT tokens with a short-lived access token (15 min) and a long-lived refresh token (7 days). The authentication middleware validates tokens, extracts user context, and attaches workspace permissions to the request object.' },
    { id: makeId(), type: 'heading3', content: 'Rate Limiting Strategy' },
    { id: makeId(), type: 'paragraph', content: 'We implement a sliding window rate limiter using Redis sorted sets. Each API tier has different limits:' },
    { id: makeId(), type: 'bullet', content: 'Free tier: 100 requests/minute' },
    { id: makeId(), type: 'bullet', content: 'Pro tier: 1,000 requests/minute' },
    { id: makeId(), type: 'bullet', content: 'Enterprise: 10,000 requests/minute' },
    { id: makeId(), type: 'paragraph', content: 'The rate limiter returns X-RateLimit-Remaining and X-RateLimit-Reset headers so clients can implement backoff strategies.' },
    { id: makeId(), type: 'quote', content: 'Decision: We chose sliding window over fixed window because it provides smoother rate limiting and prevents the "thundering herd" problem at window boundaries. - Architecture Review Board' },
    { id: makeId(), type: 'heading2', content: 'WebSocket Integration' },
    { id: makeId(), type: 'paragraph', content: 'Real-time features (document collaboration, presence, notifications) use a separate WebSocket server that shares authentication with the REST API. The WebSocket server handles room management, CRDT sync, and awareness broadcasting.' },
    { id: makeId(), type: 'code', content: '{\n  "websocket": {\n    "port": 3001,\n    "maxConnections": 10000,\n    "heartbeatInterval": 30000,\n    "rooms": {\n      "maxPerUser": 50,\n      "idleTimeout": 300000\n    },\n    "encoding": "binary",\n    "fallback": "json"\n  }\n}' },
    { id: makeId(), type: 'heading2', content: 'Action Items' },
    { id: makeId(), type: 'checklist', content: 'Implement rate limiter Redis integration', checked: true },
    { id: makeId(), type: 'checklist', content: 'Add GraphQL schema documentation', checked: true },
    { id: makeId(), type: 'checklist', content: 'Set up WebSocket load balancing', checked: false },
    { id: makeId(), type: 'checklist', content: 'Write API versioning strategy document', checked: false },
    { id: makeId(), type: 'checklist', content: 'Configure PgBouncer connection pooling', checked: true },
    { id: makeId(), type: 'checklist', content: 'Add end-to-end API integration tests', checked: false },
    { id: makeId(), type: 'divider', content: '' },
    { id: makeId(), type: 'callout', content: 'This document is a living specification. Please discuss any proposed changes in the #api-architecture Slack channel before making edits.', calloutType: 'info' },
  ];
}

// ============================================================
// Main Component
// ============================================================

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;

  // Document state
  const [title, setTitle] = useState('API Architecture Design');
  const [subtitle, setSubtitle] = useState('Platform architecture specification - v2.4');
  const [blocks, setBlocks] = useState<Block[]>(buildInitialBlocks);
  const [showCover, setShowCover] = useState(true);

  // UI panels
  const [showComments, setShowComments] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Floating toolbar
  const [floatingToolbar, setFloatingToolbar] = useState<{ x: number; y: number } | null>(null);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);

  // Slash command
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; x: number; y: number } | null>(null);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  // Save status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [lastSaved, setLastSaved] = useState(120);

  // Comments
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(DEMO_COMMENTS);

  // Version preview
  const [previewVersion, setPreviewVersion] = useState<string | null>(null);

  // Loading
  const [isLoading, setIsLoading] = useState(true);

  // Link dialog
  const [linkDialog, setLinkDialog] = useState<{ x: number; y: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');

  // Refs
  const titleRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editorRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // ---- Loading ----
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // ---- Auto-save timer ----
  useEffect(() => {
    const interval = setInterval(() => {
      setLastSaved((prev) => prev + 10);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Trigger "saving" on block change
  useEffect(() => {
    setSaveStatus('saving');
    const t = setTimeout(() => {
      setSaveStatus('saved');
      setLastSaved(0);
    }, 800);
    return () => clearTimeout(t);
  }, [blocks]);

  const formatSavedTime = (seconds: number): string => {
    if (seconds < 10) return 'Saved just now';
    if (seconds < 60) return `Saved ${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    return `Saved ${mins}m ago`;
  };

  // ---- Computed stats ----
  const stats = useMemo(() => {
    const allText = blocks.map((b) => b.content).join(' ');
    const words = allText.trim().split(/\s+/).filter(Boolean).length;
    const chars = allText.length;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readingTime };
  }, [blocks]);

  const unresolvedCommentCount = comments.filter((c) => !c.resolved).length;

  // ============================================================
  // Block operations
  // ============================================================

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }, []);

  const insertBlockAfter = useCallback((afterId: string, newBlock: Block) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === afterId);
      if (idx === -1) return [...prev, newBlock];
      const next = [...prev];
      next.splice(idx + 1, 0, newBlock);
      return next;
    });
    // Focus the new block
    setTimeout(() => {
      const el = blockRefs.current[newBlock.id];
      if (el) {
        el.focus();
        // Place caret at start
        const sel = window.getSelection();
        if (sel && el.childNodes.length > 0) {
          const range = document.createRange();
          range.setStart(el, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }, 20);
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((b) => b.id === id);
      const next = prev.filter((b) => b.id !== id);
      // Focus the previous block
      const focusIdx = Math.max(0, idx - 1);
      setTimeout(() => {
        const el = blockRefs.current[next[focusIdx]?.id];
        if (el) {
          el.focus();
          // Move caret to end
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 20);
      return next;
    });
  }, []);

  const convertBlock = useCallback((id: string, newType: BlockType, calloutType?: 'info' | 'warning' | 'success') => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, type: newType, checked: newType === 'checklist' ? false : undefined, calloutType: newType === 'callout' ? (calloutType || 'info') : undefined }
          : b
      )
    );
  }, []);

  // ============================================================
  // Markdown shortcuts (auto-convert on Space)
  // ============================================================

  const checkMarkdownShortcut = useCallback(
    (blockId: string, text: string): boolean => {
      const conversions: [RegExp, BlockType, string?][] = [
        [/^# $/, 'heading1'],
        [/^## $/, 'heading2'],
        [/^### $/, 'heading3'],
        [/^[-*] $/, 'bullet'],
        [/^\d+\. $/, 'numbered'],
        [/^\[\] $/, 'checklist'],
        [/^> $/, 'quote'],
      ];
      for (const [regex, type] of conversions) {
        if (regex.test(text)) {
          convertBlock(blockId, type);
          // Clear the trigger text
          setTimeout(() => {
            const el = blockRefs.current[blockId];
            if (el) {
              el.textContent = '';
              el.focus();
            }
          }, 0);
          return true;
        }
      }
      // Code block: ```
      if (text.trimEnd() === '```') {
        convertBlock(blockId, 'code');
        setTimeout(() => {
          const el = blockRefs.current[blockId];
          if (el) {
            el.textContent = '';
            el.focus();
          }
        }, 0);
        return true;
      }
      // Divider: ---
      if (text.trimEnd() === '---') {
        convertBlock(blockId, 'divider');
        updateBlock(blockId, { content: '' });
        const newBlock: Block = { id: makeId(), type: 'paragraph', content: '' };
        insertBlockAfter(blockId, newBlock);
        return true;
      }
      return false;
    },
    [convertBlock, updateBlock, insertBlockAfter]
  );

  // ============================================================
  // Floating toolbar detection
  // ============================================================

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        // Small delay to allow click-on-toolbar without flickering
        setTimeout(() => {
          const active = document.activeElement;
          const toolbar = document.getElementById('floating-toolbar');
          if (toolbar && toolbar.contains(active)) return;
          setFloatingToolbar(null);
          setShowTextColor(false);
          setShowHighlight(false);
        }, 150);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) return;

      // Check if selection is inside our editor
      const editor = editorRef.current;
      if (!editor) return;
      const container = range.commonAncestorContainer;
      if (!editor.contains(container instanceof Element ? container : container.parentElement)) return;

      setFloatingToolbar({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  // ============================================================
  // Keyboard shortcuts (bold, italic, underline)
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            document.execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            document.execCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            document.execCommand('underline');
            break;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ============================================================
  // Close slash menu on outside click
  // ============================================================

  useEffect(() => {
    if (!slashMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashMenu(null);
        setSlashFilter('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [slashMenu]);

  // ============================================================
  // Block event handlers
  // ============================================================

  const handleBlockKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, block: Block) => {
      const el = e.currentTarget;

      // Enter → new block
      if (e.key === 'Enter' && !e.shiftKey) {
        // Don't intercept in code blocks (allow multi-line)
        if (block.type === 'code') return;
        e.preventDefault();
        const newBlock: Block = {
          id: makeId(),
          type: block.type === 'bullet' || block.type === 'numbered' || block.type === 'checklist'
            ? block.type
            : 'paragraph',
          content: '',
          checked: block.type === 'checklist' ? false : undefined,
        };
        // If current block is empty list item, convert to paragraph instead
        if (
          (block.type === 'bullet' || block.type === 'numbered' || block.type === 'checklist') &&
          !el.textContent?.trim()
        ) {
          convertBlock(block.id, 'paragraph');
          return;
        }
        insertBlockAfter(block.id, newBlock);
      }

      // Backspace on empty block → delete
      if (e.key === 'Backspace' && !el.textContent?.trim()) {
        if (block.type !== 'paragraph') {
          e.preventDefault();
          convertBlock(block.id, 'paragraph');
          return;
        }
        e.preventDefault();
        deleteBlock(block.id);
      }

      // Slash command: handled in onInput
      // Arrow key navigation for slash menu
      if (slashMenu && slashMenu.blockId === block.id) {
        const filtered = SLASH_ITEMS.filter((item) =>
          item.label.toLowerCase().includes(slashFilter.toLowerCase())
        );
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = filtered[slashIndex];
          if (selected) {
            applySlashCommand(block.id, selected);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setSlashMenu(null);
          setSlashFilter('');
        }
      }
    },
    [slashMenu, slashFilter, slashIndex, convertBlock, insertBlockAfter, deleteBlock]
  );

  const handleBlockInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>, block: Block) => {
      const el = e.currentTarget;
      const text = el.textContent || '';

      // Update block content (innerHTML for rich text)
      updateBlock(block.id, { content: el.innerHTML });

      // Check for markdown shortcuts
      if (block.type === 'paragraph') {
        if (checkMarkdownShortcut(block.id, text)) return;
      }

      // Slash menu
      if (text.startsWith('/')) {
        const rect = el.getBoundingClientRect();
        setSlashMenu({ blockId: block.id, x: rect.left, y: rect.bottom + 4 });
        setSlashFilter(text.slice(1));
        setSlashIndex(0);
      } else if (slashMenu && slashMenu.blockId === block.id) {
        setSlashMenu(null);
        setSlashFilter('');
      }
    },
    [updateBlock, checkMarkdownShortcut, slashMenu]
  );

  const applySlashCommand = useCallback(
    (blockId: string, item: (typeof SLASH_ITEMS)[number]) => {
      convertBlock(blockId, item.type, item.calloutType);
      // Clear the slash text
      setTimeout(() => {
        const el = blockRefs.current[blockId];
        if (el) {
          el.textContent = '';
          el.innerHTML = '';
          el.focus();
        }
      }, 0);
      setSlashMenu(null);
      setSlashFilter('');
    },
    [convertBlock]
  );

  // ============================================================
  // Formatting commands
  // ============================================================

  const execFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  const applyTextColor = useCallback((color: string) => {
    if (color) {
      document.execCommand('foreColor', false, color);
    } else {
      document.execCommand('removeFormat');
    }
    setShowTextColor(false);
  }, []);

  const applyHighlight = useCallback((color: string) => {
    if (color) {
      document.execCommand('hiliteColor', false, color);
    } else {
      document.execCommand('removeFormat');
    }
    setShowHighlight(false);
  }, []);

  const insertLink = useCallback(() => {
    if (linkUrl.trim()) {
      document.execCommand('createLink', false, linkUrl.trim());
    }
    setLinkDialog(null);
    setLinkUrl('');
  }, [linkUrl]);

  // ============================================================
  // Comment actions
  // ============================================================

  const handleAddComment = useCallback(() => {
    if (!commentText.trim()) return;
    setComments((prev) => [
      {
        id: `c-${Date.now()}`,
        author: 'You',
        content: commentText.trim(),
        time: 'just now',
        resolved: false,
      },
      ...prev,
    ]);
    setCommentText('');
  }, [commentText]);

  const toggleResolve = useCallback((id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c))
    );
  }, []);

  // ============================================================
  // Loading skeleton
  // ============================================================

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-white dark:bg-surface-950">
        <div className="flex h-14 items-center gap-3 border-b border-surface-200 px-4 dark:border-surface-800">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-200 dark:bg-surface-800" />
          <div className="h-5 w-48 animate-pulse rounded bg-surface-200 dark:bg-surface-800" />
        </div>
        <div className="flex-1 animate-pulse p-8">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="h-10 w-3/4 rounded bg-surface-200 dark:bg-surface-800" />
            <div className="h-4 w-1/2 rounded bg-surface-200 dark:bg-surface-800" />
            <div className="mt-8 h-4 w-full rounded bg-surface-200 dark:bg-surface-800" />
            <div className="h-4 w-5/6 rounded bg-surface-200 dark:bg-surface-800" />
            <div className="h-4 w-2/3 rounded bg-surface-200 dark:bg-surface-800" />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-surface-950">
      {/* ---- Header ---- */}
      <header className="flex h-14 items-center justify-between border-b border-surface-200 px-3 dark:border-surface-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/documents')}
            className="shrink-0 rounded-lg p-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
            title="Back to documents"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
              {title || 'Untitled'}
            </span>
          </div>

          <span className="shrink-0 flex items-center gap-1 text-xs text-surface-400">
            {saveStatus === 'saving' ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                {formatSavedTime(lastSaved)}
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Collaborator avatars */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className="flex -space-x-2">
              {COLLABORATORS.map((user) => (
                <div
                  key={user.id}
                  title={`${user.name} (online)`}
                  className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-medium text-white dark:border-surface-950"
                  style={{ backgroundColor: user.color }}
                >
                  {getInitials(user.name)}
                  <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-surface-950" />
                </div>
              ))}
            </div>
          </div>

          {/* Version history */}
          <button
            type="button"
            onClick={() => { setShowVersions(!showVersions); if (showComments) setShowComments(false); }}
            className={cn(
              'rounded-lg p-2 transition-colors',
              showVersions ? 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400' : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500'
            )}
            title="Version history"
          >
            <History className="h-4 w-4" />
          </button>

          {/* Comments toggle */}
          <button
            type="button"
            onClick={() => { setShowComments(!showComments); if (showVersions) setShowVersions(false); }}
            className={cn(
              'relative rounded-lg p-2 transition-colors',
              showComments ? 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400' : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500'
            )}
            title="Comments"
          >
            <MessageSquare className="h-4 w-4" />
            {unresolvedCommentCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
                {unresolvedCommentCount}
              </span>
            )}
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="rounded-lg p-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="dropdown absolute right-0 top-full z-50 mt-1 w-48">
                  <button type="button" onClick={() => setShowMoreMenu(false)} className="dropdown-item flex w-full items-center gap-2.5">
                    <Download className="h-4 w-4" /> Export
                  </button>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(window.location.href); setShowMoreMenu(false); }}
                    className="dropdown-item flex w-full items-center gap-2.5"
                  >
                    <Copy className="h-4 w-4" /> Copy Link
                  </button>
                  <div className="my-1 h-px bg-surface-200 dark:bg-surface-700" />
                  <button
                    type="button"
                    onClick={() => { if (window.confirm('Delete this document?')) router.push('/documents'); setShowMoreMenu(false); }}
                    className="dropdown-item flex w-full items-center gap-2.5 text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---- Main area ---- */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- Editor column ---- */}
        <div className="flex-1 overflow-y-auto scrollbar-thin" ref={editorRef}>
          <div className="mx-auto max-w-3xl px-8 pb-32">
            {/* Cover image */}
            {showCover ? (
              <div className="relative -mx-8 mb-6 h-48 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 dark:from-brand-700 dark:via-brand-800 dark:to-brand-950">
                {previewVersion && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-surface-800">
                      Previewing: {DEMO_VERSIONS.find((v) => v.id === previewVersion)?.label}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowCover(false)}
                  className="absolute right-3 top-3 rounded-lg bg-black/20 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="pt-6 mb-2">
                <button
                  type="button"
                  onClick={() => setShowCover(true)}
                  className="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                >
                  + Add cover
                </button>
              </div>
            )}

            {/* Title */}
            <div
              ref={titleRef}
              contentEditable
              suppressContentEditableWarning
              className="mt-4 text-4xl font-bold text-surface-900 dark:text-surface-50 outline-none empty:before:content-['Untitled'] empty:before:text-surface-300 dark:empty:before:text-surface-600"
              onInput={(e) => setTitle(e.currentTarget.textContent || '')}
              dangerouslySetInnerHTML={{ __html: title }}
            />

            {/* Subtitle */}
            <div
              ref={subtitleRef}
              contentEditable
              suppressContentEditableWarning
              className="mt-2 mb-8 text-lg text-surface-400 dark:text-surface-500 outline-none empty:before:content-['Add_a_description...'] empty:before:text-surface-300 dark:empty:before:text-surface-600"
              onInput={(e) => setSubtitle(e.currentTarget.textContent || '')}
              dangerouslySetInnerHTML={{ __html: subtitle }}
            />

            {/* Fake collaboration cursors */}
            <div className="relative">
              <FakeCursor name="Alex R." color="#3b82f6" top={180} left={220} />
              <FakeCursor name="James K." color="#f59e0b" top={420} left={140} />
            </div>

            {/* Blocks */}
            <div className="space-y-0.5">
              {blocks.map((block, index) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  index={index}
                  blockRef={(el) => { blockRefs.current[block.id] = el; }}
                  onInput={(e) => handleBlockInput(e, block)}
                  onKeyDown={(e) => handleBlockKeyDown(e, block)}
                  onToggleCheck={() => updateBlock(block.id, { checked: !block.checked })}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ---- Comments Panel ---- */}
        {showComments && (
          <div className="w-80 shrink-0 border-l border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900 flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3 dark:border-surface-800">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                Comments ({unresolvedCommentCount})
              </h3>
              <button onClick={() => setShowComments(false)} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-surface-200 p-3 dark:border-surface-800">
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="input flex-1 text-sm py-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); }
                  }}
                />
                <button onClick={handleAddComment} disabled={!commentText.trim()} className="btn-primary px-2.5 py-2">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={cn('rounded-lg border p-3 transition-colors', comment.resolved ? 'border-surface-200 bg-surface-100 opacity-60 dark:border-surface-700 dark:bg-surface-800' : 'border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800')}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: generateColor(comment.author) }}
                    >
                      {getInitials(comment.author)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{comment.author}</span>
                        <span className="text-xs text-surface-400">{comment.time}</span>
                      </div>
                      <p className="mt-1 text-sm text-surface-600 dark:text-surface-400 leading-relaxed">{comment.content}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => toggleResolve(comment.id)}
                          className={cn('text-xs font-medium transition-colors', comment.resolved ? 'text-amber-600 hover:text-amber-700' : 'text-brand-600 hover:text-brand-700 dark:text-brand-400')}
                        >
                          {comment.resolved ? 'Re-open' : 'Resolve'}
                        </button>
                        <button className="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">Reply</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Version History Panel ---- */}
        {showVersions && (
          <div className="w-80 shrink-0 border-l border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900 flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3 dark:border-surface-800">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">Version History</h3>
              <button onClick={() => { setShowVersions(false); setPreviewVersion(null); }} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {DEMO_VERSIONS.map((version) => (
                <div
                  key={version.id}
                  className={cn('border-b border-surface-200 dark:border-surface-800 p-4 transition-colors cursor-pointer', previewVersion === version.id ? 'bg-brand-50 dark:bg-brand-950/30' : 'hover:bg-surface-100 dark:hover:bg-surface-800/50')}
                  onClick={() => setPreviewVersion(previewVersion === version.id ? null : version.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: generateColor(version.user) }}
                    >
                      {getInitials(version.user)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{version.label}</p>
                      <p className="mt-0.5 text-xs text-surface-400">{version.user}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-surface-400">
                        <Clock className="h-3 w-3" />
                        {version.time}
                      </div>
                      {previewVersion === version.id && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPreviewVersion(null); }}
                          className="mt-2 inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                      )}
                    </div>
                    <ChevronRight className={cn('h-4 w-4 text-surface-300 transition-transform', previewVersion === version.id && 'rotate-90')} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- Bottom Status Bar ---- */}
      <div className="flex items-center justify-between border-t border-surface-200 px-4 py-1.5 dark:border-surface-800 shrink-0 bg-white dark:bg-surface-950">
        <div className="flex items-center gap-4">
          <span className="text-xs text-surface-400">{stats.words} words</span>
          <span className="text-xs text-surface-400">{stats.chars} characters</span>
          <span className="text-xs text-surface-400">{stats.readingTime} min read</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-surface-400">
          {saveStatus === 'saving' ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              All changes saved
            </>
          )}
        </div>
      </div>

      {/* ---- Floating Toolbar ---- */}
      {floatingToolbar && (
        <FloatingToolbar
          x={floatingToolbar.x}
          y={floatingToolbar.y}
          onFormat={execFormat}
          showTextColor={showTextColor}
          setShowTextColor={setShowTextColor}
          showHighlight={showHighlight}
          setShowHighlight={setShowHighlight}
          onTextColor={applyTextColor}
          onHighlight={applyHighlight}
          onLinkClick={() => {
            setLinkDialog({ x: floatingToolbar.x, y: floatingToolbar.y + 50 });
            setTimeout(() => linkInputRef.current?.focus(), 50);
          }}
        />
      )}

      {/* ---- Link Dialog ---- */}
      {linkDialog && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => { setLinkDialog(null); setLinkUrl(''); }} />
          <div
            className="fixed z-[71] flex items-center gap-2 rounded-lg border border-surface-200 bg-white p-2 shadow-overlay dark:border-surface-700 dark:bg-surface-800 animate-scale-in"
            style={{ left: Math.max(16, linkDialog.x - 140), top: linkDialog.y }}
          >
            <input
              ref={linkInputRef}
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="input w-56 py-1.5 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } if (e.key === 'Escape') { setLinkDialog(null); setLinkUrl(''); } }}
            />
            <button onClick={insertLink} className="btn-primary px-2.5 py-1.5 text-sm">
              <Link className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}

      {/* ---- Slash Command Menu ---- */}
      {slashMenu && (
        <SlashCommandMenu
          ref={slashMenuRef}
          x={slashMenu.x}
          y={slashMenu.y}
          filter={slashFilter}
          activeIndex={slashIndex}
          onSelect={(item) => applySlashCommand(slashMenu.blockId, item)}
          onClose={() => { setSlashMenu(null); setSlashFilter(''); }}
        />
      )}

      {/* ---- Share Modal ---- */}
      {showShareModal && (
        <ShareModal documentId={documentId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}

// ============================================================
// Block Renderer
// ============================================================

function BlockRenderer({
  block,
  index,
  blockRef,
  onInput,
  onKeyDown,
  onToggleCheck,
}: {
  block: Block;
  index: number;
  blockRef: (el: HTMLDivElement | null) => void;
  onInput: (e: React.FormEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onToggleCheck: () => void;
}) {
  // Divider block
  if (block.type === 'divider') {
    return <hr className="my-6 border-surface-200 dark:border-surface-700" />;
  }

  // Callout block
  if (block.type === 'callout') {
    const styles = {
      info: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
      warning: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
      success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
    };
    const icons = {
      info: <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />,
      warning: <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />,
      success: <Sparkles className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />,
    };
    const calloutType = block.calloutType || 'info';
    return (
      <div className={cn('my-3 flex gap-3 rounded-lg border p-4', styles[calloutType])}>
        {icons[calloutType]}
        <div
          ref={blockRef}
          contentEditable
          suppressContentEditableWarning
          className="flex-1 text-sm leading-relaxed text-surface-700 dark:text-surface-300 outline-none"
          onInput={onInput}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    );
  }

  // Code block
  if (block.type === 'code') {
    return (
      <div className="my-3 rounded-lg bg-surface-900 dark:bg-surface-950 border border-surface-800">
        <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800">
          <span className="text-xs text-surface-400 font-mono">Code</span>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(`code-block-${block.id}`);
              if (el) navigator.clipboard.writeText(el.textContent || '');
            }}
            className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
          >
            Copy
          </button>
        </div>
        <div
          id={`code-block-${block.id}`}
          ref={blockRef}
          contentEditable
          suppressContentEditableWarning
          className="p-4 font-mono text-sm text-emerald-400 leading-relaxed outline-none whitespace-pre-wrap"
          onInput={onInput}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    );
  }

  // Quote block
  if (block.type === 'quote') {
    return (
      <div className="my-2 border-l-4 border-brand-400 dark:border-brand-600 pl-4 py-1">
        <div
          ref={blockRef}
          contentEditable
          suppressContentEditableWarning
          className="text-base italic text-surface-600 dark:text-surface-400 leading-relaxed outline-none"
          onInput={onInput}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    );
  }

  // Checklist block
  if (block.type === 'checklist') {
    return (
      <div className="flex items-start gap-2.5 py-0.5 group">
        <button
          type="button"
          onClick={onToggleCheck}
          className={cn(
            'mt-1 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border-2 transition-colors',
            block.checked
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-surface-300 dark:border-surface-600 hover:border-brand-400'
          )}
          style={{ width: 18, height: 18 }}
        >
          {block.checked && <Check className="h-3 w-3" />}
        </button>
        <div
          ref={blockRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            'flex-1 text-base leading-relaxed outline-none',
            block.checked ? 'line-through text-surface-400' : 'text-surface-800 dark:text-surface-200'
          )}
          onInput={onInput}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    );
  }

  // Bullet list
  if (block.type === 'bullet') {
    return (
      <div className="flex items-start gap-2.5 py-0.5 pl-1">
        <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-surface-400 dark:bg-surface-500" />
        <div
          ref={blockRef}
          contentEditable
          suppressContentEditableWarning
          className="flex-1 text-base text-surface-800 dark:text-surface-200 leading-relaxed outline-none"
          onInput={onInput}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    );
  }

  // Numbered list
  if (block.type === 'numbered') {
    return (
      <div className="flex items-start gap-2.5 py-0.5 pl-1">
        <span className="mt-0.5 min-w-[1.25rem] shrink-0 text-right text-base font-medium text-surface-400 dark:text-surface-500">
          {index + 1}.
        </span>
        <div
          ref={blockRef}
          contentEditable
          suppressContentEditableWarning
          className="flex-1 text-base text-surface-800 dark:text-surface-200 leading-relaxed outline-none"
          onInput={onInput}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    );
  }

  // Headings and paragraph
  const headingStyles: Record<string, string> = {
    heading1: 'text-3xl font-bold text-surface-900 dark:text-surface-50 mt-8 mb-2',
    heading2: 'text-2xl font-semibold text-surface-900 dark:text-surface-50 mt-6 mb-1.5',
    heading3: 'text-xl font-semibold text-surface-800 dark:text-surface-100 mt-5 mb-1',
    paragraph: 'text-base text-surface-700 dark:text-surface-300 leading-relaxed py-0.5',
  };

  return (
    <div
      ref={blockRef}
      contentEditable
      suppressContentEditableWarning
      className={cn(headingStyles[block.type] || headingStyles.paragraph, 'outline-none empty:before:text-surface-300 dark:empty:before:text-surface-600')}
      data-placeholder="Type / for commands..."
      onInput={onInput}
      onKeyDown={onKeyDown}
      dangerouslySetInnerHTML={{ __html: block.content }}
    />
  );
}

// ============================================================
// Floating Toolbar
// ============================================================

function FloatingToolbar({
  x,
  y,
  onFormat,
  showTextColor,
  setShowTextColor,
  showHighlight,
  setShowHighlight,
  onTextColor,
  onHighlight,
  onLinkClick,
}: {
  x: number;
  y: number;
  onFormat: (cmd: string, value?: string) => void;
  showTextColor: boolean;
  setShowTextColor: (v: boolean) => void;
  showHighlight: boolean;
  setShowHighlight: (v: boolean) => void;
  onTextColor: (color: string) => void;
  onHighlight: (color: string) => void;
  onLinkClick: () => void;
}) {
  const toolbarWidth = 380;
  const left = Math.max(16, Math.min(x - toolbarWidth / 2, window.innerWidth - toolbarWidth - 16));
  const top = Math.max(8, y - 44);

  return (
    <div
      id="floating-toolbar"
      className="fixed z-[60] flex items-center gap-0.5 rounded-lg border border-surface-200 bg-white px-1.5 py-1 shadow-overlay dark:border-surface-700 dark:bg-surface-800 animate-scale-in"
      style={{ left, top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarBtn icon={Bold} title="Bold (Ctrl+B)" onClick={() => onFormat('bold')} />
      <ToolbarBtn icon={Italic} title="Italic (Ctrl+I)" onClick={() => onFormat('italic')} />
      <ToolbarBtn icon={Underline} title="Underline (Ctrl+U)" onClick={() => onFormat('underline')} />
      <ToolbarBtn icon={Strikethrough} title="Strikethrough" onClick={() => onFormat('strikeThrough')} />
      <div className="mx-0.5 h-5 w-px bg-surface-200 dark:bg-surface-700" />
      <ToolbarBtn icon={Code} title="Inline Code" onClick={() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          const text = sel.toString();
          document.execCommand('insertHTML', false, `<code class="rounded bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 text-sm font-mono text-brand-700 dark:text-brand-400">${text}</code>`);
        }
      }} />
      <ToolbarBtn icon={Link} title="Insert Link" onClick={onLinkClick} />
      <div className="mx-0.5 h-5 w-px bg-surface-200 dark:bg-surface-700" />

      {/* Text color */}
      <div className="relative">
        <ToolbarBtn icon={Palette} title="Text Color" onClick={() => { setShowTextColor(!showTextColor); setShowHighlight(false); }} active={showTextColor} />
        {showTextColor && (
          <div className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 rounded-lg border border-surface-200 bg-white p-2 shadow-overlay dark:border-surface-700 dark:bg-surface-800 animate-scale-in">
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  onClick={() => onTextColor(c.value)}
                  className="h-6 w-6 rounded-full border border-surface-200 dark:border-surface-600 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value || '#1f2937' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Highlight */}
      <div className="relative">
        <ToolbarBtn icon={Highlighter} title="Highlight" onClick={() => { setShowHighlight(!showHighlight); setShowTextColor(false); }} active={showHighlight} />
        {showHighlight && (
          <div className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 rounded-lg border border-surface-200 bg-white p-2 shadow-overlay dark:border-surface-700 dark:bg-surface-800 animate-scale-in">
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  onClick={() => onHighlight(c.value)}
                  className={cn('h-6 w-6 rounded-full border border-surface-200 dark:border-surface-600 hover:scale-110 transition-transform', !c.value && 'flex items-center justify-center')}
                  style={{ backgroundColor: c.value || undefined }}
                >
                  {!c.value && <X className="h-3 w-3 text-surface-400" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-0.5 h-5 w-px bg-surface-200 dark:bg-surface-700" />
      <ToolbarBtn icon={RemoveFormatting} title="Clear Formatting" onClick={() => onFormat('removeFormat')} />
    </div>
  );
}

function ToolbarBtn({ icon: Icon, title, onClick, active }: { icon: typeof Bold; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        active
          ? 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400'
          : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-surface-100'
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ============================================================
// Slash Command Menu
// ============================================================

import { forwardRef } from 'react';

const SlashCommandMenu = forwardRef<HTMLDivElement, {
  x: number;
  y: number;
  filter: string;
  activeIndex: number;
  onSelect: (item: (typeof SLASH_ITEMS)[number]) => void;
  onClose: () => void;
}>(function SlashCommandMenu({ x, y, filter, activeIndex, onSelect, onClose }, ref) {
  const filtered = SLASH_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) return null;

  // Ensure menu stays on screen
  const left = Math.max(16, Math.min(x, window.innerWidth - 280));
  const top = Math.min(y, window.innerHeight - Math.min(filtered.length, 8) * 48 - 60);

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-64 max-h-80 overflow-y-auto rounded-xl border border-surface-200 bg-white shadow-overlay dark:border-surface-700 dark:bg-surface-900 animate-slide-up scrollbar-thin"
      style={{ left, top }}
    >
      <div className="px-3 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider">
        Blocks
      </div>
      {filtered.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={`${item.label}-${i}`}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
              i === activeIndex
                ? 'bg-brand-50 dark:bg-brand-950/30'
                : 'hover:bg-surface-50 dark:hover:bg-surface-800'
            )}
          >
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', i === activeIndex ? 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-400' : 'border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400')}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{item.label}</p>
              <p className="text-xs text-surface-400">{item.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
});

// ============================================================
// Fake Cursors (Collaboration)
// ============================================================

function FakeCursor({ name, color, top, left }: { name: string; color: string; top: number; left: number }) {
  return (
    <div className="absolute pointer-events-none" style={{ top, left }}>
      <div className="relative">
        <div className="h-5 w-0.5 animate-cursor-blink" style={{ backgroundColor: color }} />
        <div
          className="absolute -top-5 left-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: color }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Share Modal
// ============================================================

function ShareModal({ onClose, documentId }: { onClose: () => void; documentId: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/documents/${documentId}` : '';

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-surface-200 bg-white p-6 shadow-elevated dark:border-surface-700 dark:bg-surface-800 animate-scale-in">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">Share Document</h2>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          Anyone with the link can view this document.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <input type="text" readOnly value={shareUrl} className="input flex-1 py-2.5 text-sm" />
          <button
            type="button"
            onClick={copyLink}
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors', copied ? 'bg-emerald-600 text-white' : 'btn-primary')}
          >
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
