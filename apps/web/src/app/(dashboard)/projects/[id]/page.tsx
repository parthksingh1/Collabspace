'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  Settings, Plus, Search, LayoutGrid,
  X, ArrowUp, ArrowDown, Minus, Flame,
  MessageSquare, Clock, AlertTriangle, Calendar,
  CheckSquare, Square, Send, Activity,
  User, Tag, Zap, GitCommit, Edit3,
  ChevronDown,
} from 'lucide-react';
import { cn, getInitials, generateColor, truncate } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';

// ---- Types ----

type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface ActivityEntry {
  id: string;
  type: 'status_change' | 'comment' | 'assignee_change' | 'priority_change' | 'created';
  description: string;
  user: string;
  timestamp: string;
}

interface Comment {
  id: string;
  user: string;
  userId: string;
  text: string;
  timestamp: string;
}

interface DemoTask {
  id: string;
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeName?: string;
  labels: TaskLabel[];
  storyPoints?: number;
  dueDate?: string;
  commentCount: number;
  subtasks: Subtask[];
  activities: ActivityEntry[];
  comments: Comment[];
}

interface ColumnConfig {
  id: TaskStatus;
  title: string;
  color: string;
  dotColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', color: 'bg-surface-100 dark:bg-surface-800/60', dotColor: 'bg-surface-400' },
  { id: 'todo', title: 'To Do', color: 'bg-blue-50 dark:bg-blue-950/20', dotColor: 'bg-blue-400' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-amber-50 dark:bg-amber-950/20', dotColor: 'bg-amber-400' },
  { id: 'in_review', title: 'In Review', color: 'bg-brand-50 dark:bg-brand-950/20', dotColor: 'bg-brand-400' },
  { id: 'done', title: 'Done', color: 'bg-green-50 dark:bg-green-950/20', dotColor: 'bg-green-500' },
];

const priorityConfig: Record<TaskPriority, { border: string; icon: React.ReactNode; label: string }> = {
  critical: { border: 'border-l-red-500', icon: <Flame className="h-3.5 w-3.5 text-red-500" />, label: 'Critical' },
  high: { border: 'border-l-orange-500', icon: <ArrowUp className="h-3.5 w-3.5 text-orange-500" />, label: 'High' },
  medium: { border: 'border-l-blue-500', icon: <Minus className="h-3.5 w-3.5 text-blue-500" />, label: 'Medium' },
  low: { border: 'border-l-surface-400', icon: <ArrowDown className="h-3.5 w-3.5 text-surface-400" />, label: 'Low' },
};

const TEAM_MEMBERS = [
  { id: 'u1', name: 'Sarah Chen' },
  { id: 'u2', name: 'Alex Rivera' },
  { id: 'u3', name: 'James Kim' },
  { id: 'u4', name: 'Taylor Brooks' },
  { id: 'u5', name: 'Morgan Lee' },
  { id: 'u6', name: 'Priya Gupta' },
];

const ALL_LABELS: TaskLabel[] = [
  { id: 'l1', name: 'Testing', color: '#3b82f6' },
  { id: 'l2', name: 'Frontend', color: '#14b8a6' },
  { id: 'l3', name: 'Design', color: '#f59e0b' },
  { id: 'l4', name: 'DevOps', color: '#ef4444' },
  { id: 'l5', name: 'Backend', color: '#0ea5e9' },
  { id: 'l6', name: 'Bug', color: '#ef4444' },
  { id: 'l7', name: 'Security', color: '#dc2626' },
  { id: 'l8', name: 'Docs', color: '#06b6d4' },
  { id: 'l9', name: 'Performance', color: '#22c55e' },
];

// ---- Demo Data ----

let taskCounter = 20;

function makeSubtasks(titles: string[]): Subtask[] {
  return titles.map((t, i) => ({ id: `sub-${Date.now()}-${i}`, title: t, completed: i === 0 }));
}

function makeActivities(taskKey: string): ActivityEntry[] {
  return [
    { id: `a1-${taskKey}`, type: 'created', description: `${taskKey} created`, user: 'Sarah Chen', timestamp: '2026-04-07T09:00:00Z' },
    { id: `a2-${taskKey}`, type: 'assignee_change', description: 'Assignee changed', user: 'Alex Rivera', timestamp: '2026-04-08T11:30:00Z' },
    { id: `a3-${taskKey}`, type: 'status_change', description: 'Moved to In Progress', user: 'James Kim', timestamp: '2026-04-09T14:00:00Z' },
    { id: `a4-${taskKey}`, type: 'comment', description: 'Added a comment', user: 'Taylor Brooks', timestamp: '2026-04-10T10:15:00Z' },
    { id: `a5-${taskKey}`, type: 'priority_change', description: 'Priority set to High', user: 'Morgan Lee', timestamp: '2026-04-11T16:45:00Z' },
  ];
}

function makeComments(taskKey: string): Comment[] {
  return [
    { id: `c1-${taskKey}`, user: 'Sarah Chen', userId: 'u1', text: 'I have started working on this. Will update once the initial implementation is ready for review.', timestamp: '2026-04-09T14:30:00Z' },
    { id: `c2-${taskKey}`, user: 'Alex Rivera', userId: 'u2', text: 'Looks good so far. Make sure we add proper error handling for edge cases.', timestamp: '2026-04-10T10:15:00Z' },
    { id: `c3-${taskKey}`, user: 'James Kim', userId: 'u3', text: 'I added some relevant test cases in the linked PR. Let me know if you need anything else.', timestamp: '2026-04-11T16:00:00Z' },
  ];
}

const INITIAL_TASKS: DemoTask[] = [
  // Backlog (4)
  { id: 't1', key: 'CS-1', title: 'Write load testing scenarios for WebSocket layer', description: 'Create k6 scripts for stress testing the WebSocket connections under high concurrency', status: 'backlog', priority: 'medium', assigneeName: 'Sarah Chen', assigneeId: 'u1', labels: [{ id: 'l1', name: 'Testing', color: '#3b82f6' }], storyPoints: 5, commentCount: 2, subtasks: makeSubtasks(['Set up k6 environment', 'Write connection pool tests', 'Add throughput benchmarks']), activities: makeActivities('CS-1'), comments: makeComments('CS-1') },
  { id: 't2', key: 'CS-2', title: 'Add dark mode toggle to settings page', description: 'Theme switcher component with system preference detection', status: 'backlog', priority: 'low', assigneeName: 'Priya Gupta', assigneeId: 'u6', labels: [{ id: 'l2', name: 'Frontend', color: '#14b8a6' }], storyPoints: 3, commentCount: 0, subtasks: makeSubtasks(['Create toggle component', 'Add system detection', 'Persist preference']), activities: makeActivities('CS-2'), comments: makeComments('CS-2') },
  { id: 't3', key: 'CS-3', title: 'Design user onboarding flow', description: 'First-run user experience with guided walkthrough', status: 'backlog', priority: 'high', labels: [{ id: 'l3', name: 'Design', color: '#f59e0b' }], storyPoints: 8, commentCount: 4, subtasks: makeSubtasks(['Create wireframes', 'Design welcome screens', 'Build tooltip tour']), activities: makeActivities('CS-3'), comments: makeComments('CS-3') },
  { id: 't18', key: 'CS-18', title: 'Write E2E tests for auth flow', description: 'Playwright tests covering login, register, password reset, and token refresh', status: 'backlog', priority: 'low', assigneeName: 'Morgan Lee', assigneeId: 'u5', labels: [{ id: 'l1', name: 'Testing', color: '#3b82f6' }, { id: 'l7', name: 'Security', color: '#dc2626' }], storyPoints: 5, commentCount: 1, subtasks: makeSubtasks(['Set up Playwright config', 'Write login tests', 'Write registration tests']), activities: makeActivities('CS-18'), comments: makeComments('CS-18') },

  // Todo (4)
  { id: 't4', key: 'CS-4', title: 'Set up CI/CD pipeline with GitHub Actions', description: 'GitHub Actions with staging deploys and automated testing', status: 'todo', priority: 'high', assigneeName: 'Taylor Brooks', assigneeId: 'u4', labels: [{ id: 'l4', name: 'DevOps', color: '#ef4444' }], storyPoints: 8, dueDate: '2026-04-18T00:00:00Z', commentCount: 3, subtasks: makeSubtasks(['Create workflow files', 'Add staging environment', 'Set up secrets']), activities: makeActivities('CS-4'), comments: makeComments('CS-4') },
  { id: 't5', key: 'CS-5', title: 'Implement WebSocket connection pooling', description: 'Distribute connections across nodes with consistent hashing', status: 'todo', priority: 'critical', assigneeName: 'James Kim', assigneeId: 'u3', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }], storyPoints: 13, dueDate: '2026-04-16T00:00:00Z', commentCount: 7, subtasks: makeSubtasks(['Design pool architecture', 'Implement connection manager', 'Add health checks']), activities: makeActivities('CS-5'), comments: makeComments('CS-5') },
  { id: 't6', key: 'CS-6', title: 'Add rate limiting to API gateway', description: 'Redis sliding window implementation with configurable limits', status: 'todo', priority: 'high', assigneeName: 'Sarah Chen', assigneeId: 'u1', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }], storyPoints: 5, commentCount: 1, subtasks: makeSubtasks(['Set up Redis integration', 'Implement sliding window', 'Add rate limit headers']), activities: makeActivities('CS-6'), comments: makeComments('CS-6') },
  { id: 't7', key: 'CS-7', title: 'Set up Kafka consumers for async events', description: 'Event-driven architecture for async task processing and notifications', status: 'todo', priority: 'medium', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }, { id: 'l4', name: 'DevOps', color: '#ef4444' }], storyPoints: 8, commentCount: 0, subtasks: makeSubtasks(['Configure Kafka topics', 'Create consumer groups', 'Add dead letter queue']), activities: makeActivities('CS-7'), comments: makeComments('CS-7') },

  // In Progress (4)
  { id: 't8', key: 'CS-8', title: 'Fix CRDT merge conflict in concurrent edits', description: 'Handle concurrent edits on same block in collaborative documents', status: 'in_progress', priority: 'critical', assigneeName: 'Alex Rivera', assigneeId: 'u2', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }, { id: 'l6', name: 'Bug', color: '#ef4444' }], storyPoints: 13, dueDate: '2026-04-15T00:00:00Z', commentCount: 12, subtasks: makeSubtasks(['Reproduce merge conflict', 'Implement conflict resolution', 'Add regression tests']), activities: makeActivities('CS-8'), comments: makeComments('CS-8') },
  { id: 't9', key: 'CS-9', title: 'Build notification service with real-time delivery', description: 'Real-time WebSocket notifications plus email digest fallback', status: 'in_progress', priority: 'high', assigneeName: 'Morgan Lee', assigneeId: 'u5', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }], storyPoints: 8, commentCount: 5, subtasks: makeSubtasks(['Design notification schema', 'Implement WebSocket push', 'Add email templates']), activities: makeActivities('CS-9'), comments: makeComments('CS-9') },
  { id: 't10', key: 'CS-10', title: 'Implement file upload service', description: 'S3 presigned URLs with virus scanning and size limits', status: 'in_progress', priority: 'medium', assigneeName: 'Taylor Brooks', assigneeId: 'u4', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }], storyPoints: 5, commentCount: 2, subtasks: makeSubtasks(['Set up S3 bucket', 'Generate presigned URLs', 'Add virus scanning']), activities: makeActivities('CS-10'), comments: makeComments('CS-10') },
  { id: 't19', key: 'CS-19', title: 'Add Prometheus metrics to API gateway', description: 'Instrument request latency, error rates, and throughput metrics', status: 'in_progress', priority: 'medium', assigneeName: 'James Kim', assigneeId: 'u3', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }, { id: 'l9', name: 'Performance', color: '#22c55e' }], storyPoints: 5, dueDate: '2026-04-17T00:00:00Z', commentCount: 3, subtasks: makeSubtasks(['Install prom-client', 'Add request middleware', 'Set up Grafana dashboard']), activities: makeActivities('CS-19'), comments: makeComments('CS-19') },

  // In Review (4)
  { id: 't11', key: 'CS-11', title: 'Add workspace permissions with RBAC', description: 'Role-based access control with role hierarchy and permission inheritance', status: 'in_review', priority: 'high', assigneeName: 'Sarah Chen', assigneeId: 'u1', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }, { id: 'l7', name: 'Security', color: '#dc2626' }], storyPoints: 8, commentCount: 6, subtasks: makeSubtasks(['Define role hierarchy', 'Implement permission guards', 'Add admin UI']), activities: makeActivities('CS-11'), comments: makeComments('CS-11') },
  { id: 't12', key: 'CS-12', title: 'Create API documentation with OpenAPI', description: 'OpenAPI spec with Swagger UI and auto-generated SDK types', status: 'in_review', priority: 'medium', assigneeName: 'James Kim', assigneeId: 'u3', labels: [{ id: 'l8', name: 'Docs', color: '#06b6d4' }], storyPoints: 3, commentCount: 1, subtasks: makeSubtasks(['Write OpenAPI spec', 'Set up Swagger UI', 'Generate TypeScript types']), activities: makeActivities('CS-12'), comments: makeComments('CS-12') },
  { id: 't20', key: 'CS-20', title: 'Implement search indexing with Elasticsearch', description: 'Full-text search across documents, tasks, and comments', status: 'in_review', priority: 'high', assigneeName: 'Alex Rivera', assigneeId: 'u2', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }, { id: 'l9', name: 'Performance', color: '#22c55e' }], storyPoints: 8, commentCount: 4, subtasks: makeSubtasks(['Set up ES cluster', 'Create index mappings', 'Build search API']), activities: makeActivities('CS-20'), comments: makeComments('CS-20') },
  { id: 't21', key: 'CS-21', title: 'Build responsive mobile navigation', description: 'Hamburger menu and bottom tab bar for mobile viewports', status: 'in_review', priority: 'medium', assigneeName: 'Priya Gupta', assigneeId: 'u6', labels: [{ id: 'l2', name: 'Frontend', color: '#14b8a6' }, { id: 'l3', name: 'Design', color: '#f59e0b' }], storyPoints: 5, commentCount: 2, subtasks: makeSubtasks(['Create hamburger menu', 'Add bottom tab bar', 'Test breakpoints']), activities: makeActivities('CS-21'), comments: makeComments('CS-21') },

  // Done (4)
  { id: 't13', key: 'CS-13', title: 'Set up PostgreSQL with Prisma ORM', description: 'Schema design, migrations, and seed data for development', status: 'done', priority: 'high', assigneeName: 'Alex Rivera', assigneeId: 'u2', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }], storyPoints: 5, commentCount: 3, subtasks: makeSubtasks(['Design schema', 'Create migrations', 'Add seed data']), activities: makeActivities('CS-13'), comments: makeComments('CS-13') },
  { id: 't14', key: 'CS-14', title: 'Implement JWT authentication flow', description: 'Access + refresh token flow with secure httpOnly cookies', status: 'done', priority: 'critical', assigneeName: 'Sarah Chen', assigneeId: 'u1', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }, { id: 'l7', name: 'Security', color: '#dc2626' }], storyPoints: 8, commentCount: 9, subtasks: makeSubtasks(['Implement token generation', 'Add refresh flow', 'Set up cookie handling']), activities: makeActivities('CS-14'), comments: makeComments('CS-14') },
  { id: 't15', key: 'CS-15', title: 'Design system tokens and theme config', description: 'Colors, spacing, typography scale, and component tokens', status: 'done', priority: 'medium', assigneeName: 'Priya Gupta', assigneeId: 'u6', labels: [{ id: 'l3', name: 'Design', color: '#f59e0b' }], storyPoints: 3, commentCount: 2, subtasks: makeSubtasks(['Define color palette', 'Set typography scale', 'Create spacing tokens']), activities: makeActivities('CS-15'), comments: makeComments('CS-15') },
  { id: 't16', key: 'CS-16', title: 'WebSocket server MVP with room support', description: 'Basic pub/sub with room support and presence tracking', status: 'done', priority: 'high', assigneeName: 'James Kim', assigneeId: 'u3', labels: [{ id: 'l5', name: 'Backend', color: '#0ea5e9' }], storyPoints: 13, commentCount: 8, subtasks: makeSubtasks(['Set up Socket.IO', 'Implement rooms', 'Add presence tracking']), activities: makeActivities('CS-16'), comments: makeComments('CS-16') },
];

// ---- Task Card Component ----

function TaskCard({ task, isDragging }: { task: DemoTask; isDragging?: boolean }) {
  const priority = priorityConfig[task.priority];
  const overdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;

  const formatDueDate = (dueDate: string): string => {
    const date = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays <= 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const overflowCount = task.labels.length > 3 ? task.labels.length - 3 : 0;

  return (
    <div
      className={cn(
        'group cursor-pointer rounded-lg border border-surface-200 bg-white border-l-[3px] p-3 transition-all duration-150',
        'hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.01]',
        'dark:border-surface-700 dark:bg-surface-800',
        priority.border,
        isDragging && 'shadow-xl rotate-[2deg] ring-2 ring-brand-500/30 opacity-90'
      )}
    >
      {/* Top row: key + priority */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center rounded bg-surface-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
          {task.key}
        </span>
        <span title={priority.label}>{priority.icon}</span>
      </div>

      {/* Title */}
      <p className="mb-2 text-sm font-medium leading-snug text-surface-800 dark:text-surface-100 line-clamp-2">
        {task.title}
      </p>

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-200 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between text-surface-400 dark:text-surface-500">
        <div className="flex items-center gap-2">
          {task.assigneeId && (
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ backgroundColor: generateColor(task.assigneeId) }}
              title={task.assigneeName || 'Assigned'}
            >
              {getInitials(task.assigneeName || '?')}
            </div>
          )}
          {task.storyPoints !== undefined && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-surface-100 px-1 text-[10px] font-semibold text-surface-500 dark:bg-surface-700 dark:text-surface-400">
              {task.storyPoints}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]">
              <MessageSquare className="h-3 w-3" />
              {task.commentCount}
            </span>
          )}
          {task.dueDate && (
            <span className={cn('flex items-center gap-0.5 text-[11px]', overdue && 'font-medium text-red-500')}>
              {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Task Detail Side Panel ----

function TaskDetailPanel({ task, onClose, onUpdate }: { task: DemoTask; onClose: () => void; onUpdate: (updated: DemoTask) => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [storyPoints, setStoryPoints] = useState(task.storyPoints ?? 0);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.split('T')[0] : '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [comments, setComments] = useState<Comment[]>(task.comments);
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'comments'>('details');
  const [isSliding, setIsSliding] = useState(false);
  const [taskLabels, setTaskLabels] = useState<TaskLabel[]>(task.labels);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setIsSliding(true));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => {
      onUpdate({
        ...task,
        title,
        description,
        status,
        priority,
        storyPoints,
        dueDate: dueDate ? `${dueDate}T00:00:00Z` : undefined,
        subtasks,
        comments,
        labels: taskLabels,
        commentCount: comments.length,
      });
      onClose();
    }, 200);
  };

  const handleClickOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const toggleSubtask = (id: string) => {
    setSubtasks((prev) => prev.map((s) => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks((prev) => [...prev, { id: `sub-${Date.now()}`, title: newSubtaskTitle.trim(), completed: false }]);
    setNewSubtaskTitle('');
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments((prev) => [...prev, {
      id: `c-${Date.now()}`,
      user: 'You',
      userId: 'current',
      text: newComment.trim(),
      timestamp: new Date().toISOString(),
    }]);
    setNewComment('');
  };

  const toggleLabel = (label: TaskLabel) => {
    setTaskLabels((prev) => {
      const exists = prev.find((l) => l.id === label.id);
      if (exists) return prev.filter((l) => l.id !== label.id);
      return [...prev, label];
    });
  };

  const statusOptions: { value: TaskStatus; label: string; color: string }[] = [
    { value: 'backlog', label: 'Backlog', color: 'bg-surface-400' },
    { value: 'todo', label: 'To Do', color: 'bg-blue-400' },
    { value: 'in_progress', label: 'In Progress', color: 'bg-amber-400' },
    { value: 'in_review', label: 'In Review', color: 'bg-brand-400' },
    { value: 'done', label: 'Done', color: 'bg-green-500' },
  ];

  const priorityOptions: { value: TaskPriority; label: string; icon: React.ReactNode }[] = [
    { value: 'critical', label: 'Critical', icon: <Flame className="h-3.5 w-3.5 text-red-500" /> },
    { value: 'high', label: 'High', icon: <ArrowUp className="h-3.5 w-3.5 text-orange-500" /> },
    { value: 'medium', label: 'Medium', icon: <Minus className="h-3.5 w-3.5 text-blue-500" /> },
    { value: 'low', label: 'Low', icon: <ArrowDown className="h-3.5 w-3.5 text-surface-400" /> },
  ];

  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const activityIcon = (type: ActivityEntry['type']) => {
    switch (type) {
      case 'status_change': return <GitCommit className="h-3.5 w-3.5 text-brand-500" />;
      case 'comment': return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />;
      case 'assignee_change': return <User className="h-3.5 w-3.5 text-amber-500" />;
      case 'priority_change': return <Zap className="h-3.5 w-3.5 text-orange-500" />;
      case 'created': return <Activity className="h-3.5 w-3.5 text-emerald-500" />;
      default: return <Activity className="h-3.5 w-3.5 text-surface-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={handleClickOutside}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200" />
      <div
        ref={panelRef}
        className={cn(
          'relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl dark:bg-surface-900 transition-transform duration-200 ease-out',
          isSliding ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4 dark:border-surface-700">
          <div className="flex items-center gap-3">
            <span className="rounded bg-surface-100 px-2 py-0.5 font-mono text-xs font-semibold text-surface-500 dark:bg-surface-700 dark:text-surface-400">
              {task.key}
            </span>
          </div>
          <button onClick={handleClose} className="rounded-lg p-2 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
            <X className="h-4 w-4 text-surface-500" />
          </button>
        </div>

        {/* Title */}
        <div className="px-6 pt-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-none bg-transparent text-lg font-bold text-surface-900 outline-none focus:ring-0 dark:text-surface-100"
            placeholder="Task title..."
          />
        </div>

        {/* Tabs */}
        <div className="px-6 mt-3 flex gap-1 border-b border-surface-200 dark:border-surface-700">
          {(['details', 'activity', 'comments'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px capitalize',
                activeTab === tab
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              )}
            >
              {tab}
              {tab === 'comments' && comments.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-surface-200 px-1 text-[10px] font-semibold text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                  {comments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          {activeTab === 'details' && (
            <div className="space-y-5">
              {/* Status / Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-surface-400">Status</label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                      className="input text-sm py-2 pl-7 appearance-none"
                    >
                      {statusOptions.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <span className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full', statusOptions.find((s) => s.value === status)?.color)} />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-surface-400">Priority</label>
                  <div className="relative">
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TaskPriority)}
                      className="input text-sm py-2 pl-7 appearance-none"
                    >
                      {priorityOptions.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <span className="absolute left-2 top-1/2 -translate-y-1/2">
                      {priorityOptions.find((p) => p.value === priority)?.icon}
                    </span>
                  </div>
                </div>
              </div>

              {/* Assignee / Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-surface-400">Assignee</label>
                  <div className="flex items-center gap-2 rounded-[var(--radius)] border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900">
                    {task.assigneeId ? (
                      <>
                        <div
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: generateColor(task.assigneeId) }}
                        >
                          {getInitials(task.assigneeName || '?')}
                        </div>
                        <span className="text-surface-700 dark:text-surface-300">{task.assigneeName}</span>
                      </>
                    ) : (
                      <span className="text-surface-400">Unassigned</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-surface-400">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="input text-sm py-2"
                  />
                </div>
              </div>

              {/* Story Points */}
              <div className="w-1/2">
                <label className="mb-1.5 block text-xs font-medium text-surface-400">Story Points</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(Number(e.target.value))}
                  className="input text-sm py-2"
                />
              </div>

              {/* Labels */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-surface-400">Labels</label>
                  <button
                    onClick={() => setShowLabelPicker(!showLabelPicker)}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/30 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {taskLabels.map((label) => (
                    <span
                      key={label.id}
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                  ))}
                  {taskLabels.length === 0 && (
                    <span className="text-xs text-surface-400">No labels</span>
                  )}
                </div>
                {showLabelPicker && (
                  <div className="mt-2 rounded-lg border border-surface-200 bg-surface-50 p-2 dark:border-surface-700 dark:bg-surface-800/50">
                    <div className="flex flex-wrap gap-1">
                      {ALL_LABELS.map((label) => {
                        const isSelected = taskLabels.some((l) => l.id === label.id);
                        return (
                          <button
                            key={label.id}
                            onClick={() => toggleLabel(label)}
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                              isSelected ? 'text-white ring-2 ring-offset-1 ring-surface-400' : 'text-white opacity-60 hover:opacity-100'
                            )}
                            style={{ backgroundColor: label.color }}
                          >
                            {label.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-surface-400">Description</label>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => setDescription(e.currentTarget.textContent || '')}
                  className="min-h-[80px] rounded-[var(--radius)] border border-surface-300 bg-white px-3 py-2 text-sm text-surface-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300"
                >
                  {description}
                </div>
              </div>

              {/* Subtasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-surface-400">
                    Subtasks ({completedSubtasks}/{subtasks.length})
                  </label>
                </div>
                {subtasks.length > 0 && (
                  <div className="mb-2 h-1.5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{ width: subtasks.length > 0 ? `${(completedSubtasks / subtasks.length) * 100}%` : '0%' }}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  {subtasks.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => toggleSubtask(sub.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-left hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                    >
                      {sub.completed ? (
                        <CheckSquare className="h-4 w-4 text-brand-500 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-surface-400 shrink-0" />
                      )}
                      <span className={cn(sub.completed && 'line-through text-surface-400')}>
                        {sub.title}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
                    placeholder="Add subtask..."
                    className="input py-1.5 text-xs flex-1"
                  />
                  <button
                    onClick={addSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="btn-primary px-2.5 py-1.5 text-xs disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-0">
              {task.activities.map((act, i) => (
                <div key={act.id} className="flex gap-3 py-3">
                  <div className="relative flex flex-col items-center">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800">
                      {activityIcon(act.type)}
                    </div>
                    {i < task.activities.length - 1 && (
                      <div className="w-px flex-1 bg-surface-200 dark:bg-surface-700 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-surface-700 dark:text-surface-300">
                      <span className="font-medium">{act.user}</span>{' '}
                      <span className="text-surface-500">{act.description}</span>
                    </p>
                    <p className="text-xs text-surface-400 mt-0.5">{formatTimestamp(act.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: generateColor(comment.userId) }}
                  >
                    {getInitials(comment.user)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{comment.user}</span>
                      <span className="text-xs text-surface-400">{formatTimestamp(comment.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-sm text-surface-600 dark:text-surface-400 leading-relaxed">{comment.text}</p>
                  </div>
                </div>
              ))}

              {/* Add comment */}
              <div className="flex gap-3 pt-2 border-t border-surface-200 dark:border-surface-700">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                  Y
                </div>
                <div className="flex-1 flex gap-2">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
                    placeholder="Write a comment..."
                    className="input py-1.5 text-sm flex-1"
                  />
                  <button
                    onClick={addComment}
                    disabled={!newComment.trim()}
                    className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Inline Quick-Add ----

function InlineQuickAdd({ columnId, onCreate }: { columnId: TaskStatus; onCreate: (title: string, columnId: TaskStatus) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), columnId);
    setTitle('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-surface-400 hover:bg-white/60 hover:text-surface-600 dark:hover:bg-surface-800/40 dark:hover:text-surface-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add task
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-surface-200 bg-white p-2 dark:border-surface-700 dark:bg-surface-800 animate-fade-in">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreate();
          if (e.key === 'Escape') { setIsOpen(false); setTitle(''); }
        }}
        placeholder="Task title..."
        className="w-full border-none bg-transparent text-sm text-surface-800 outline-none placeholder:text-surface-400 dark:text-surface-200"
      />
      <div className="mt-2 flex items-center justify-between">
        <button onClick={() => { setIsOpen(false); setTitle(''); }} className="text-xs text-surface-400 hover:text-surface-600 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!title.trim()}
          className="btn-primary px-2.5 py-1 text-xs disabled:opacity-40"
        >
          Create
        </button>
      </div>
    </div>
  );
}

// ---- Filters Bar (Multi-select Priority, Assignee Filter) ----

function FiltersBar({
  search,
  setSearch,
  selectedPriorities,
  togglePriority,
  selectedAssignees,
  toggleAssignee,
  clearFilters,
  hasActiveFilters,
  taskCount,
}: {
  search: string;
  setSearch: (v: string) => void;
  selectedPriorities: Set<TaskPriority>;
  togglePriority: (p: TaskPriority) => void;
  selectedAssignees: Set<string>;
  toggleAssignee: (id: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  taskCount: number;
}) {
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const priorityRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) setShowPriorityDropdown(false);
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) setShowAssigneeDropdown(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const priorities: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="flex items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input py-1.5 pl-8 text-xs w-48"
          placeholder="Filter tasks..."
        />
      </div>

      {/* Priority multi-select */}
      <div ref={priorityRef} className="relative">
        <button
          onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
          className={cn(
            'input py-1.5 text-xs w-auto flex items-center gap-1.5 pr-7 cursor-pointer',
            selectedPriorities.size > 0 && 'border-brand-500 ring-1 ring-brand-500/20'
          )}
        >
          Priority
          {selectedPriorities.size > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
              {selectedPriorities.size}
            </span>
          )}
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-surface-400" />
        </button>
        {showPriorityDropdown && (
          <div className="absolute top-full left-0 z-20 mt-1 w-44 dropdown p-1">
            {priorities.map((p) => {
              const config = priorityConfig[p];
              return (
                <button
                  key={p}
                  onClick={() => togglePriority(p)}
                  className="dropdown-item w-full"
                >
                  <input
                    type="checkbox"
                    checked={selectedPriorities.has(p)}
                    readOnly
                    className="h-3.5 w-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                  />
                  {config.icon}
                  <span className="capitalize">{config.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Assignee filter */}
      <div ref={assigneeRef} className="relative">
        <button
          onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
          className={cn(
            'flex items-center gap-1',
            selectedAssignees.size > 0 ? 'ring-2 ring-brand-500/30 rounded-full' : ''
          )}
        >
          <div className="flex -space-x-1.5">
            {TEAM_MEMBERS.slice(0, 4).map((member) => (
              <div
                key={member.id}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[8px] font-semibold text-white dark:border-surface-900 transition-all',
                  selectedAssignees.has(member.id) && 'ring-2 ring-brand-500 ring-offset-1'
                )}
                style={{ backgroundColor: generateColor(member.id) }}
                title={member.name}
              >
                {getInitials(member.name)}
              </div>
            ))}
            {TEAM_MEMBERS.length > 4 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-surface-200 text-[8px] font-semibold text-surface-500 dark:border-surface-900 dark:bg-surface-700 dark:text-surface-400">
                +{TEAM_MEMBERS.length - 4}
              </div>
            )}
          </div>
        </button>
        {showAssigneeDropdown && (
          <div className="absolute top-full right-0 z-20 mt-1 w-48 dropdown p-1">
            {TEAM_MEMBERS.map((member) => (
              <button
                key={member.id}
                onClick={() => toggleAssignee(member.id)}
                className="dropdown-item w-full"
              >
                <input
                  type="checkbox"
                  checked={selectedAssignees.has(member.id)}
                  readOnly
                  className="h-3.5 w-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                  style={{ backgroundColor: generateColor(member.id) }}
                >
                  {getInitials(member.name)}
                </div>
                <span className="text-xs">{member.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}

// ---- Sprint Bar ----

function SprintBar() {
  const totalTasks = 42;
  const doneTasks = 28;
  const progress = Math.round((doneTasks / totalTasks) * 100);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-surface-200 bg-white px-4 py-2.5 dark:border-surface-700 dark:bg-surface-900">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-brand-500" />
        <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">Sprint v2.1</span>
        <span className="text-xs text-surface-400">Apr 7 - 21</span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          8 days remaining
        </span>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-medium text-surface-600 dark:text-surface-400 whitespace-nowrap">
          {doneTasks}/{totalTasks} tasks
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-surface-500">
        <Zap className="h-3.5 w-3.5 text-brand-500" />
        <span className="font-medium">Velocity:</span>
        <span className="font-semibold text-surface-700 dark:text-surface-300">34 pts/sprint</span>
      </div>
    </div>
  );
}

// ---- Main Page ----

export default function ProjectBoardPage() {
  const params = useParams();
  const projectId = params.id as string;
  const addToast = useToastStore((s) => s.addToast);

  const [tasks, setTasks] = useState<DemoTask[]>(INITIAL_TASKS);
  const [search, setSearch] = useState('');
  const [selectedPriorities, setSelectedPriorities] = useState<Set<TaskPriority>>(new Set());
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const togglePriority = useCallback((p: TaskPriority) => {
    setSelectedPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const toggleAssignee = useCallback((id: string) => {
    setSelectedAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setSelectedPriorities(new Set());
    setSelectedAssignees(new Set());
  }, []);

  const hasActiveFilters = search.length > 0 || selectedPriorities.size > 0 || selectedAssignees.size > 0;

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.labels.some((l) => l.name.toLowerCase().includes(q))
      );
    }
    if (selectedPriorities.size > 0) {
      filtered = filtered.filter((t) => selectedPriorities.has(t.priority));
    }
    if (selectedAssignees.size > 0) {
      filtered = filtered.filter((t) => t.assigneeId && selectedAssignees.has(t.assigneeId));
    }
    return filtered;
  }, [tasks, search, selectedPriorities, selectedAssignees]);

  // Group by status
  const columnTasks = useMemo(() => {
    const grouped: Record<TaskStatus, DemoTask[]> = {
      backlog: [], todo: [], in_progress: [], in_review: [], done: [],
    };
    filteredTasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    return grouped;
  }, [filteredTasks]);

  // Drag and drop handler
  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId as TaskStatus;
    const statusLabels: Record<TaskStatus, string> = {
      backlog: 'Backlog',
      todo: 'To Do',
      in_progress: 'In Progress',
      in_review: 'In Review',
      done: 'Done',
    };

    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t))
    );

    addToast({
      title: 'Task moved',
      description: `Task moved to ${statusLabels[newStatus]}`,
      variant: 'info',
    });
  }, [addToast]);

  // Create new task (from inline quick-add)
  const handleInlineCreate = useCallback((title: string, columnId: TaskStatus) => {
    taskCounter++;
    const newTask: DemoTask = {
      id: `t-${Date.now()}`,
      key: `CS-${taskCounter}`,
      title,
      description: '',
      status: columnId,
      priority: 'medium',
      labels: [],
      commentCount: 0,
      subtasks: [],
      activities: [{ id: `a-${Date.now()}`, type: 'created', description: `CS-${taskCounter} created`, user: 'You', timestamp: new Date().toISOString() }],
      comments: [],
    };
    setTasks((prev) => [newTask, ...prev]);
    addToast({ title: 'Task created', description: `${newTask.key}: ${title}`, variant: 'success' });
  }, [addToast]);

  // Create new task (from header button)
  const handleCreateFromHeader = useCallback(() => {
    taskCounter++;
    const newTask: DemoTask = {
      id: `t-${Date.now()}`,
      key: `CS-${taskCounter}`,
      title: 'New task',
      description: '',
      status: 'backlog',
      priority: 'medium',
      labels: [],
      commentCount: 0,
      subtasks: [],
      activities: [{ id: `a-${Date.now()}`, type: 'created', description: `CS-${taskCounter} created`, user: 'You', timestamp: new Date().toISOString() }],
      comments: [],
    };
    setTasks((prev) => [newTask, ...prev]);
    setSelectedTaskId(newTask.id);
  }, []);

  // Update task
  const handleUpdateTask = useCallback((updated: DemoTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  if (isLoading) {
    return (
      <div className="-mx-6 -mt-6">
        <div className="border-b border-surface-200 bg-white px-6 py-4 dark:border-surface-700 dark:bg-surface-900">
          <div className="h-7 w-48 rounded skeleton mb-3" />
          <div className="h-5 w-96 rounded skeleton" />
        </div>
        <div className="flex gap-4 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 rounded-xl bg-surface-100 dark:bg-surface-800/60 p-3">
              <div className="h-5 w-20 rounded skeleton mb-4" />
              <div className="space-y-2">
                <div className="h-24 rounded-lg skeleton" />
                <div className="h-24 rounded-lg skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-6 -mt-6">
      {/* Project Header */}
      <div className="border-b border-surface-200 bg-white px-6 py-4 dark:border-surface-700 dark:bg-surface-900">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">CollabSpace Core</h1>
            <span className="rounded-full bg-surface-100 px-2 py-0.5 font-mono text-xs font-medium text-surface-500 dark:bg-surface-800">
              CS
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Collaborator avatars */}
            <div className="flex -space-x-2">
              {TEAM_MEMBERS.slice(0, 4).map((member) => (
                <div
                  key={member.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white dark:border-surface-900"
                  style={{ backgroundColor: generateColor(member.id) }}
                  title={member.name}
                >
                  {getInitials(member.name)}
                </div>
              ))}
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-surface-200 text-[10px] font-semibold text-surface-500 dark:border-surface-900 dark:bg-surface-700 dark:text-surface-400">
                +{TEAM_MEMBERS.length - 4}
              </div>
            </div>
            <button className="rounded-lg p-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors" title="Settings">
              <Settings className="h-4 w-4 text-surface-400" />
            </button>
          </div>
        </div>

        {/* Sprint Bar */}
        <SprintBar />

        {/* Filters */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <LayoutGrid className="h-4 w-4 text-brand-500" />
            <span className="font-medium text-brand-600 dark:text-brand-400">Board</span>
            <span className="text-surface-300 dark:text-surface-600">|</span>
            <span>{filteredTasks.length} tasks</span>
          </div>

          <div className="flex items-center gap-2">
            <FiltersBar
              search={search}
              setSearch={setSearch}
              selectedPriorities={selectedPriorities}
              togglePriority={togglePriority}
              selectedAssignees={selectedAssignees}
              toggleAssignee={toggleAssignee}
              clearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              taskCount={filteredTasks.length}
            />
            <button
              onClick={handleCreateFromHeader}
              className="btn-primary gap-1.5 px-3 py-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> New Task
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-auto p-4 scrollbar-thin" style={{ height: 'calc(100vh - 240px)' }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 min-h-full">
            {COLUMNS.map((column) => {
              const colTasks = columnTasks[column.id];
              return (
                <div
                  key={column.id}
                  className={cn('flex w-72 flex-shrink-0 flex-col rounded-xl', column.color)}
                >
                  {/* Column Header (sticky) */}
                  <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 rounded-t-xl backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', column.dotColor)} />
                      <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                        {column.title}
                      </h3>
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/60 px-1.5 text-xs font-medium text-surface-500 dark:bg-surface-700/60 dark:text-surface-400">
                        {colTasks.length}
                      </span>
                    </div>
                    <button
                      onClick={() => handleInlineCreate('New task', column.id)}
                      className="rounded-md p-1 text-surface-400 hover:bg-white/50 hover:text-surface-600 dark:hover:bg-surface-700/50 transition-colors"
                      title="Add task"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Droppable Area */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'flex-1 space-y-2 px-2 pb-2 transition-colors duration-200 min-h-[80px] overflow-y-auto max-h-[calc(100vh-340px)] scrollbar-thin',
                          snapshot.isDraggingOver && 'bg-brand-100/40 dark:bg-brand-950/20 ring-2 ring-inset ring-brand-300/30 dark:ring-brand-700/30 rounded-lg'
                        )}
                      >
                        {colTasks.map((task, index) => (
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={index}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                style={{
                                  ...dragProvided.draggableProps.style,
                                  transition: dragSnapshot.isDragging
                                    ? undefined
                                    : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
                                }}
                                onClick={() => setSelectedTaskId(task.id)}
                              >
                                <TaskCard
                                  task={task}
                                  isDragging={dragSnapshot.isDragging}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}

                        {colTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex h-20 items-center justify-center">
                            <p className="text-xs text-surface-400">
                              Drag tasks here
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>

                  {/* Inline quick add at bottom */}
                  <div className="px-2 pb-2">
                    <InlineQuickAdd columnId={column.id} onCreate={handleInlineCreate} />
                  </div>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Task Detail Side Panel */}
      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handleUpdateTask}
        />
      )}
    </div>
  );
}
