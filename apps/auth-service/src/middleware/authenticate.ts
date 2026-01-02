import { Request, Response, NextFunction } from 'express';
import {
  verifyAccessToken,
  isAccessTokenBlacklisted,
  AccessTokenPayload,
} from '../services/token.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Extend Express Request to include user
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      token?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Authentication middleware
// ---------------------------------------------------------------------------

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError('Authorization header must be in the format: Bearer <token>');
    }

    const token = parts[1];

    // Verify the JWT signature and claims
    const payload = verifyAccessToken(token);

    // Check if the token has been blacklisted (user logged out)
    const blacklisted = await isAccessTokenBlacklisted(token);
    if (blacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // Attach user and raw token to the request
    req.user = payload;
    req.token = token;

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }

    logger.error('Authentication error', {
      message: err instanceof Error ? err.message : String(err),
    });
    next(new UnauthorizedError('Authentication failed'));
  }
}

// ---------------------------------------------------------------------------
// Optional authentication: does not fail if no token is present
// ---------------------------------------------------------------------------

export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      next();
      return;
    }

    const token = parts[1];
    const payload = verifyAccessToken(token);

    const blacklisted = await isAccessTokenBlacklisted(token);
    if (!blacklisted) {
      req.user = payload;
      req.token = token;
    }

    next();
  } catch {
    // Silently continue without auth — this is optional authentication
    next();
  }
}
