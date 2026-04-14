import { Router, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
import { config, ServiceEntry } from '../config.js';
import { getCircuitBreaker, CircuitBreakerOpenError } from '../services/circuit-breaker.js';
import { recordProxyDuration } from '../metrics/prometheus.js';
import { logger } from '../utils/logger.js';

export const proxyRouter = Router();

// ---------------------------------------------------------------------------
// Route-to-service mapping
// ---------------------------------------------------------------------------

interface RouteMapping {
  /** Express route prefix */
  path: string;
  /** Key in config.services */
  serviceKey: string;
  /** Path rewrite: strip gateway prefix */
  stripPrefix: string;
}

const ROUTE_MAPPINGS: RouteMapping[] = [
  { path: '/api/auth',          serviceKey: 'auth',          stripPrefix: '/api' },
  { path: '/api/account',       serviceKey: 'auth',          stripPrefix: '/api' },
  { path: '/api/documents',     serviceKey: 'documents',     stripPrefix: '/api' },
  { path: '/api/code',          serviceKey: 'code',          stripPrefix: '/api' },
  { path: '/api/boards',        serviceKey: 'boards',        stripPrefix: '/api' },
  { path: '/api/projects',      serviceKey: 'projects',      stripPrefix: '/api' },
  { path: '/api/ai',            serviceKey: 'ai',            stripPrefix: '/api' },
  { path: '/api/notifications', serviceKey: 'notifications', stripPrefix: '/api' },
];

// ---------------------------------------------------------------------------
// Create proxy middleware for a service, wrapped with circuit breaker
// ---------------------------------------------------------------------------

function createServiceProxy(mapping: RouteMapping, service: ServiceEntry) {
  const breaker = getCircuitBreaker(service.name);

  // Register circuit breaker events for logging
  breaker.on('state_change', (data) => {
    logger.info(`Circuit breaker state change: ${service.name}`, {
      from: data.previousState,
      to: data.state,
    });
  });

  const proxyOptions: ProxyOptions = {
    target: service.url,
    changeOrigin: true,
    timeout: service.timeout,
    proxyTimeout: service.timeout,

    // Rewrite path: /api/auth/login -> /auth/login
    pathRewrite: {
      [`^${mapping.stripPrefix}`]: '',
    },

    on: {
      proxyReq(proxyReq, req) {
        // Forward the request ID for distributed tracing
        const requestId = (req as Request).headers['x-request-id'];
        if (requestId) {
          proxyReq.setHeader('X-Request-Id', requestId as string);
        }

        // Forward user context headers set by auth middleware
        const userId = (req as Request).headers['x-user-id'];
        const userRole = (req as Request).headers['x-user-role'];
        const userEmail = (req as Request).headers['x-user-email'];
        const userOrgId = (req as Request).headers['x-user-org-id'];

        if (userId) proxyReq.setHeader('X-User-Id', userId as string);
        if (userRole) proxyReq.setHeader('X-User-Role', userRole as string);
        if (userEmail) proxyReq.setHeader('X-User-Email', userEmail as string);
        if (userOrgId) proxyReq.setHeader('X-User-Org-Id', userOrgId as string);

        // Forward the gateway identifier
        proxyReq.setHeader('X-Forwarded-By', 'collabspace-gateway');
      },

      proxyRes(proxyRes, req) {
        const start = (req as Request & { _proxyStartTime?: bigint })._proxyStartTime;
        if (start) {
          const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
          recordProxyDuration(service.name, proxyRes.statusCode ?? 0, durationSec);
        }
      },

      error(err, req, res) {
        logger.error(`Proxy error for ${service.name}`, {
          message: err.message,
          path: (req as Request).path,
          requestId: (req as Request).headers['x-request-id'] as string,
        });

        // Only send a response if headers haven't been sent yet
        if (res && 'headersSent' in res && !res.headersSent && 'status' in res) {
          (res as Response).status(502).json({
            success: false,
            error: {
              code: 'BAD_GATEWAY',
              message: `Service "${service.name}" is not available`,
              requestId: (req as Request).headers['x-request-id'],
            },
          });
        }
      },
    },
  };

  const proxy = createProxyMiddleware(proxyOptions);

  // Wrap with circuit breaker
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Record start time for latency metrics
    (req as Request & { _proxyStartTime?: bigint })._proxyStartTime = process.hrtime.bigint();

    try {
      await breaker.execute(async () => {
        return new Promise<void>((resolve, reject) => {
          // Listen for the response to complete so we can detect errors
          res.on('finish', () => {
            if (res.statusCode >= 500) {
              // Count 5xx as a circuit breaker failure
              reject(new Error(`Upstream returned ${res.statusCode}`));
            } else {
              resolve();
            }
          });

          res.on('error', (err) => {
            reject(err);
          });

          // Delegate to the actual proxy
          proxy(req, res, (err?: unknown) => {
            if (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
            }
            // If proxy calls next() without error, the request was handled
          });
        });
      });
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        const retryAfter = Math.max(1, Math.ceil((err.retryAfter - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfter);

        if (!res.headersSent) {
          res.status(503).json({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: `Service "${service.name}" is temporarily unavailable`,
              retryAfter,
              requestId: req.headers['x-request-id'],
            },
          });
        }
        return;
      }

      // For other errors, pass to the error handler
      if (!res.headersSent) {
        next(err);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Mount all proxy routes
// ---------------------------------------------------------------------------

for (const mapping of ROUTE_MAPPINGS) {
  const service = config.services[mapping.serviceKey];
  if (!service) {
    logger.warn(`Service "${mapping.serviceKey}" not found in config, skipping route ${mapping.path}`);
    continue;
  }

  const handler = createServiceProxy(mapping, service);
  proxyRouter.use(mapping.path, handler);

  logger.info(`Proxy route registered: ${mapping.path} -> ${service.url}`, {
    service: service.name,
    timeout: service.timeout,
  });
}
