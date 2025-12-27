import { Request, Response, NextFunction, Router } from 'express';
import client from 'prom-client';
import { getAllCircuitBreakers, CircuitState } from '../services/circuit-breaker.js';

// ---------------------------------------------------------------------------
// Registry with default metrics (CPU, memory, event loop, etc.)
// ---------------------------------------------------------------------------

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'collabspace_gateway_' });

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

/** Total HTTP requests handled by the gateway */
const httpRequestsTotal = new client.Counter({
  name: 'collabspace_gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'] as const,
  registers: [register],
});

/** HTTP request duration histogram */
const httpRequestDuration = new client.Histogram({
  name: 'collabspace_gateway_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'path', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** HTTP error rate */
const httpErrorsTotal = new client.Counter({
  name: 'collabspace_gateway_http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx)',
  labelNames: ['method', 'path', 'status_code'] as const,
  registers: [register],
});

/** Active connections gauge */
const activeConnections = new client.Gauge({
  name: 'collabspace_gateway_active_connections',
  help: 'Number of currently active connections',
  registers: [register],
});

/** Circuit breaker state gauge (0 = closed, 1 = half-open, 2 = open) */
const circuitBreakerState = new client.Gauge({
  name: 'collabspace_gateway_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'] as const,
  registers: [register],
});

/** Proxied request latency per downstream service */
const proxyDuration = new client.Histogram({
  name: 'collabspace_gateway_proxy_duration_seconds',
  help: 'Latency of proxied requests to downstream services',
  labelNames: ['service', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

/** Rate limit rejections */
const rateLimitRejectionsTotal = new client.Counter({
  name: 'collabspace_gateway_rate_limit_rejections_total',
  help: 'Total number of requests rejected by rate limiter',
  labelNames: ['tier'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// State mapping for circuit breaker gauge
// ---------------------------------------------------------------------------

function circuitStateToNumber(state: CircuitState): number {
  switch (state) {
    case CircuitState.CLOSED:
      return 0;
    case CircuitState.HALF_OPEN:
      return 1;
    case CircuitState.OPEN:
      return 2;
    default:
      return -1;
  }
}

// ---------------------------------------------------------------------------
// Collect circuit breaker metrics (called before scrape)
// ---------------------------------------------------------------------------

function collectCircuitBreakerMetrics(): void {
  try {
    const breakers = getAllCircuitBreakers();
    for (const [name, breaker] of breakers) {
      circuitBreakerState.labels(name).set(circuitStateToNumber(breaker.getState()));
    }
  } catch {
    // Circuit breaker registry may not be initialized yet
  }
}

// ---------------------------------------------------------------------------
// Request metrics middleware
// ---------------------------------------------------------------------------

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  activeConnections.inc();

  const start = process.hrtime.bigint();

  // Normalize path to avoid high cardinality
  const normalizedPath = normalizePath(req.path);

  res.on('finish', () => {
    activeConnections.dec();

    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;
    const statusCode = res.statusCode.toString();

    httpRequestsTotal.labels(req.method, normalizedPath, statusCode).inc();
    httpRequestDuration.labels(req.method, normalizedPath, statusCode).observe(durationSec);

    if (res.statusCode >= 400) {
      httpErrorsTotal.labels(req.method, normalizedPath, statusCode).inc();
    }
  });

  next();
}

// ---------------------------------------------------------------------------
// Metrics endpoint router
// ---------------------------------------------------------------------------

export const metricsRouter = Router();

metricsRouter.get('/metrics', async (_req: Request, res: Response) => {
  try {
    collectCircuitBreakerMetrics();
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(String(err));
  }
});

// ---------------------------------------------------------------------------
// Public helpers for incrementing metrics from other middleware
// ---------------------------------------------------------------------------

export function recordProxyDuration(service: string, statusCode: number, durationSec: number): void {
  proxyDuration.labels(service, statusCode.toString()).observe(durationSec);
}

export function recordRateLimitRejection(tier: string): void {
  rateLimitRejectionsTotal.labels(tier).inc();
}

// ---------------------------------------------------------------------------
// Normalize paths to reduce label cardinality
//
// /api/documents/abc-123 -> /api/documents/:id
// /api/projects/abc-123/tasks/xyz -> /api/projects/:id/tasks/:id
// ---------------------------------------------------------------------------

function normalizePath(path: string): string {
  return path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id',
  ).replace(
    /\/[a-zA-Z0-9_-]{20,}/g,
    '/:id',
  );
}
