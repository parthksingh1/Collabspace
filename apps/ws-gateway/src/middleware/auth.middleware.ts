import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import jwt from 'jsonwebtoken';
import { URL } from 'node:url';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  role?: string;
  error?: string;
}

// ── Token extraction ──────────────────────────────────────────────────────────

function extractTokenFromQuery(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

function extractTokenFromCookie(req: IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'access_token' && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

function extractTokenFromHeader(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;

  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0]!.toLowerCase() === 'bearer') {
    return parts[1]!;
  }
  return null;
}

// ── Authentication ────────────────────────────────────────────────────────────

export function authenticateUpgrade(req: IncomingMessage): AuthResult {
  // Try multiple sources for the token
  const token =
    extractTokenFromQuery(req) ??
    extractTokenFromHeader(req) ??
    extractTokenFromCookie(req);

  if (!token) {
    logger.warn('WebSocket auth failed: no token provided', {
      url: req.url,
      ip: req.socket.remoteAddress,
    });
    return { authenticated: false, error: 'NO_TOKEN' };
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    if (!payload.sub) {
      return { authenticated: false, error: 'INVALID_TOKEN_PAYLOAD' };
    }

    return {
      authenticated: true,
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch (err) {
    const jwtError = err as jwt.JsonWebTokenError;

    if (jwtError.name === 'TokenExpiredError') {
      logger.warn('WebSocket auth failed: token expired', { ip: req.socket.remoteAddress });
      return { authenticated: false, error: 'TOKEN_EXPIRED' };
    }

    logger.warn('WebSocket auth failed: invalid token', {
      error: jwtError.message,
      ip: req.socket.remoteAddress,
    });
    return { authenticated: false, error: 'INVALID_TOKEN' };
  }
}

export function rejectUpgrade(socket: Socket, statusCode: number, reason: string): void {
  const body = JSON.stringify({ error: reason });
  const response = [
    `HTTP/1.1 ${statusCode} ${reason}`,
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
    '',
    body,
  ].join('\r\n');

  socket.write(response);
  socket.destroy();
}
