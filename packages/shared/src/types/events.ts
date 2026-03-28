// ─── Base Event Interface ──────────────────────────────────────────

export interface BaseEvent<T extends string = string, P = unknown> {
  type: T;
  payload: P;
  timestamp: number;
  traceId: string;
  source: string;
}

// ─── Document Events ───────────────────────────────────────────────

export interface DocumentCreatedPayload {
  documentId: string;
  title: string;
  workspaceId: string;
  createdBy: string;
}

export interface DocumentUpdatedPayload {
  documentId: string;
  version: number;
  updatedBy: string;
  changes: Record<string, unknown>;
}

export interface DocumentDeletedPayload {
  documentId: string;
  deletedBy: string;
}

export interface CollaboratorJoinedPayload {
  documentId: string;
  userId: string;
  name: string;
  avatar: string | null;
  cursorColor: string;
}

export interface CollaboratorLeftPayload {
  documentId: string;
  userId: string;
}

export type DocumentEvent =
  | BaseEvent<'document.created', DocumentCreatedPayload>
  | BaseEvent<'document.updated', DocumentUpdatedPayload>
  | BaseEvent<'document.deleted', DocumentDeletedPayload>
  | BaseEvent<'document.collaborator_joined', CollaboratorJoinedPayload>
  | BaseEvent<'document.collaborator_left', CollaboratorLeftPayload>;

// ─── Code Events ───────────────────────────────────────────────────

export interface FileCreatedPayload {
  fileId: string;
  name: string;
  language: string;
  workspaceId: string;
  createdBy: string;
}

export interface FileUpdatedPayload {
  fileId: string;
  version: number;
  updatedBy: string;
  diff: string;
}

export interface ExecutionStartedPayload {
  executionId: string;
  fileId: string;
  language: string;
  userId: string;
}

export interface ExecutionCompletedPayload {
  executionId: string;
  fileId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type CodeEvent =
  | BaseEvent<'code.file_created', FileCreatedPayload>
  | BaseEvent<'code.file_updated', FileUpdatedPayload>
  | BaseEvent<'code.execution_started', ExecutionStartedPayload>
  | BaseEvent<'code.execution_completed', ExecutionCompletedPayload>;

// ─── Project Events ────────────────────────────────────────────────

export interface TaskCreatedPayload {
  taskId: string;
  title: string;
  projectId: string;
  assigneeId: string | null;
  createdBy: string;
}

export interface TaskUpdatedPayload {
  taskId: string;
  changes: Record<string, unknown>;
  updatedBy: string;
}

export interface SprintStartedPayload {
  sprintId: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface SprintCompletedPayload {
  sprintId: string;
  projectId: string;
  completedTasks: number;
  totalTasks: number;
  velocity: number;
}

export type ProjectEvent =
  | BaseEvent<'project.task_created', TaskCreatedPayload>
  | BaseEvent<'project.task_updated', TaskUpdatedPayload>
  | BaseEvent<'project.sprint_started', SprintStartedPayload>
  | BaseEvent<'project.sprint_completed', SprintCompletedPayload>;

// ─── AI Events ─────────────────────────────────────────────────────

export interface AgentStartedPayload {
  agentId: string;
  agentType: string;
  taskDescription: string;
  userId: string;
}

export interface AgentCompletedPayload {
  agentId: string;
  agentType: string;
  result: Record<string, unknown>;
  durationMs: number;
  tokensUsed: number;
}

export interface SuggestionGeneratedPayload {
  suggestionId: string;
  agentId: string;
  type: 'code' | 'text' | 'task' | 'review';
  content: string;
  confidence: number;
  targetEntityId: string;
}

export type AIEvent =
  | BaseEvent<'ai.agent_started', AgentStartedPayload>
  | BaseEvent<'ai.agent_completed', AgentCompletedPayload>
  | BaseEvent<'ai.suggestion_generated', SuggestionGeneratedPayload>;

// ─── System Events ─────────────────────────────────────────────────

export interface UserConnectedPayload {
  userId: string;
  socketId: string;
  roomIds: string[];
}

export interface UserDisconnectedPayload {
  userId: string;
  socketId: string;
  reason: string;
}

export interface SystemErrorPayload {
  code: string;
  message: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, unknown>;
}

export type SystemEvent =
  | BaseEvent<'system.user_connected', UserConnectedPayload>
  | BaseEvent<'system.user_disconnected', UserDisconnectedPayload>
  | BaseEvent<'system.error', SystemErrorPayload>;

// ─── Union of All Events ───────────────────────────────────────────

export type AppEvent =
  | DocumentEvent
  | CodeEvent
  | ProjectEvent
  | AIEvent
  | SystemEvent;

// ─── Event type extraction helper ──────────────────────────────────

export type EventType = AppEvent['type'];

export type EventPayload<T extends EventType> = Extract<AppEvent, { type: T }>['payload'];
