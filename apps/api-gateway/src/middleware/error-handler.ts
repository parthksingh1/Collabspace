import { Request, Response, NextFunction } from 'express';
import { CircuitBreakerOpenError } from '../services/circuit-breaker.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Standard API error response format
// ---------------------------------------------------------------------------

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    retryAfter?: number;
    stack?: string;
  };
}

// ---------------------------------------------------------------------------
// Known error shapes
// ---------------------------------------------------------------------------

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  status?: number;
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.headers['x-request-id'] as string | undefined;

  // Circuit breaker open
  if (err instanceof CircuitBreakerOpenError) {
    const retryAfter = Math.max(1, Math.ceil((err.retryAfter - Date.now()) / 1000));

    logger.warn('Request rejected by circuit breaker', {
      service: err.serviceName,
      requestId,
      retryAfter,
    });

    res.setHeader('Retry-After', retryAfter);
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: `Service "${err.serviceName}" is temporarily unavailable. Please try again later.`,
        requestId,
        retryAfter,
      },
    };
    res.status(503).json(body);
    return;
  }

  // Proxy errors (ECONNREFUSED, ETIMEDOUT, etc.)
  const statusCode = err.statusCode ?? err.status ?? 500;
  const code = err.code ?? (statusCode === 502 ? 'BAD_GATEWAY' : 'INTERNAL_ERROR');

  // Determine user-facing message
  let message: string;
  if (statusCode === 502 || code === 'ECONNREFUSED') {
    message = 'The upstream service is not available. Please try again later.';
  } else if (statusCode >= 500) {
    message = 'An internal server error occurred';
  } else {
    message = err.message;
  }

  logger.error('Gateway error', {
    statusCode,
    code,
    message: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    requestId,
    path: req.path,
    method: req.method,
  });

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      requestId,
      ...(err.retryAfter && { retryAfter: err.retryAfter }),
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(body);
}
