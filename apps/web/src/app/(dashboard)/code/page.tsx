'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  LayoutGrid,
  LayoutList,
  Code2,
  Users,
  Clock,
  Trophy,
  X,
  Filter,
  Braces,
  FileCode2,
  Hash,
  Coffee,
  ChevronDown,
} from 'lucide-react';
import { cn, formatRelativeTime, getInitials, generateColor } from '@/lib/utils';

// ---- Language Definitions ----

interface LanguageDef {
  id: string;
  label: string;
  ext: string;
  icon: typeof Code2;
  color: string;
}

const LANGUAGES: LanguageDef[] = [
  { id: 'javascript', label: 'JavaScript', ext: '.js', icon: Braces, color: 'text-amber-400' },
  { id: 'typescript', label: 'TypeScript', ext: '.ts', icon: FileCode2, color: 'text-blue-400' },
  { id: 'python', label: 'Python', ext: '.py', icon: Hash, color: 'text-emerald-400' },
  { id: 'java', label: 'Java', ext: '.java', icon: Coffee, color: 'text-orange-400' },
  { id: 'go', label: 'Go', ext: '.go', icon: Code2, color: 'text-cyan-400' },
  { id: 'rust', label: 'Rust', ext: '.rs', icon: Code2, color: 'text-orange-500' },
  { id: 'cpp', label: 'C++', ext: '.cpp', icon: Code2, color: 'text-blue-600' },
  { id: 'c', label: 'C', ext: '.c', icon: Code2, color: 'text-blue-500' },
];

const getLangDef = (lang: string) =>
  LANGUAGES.find((l) => l.id === lang) || LANGUAGES[0];

// ---- Types ----

interface DemoFile {
  id: string;
  name: string;
  language: string;
  lineCount: number;
  updatedAt: string;
  collaborators: { id: string; name: string; color: string }[];
}

interface DemoCodingRoom {
  id: string;
  name: string;
  description: string;
  status: 'waiting' | 'active' | 'finished';
  participants: { id: string; name: string }[];
  duration: number;
}

// ---- Demo Data ----

const INITIAL_FILES: DemoFile[] = [
  {
    id: 'cf-1', name: 'auth-middleware.ts', language: 'typescript', lineCount: 87,
    updatedAt: '2026-04-13T08:00:00Z',
    collaborators: [{ id: 'u1', name: 'Sarah Chen', color: '#14b8a6' }],
  },
  {
    id: 'cf-2', name: 'api-gateway.ts', language: 'typescript', lineCount: 145,
    updatedAt: '2026-04-13T06:30:00Z',
    collaborators: [{ id: 'u2', name: 'Alex Rivera', color: '#3b82f6' }, { id: 'u3', name: 'James Kim', color: '#f59e0b' }],
  },
  {
    id: 'cf-3', name: 'websocket-handler.ts', language: 'typescript', lineCount: 203,
    updatedAt: '2026-04-12T22:15:00Z',
    collaborators: [],
  },
  {
    id: 'cf-4', name: 'data-pipeline.py', language: 'python', lineCount: 156,
    updatedAt: '2026-04-12T18:00:00Z',
    collaborators: [{ id: 'u4', name: 'Taylor Brooks', color: '#ef4444' }],
  },
  {
    id: 'cf-5', name: 'rate-limiter.go', language: 'go', lineCount: 92,
    updatedAt: '2026-04-11T14:30:00Z',
    collaborators: [],
  },
  {
    id: 'cf-6', name: 'crdt-merge.ts', language: 'typescript', lineCount: 234,
    updatedAt: '2026-04-10T20:00:00Z',
    collaborators: [{ id: 'u1', name: 'Sarah Chen', color: '#14b8a6' }],
  },
  {
    id: 'cf-7', name: 'event-bus.js', language: 'javascript', lineCount: 78,
    updatedAt: '2026-04-09T16:45:00Z',
    collaborators: [],
  },
  {
    id: 'cf-8', name: 'load-balancer.rs', language: 'rust', lineCount: 312,
    updatedAt: '2026-04-08T11:00:00Z',
    collaborators: [{ id: 'u3', name: 'James Kim', color: '#f59e0b' }],
  },
  {
    id: 'cf-9', name: 'kafka-consumer.java', language: 'java', lineCount: 189,
    updatedAt: '2026-04-07T09:30:00Z',
    collaborators: [],
  },
];

const INITIAL_ROOMS: DemoCodingRoom[] = [
  {
    id: 'room-1', name: 'Algorithm Challenge #1', description: 'Solve the minimum spanning tree problem using Kruskal\'s algorithm. Optimize for time complexity.',
    status: 'active',
    participants: [{ id: 'u1', name: 'Sarah Chen' }, { id: 'u2', name: 'Alex Rivera' }, { id: 'u3', name: 'James Kim' }],
    duration: 60,
  },
  {
    id: 'room-2', name: 'System Design Interview', description: 'Design a distributed key-value store with eventual consistency. Focus on partitioning and replication.',
    status: 'waiting',
    participants: [{ id: 'u4', name: 'Taylor Brooks' }],
    duration: 90,
  },
];

// ---- Tabs ----

type TabId = 'my-files' | 'shared' | 'rooms';

const TABS: { id: TabId; label: string; icon: typeof Code2 }[] = [
  { id: 'my-files', label: 'My Files', icon: Code2 },
  { id: 'shared', label: 'Shared', icon: Users },
  { id: 'rooms', label: 'Coding Rooms', icon: Trophy },
];

// ---- New File Modal ----

function NewFileModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, language: string) => void;
}) {
  const [name, setName] = useState('');
  const [selectedLang, setSelectedLang] = useState('typescript');

  const handleCreate = () => {
    const langDef = getLangDef(selectedLang);
    const fileName = name.trim() || `untitled${langDef.ext}`;
    const finalName = fileName.includes('.') ? fileName : `${fileName}${langDef.ext}`;
    onCreate(finalName, selectedLang);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-surface-900 rounded-2xl shadow-elevated border border-surface-200 dark:border-surface-700 p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            Create New File
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            File Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`untitled${getLangDef(selectedLang).ext}`}
            className="input"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
        </div>

        {/* Language selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Language
          </label>
          <div className="grid grid-cols-4 gap-2">
            {LANGUAGES.map((lang) => {
              const Icon = lang.icon;
              return (
                <button
                  key={lang.id}
                  onClick={() => setSelectedLang(lang.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all text-xs',
                    selectedLang === lang.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 ring-1 ring-brand-500'
                      : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-surface-300 dark:hover:border-surface-600'
                  )}
                >
                  <Icon className={cn('w-4 h-4', lang.color)} />
                  <span className="truncate w-full text-center">{lang.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button onClick={handleCreate} className="btn-primary px-4 py-2 text-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create File
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- File Card ----

function FileCard({
  file,
  viewMode,
  onClick,
}: {
  file: DemoFile;
  viewMode: 'grid' | 'list';
  onClick: () => void;
}) {
  const langDef = getLangDef(file.language);
  const LangIcon = langDef.icon;

  if (viewMode === 'list') {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-4 w-full p-3 rounded-xl border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 bg-white dark:bg-surface-900 hover:shadow-soft transition-all text-left"
      >
        <div className="p-2 rounded-lg bg-surface-50 dark:bg-surface-800">
          <LangIcon className={cn('w-5 h-5', langDef.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
            {file.name}
          </p>
          <p className="text-xs text-surface-500 mt-0.5">
            {langDef.label} &middot; {file.lineCount} lines
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {file.collaborators.length > 0 && (
            <div className="flex -space-x-1.5">
              {file.collaborators.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="w-6 h-6 rounded-full border-2 border-white dark:border-surface-900 flex items-center justify-center text-[9px] font-medium text-white"
                  style={{ backgroundColor: c.color || generateColor(c.name) }}
                  title={c.name}
                >
                  {getInitials(c.name)}
                </div>
              ))}
            </div>
          )}
          <span className="text-xs text-surface-400 whitespace-nowrap">
            {formatRelativeTime(file.updatedAt)}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="card-hover flex flex-col p-4 text-left group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-lg bg-surface-50 dark:bg-surface-800">
          <LangIcon className={cn('w-6 h-6', langDef.color)} />
        </div>
        <span className="badge-neutral text-2xs">
          {langDef.label}
        </span>
      </div>
      <h3 className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate mb-1">
        {file.name}
      </h3>
      <p className="text-xs text-surface-400 mb-2">{file.lineCount} lines</p>
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-1 text-xs text-surface-400">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(file.updatedAt)}
        </div>
        {file.collaborators.length > 0 && (
          <div className="flex -space-x-1.5">
            {file.collaborators.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="w-5 h-5 rounded-full border-2 border-white dark:border-surface-900 flex items-center justify-center text-[8px] font-medium text-white"
                style={{ backgroundColor: c.color || generateColor(c.name) }}
                title={c.name}
              >
                {getInitials(c.name)}
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ---- Room Card ----

function RoomCard({
  room,
  onClick,
}: {
  room: DemoCodingRoom;
  onClick: () => void;
}) {
  const statusColors: Record<string, string> = {
    waiting: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    finished: 'bg-surface-200 dark:bg-surface-700 text-surface-500',
  };

  return (
    <button
      onClick={onClick}
      className="card-hover flex flex-col p-4 text-left"
    >
      <div className="flex items-start justify-between mb-3">
        <Trophy className="w-6 h-6 text-amber-500" />
        <span
          className={cn(
            'px-2 py-0.5 text-2xs font-semibold uppercase rounded-full',
            statusColors[room.status]
          )}
        >
          {room.status}
        </span>
      </div>
      <h3 className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate mb-1">
        {room.name}
      </h3>
      <p className="text-xs text-surface-500 line-clamp-2 mb-3">{room.description}</p>
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-1 text-xs text-surface-400">
          <Users className="w-3 h-3" />
          {room.participants.length} participant{room.participants.length !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1 text-xs text-surface-400">
          <Clock className="w-3 h-3" />
          {room.duration}m
        </div>
      </div>
    </button>
  );
}

// ---- Main Page ----

export default function CodeFilesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('my-files');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLanguage, setFilterLanguage] = useState<string>('');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [showLanguageFilter, setShowLanguageFilter] = useState(false);
  const [files, setFiles] = useState<DemoFile[]>([]);
  const [rooms] = useState<DemoCodingRoom[]>(INITIAL_ROOMS);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setFiles(INITIAL_FILES);
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Filter files
  const filteredFiles = useMemo(() => {
    let filtered = [...files];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.language.toLowerCase().includes(q)
      );
    }

    if (filterLanguage) {
      filtered = filtered.filter((f) => f.language === filterLanguage);
    }

    return filtered;
  }, [files, searchQuery, filterLanguage]);

  // Filter rooms
  const filteredRooms = useMemo(() => {
    if (!searchQuery) return rooms;
    const q = searchQuery.toLowerCase();
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }, [rooms, searchQuery]);

  const handleCreateFile = (name: string, language: string) => {
    const newFile: DemoFile = {
      id: `cf-${Date.now()}`,
      name,
      language,
      lineCount: 0,
      updatedAt: new Date().toISOString(),
      collaborators: [],
    };
    setFiles((prev) => [newFile, ...prev]);
    setShowNewFileModal(false);
    router.push(`/code/${newFile.id}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">
              Code Editor
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">
              Write, run, and collaborate on code in real-time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewFileModal(true)}
              className="btn-primary px-3 py-2 text-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New File
            </button>
          </div>
        </div>

        {/* Tabs + Search + Filters */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                    activeTab === tab.id
                      ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400'
                      : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="input pl-9 w-56 py-1.5 text-sm"
              />
            </div>

            {/* Language filter */}
            {activeTab !== 'rooms' && (
              <div className="relative">
                <button
                  onClick={() => setShowLanguageFilter(!showLanguageFilter)}
                  className={cn(
                    'btn-secondary px-2.5 py-1.5 text-sm',
                    filterLanguage && 'ring-1 ring-brand-500'
                  )}
                >
                  <Filter className="w-4 h-4" />
                  {filterLanguage && (
                    <span className="ml-1">{getLangDef(filterLanguage).label}</span>
                  )}
                  <ChevronDown className="w-3 h-3 ml-1" />
                </button>
                {showLanguageFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowLanguageFilter(false)} />
                    <div className="dropdown absolute right-0 top-full mt-1 w-48 z-20 animate-scale-in">
                      <button
                        onClick={() => {
                          setFilterLanguage('');
                          setShowLanguageFilter(false);
                        }}
                        className={cn(
                          'dropdown-item',
                          !filterLanguage ? 'text-brand-600 dark:text-brand-400 font-medium' : ''
                        )}
                      >
                        All Languages
                      </button>
                      {LANGUAGES.map((lang) => {
                        const Icon = lang.icon;
                        return (
                          <button
                            key={lang.id}
                            onClick={() => {
                              setFilterLanguage(lang.id);
                              setShowLanguageFilter(false);
                            }}
                            className={cn(
                              'dropdown-item',
                              filterLanguage === lang.id
                                ? 'text-brand-600 dark:text-brand-400 font-medium'
                                : ''
                            )}
                          >
                            <Icon className={cn('w-3.5 h-3.5', lang.color)} />
                            {lang.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* View toggle */}
            {activeTab !== 'rooms' && (
              <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-1.5 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100'
                      : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
                  )}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-1.5 transition-colors',
                    viewMode === 'list'
                      ? 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100'
                      : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
                  )}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-11 w-11 rounded-lg skeleton" />
                  <div className="h-5 w-16 rounded skeleton" />
                </div>
                <div className="h-4 w-3/4 rounded skeleton mb-1" />
                <div className="h-3 w-1/2 rounded skeleton" />
              </div>
            ))}
          </div>
        ) : activeTab === 'rooms' ? (
          /* Coding Rooms */
          filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Trophy className="w-12 h-12 text-surface-300 dark:text-surface-600 mb-3" />
              <h3 className="text-sm font-medium text-surface-600 dark:text-surface-400">
                No coding rooms
              </h3>
              <p className="text-xs text-surface-400 mt-1 max-w-sm">
                Create a coding room to host competitive programming challenges with your team.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onClick={() => router.push(`/code/${room.id}`)}
                />
              ))}
            </div>
          )
        ) : /* Files */
        filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Code2 className="w-12 h-12 text-surface-300 dark:text-surface-600 mb-3" />
            <h3 className="text-sm font-medium text-surface-600 dark:text-surface-400">
              {searchQuery || filterLanguage ? 'No files found' : 'No code files yet'}
            </h3>
            <p className="text-xs text-surface-400 mt-1 max-w-sm">
              {searchQuery || filterLanguage
                ? 'Try adjusting your search or filter criteria.'
                : 'Create your first code file to start coding collaboratively.'}
            </p>
            {!searchQuery && !filterLanguage && (
              <button
                onClick={() => setShowNewFileModal(true)}
                className="btn-primary px-4 py-2 text-sm mt-4"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Create File
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="grid"
                onClick={() => router.push(`/code/${file.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl">
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="list"
                onClick={() => router.push(`/code/${file.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showNewFileModal && (
        <NewFileModal
          onClose={() => setShowNewFileModal(false)}
          onCreate={handleCreateFile}
        />
      )}
    </div>
  );
}
