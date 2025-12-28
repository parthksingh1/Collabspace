import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Public paths that do not require authentication
// ---------------------------------------------------------------------------

const PUBLIC_PATHS: RegExp[] = [
  /^\/health$/,
  /^\/metrics$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/refresh$/,
  /^\/api\/auth\/forgot-password$/,
  /^\/api\/auth\/reset-password$/,
  /^\/api\/auth\/verify-email$/,
  /^\/api\/auth\/demo-login$/,
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(path));
}

// ---------------------------------------------------------------------------
// Token payload type
// ---------------------------------------------------------------------------

interface AccessTokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  orgId?: string;
  type: 'access';
}

// ---------------------------------------------------------------------------
// Augment Express Request
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      gatewayUser?: AccessTokenPayload;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for public paths
  if (isPublicPath(req.path)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header is required' },
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid authorization format. Use: Bearer <token>' },
    });
    return;
  }

  const token = parts[1];

  // Demo token bypass for development without real JWT infrastructure
  if (token.endsWith('.demo')) {
    req.gatewayUser = {
      userId: '00000000-0000-0000-0000-000000000002',
      email: 'admin@collabspace.io',
      role: 'owner',
      orgId: '00000000-0000-0000-0000-000000000001',
      type: 'access',
    } as AccessTokenPayload;
    req.headers['x-user-id'] = '00000000-0000-0000-0000-000000000002';
    req.headers['x-user-email'] = 'admin@collabspace.io';
    req.headers['x-user-role'] = 'owner';
    req.headers['x-user-org-id'] = '00000000-0000-0000-0000-000000000001';
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'collabspace-auth',
      audience: 'collabspace',
    }) as AccessTokenPayload;

    if (payload.type !== 'access') {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token type' },
      });
      return;
    }

    // Attach user context to request for downstream services
    req.gatewayUser = payload;

    // Forward user identity as headers so downstream services can trust
    // the gateway's verification without re-verifying the JWT
    req.headers['x-user-id'] = payload.userId;
    req.headers['x-user-email'] = payload.email;
    req.headers['x-user-role'] = payload.role;
    if (payload.orgId) {
      req.headers['x-user-org-id'] = payload.orgId;
    }

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' },
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT at gateway', { message: err.message, ip: req.ip });
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid access token' },
      });
      return;
    }

    logger.error('Auth middleware error', {
      message: err instanceof Error ? err.message : String(err),
    });

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Authentication check failed' },
    });
  }
}
