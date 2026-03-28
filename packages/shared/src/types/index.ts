// ─── User & Organization ───────────────────────────────────────────

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  timezone: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: 'owner' | 'admin' | 'member' | 'guest';
  orgId: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSettings {
  allowPublicWorkspaces: boolean;
  defaultWorkspaceVisibility: 'public' | 'private';
  ssoEnabled: boolean;
  ssoProvider: string | null;
  enforceMfa: boolean;
  allowedDomains: string[];
  maxWorkspaces: number;
  maxMembersPerWorkspace: number;
}

export interface OrganizationMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  joinedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: OrganizationSettings;
  members: OrganizationMember[];
}

// ─── Workspace ─────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  orgId: string;
  description: string;
  visibility: 'public' | 'private' | 'restricted';
  createdAt: Date;
}

// ─── Documents ─────────────────────────────────────────────────────

export interface DocumentCollaborator {
  userId: string;
  permission: 'view' | 'comment' | 'edit' | 'admin';
  addedAt: Date;
}

export interface Document {
  id: string;
  title: string;
  workspaceId: string;
  content: Record<string, unknown>;
  version: number;
  collaborators: DocumentCollaborator[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Code ──────────────────────────────────────────────────────────

export interface CodeFile {
  id: string;
  name: string;
  language: string;
  workspaceId: string;
  content: string;
  version: number;
}

// ─── Whiteboard ────────────────────────────────────────────────────

export interface WhiteboardElement {
  id: string;
  type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'image' | 'freehand' | 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardData {
  id: string;
  title: string;
  workspaceId: string;
  elements: WhiteboardElement[];
  viewport: Viewport;
}

// ─── Project Management ────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type SprintStatus = 'planning' | 'active' | 'completed' | 'cancelled';

export interface TaskComment {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  assigneeId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  dueDate: Date | null;
  storyPoints: number | null;
  parentId: string | null;
  subtasks: string[];
  comments: TaskComment[];
}

export interface Sprint {
  id: string;
  name: string;
  projectId: string;
  startDate: Date;
  endDate: Date;
  goals: string[];
  status: SprintStatus;
}

export interface Project {
  id: string;
  name: string;
  workspaceId: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  sprints: Sprint[];
}

// ─── Comments & Social ─────────────────────────────────────────────

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  entityId: string;
  entityType: 'document' | 'task' | 'code_file' | 'whiteboard';
  parentId: string | null;
  reactions: Reaction[];
  createdAt: Date;
}

// ─── Notifications ─────────────────────────────────────────────────

export type NotificationType =
  | 'mention'
  | 'assignment'
  | 'comment'
  | 'status_change'
  | 'invitation'
  | 'system'
  | 'ai_suggestion';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  recipientId: string;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ─── AI ────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface AIMessageMetadata {
  model: string;
  tokensUsed: number;
  latencyMs: number;
  provider: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  metadata: AIMessageMetadata | null;
  toolCalls: ToolCall[];
}

export type AgentType = 'planner' | 'developer' | 'reviewer' | 'meeting' | 'knowledge' | 'execution';
export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'observing' | 'error';

export interface AIAgent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  capabilities: string[];
  memory: Record<string, unknown>;
}

// ─── Real-time ─────────────────────────────────────────────────────

export interface WebSocketEvent<T = unknown> {
  type: string;
  payload: T;
  roomId: string;
  userId: string;
  timestamp: number;
}

export interface CRDTUpdate {
  documentId: string;
  update: Uint8Array;
  origin: string;
  timestamp: number;
}

// ─── Audit & Security ──────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ip: string;
  timestamp: Date;
}

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'admin';

export interface Permission {
  resource: string;
  action: PermissionAction;
  conditions: Record<string, unknown>;
}

// ─── Generic Responses ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  metadata: Record<string, unknown>;
}
