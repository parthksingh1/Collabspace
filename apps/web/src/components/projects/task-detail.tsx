'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import {
  X,
  Calendar,
  User,
  Tag,
  Flag,
  Hash,
  MessageSquare,
  Activity,
  ListChecks,
  Link2,
  Sparkles,
  Trash2,
  Plus,
  Send,
  ChevronDown,
  Check,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  Clock,
  SmilePlus,
} from 'lucide-react';
import { cn, formatRelativeTime, getInitials } from '@/lib/utils';
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type ActivityEntry,
} from '@/hooks/use-projects';
import { useAIStore } from '@/stores/ai-store';

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'backlog', label: 'Backlog', color: 'bg-surface-400' },
  { value: 'todo', label: 'To Do', color: 'bg-blue-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-400' },
  { value: 'in_review', label: 'In Review', color: 'bg-amber-500' },
  { value: 'done', label: 'Done', color: 'bg-green-500' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'critical', label: 'Critical', icon: <Flame className="h-3.5 w-3.5" />, color: 'text-red-500' },
  { value: 'high', label: 'High', icon: <ArrowUp className="h-3.5 w-3.5" />, color: 'text-orange-500' },
  { value: 'medium', label: 'Medium', icon: <Minus className="h-3.5 w-3.5" />, color: 'text-blue-500' },
  { value: 'low', label: 'Low', icon: <ArrowDown className="h-3.5 w-3.5" />, color: 'text-surface-400' },
];

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  const { data: task, isLoading, error } = useTask(taskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { sendMessage, toggleSidebar } = useAIStore();

  const [activeTab, setActiveTab] = useState<'activity' | 'comments' | 'subtasks' | 'related'>('activity');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescValue(task.description);
    }
  }, [task]);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleTitleSave = () => {
    if (titleValue.trim() && titleValue !== task?.title) {
      updateTask.mutate({ id: taskId, title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescSave = () => {
    if (descValue !== task?.description) {
      updateTask.mutate({ id: taskId, description: descValue });
    }
    setEditingDesc(false);
  };

  const handleStatusChange = (status: TaskStatus) => {
    updateTask.mutate({ id: taskId, status });
    setShowStatusDropdown(false);
  };

  const handlePriorityChange = (priority: TaskPriority) => {
    updateTask.mutate({ id: taskId, priority });
    setShowPriorityDropdown(false);
  };

  const handleDelete = () => {
    deleteTask.mutate(taskId, { onSuccess: onClose });
  };

  const handleAIAssist = (action: string) => {
    toggleSidebar();
    const prompts: Record<string, string> = {
      breakdown: `Break down this task into smaller subtasks:\n\nTask: ${task?.title}\nDescription: ${task?.description || 'No description'}`,
      priority: `Suggest the appropriate priority for this task:\n\nTask: ${task?.title}\nDescription: ${task?.description || 'No description'}`,
      estimate: `Estimate the story points/effort for this task:\n\nTask: ${task?.title}\nDescription: ${task?.description || 'No description'}`,
    };
    sendMessage(prompts[action] || `Help me with task: ${task?.title}`);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative h-full w-full max-w-2xl animate-slide-up bg-white shadow-2xl dark:bg-surface-900">
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-surface-500">Loading task...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative h-full w-full max-w-2xl bg-white shadow-2xl dark:bg-surface-900">
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-500">Failed to load task</p>
            <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === task.status)!;
  const currentPriority = PRIORITY_OPTIONS.find((p) => p.value === task.priority)!;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative flex h-full w-full max-w-2xl flex-col animate-fade-in bg-white shadow-2xl dark:bg-surface-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4 dark:border-surface-700">
          <div className="flex items-center gap-3">
            <span className="rounded bg-surface-100 px-2 py-0.5 text-xs font-semibold text-surface-500 dark:bg-surface-700 dark:text-surface-400">
              {task.key}
            </span>
            <span className="text-xs text-surface-400">
              Created {formatRelativeTime(task.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Assist button */}
            <div className="relative group">
              <button
                className="btn-ghost p-2 text-brand-500"
                title="AI Assist"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <div className="invisible absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-surface-200 bg-white py-1 shadow-lg group-hover:visible dark:border-surface-700 dark:bg-surface-800">
                <button
                  onClick={() => handleAIAssist('breakdown')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700"
                >
                  Break down task
                </button>
                <button
                  onClick={() => handleAIAssist('priority')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700"
                >
                  Suggest priority
                </button>
                <button
                  onClick={() => handleAIAssist('estimate')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700"
                >
                  Estimate effort
                </button>
              </div>
            </div>
            <button onClick={onClose} className="btn-ghost p-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-6 py-5">
            {/* Title */}
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') {
                    setTitleValue(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full border-none bg-transparent text-xl font-bold text-surface-900 outline-none focus:ring-0 dark:text-surface-100"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="cursor-text text-xl font-bold text-surface-900 hover:text-brand-600 dark:text-surface-100"
              >
                {task.title}
              </h2>
            )}

            {/* Status / Priority / Assignee bar */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {/* Status */}
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-surface-400">Status</label>
                <button
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="flex w-full items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm transition-colors hover:border-brand-400 dark:border-surface-700"
                >
                  <span className={cn('h-2 w-2 rounded-full', currentStatus.color)} />
                  {currentStatus.label}
                  <ChevronDown className="ml-auto h-3.5 w-3.5 text-surface-400" />
                </button>
                {showStatusDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => handleStatusChange(s.value)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700',
                          s.value === task.status && 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', s.color)} />
                        {s.label}
                        {s.value === task.status && <Check className="ml-auto h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority */}
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-surface-400">Priority</label>
                <button
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className="flex w-full items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm transition-colors hover:border-brand-400 dark:border-surface-700"
                >
                  <span className={currentPriority.color}>{currentPriority.icon}</span>
                  {currentPriority.label}
                  <ChevronDown className="ml-auto h-3.5 w-3.5 text-surface-400" />
                </button>
                {showPriorityDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                    {PRIORITY_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => handlePriorityChange(p.value)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700',
                          p.value === task.priority && 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                        )}
                      >
                        <span className={p.color}>{p.icon}</span>
                        {p.label}
                        {p.value === task.priority && <Check className="ml-auto h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Assignee */}
              <div>
                <label className="mb-1 block text-xs font-medium text-surface-400">Assignee</label>
                <div className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm dark:border-surface-700">
                  {task.assigneeId ? (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[9px] font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                        {task.assigneeAvatar ? (
                          <img src={task.assigneeAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          getInitials(task.assigneeName || '?')
                        )}
                      </div>
                      <span>{task.assigneeName}</span>
                    </>
                  ) : (
                    <>
                      <User className="h-4 w-4 text-surface-400" />
                      <span className="text-surface-400">Unassigned</span>
                    </>
                  )}
                </div>
              </div>

              {/* Story Points */}
              <div>
                <label className="mb-1 block text-xs font-medium text-surface-400">Story Points</label>
                <div className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm dark:border-surface-700">
                  <Hash className="h-4 w-4 text-surface-400" />
                  <span>{task.storyPoints ?? 'Not estimated'}</span>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="mb-1 block text-xs font-medium text-surface-400">Due Date</label>
                <div className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm dark:border-surface-700">
                  <Calendar className="h-4 w-4 text-surface-400" />
                  <span>
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'No due date'}
                  </span>
                </div>
              </div>

              {/* Labels */}
              <div>
                <label className="mb-1 block text-xs font-medium text-surface-400">Labels</label>
                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700">
                  {task.labels.length > 0 ? (
                    task.labels.map((label) => (
                      <span
                        key={label.id}
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                      </span>
                    ))
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-surface-400">
                      <Tag className="h-4 w-4" /> No labels
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mt-6">
              <label className="mb-2 block text-xs font-medium text-surface-400">Description</label>
              {editingDesc ? (
                <div>
                  <textarea
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    rows={6}
                    className="input min-h-[120px] resize-y font-sans text-sm"
                    placeholder="Add a description..."
                  />
                  <div className="mt-2 flex gap-2">
                    <button onClick={handleDescSave} className="btn-primary px-3 py-1.5 text-xs">
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setDescValue(task.description);
                        setEditingDesc(false);
                      }}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setEditingDesc(true)}
                  className={cn(
                    'cursor-text rounded-lg border border-transparent p-3 text-sm leading-relaxed transition-colors hover:border-surface-200 dark:hover:border-surface-700',
                    task.description ? 'text-surface-700 dark:text-surface-300' : 'text-surface-400'
                  )}
                >
                  {task.description || 'Click to add a description...'}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="mt-8 border-b border-surface-200 dark:border-surface-700">
              <div className="flex gap-1">
                {[
                  { key: 'activity' as const, label: 'Activity', icon: Activity },
                  { key: 'comments' as const, label: 'Comments', icon: MessageSquare },
                  { key: 'subtasks' as const, label: 'Subtasks', icon: ListChecks },
                  { key: 'related' as const, label: 'Related', icon: Link2 },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      activeTab === key
                        ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                        : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {key === 'subtasks' && task.subtasks.length > 0 && (
                      <span className="ml-1 rounded-full bg-surface-100 px-1.5 py-0.5 text-[10px] dark:bg-surface-700">
                        {task.subtasks.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="mt-4">
              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <div className="space-y-3">
                  {task.activityLog.length === 0 ? (
                    <p className="py-8 text-center text-sm text-surface-400">No activity yet</p>
                  ) : (
                    task.activityLog.map((entry) => (
                      <ActivityItem key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              )}

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <div>
                  <div className="space-y-4">
                    {task.comments.length === 0 ? (
                      <p className="py-6 text-center text-sm text-surface-400">
                        No comments yet. Start the conversation.
                      </p>
                    ) : (
                      task.comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-200 text-[10px] font-semibold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                            {comment.authorAvatar ? (
                              <img src={comment.authorAvatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              getInitials(comment.authorName)
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                                {comment.authorName}
                              </span>
                              <span className="text-xs text-surface-400">
                                {formatRelativeTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">
                              {comment.content}
                            </p>
                            {comment.reactions.length > 0 && (
                              <div className="mt-1.5 flex gap-1">
                                {comment.reactions.map((r, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-0.5 rounded-full bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700"
                                  >
                                    {r.emoji} {r.userIds.length}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add comment */}
                  <div className="mt-4 flex gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment... Use @mention"
                      className="input flex-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (commentText.trim()) {
                            // TODO: hook up addComment mutation
                            setCommentText('');
                          }
                        }
                      }}
                    />
                    <button
                      disabled={!commentText.trim()}
                      className="btn-primary px-3 py-2"
                      onClick={() => {
                        if (commentText.trim()) setCommentText('');
                      }}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Subtasks Tab */}
              {activeTab === 'subtasks' && (
                <div>
                  <div className="space-y-1">
                    {task.subtasks.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-50 dark:hover:bg-surface-800"
                      >
                        <button className="text-surface-400 hover:text-brand-500">
                          {sub.completed ? (
                            <CheckSquare className="h-4 w-4 text-green-500" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                        <span
                          className={cn(
                            'text-sm',
                            sub.completed && 'text-surface-400 line-through'
                          )}
                        >
                          {sub.title}
                        </span>
                      </div>
                    ))}
                    {task.subtasks.length === 0 && (
                      <p className="py-4 text-center text-sm text-surface-400">
                        No subtasks. Break this task down.
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      placeholder="Add subtask..."
                      className="input flex-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newSubtask.trim()) {
                          setNewSubtask('');
                        }
                      }}
                    />
                    <button className="btn-secondary px-3 py-2 text-sm">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Related Tab */}
              {activeTab === 'related' && (
                <div>
                  {task.relatedTasks.length === 0 ? (
                    <p className="py-8 text-center text-sm text-surface-400">
                      No related tasks
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {task.relatedTasks.map((rt) => (
                        <div
                          key={rt.id}
                          className="flex items-center gap-3 rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700"
                        >
                          <span className="rounded bg-surface-100 px-1.5 py-0.5 text-[11px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                            {rt.key}
                          </span>
                          <span className="flex-1 text-sm">{rt.title}</span>
                          <span className="text-xs text-surface-400 capitalize">
                            {rt.relationship.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn-ghost mt-3 flex items-center gap-1.5 text-sm">
                    <Plus className="h-3.5 w-3.5" /> Link task
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-surface-200 px-6 py-3 dark:border-surface-700">
          <span className="text-xs text-surface-400">
            Updated {formatRelativeTime(task.updatedAt)}
          </span>
          <div className="flex items-center gap-2">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500">Delete this task?</span>
                <button
                  onClick={handleDelete}
                  className="btn-danger px-3 py-1.5 text-xs"
                  disabled={deleteTask.isPending}
                >
                  {deleteTask.isPending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const description = (() => {
    switch (entry.type) {
      case 'created':
        return 'created this task';
      case 'status_change':
        return (
          <>
            changed status from{' '}
            <span className="font-medium">{entry.oldValue}</span> to{' '}
            <span className="font-medium">{entry.newValue}</span>
          </>
        );
      case 'assignee_change':
        return (
          <>
            {entry.newValue
              ? <>assigned to <span className="font-medium">{entry.newValue}</span></>
              : 'removed the assignee'}
          </>
        );
      case 'priority_change':
        return (
          <>
            changed priority to{' '}
            <span className="font-medium">{entry.newValue}</span>
          </>
        );
      case 'comment':
        return 'added a comment';
      case 'label_change':
        return (
          <>
            updated labels to{' '}
            <span className="font-medium">{entry.newValue}</span>
          </>
        );
      default:
        return `updated ${entry.field || 'the task'}`;
    }
  })();

  return (
    <div className="flex items-start gap-3 py-1">
      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-100 text-[9px] font-semibold text-surface-500 dark:bg-surface-700 dark:text-surface-400">
        {entry.userAvatar ? (
          <img src={entry.userAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          getInitials(entry.userName)
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm text-surface-600 dark:text-surface-400">
          <span className="font-medium text-surface-800 dark:text-surface-200">
            {entry.userName}
          </span>{' '}
          {description}
        </p>
        <span className="text-xs text-surface-400">
          {formatRelativeTime(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}
