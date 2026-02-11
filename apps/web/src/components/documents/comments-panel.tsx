'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useDocumentComments,
  useAddComment,
  useResolveComment,
  type DocumentComment,
} from '@/hooks/use-documents';
import { useAuthStore } from '@/stores/auth-store';
import { cn, formatRelativeTime, getInitials, generateColor } from '@/lib/utils';
import {
  X,
  MessageSquarePlus,
  Check,
  CheckCheck,
  Reply,
  Filter,
  Send,
  Loader2,
  MessageSquare,
} from 'lucide-react';

type CommentFilter = 'all' | 'open' | 'resolved';

interface CommentsPanelProps {
  documentId: string;
  onClose: () => void;
}

function CommentAvatar({ name, avatar, size = 'md' }: { name: string; avatar?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', dim)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        dim
      )}
      style={{ backgroundColor: generateColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

function CommentInput({
  documentId,
  parentId,
  placeholder = 'Write a comment...',
  onSubmit,
  autoFocus = false,
}: {
  documentId: string;
  parentId?: string;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const addComment = useAddComment();

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed) return;

    addComment.mutate(
      { documentId, content: trimmed, parentId },
      {
        onSuccess: () => {
          setContent('');
          onSubmit?.();
        },
      }
    );
  }, [content, documentId, parentId, addComment, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className={cn(
          'w-full resize-none rounded-lg border bg-white px-3 py-2.5 pr-10 text-sm',
          'placeholder:text-gray-400',
          'focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100',
          'dark:border-gray-600 dark:bg-gray-800 dark:placeholder:text-gray-500',
          'dark:focus:border-brand-500 dark:focus:ring-brand-900/30'
        )}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!content.trim() || addComment.isPending}
        className={cn(
          'absolute bottom-2.5 right-2 rounded-md p-1 transition-colors',
          content.trim()
            ? 'text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30'
            : 'text-gray-300 dark:text-gray-600'
        )}
      >
        {addComment.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
      <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
        Press Ctrl+Enter to send
      </p>
    </div>
  );
}

function CommentThread({
  comment,
  documentId,
}: {
  comment: DocumentComment;
  documentId: string;
}) {
  const [showReply, setShowReply] = useState(false);
  const resolveComment = useResolveComment();

  const handleResolve = useCallback(() => {
    resolveComment.mutate({ documentId, commentId: comment.id });
  }, [documentId, comment.id, resolveComment]);

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        comment.resolved
          ? 'border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-900/10'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      )}
    >
      {/* Main comment */}
      <div className="flex items-start gap-2.5">
        <CommentAvatar name={comment.authorName} avatar={comment.authorAvatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {comment.authorName}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {comment.resolved && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCheck className="h-3 w-3" />
                Resolved
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-700 leading-relaxed dark:text-gray-300 whitespace-pre-wrap">
            {comment.content}
          </p>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="ml-10 mt-3 space-y-3 border-l-2 border-gray-100 pl-3 dark:border-gray-700">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              <CommentAvatar name={reply.authorName} avatar={reply.authorAvatar} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {reply.authorName}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatRelativeTime(reply.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-700 leading-relaxed dark:text-gray-300 whitespace-pre-wrap">
                  {reply.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-2.5 flex items-center gap-1 ml-10">
        {!comment.resolved && (
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolveComment.isPending}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              'dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
            )}
          >
            <Check className="h-3 w-3" />
            Resolve
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowReply(!showReply)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
            'dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
          )}
        >
          <Reply className="h-3 w-3" />
          Reply
        </button>
      </div>

      {/* Reply input */}
      {showReply && (
        <div className="ml-10 mt-2">
          <CommentInput
            documentId={documentId}
            parentId={comment.id}
            placeholder="Write a reply..."
            onSubmit={() => setShowReply(false)}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({ documentId, onClose }: CommentsPanelProps) {
  const [filter, setFilter] = useState<CommentFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const { data: comments = [], isLoading } = useDocumentComments(documentId);

  const filteredComments = comments.filter((comment) => {
    if (filter === 'open') return !comment.resolved;
    if (filter === 'resolved') return comment.resolved;
    return true;
  });

  const openCount = comments.filter((c) => !c.resolved).length;
  const resolvedCount = comments.filter((c) => c.resolved).length;

  const filterLabels: Record<CommentFilter, string> = {
    all: `All (${comments.length})`,
    open: `Open (${openCount})`,
    resolved: `Resolved (${resolvedCount})`,
  };

  return (
    <div className="flex h-full w-80 flex-col border-l bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Comments</h3>
          {openCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              {openCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                'hover:bg-gray-200 dark:hover:bg-gray-700',
                filter !== 'all' && 'text-brand-600 dark:text-brand-400'
              )}
              title="Filter comments"
            >
              <Filter className="h-4 w-4" />
            </button>
            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFilterMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {(Object.keys(filterLabels) as CommentFilter[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setFilter(key);
                        setShowFilterMenu(false);
                      }}
                      className={cn(
                        'flex w-full items-center rounded-md px-2.5 py-1.5 text-sm',
                        'hover:bg-gray-100 dark:hover:bg-gray-700',
                        filter === key &&
                          'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                      )}
                    >
                      {filterLabels[key]}
                    </button>
                  ))}
                </div>
              </>
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
      </div>

      {/* New comment */}
      <div className="border-b px-4 py-3 dark:border-gray-700">
        <CommentInput documentId={documentId} placeholder="Add a comment..." />
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-1">
                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-2 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <MessageSquarePlus className="h-6 w-6 text-gray-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">
              {filter === 'all' ? 'No comments yet' : `No ${filter} comments`}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {filter === 'all'
                ? 'Start a conversation by adding a comment above.'
                : 'Try changing the filter to see other comments.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {filteredComments.map((comment) => (
              <CommentThread key={comment.id} comment={comment} documentId={documentId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
