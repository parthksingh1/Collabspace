'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatRelativeTime, getInitials, generateColor, truncate } from '@/lib/utils';
import {
  Search,
  Plus,
  FileText,
  User,
  Users,
  SortAsc,
  SortDesc,
  ChevronDown,
  X,
  MoreVertical,
  Trash2,
  Star,
} from 'lucide-react';

// ---- Types ----

interface DemoDocument {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  createdAt: string;
  collaborators: { id: string; name: string }[];
  editorCount: number;
  isStarred: boolean;
  status: 'Draft' | 'Published';
  owner: 'me' | 'other';
}

type FilterTab = 'all' | 'my-docs' | 'shared';
type SortField = 'updatedAt' | 'title' | 'createdAt';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'updatedAt', label: 'Last Modified' },
  { value: 'title', label: 'Title A-Z' },
  { value: 'createdAt', label: 'Created' },
];

// ---- Demo Data ----

const INITIAL_DOCS: DemoDocument[] = [
  {
    id: 'doc-1',
    title: 'API Architecture Design',
    snippet: 'This document outlines the REST and GraphQL API architecture for the platform...',
    updatedAt: '2026-04-13T08:30:00Z',
    createdAt: '2026-04-01T10:00:00Z',
    collaborators: [
      { id: 'u1', name: 'Sarah Chen' },
      { id: 'u2', name: 'Alex Rivera' },
      { id: 'u3', name: 'James Kim' },
    ],
    editorCount: 2,
    isStarred: true,
    status: 'Published',
    owner: 'me',
  },
  {
    id: 'doc-2',
    title: 'Sprint v2.1 Planning',
    snippet: 'Sprint goals: Implement WebSocket sharding, rate limiting, and Kafka integration...',
    updatedAt: '2026-04-13T06:15:00Z',
    createdAt: '2026-04-10T09:00:00Z',
    collaborators: [
      { id: 'u1', name: 'Sarah Chen' },
      { id: 'u4', name: 'Taylor Brooks' },
    ],
    editorCount: 1,
    isStarred: false,
    status: 'Draft',
    owner: 'me',
  },
  {
    id: 'doc-3',
    title: 'Onboarding Guide',
    snippet: 'Welcome to CollabSpace! This guide will walk you through setting up your workspace...',
    updatedAt: '2026-04-12T14:20:00Z',
    createdAt: '2026-03-15T11:00:00Z',
    collaborators: [
      { id: 'u2', name: 'Alex Rivera' },
    ],
    editorCount: 0,
    isStarred: false,
    status: 'Published',
    owner: 'other',
  },
  {
    id: 'doc-4',
    title: 'Product Roadmap Q2',
    snippet: 'Key deliverables for Q2: real-time collaboration, AI assistant, code execution...',
    updatedAt: '2026-04-11T20:45:00Z',
    createdAt: '2026-03-28T08:00:00Z',
    collaborators: [
      { id: 'u1', name: 'Sarah Chen' },
      { id: 'u3', name: 'James Kim' },
      { id: 'u5', name: 'Morgan Lee' },
      { id: 'u6', name: 'Priya Gupta' },
    ],
    editorCount: 0,
    isStarred: true,
    status: 'Published',
    owner: 'me',
  },
  {
    id: 'doc-5',
    title: 'Database Schema Migration v3',
    snippet: 'PostgreSQL schema changes for multi-tenant architecture with row-level security...',
    updatedAt: '2026-04-10T17:30:00Z',
    createdAt: '2026-04-05T14:00:00Z',
    collaborators: [
      { id: 'u3', name: 'James Kim' },
    ],
    editorCount: 0,
    isStarred: false,
    status: 'Draft',
    owner: 'other',
  },
  {
    id: 'doc-6',
    title: 'Security Audit Report',
    snippet: 'Findings from the Q1 security audit: XSS mitigation, CSRF tokens, rate limiting...',
    updatedAt: '2026-04-09T11:00:00Z',
    createdAt: '2026-03-20T09:00:00Z',
    collaborators: [
      { id: 'u4', name: 'Taylor Brooks' },
      { id: 'u5', name: 'Morgan Lee' },
    ],
    editorCount: 0,
    isStarred: false,
    status: 'Published',
    owner: 'other',
  },
  {
    id: 'doc-7',
    title: 'Design System Guidelines',
    snippet: 'Color tokens, typography scale, spacing system, and component patterns for the UI...',
    updatedAt: '2026-04-08T15:45:00Z',
    createdAt: '2026-02-12T10:00:00Z',
    collaborators: [
      { id: 'u2', name: 'Alex Rivera' },
      { id: 'u6', name: 'Priya Gupta' },
    ],
    editorCount: 0,
    isStarred: false,
    status: 'Published',
    owner: 'me',
  },
  {
    id: 'doc-8',
    title: 'WebSocket Protocol Specification',
    snippet: 'Binary message format, heartbeat mechanism, reconnection strategy, room management...',
    updatedAt: '2026-04-07T09:20:00Z',
    createdAt: '2026-03-01T16:00:00Z',
    collaborators: [
      { id: 'u1', name: 'Sarah Chen' },
      { id: 'u3', name: 'James Kim' },
    ],
    editorCount: 0,
    isStarred: true,
    status: 'Draft',
    owner: 'me',
  },
  {
    id: 'doc-9',
    title: 'Performance Benchmarks',
    snippet: 'Load testing results: 10k concurrent connections, p99 latency under 50ms...',
    updatedAt: '2026-04-06T12:00:00Z',
    createdAt: '2026-04-03T10:00:00Z',
    collaborators: [
      { id: 'u5', name: 'Morgan Lee' },
    ],
    editorCount: 0,
    isStarred: false,
    status: 'Published',
    owner: 'other',
  },
];

// ---- Debounce Hook ----

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ---- Create Document Modal ----

function CreateDocumentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;
      onCreate(trimmed);
    },
    [title, onCreate]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-surface-200 bg-white p-6 shadow-elevated dark:border-surface-700 dark:bg-surface-900 animate-scale-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            New Document
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 dark:hover:text-surface-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="doc-title" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Document Title
          </label>
          <input
            ref={inputRef}
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Document"
            className="input"
          />

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="btn-primary px-4 py-2 text-sm"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Document Card ----

function DocumentCard({
  document: doc,
  onDelete,
}: {
  document: DemoDocument;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={() => router.push(`/documents/${doc.id}`)}
      className="card-hover group relative cursor-pointer animate-fade-in"
    >
      {/* Thumbnail area */}
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-t-xl bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-800 dark:to-surface-850">
        <div className="flex flex-col items-center gap-2 text-surface-300 dark:text-surface-600">
          <FileText className="h-10 w-10" />
          <div className="flex flex-col gap-1.5 px-8 w-full">
            <div className="h-1.5 w-full rounded-full bg-surface-200 dark:bg-surface-700" />
            <div className="h-1.5 w-5/6 rounded-full bg-surface-200 dark:bg-surface-700" />
            <div className="h-1.5 w-4/6 rounded-full bg-surface-200 dark:bg-surface-700" />
            <div className="h-1.5 w-3/4 rounded-full bg-surface-200 dark:bg-surface-700" />
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div className="absolute left-2 top-2">
        <span
          className={cn(
            'px-2 py-0.5 text-2xs font-semibold rounded-full',
            doc.status === 'Published'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          )}
        >
          {doc.status}
        </span>
      </div>

      {/* Editor count badge */}
      {doc.editorCount > 0 && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-2xs font-bold text-white shadow-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          {doc.editorCount} editing
        </div>
      )}

      {/* Star indicator */}
      {doc.isStarred && (
        <div className="absolute left-2 top-8 mt-1">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        </div>
      )}

      {/* Content */}
      <div className="p-3.5">
        <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100 line-clamp-1">
          {doc.title || 'Untitled'}
        </h3>

        <p className="mt-1 text-xs text-surface-400 line-clamp-1">
          {truncate(doc.snippet, 50)}
        </p>

        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-surface-500 dark:text-surface-400">
            {formatRelativeTime(doc.updatedAt)}
          </span>

          {/* Collaborator avatars */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-surface-400">{doc.collaborators.length}</span>
            <div className="flex -space-x-1.5">
              {doc.collaborators.slice(0, 3).map((collab) => (
                <div
                  key={collab.id}
                  title={collab.name}
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-[8px] font-medium text-white dark:border-surface-900"
                  style={{ backgroundColor: generateColor(collab.id) }}
                >
                  {getInitials(collab.name)}
                </div>
              ))}
              {doc.collaborators.length > 3 && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-surface-200 text-[8px] font-bold text-surface-600 dark:border-surface-900 dark:bg-surface-700 dark:text-surface-300">
                  +{doc.collaborators.length - 3}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu button */}
      <div
        className="absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="rounded-lg p-1 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <MoreVertical className="h-4 w-4 text-surface-500" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="dropdown absolute bottom-full right-0 z-50 mb-1 w-36">
                <button
                  type="button"
                  onClick={() => {
                    onDelete(doc.id);
                    setShowMenu(false);
                  }}
                  className="dropdown-item text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Skeleton Card ----

function SkeletonCard() {
  return (
    <div className="card">
      <div className="h-36 rounded-t-xl skeleton" />
      <div className="space-y-2 p-3.5">
        <div className="h-4 w-3/4 rounded skeleton" />
        <div className="h-3 w-full rounded skeleton" />
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 rounded skeleton" />
          <div className="flex -space-x-1">
            <div className="h-5 w-5 rounded-full skeleton" />
            <div className="h-5 w-5 rounded-full skeleton" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Empty State ----

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800">
        <FileText className="h-10 w-10 text-surface-300 dark:text-surface-600" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-surface-900 dark:text-surface-100">
        {hasFilters ? 'No documents found' : 'No documents yet'}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-surface-500 dark:text-surface-400">
        {hasFilters
          ? 'Try adjusting your search or filters to find what you are looking for.'
          : 'Create your first document to start collaborating with your team in real time.'}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="btn-secondary mt-4 px-4 py-2 text-sm"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

// ---- Main Page ----

export default function DocumentsPage() {
  const router = useRouter();

  const [documents, setDocuments] = useState<DemoDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  // Simulate loading, then show data
  useEffect(() => {
    const timer = setTimeout(() => {
      setDocuments(INITIAL_DOCS);
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Filter + sort
  const displayedDocs = useMemo(() => {
    let filtered = [...documents];

    // Tab filter
    if (filterTab === 'my-docs') {
      filtered = filtered.filter((d) => d.owner === 'me');
    } else if (filterTab === 'shared') {
      filtered = filtered.filter((d) => d.owner === 'other');
    }

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.snippet.toLowerCase().includes(q)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string;
      let bVal: string;
      switch (sortBy) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        default:
          aVal = a.updatedAt;
          bVal = b.updatedAt;
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [documents, filterTab, debouncedSearch, sortBy, sortOrder]);

  const handleCreate = useCallback(
    (title: string) => {
      const newDoc: DemoDocument = {
        id: `doc-${Date.now()}`,
        title,
        snippet: 'Start writing your document here...',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        collaborators: [{ id: 'u-me', name: 'You' }],
        editorCount: 0,
        isStarred: false,
        status: 'Draft',
        owner: 'me',
      };
      setDocuments((prev) => [newDoc, ...prev]);
      setShowCreateModal(false);
      router.push(`/documents/${newDoc.id}`);
    },
    [router]
  );

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const resetFilters = useCallback(() => {
    setSearch('');
    setFilterTab('all');
    setSortBy('updatedAt');
    setSortOrder('desc');
  }, []);

  const hasFilters = !!debouncedSearch || filterTab !== 'all';
  const activeSort = SORT_OPTIONS.find((o) => o.value === sortBy) || SORT_OPTIONS[0];

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Documents</h1>
            <p className="mt-0.5 text-sm text-surface-500">
              Collaborate on documents with your team in real-time
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-primary gap-2 px-4 py-2.5 text-sm"
          >
            <Plus className="h-4 w-4" />
            New Document
          </button>
        </div>

        {/* Filter Tabs + Search + Sort */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1 dark:bg-surface-800">
            {([
              { value: 'all' as FilterTab, label: 'All', icon: FileText },
              { value: 'my-docs' as FilterTab, label: 'My Docs', icon: User },
              { value: 'shared' as FilterTab, label: 'Shared', icon: Users },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilterTab(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  filterTab === value
                    ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents..."
                className="input pl-10 pr-10 sm:w-64"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-surface-400" />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="btn-secondary gap-2 px-3 py-2.5 text-sm"
              >
                {sortOrder === 'desc' ? (
                  <SortDesc className="h-4 w-4" />
                ) : (
                  <SortAsc className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{activeSort.label}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>

              {showSortDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSortDropdown(false)} />
                  <div className="dropdown absolute right-0 top-full z-50 mt-1 w-48">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (sortBy === option.value) {
                            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortBy(option.value);
                            setSortOrder(option.value === 'title' ? 'asc' : 'desc');
                          }
                          setShowSortDropdown(false);
                        }}
                        className={cn(
                          'dropdown-item justify-between',
                          sortBy === option.value &&
                            'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400'
                        )}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.value &&
                          (sortOrder === 'desc' ? (
                            <SortDesc className="h-3.5 w-3.5" />
                          ) : (
                            <SortAsc className="h-3.5 w-3.5" />
                          ))}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Document Grid */}
        <div className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : displayedDocs.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {displayedDocs.map((doc) => (
                <DocumentCard key={doc.id} document={doc} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Document Modal */}
      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
