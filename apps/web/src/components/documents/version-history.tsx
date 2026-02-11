'use client';

import { useState, useCallback } from 'react';
import {
  useDocumentHistory,
  useRestoreVersion,
  type DocumentVersion,
} from '@/hooks/use-documents';
import { cn, formatRelativeTime, getInitials, generateColor } from '@/lib/utils';
import {
  X,
  History,
  RotateCcw,
  Eye,
  ChevronRight,
  Loader2,
  Clock,
  FileText,
  ArrowLeftRight,
} from 'lucide-react';

interface VersionHistoryProps {
  documentId: string;
  onClose: () => void;
  onPreview?: (version: DocumentVersion) => void;
}

function VersionAvatar({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) {
    return (
      <img src={avatar} alt={name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
      style={{ backgroundColor: generateColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

function DiffView({
  current,
  previous,
}: {
  current: DocumentVersion;
  previous?: DocumentVersion;
}) {
  if (!previous) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-900/10">
        <p className="text-xs font-medium text-green-700 dark:text-green-400">Initial version</p>
        <p className="mt-1 text-xs text-green-600 dark:text-green-500">
          Document created with {current.wordCount} words.
        </p>
      </div>
    );
  }

  const wordDiff = current.wordCount - previous.wordCount;
  const isAddition = wordDiff > 0;
  const isRemoval = wordDiff < 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isAddition && 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10',
        isRemoval && 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10',
        !isAddition && !isRemoval && 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        <ArrowLeftRight className="h-3 w-3" />
        <span className="font-medium">
          {isAddition
            ? `+${wordDiff} words added`
            : isRemoval
              ? `${wordDiff} words removed`
              : 'No word count change'}
        </span>
      </div>
      {current.changeSummary && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {current.changeSummary}
        </p>
      )}
    </div>
  );
}

function VersionItem({
  version,
  previousVersion,
  isSelected,
  isLatest,
  onSelect,
  onPreview,
  onRestore,
  isRestoring,
}: {
  version: DocumentVersion;
  previousVersion?: DocumentVersion;
  isSelected: boolean;
  isLatest: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  return (
    <div className="relative pl-6">
      {/* Timeline dot and line */}
      <div className="absolute left-0 top-0 flex h-full flex-col items-center">
        <div
          className={cn(
            'relative z-10 mt-3 h-3 w-3 rounded-full border-2',
            isLatest
              ? 'border-brand-500 bg-brand-500'
              : isSelected
                ? 'border-brand-400 bg-brand-100 dark:bg-brand-900'
                : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
          )}
        />
        <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Version card */}
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'mb-2 w-full rounded-lg border p-3 text-left transition-all',
          isSelected
            ? 'border-brand-200 bg-brand-50 shadow-sm dark:border-brand-800 dark:bg-brand-900/20'
            : 'border-transparent hover:border-gray-200 hover:bg-white dark:hover:border-gray-700 dark:hover:bg-gray-800'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <VersionAvatar name={version.authorName} avatar={version.authorAvatar} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {version.authorName}
                {isLatest && (
                  <span className="ml-1.5 inline-flex rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    Current
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3 w-3" />
                <span>{formatRelativeTime(version.createdAt)}</span>
              </div>
            </div>
          </div>
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-gray-400 transition-transform',
              isSelected && 'rotate-90'
            )}
          />
        </div>

        {version.changeSummary && (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
            {version.changeSummary}
          </p>
        )}

        {/* Expanded content */}
        {isSelected && (
          <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
            <DiffView current={version} previous={previousVersion} />

            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <FileText className="h-3 w-3" />
              <span>Version {version.version}</span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>{version.wordCount} words</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPreview}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  'dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                )}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
              {!isLatest && (
                <button
                  type="button"
                  onClick={onRestore}
                  disabled={isRestoring}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    'bg-brand-600 text-white hover:bg-brand-700',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  {isRestoring ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </button>
              )}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

export function VersionHistoryPanel({ documentId, onClose, onPreview }: VersionHistoryProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const { data: versions = [], isLoading } = useDocumentHistory(documentId);
  const restoreVersion = useRestoreVersion();

  const handleRestore = useCallback(
    (versionId: string) => {
      if (!window.confirm('Are you sure you want to restore this version? Current changes will be saved as a new version.')) {
        return;
      }
      restoreVersion.mutate({ documentId, versionId });
    },
    [documentId, restoreVersion]
  );

  // Versions sorted by newest first
  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="flex h-full w-80 flex-col border-l bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Version History
          </h3>
          {versions.length > 0 && (
            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {versions.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Versions list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse pl-6">
                <div className="absolute left-0">
                  <div className="h-3 w-3 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2 rounded-lg border border-transparent p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="space-y-1">
                      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-2 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  </div>
                  <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedVersions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <History className="h-6 w-6 text-gray-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">
              No version history
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Version history will appear as you make changes.
            </p>
          </div>
        ) : (
          <div>
            {sortedVersions.map((version, index) => {
              const previousVersion = sortedVersions[index + 1];
              return (
                <VersionItem
                  key={version.id}
                  version={version}
                  previousVersion={previousVersion}
                  isSelected={selectedVersionId === version.id}
                  isLatest={index === 0}
                  onSelect={() =>
                    setSelectedVersionId(
                      selectedVersionId === version.id ? null : version.id
                    )
                  }
                  onPreview={() => onPreview?.(version)}
                  onRestore={() => handleRestore(version.id)}
                  isRestoring={restoreVersion.isPending}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
