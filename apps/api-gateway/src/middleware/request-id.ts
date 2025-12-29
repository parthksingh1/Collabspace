import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Middleware that generates a unique request ID for distributed tracing.
 * If the incoming request already has an X-Request-Id header (e.g., from a
 * load balancer), it is preserved. Otherwise a new one is created.
 *
 * The request ID is set on both the request and response headers.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'] as string | undefined;
  const requestId = existing ?? crypto.randomUUID();

  // Attach to request for downstream services
  req.headers['x-request-id'] = requestId;

  // Echo it back in the response so clients can correlate
  res.setHeader('X-Request-Id', requestId);

  next();
}
