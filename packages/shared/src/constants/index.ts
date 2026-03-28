// ─── Kafka Topics ──────────────────────────────────────────────────

export const KAFKA_TOPICS = {
  // Document service
  DOCUMENT_CREATED: 'collabspace.documents.created',
  DOCUMENT_UPDATED: 'collabspace.documents.updated',
  DOCUMENT_DELETED: 'collabspace.documents.deleted',
  DOCUMENT_COLLABORATOR: 'collabspace.documents.collaborator',

  // Code service
  CODE_FILE_CREATED: 'collabspace.code.file-created',
  CODE_FILE_UPDATED: 'collabspace.code.file-updated',
  CODE_EXECUTION_STARTED: 'collabspace.code.execution-started',
  CODE_EXECUTION_COMPLETED: 'collabspace.code.execution-completed',

  // Project service
  TASK_CREATED: 'collabspace.projects.task-created',
  TASK_UPDATED: 'collabspace.projects.task-updated',
  SPRINT_STARTED: 'collabspace.projects.sprint-started',
  SPRINT_COMPLETED: 'collabspace.projects.sprint-completed',

  // AI service
  AI_AGENT_STARTED: 'collabspace.ai.agent-started',
  AI_AGENT_COMPLETED: 'collabspace.ai.agent-completed',
  AI_SUGGESTION: 'collabspace.ai.suggestion',

  // Auth & system
  USER_CREATED: 'collabspace.auth.user-created',
  USER_UPDATED: 'collabspace.auth.user-updated',
  AUDIT_LOG: 'collabspace.system.audit-log',
  NOTIFICATION: 'collabspace.system.notification',

  // Real-time sync
  CRDT_UPDATE: 'collabspace.sync.crdt-update',
  PRESENCE_UPDATE: 'collabspace.sync.presence',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

// ─── Redis Key Prefixes ────────────────────────────────────────────

export const REDIS_KEYS = {
  // Cache
  CACHE_USER: 'cache:user:',
  CACHE_DOCUMENT: 'cache:document:',
  CACHE_WORKSPACE: 'cache:workspace:',
  CACHE_PROJECT: 'cache:project:',
  CACHE_ORG: 'cache:org:',

  // Presence
  PRESENCE_ROOM: 'presence:room:',
  PRESENCE_USER: 'presence:user:',
  PRESENCE_CURSOR: 'presence:cursor:',

  // Locks
  LOCK_DOCUMENT: 'lock:document:',
  LOCK_EXECUTION: 'lock:execution:',
  LOCK_MIGRATION: 'lock:migration:',

  // Sessions
  SESSION: 'session:',
  SESSION_REFRESH: 'session:refresh:',
  SESSION_MFA: 'session:mfa:',

  // Rate limiting
  RATE_LIMIT: 'ratelimit:',
  RATE_LIMIT_API: 'ratelimit:api:',
  RATE_LIMIT_AUTH: 'ratelimit:auth:',

  // AI
  AI_CONVERSATION: 'ai:conversation:',
  AI_MEMORY: 'ai:memory:',
  AI_QUEUE: 'ai:queue:',

  // Pub/Sub channels
  PUBSUB_DOCUMENT: 'pubsub:document:',
  PUBSUB_WORKSPACE: 'pubsub:workspace:',
  PUBSUB_NOTIFICATION: 'pubsub:notification:',
} as const;

// ─── WebSocket Events ──────────────────────────────────────────────

export const WS_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECONNECT: 'reconnect',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',

  // Room management
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  ROOM_STATE: 'room:state',

  // Document collaboration
  DOC_UPDATE: 'document:update',
  DOC_AWARENESS: 'document:awareness',
  DOC_SYNC_STEP1: 'document:sync:step1',
  DOC_SYNC_STEP2: 'document:sync:step2',
  DOC_CURSOR_UPDATE: 'document:cursor:update',

  // Code collaboration
  CODE_UPDATE: 'code:update',
  CODE_CURSOR: 'code:cursor',
  CODE_EXECUTE: 'code:execute',
  CODE_OUTPUT: 'code:output',
  CODE_TERMINAL: 'code:terminal',

  // Whiteboard
  WHITEBOARD_UPDATE: 'whiteboard:update',
  WHITEBOARD_CURSOR: 'whiteboard:cursor',
  WHITEBOARD_VIEWPORT: 'whiteboard:viewport',

  // Presence
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_CURSOR: 'presence:cursor',
  USER_TYPING: 'presence:typing',

  // AI
  AI_MESSAGE: 'ai:message',
  AI_STREAM_START: 'ai:stream:start',
  AI_STREAM_CHUNK: 'ai:stream:chunk',
  AI_STREAM_END: 'ai:stream:end',
  AI_TOOL_CALL: 'ai:tool:call',
  AI_TOOL_RESULT: 'ai:tool:result',

  // Notifications
  NOTIFICATION: 'notification',
  NOTIFICATION_READ: 'notification:read',

  // Project
  TASK_UPDATE: 'project:task:update',
  SPRINT_UPDATE: 'project:sprint:update',
} as const;

export type WSEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

// ─── Permissions ───────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'member' | 'guest';
export type PermAction = 'create' | 'read' | 'update' | 'delete' | 'admin';

export const PERMISSIONS: Record<Role, Record<string, PermAction[]>> = {
  owner: {
    organization: ['create', 'read', 'update', 'delete', 'admin'],
    workspace: ['create', 'read', 'update', 'delete', 'admin'],
    document: ['create', 'read', 'update', 'delete', 'admin'],
    code: ['create', 'read', 'update', 'delete', 'admin'],
    project: ['create', 'read', 'update', 'delete', 'admin'],
    task: ['create', 'read', 'update', 'delete', 'admin'],
    whiteboard: ['create', 'read', 'update', 'delete', 'admin'],
    member: ['create', 'read', 'update', 'delete', 'admin'],
    settings: ['read', 'update', 'admin'],
    billing: ['read', 'update', 'admin'],
    ai: ['create', 'read', 'update', 'delete', 'admin'],
  },
  admin: {
    organization: ['read', 'update'],
    workspace: ['create', 'read', 'update', 'delete'],
    document: ['create', 'read', 'update', 'delete'],
    code: ['create', 'read', 'update', 'delete'],
    project: ['create', 'read', 'update', 'delete'],
    task: ['create', 'read', 'update', 'delete'],
    whiteboard: ['create', 'read', 'update', 'delete'],
    member: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update'],
    billing: ['read'],
    ai: ['create', 'read', 'update', 'delete'],
  },
  member: {
    organization: ['read'],
    workspace: ['create', 'read', 'update'],
    document: ['create', 'read', 'update'],
    code: ['create', 'read', 'update'],
    project: ['read', 'update'],
    task: ['create', 'read', 'update'],
    whiteboard: ['create', 'read', 'update'],
    member: ['read'],
    settings: ['read'],
    billing: [],
    ai: ['create', 'read'],
  },
  guest: {
    organization: ['read'],
    workspace: ['read'],
    document: ['read'],
    code: ['read'],
    project: ['read'],
    task: ['read'],
    whiteboard: ['read'],
    member: ['read'],
    settings: [],
    billing: [],
    ai: ['read'],
  },
};

/**
 * Check if a role has permission to perform an action on a resource.
 */
export function hasPermission(role: Role, resource: string, action: PermAction): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action);
}

// ─── Rate Limits ───────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS: Record<string, Record<string, RateLimitConfig>> = {
  free: {
    api: { windowMs: 60_000, maxRequests: 60 },
    auth: { windowMs: 900_000, maxRequests: 10 },
    ai: { windowMs: 60_000, maxRequests: 5 },
    upload: { windowMs: 3_600_000, maxRequests: 20 },
    websocket: { windowMs: 1_000, maxRequests: 50 },
    search: { windowMs: 60_000, maxRequests: 30 },
  },
  pro: {
    api: { windowMs: 60_000, maxRequests: 300 },
    auth: { windowMs: 900_000, maxRequests: 20 },
    ai: { windowMs: 60_000, maxRequests: 30 },
    upload: { windowMs: 3_600_000, maxRequests: 100 },
    websocket: { windowMs: 1_000, maxRequests: 200 },
    search: { windowMs: 60_000, maxRequests: 100 },
  },
  enterprise: {
    api: { windowMs: 60_000, maxRequests: 1000 },
    auth: { windowMs: 900_000, maxRequests: 50 },
    ai: { windowMs: 60_000, maxRequests: 100 },
    upload: { windowMs: 3_600_000, maxRequests: 500 },
    websocket: { windowMs: 1_000, maxRequests: 1000 },
    search: { windowMs: 60_000, maxRequests: 500 },
  },
};

// ─── Max Values ────────────────────────────────────────────────────

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_COLLABORATORS = 50;
export const MAX_WORKSPACES_FREE = 5;
export const MAX_WORKSPACES_PRO = 50;
export const MAX_WORKSPACES_ENTERPRISE = 500;
export const MAX_MEMBERS_FREE = 10;
export const MAX_MEMBERS_PRO = 100;
export const MAX_MEMBERS_ENTERPRISE = 10000;
export const MAX_TASKS_PER_PROJECT = 10000;
export const MAX_SPRINTS_PER_PROJECT = 100;
export const MAX_AI_CONVERSATION_LENGTH = 100;
export const MAX_AI_TOKENS_PER_REQUEST = 32768;
export const MAX_COMMENT_LENGTH = 10000;
export const MAX_DOCUMENT_TITLE_LENGTH = 255;
export const MAX_WORKSPACE_NAME_LENGTH = 100;
export const MAX_LABEL_LENGTH = 50;
export const MAX_LABELS_PER_TASK = 20;
export const MAX_SUBTASKS = 50;
export const MAX_WHITEBOARD_ELEMENTS = 5000;
export const MAX_CODE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ─── Timeouts & Intervals ──────────────────────────────────────────

export const SESSION_TTL_SECONDS = 7 * 24 * 3600; // 7 days
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days
export const CACHE_TTL_SECONDS = 300; // 5 min
export const PRESENCE_TTL_SECONDS = 30;
export const LOCK_TTL_SECONDS = 30;
export const AI_REQUEST_TIMEOUT_MS = 120_000; // 2 min
export const CODE_EXECUTION_TIMEOUT_MS = 30_000; // 30 sec
export const CRDT_DEBOUNCE_MS = 500;
export const SEARCH_DEBOUNCE_MS = 300;
