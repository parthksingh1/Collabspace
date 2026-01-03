// ---------------------------------------------------------------------------
// Role definitions and permission matrix for CollabSpace RBAC / ABAC
// ---------------------------------------------------------------------------

export type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'guest';

export type Resource =
  | 'organization'
  | 'project'
  | 'document'
  | 'board'
  | 'code_session'
  | 'user'
  | 'settings'
  | 'billing'
  | 'audit_log';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'invite' | 'export';

// ---------------------------------------------------------------------------
// Permission matrix: role -> resource -> allowed actions
// ---------------------------------------------------------------------------

const PERMISSION_MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  owner: {
    organization: ['create', 'read', 'update', 'delete', 'manage'],
    project: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    document: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    board: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    code_session: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    user: ['create', 'read', 'update', 'delete', 'manage', 'invite'],
    settings: ['read', 'update', 'manage'],
    billing: ['read', 'update', 'manage'],
    audit_log: ['read', 'export'],
  },

  admin: {
    organization: ['read', 'update'],
    project: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    document: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    board: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    code_session: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    user: ['read', 'update', 'invite', 'manage'],
    settings: ['read', 'update'],
    billing: ['read'],
    audit_log: ['read'],
  },

  member: {
    organization: ['read'],
    project: ['create', 'read', 'update'],
    document: ['create', 'read', 'update'],
    board: ['create', 'read', 'update'],
    code_session: ['create', 'read', 'update'],
    user: ['read'],
    settings: ['read'],
    billing: [],
    audit_log: [],
  },

  viewer: {
    organization: ['read'],
    project: ['read'],
    document: ['read'],
    board: ['read'],
    code_session: ['read'],
    user: ['read'],
    settings: [],
    billing: [],
    audit_log: [],
  },

  guest: {
    organization: [],
    project: ['read'],
    document: ['read'],
    board: ['read'],
    code_session: ['read'],
    user: [],
    settings: [],
    billing: [],
    audit_log: [],
  },
};

// ---------------------------------------------------------------------------
// Role hierarchy — higher numeric value = more authority
// ---------------------------------------------------------------------------

const ROLE_HIERARCHY: Record<Role, number> = {
  guest: 0,
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

// ---------------------------------------------------------------------------
// Core RBAC functions
// ---------------------------------------------------------------------------

/**
 * Check whether a given role has permission to perform an action on a resource.
 */
export function checkPermission(
  userRole: string,
  resource: Resource,
  action: Action,
): boolean {
  const role = userRole as Role;
  const permissions = PERMISSION_MATRIX[role];
  if (!permissions) return false;

  const allowedActions = permissions[resource];
  if (!allowedActions) return false;

  return allowedActions.includes(action);
}

/**
 * Get all flattened permission strings for a role (e.g., "document:create").
 */
export function getRolePermissions(roleName: string): string[] {
  const role = roleName as Role;
  const matrix = PERMISSION_MATRIX[role];
  if (!matrix) return [];

  const permissions: string[] = [];
  for (const [resource, actions] of Object.entries(matrix)) {
    if (actions) {
      for (const action of actions) {
        permissions.push(`${resource}:${action}`);
      }
    }
  }

  return permissions;
}

/**
 * Check if roleA has equal or higher authority than roleB.
 */
export function hasHigherOrEqualRole(roleA: string, roleB: string): boolean {
  return (ROLE_HIERARCHY[roleA as Role] ?? -1) >= (ROLE_HIERARCHY[roleB as Role] ?? -1);
}

/**
 * Get all roles with at least the given authority level.
 */
export function getRolesAtOrAbove(role: string): Role[] {
  const threshold = ROLE_HIERARCHY[role as Role] ?? 0;
  return (Object.entries(ROLE_HIERARCHY) as [Role, number][])
    .filter(([, level]) => level >= threshold)
    .map(([r]) => r);
}

// ---------------------------------------------------------------------------
// ABAC condition helpers
// ---------------------------------------------------------------------------

export interface AbacContext {
  userId: string;
  userRole: string;
  resourceOwnerId?: string;
  orgId?: string;
  userOrgId?: string;
  timestamp?: Date;
}

/**
 * Check if the user is the owner of the resource.
 */
export function isOwner(ctx: AbacContext): boolean {
  return ctx.userId === ctx.resourceOwnerId;
}

/**
 * Check if the user belongs to the same organization as the resource.
 */
export function isMember(ctx: AbacContext): boolean {
  if (!ctx.orgId || !ctx.userOrgId) return false;
  return ctx.orgId === ctx.userOrgId;
}

/**
 * Time-based access: check if current time is within business hours (9-17 UTC, weekdays).
 */
export function isWithinBusinessHours(ctx: AbacContext): boolean {
  const now = ctx.timestamp ?? new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isWeekday = day >= 1 && day <= 5;
  const isBusinessHour = hour >= 9 && hour < 17;
  return isWeekday && isBusinessHour;
}

/**
 * Combined ABAC check: RBAC permission + ABAC conditions.
 */
export function checkAbacPermission(
  ctx: AbacContext,
  resource: Resource,
  action: Action,
  options?: {
    requireOwnership?: boolean;
    requireMembership?: boolean;
    requireBusinessHours?: boolean;
  },
): boolean {
  // First check RBAC
  if (!checkPermission(ctx.userRole, resource, action)) {
    // Even if RBAC denies, allow if user is the resource owner for update/delete
    if (
      (action === 'update' || action === 'delete') &&
      isOwner(ctx)
    ) {
      // Owners of their own resources can update/delete even as viewers
      // but NOT guests
      if (ctx.userRole === 'guest') return false;
      // Fall through to ABAC checks
    } else {
      return false;
    }
  }

  if (options?.requireOwnership && !isOwner(ctx)) {
    return false;
  }

  if (options?.requireMembership && !isMember(ctx)) {
    return false;
  }

  if (options?.requireBusinessHours && !isWithinBusinessHours(ctx)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Utility: validate role string
// ---------------------------------------------------------------------------

const VALID_ROLES: Role[] = ['owner', 'admin', 'member', 'viewer', 'guest'];

export function isValidRole(role: string): role is Role {
  return VALID_ROLES.includes(role as Role);
}
