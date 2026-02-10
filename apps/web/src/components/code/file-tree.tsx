'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileCode2,
  FileJson,
  FileType,
  FileText,
  Braces,
  Hash,
  Gem,
  Coffee,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CodeFile } from '@/hooks/use-code';

// ─── File icon mapping ────────────────────────────────────────────

function getFileIcon(name: string, language: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const iconClass = 'w-4 h-4 shrink-0';

  const map: Record<string, { icon: typeof File; color: string }> = {
    js: { icon: Braces, color: 'text-yellow-400' },
    jsx: { icon: Braces, color: 'text-yellow-400' },
    ts: { icon: FileCode2, color: 'text-blue-400' },
    tsx: { icon: FileCode2, color: 'text-blue-400' },
    py: { icon: Hash, color: 'text-green-400' },
    rb: { icon: Gem, color: 'text-red-400' },
    java: { icon: Coffee, color: 'text-orange-400' },
    go: { icon: Code2, color: 'text-cyan-400' },
    rs: { icon: Code2, color: 'text-orange-500' },
    json: { icon: FileJson, color: 'text-yellow-300' },
    html: { icon: FileType, color: 'text-orange-400' },
    css: { icon: FileType, color: 'text-blue-300' },
    md: { icon: FileText, color: 'text-surface-400' },
    c: { icon: Code2, color: 'text-blue-500' },
    cpp: { icon: Code2, color: 'text-blue-600' },
    cs: { icon: Code2, color: 'text-brand-400' },
  };

  const config = map[ext || ''] || { icon: File, color: 'text-surface-400' };
  const Icon = config.icon;
  return <Icon className={cn(iconClass, config.color)} />;
}

// ─── Types ────────────────────────────────────────────────────────

interface FileTreeNode {
  id: string;
  name: string;
  language: string;
  isFolder: boolean;
  parentId: string | null;
  children: FileTreeNode[];
}

interface FileTreeProps {
  files: CodeFile[];
  activeFileId: string | null;
  onFileSelect: (file: CodeFile) => void;
  onCreateFile: (parentId: string | null, name: string, language: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRenameFile: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveFile?: (id: string, newParentId: string | null) => void;
  className?: string;
}

// ─── Tree builder ─────────────────────────────────────────────────

function buildTree(files: CodeFile[]): FileTreeNode[] {
  const nodeMap = new Map<string, FileTreeNode>();
  const roots: FileTreeNode[] = [];

  // Create nodes
  files.forEach((f) => {
    nodeMap.set(f.id, {
      id: f.id,
      name: f.name,
      language: f.language,
      isFolder: f.isFolder,
      parentId: f.parentId,
      children: [],
    });
  });

  // Build hierarchy
  files.forEach((f) => {
    const node = nodeMap.get(f.id)!;
    if (f.parentId && nodeMap.has(f.parentId)) {
      nodeMap.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort: folders first, then alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const sortTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return sortNodes(nodes).map((n) => ({
      ...n,
      children: sortTree(n.children),
    }));
  };

  return sortTree(roots);
}

// ─── Context Menu ─────────────────────────────────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  isFolder: boolean;
  onRename: () => void;
  onDelete: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onClose: () => void;
}

function ContextMenu({ x, y, isFolder, onRename, onDelete, onNewFile, onNewFolder, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-48 bg-surface-800 border border-surface-700 rounded-lg shadow-xl py-1 animate-scale-in"
      style={{ left: x, top: y }}
    >
      {isFolder && (
        <>
          <button
            onClick={onNewFile}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New File
          </button>
          <button
            onClick={onNewFolder}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Folder
          </button>
          <div className="my-1 border-t border-surface-700" />
        </>
      )}
      <button
        onClick={onRename}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Rename
      </button>
      <button
        onClick={onDelete}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  );
}

// ─── Tree Node ────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  activeFileId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  draggedId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (targetId: string) => void;
  onDragEnd: () => void;
}

function TreeNode({
  node,
  depth,
  activeFileId,
  expandedIds,
  onToggle,
  onSelect,
  onContextMenu,
  draggedId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const isActive = node.id === activeFileId;
  const isDragging = node.id === draggedId;

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(node.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(e, node.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(node.id);
        }}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (node.isFolder) {
            onToggle(node.id);
          } else {
            onSelect(node.id);
          }
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none text-sm transition-colors group',
          isActive
            ? 'bg-brand-600/20 text-brand-300'
            : 'text-surface-300 hover:bg-surface-800 hover:text-surface-100',
          isDragging && 'opacity-50'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand arrow for folders */}
        {node.isFolder ? (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-surface-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-surface-500" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        {node.isFolder ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-amber-400" />
          ) : (
            <Folder className="w-4 h-4 shrink-0 text-amber-400" />
          )
        ) : (
          getFileIcon(node.name, node.language)
        )}

        {/* Name */}
        <span className="truncate text-xs">{node.name}</span>
      </div>

      {/* Children */}
      {node.isFolder && isExpanded && (
        <div>
          {node.children.length > 0 ? (
            node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                draggedId={draggedId}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              />
            ))
          ) : (
            <div
              className="text-[11px] text-surface-600 italic"
              style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline Input ─────────────────────────────────────────────────

interface InlineInputProps {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function InlineInput({ defaultValue, onSubmit, onCancel }: InlineInputProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          onSubmit(value.trim());
        }
        if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={() => {
        if (value.trim()) {
          onSubmit(value.trim());
        } else {
          onCancel();
        }
      }}
      className="w-full px-2 py-0.5 text-xs bg-surface-800 border border-brand-500 rounded focus:outline-none text-surface-100"
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function FileTree({
  files,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
  onMoveFile,
  className,
}: FileTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileTreeNode;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<{
    parentId: string | null;
    type: 'file' | 'folder';
  } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const tree = buildTree(files);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file && !file.isFolder) {
        onFileSelect(file);
      }
    },
    [files, onFileSelect]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileTreeNode) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    },
    []
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      if (draggedId && draggedId !== targetId && onMoveFile) {
        const targetFile = files.find((f) => f.id === targetId);
        if (targetFile?.isFolder) {
          onMoveFile(draggedId, targetId);
        } else if (targetFile) {
          onMoveFile(draggedId, targetFile.parentId);
        }
      }
      setDraggedId(null);
      setDropTargetId(null);
    },
    [draggedId, files, onMoveFile]
  );

  const guessLanguage = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      java: 'java',
      go: 'go',
      rs: 'rust',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return map[ext] || 'plaintext';
  };

  return (
    <div className={cn('flex flex-col h-full bg-surface-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700">
        <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCreatingIn({ parentId: null, type: 'file' })}
            className="p-1 text-surface-400 hover:text-surface-200 rounded hover:bg-surface-800 transition-colors"
            title="New file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCreatingIn({ parentId: null, type: 'folder' })}
            className="p-1 text-surface-400 hover:text-surface-200 rounded hover:bg-surface-800 transition-colors"
            title="New folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {/* New item input at root */}
        {creatingIn && creatingIn.parentId === null && (
          <div className="px-2 py-1">
            <InlineInput
              defaultValue={creatingIn.type === 'folder' ? 'new-folder' : 'untitled.ts'}
              onSubmit={(name) => {
                if (creatingIn.type === 'folder') {
                  onCreateFolder(null, name);
                } else {
                  onCreateFile(null, name, guessLanguage(name));
                }
                setCreatingIn(null);
              }}
              onCancel={() => setCreatingIn(null)}
            />
          </div>
        )}

        {tree.length === 0 && !creatingIn ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <File className="w-8 h-8 text-surface-600 mb-2" />
            <p className="text-xs text-surface-500">No files yet</p>
            <p className="text-[11px] text-surface-600 mt-1">
              Click + to create a new file
            </p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              activeFileId={activeFileId}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
              draggedId={draggedId}
              onDragStart={setDraggedId}
              onDragOver={(e, id) => setDropTargetId(id)}
              onDrop={handleDrop}
              onDragEnd={() => {
                setDraggedId(null);
                setDropTargetId(null);
              }}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.node.id}
          isFolder={contextMenu.node.isFolder}
          onRename={() => {
            setRenamingId(contextMenu.node.id);
            setContextMenu(null);
          }}
          onDelete={() => {
            onDeleteFile(contextMenu.node.id);
            setContextMenu(null);
          }}
          onNewFile={() => {
            setCreatingIn({ parentId: contextMenu.node.id, type: 'file' });
            setExpandedIds((prev) => new Set([...prev, contextMenu.node.id]));
            setContextMenu(null);
          }}
          onNewFolder={() => {
            setCreatingIn({ parentId: contextMenu.node.id, type: 'folder' });
            setExpandedIds((prev) => new Set([...prev, contextMenu.node.id]));
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default FileTree;
