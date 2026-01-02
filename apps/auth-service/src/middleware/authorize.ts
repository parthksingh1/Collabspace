import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import {
  checkPermission,
  checkAbacPermission,
  Resource,
  Action,
  AbacContext,
  Role,
} from '../services/rbac.service.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// RBAC middleware: authorize(...roles)
// Restricts access to users who have one of the specified roles.
// ---------------------------------------------------------------------------

export function authorize(...roles: (Role | string)[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const userRole = req.user.role;
    if (!roles.includes(userRole)) {
      logger.warn('Authorization denied (role)', {
        userId: req.user.userId,
        userRole,
        requiredRoles: roles,
        path: req.path,
      });
      next(new ForbiddenError('You do not have permission to access this resource'));
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// ABAC middleware: authorizeAction(resource, action)
// Checks the role-permission matrix for a specific resource/action pair.
// ---------------------------------------------------------------------------

export function authorizeAction(resource: Resource, action: Action) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const hasPermission = checkPermission(req.user.role, resource, action);

    if (!hasPermission) {
      logger.warn('Authorization denied (action)', {
        userId: req.user.userId,
        userRole: req.user.role,
        resource,
        action,
        path: req.path,
      });
      next(new ForbiddenError(`You do not have permission to ${action} ${resource}`));
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// ABAC middleware with ownership and membership checks
// ---------------------------------------------------------------------------

export interface AbacOptions {
  resource: Resource;
  action: Action;
  /** Function to extract resource owner ID from the request */
  getResourceOwnerId?: (req: Request) => string | undefined;
  /** Function to extract resource org ID from the request */
  getResourceOrgId?: (req: Request) => string | undefined;
  requireOwnership?: boolean;
  requireMembership?: boolean;
  requireBusinessHours?: boolean;
}

export function authorizeAbac(options: AbacOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const ctx: AbacContext = {
      userId: req.user.userId,
      userRole: req.user.role,
      resourceOwnerId: options.getResourceOwnerId?.(req),
      orgId: options.getResourceOrgId?.(req),
      userOrgId: req.user.orgId,
      timestamp: new Date(),
    };

    const hasPermission = checkAbacPermission(ctx, options.resource, options.action, {
      requireOwnership: options.requireOwnership,
      requireMembership: options.requireMembership,
      requireBusinessHours: options.requireBusinessHours,
    });

    if (!hasPermission) {
      logger.warn('Authorization denied (ABAC)', {
        userId: req.user.userId,
        userRole: req.user.role,
        resource: options.resource,
        action: options.action,
        path: req.path,
      });
      next(new ForbiddenError(`You do not have permission to ${options.action} this ${options.resource}`));
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Self-or-admin guard: user can only access their own resource, or admins+
// ---------------------------------------------------------------------------

export function selfOrAdmin(userIdParam = 'id') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const targetUserId = req.params[userIdParam];
    const isSelf = req.user.userId === targetUserId;
    const isAdminOrAbove = ['admin', 'owner'].includes(req.user.role);

    if (!isSelf && !isAdminOrAbove) {
      next(new ForbiddenError('You can only access your own resource'));
      return;
    }

    next();
  };
}
