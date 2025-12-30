import { config, ServiceEntry } from '../config.js';
import { getCircuitBreaker, CircuitState } from './circuit-breaker.js';
import { logger } from '../utils/logger.js';
import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs: number;
  circuitState: CircuitState;
  error?: string;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: ServiceHealth[];
  redis: { status: 'connected' | 'disconnected'; latencyMs: number; error?: string };
}

const startTime = Date.now();

// ---------------------------------------------------------------------------
// Check a single downstream service
// ---------------------------------------------------------------------------

async function checkService(entry: ServiceEntry): Promise<ServiceHealth> {
  const breaker = getCircuitBreaker(entry.name);
  const circuitState = breaker.getState();
  const start = Date.now();

  // If the circuit is open, report degraded without hitting the service
  if (circuitState === CircuitState.OPEN) {
    return {
      name: entry.name,
      status: 'degraded',
      latencyMs: 0,
      circuitState,
      error: 'Circuit breaker is open',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${entry.url}${entry.healthPath}`, {
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { name: entry.name, status: 'healthy', latencyMs, circuitState };
    }

    return {
      name: entry.name,
      status: 'unhealthy',
      latencyMs,
      circuitState,
      error: `HTTP ${response.status}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      name: entry.name,
      status: 'unhealthy',
      latencyMs,
      circuitState,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Check Redis
// ---------------------------------------------------------------------------

async function checkRedis(): Promise<HealthReport['redis']> {
  const start = Date.now();
  let redis: Redis | null = null;

  try {
    redis = new Redis(config.redisUrl, {
      connectTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    redis.on('error', () => {}); // Suppress unhandled error events

    await redis.connect();
    await redis.ping();
    const latencyMs = Date.now() - start;

    await redis.quit();
    return { status: 'connected', latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (redis) {
      try {
        await redis.quit();
      } catch {
        // Ignore close errors
      }
    }
    return {
      status: 'disconnected',
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Full health check
// ---------------------------------------------------------------------------

export async function performHealthCheck(): Promise<HealthReport> {
  const serviceEntries = Object.values(config.services);

  // Run all checks in parallel
  const [serviceResults, redisResult] = await Promise.all([
    Promise.all(serviceEntries.map(checkService)),
    checkRedis(),
  ]);

  // Determine overall status
  const unhealthyCount = serviceResults.filter((s) => s.status === 'unhealthy').length;
  const degradedCount = serviceResults.filter((s) => s.status === 'degraded').length;
  const redisDown = redisResult.status === 'disconnected';

  let overallStatus: HealthReport['status'] = 'healthy';
  if (redisDown || unhealthyCount > serviceResults.length / 2) {
    overallStatus = 'unhealthy';
  } else if (unhealthyCount > 0 || degradedCount > 0) {
    overallStatus = 'degraded';
  }

  const report: HealthReport = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services: serviceResults,
    redis: redisResult,
  };

  if (overallStatus !== 'healthy') {
    logger.warn('Health check: system not fully healthy', {
      status: overallStatus,
      unhealthy: unhealthyCount,
      degraded: degradedCount,
      redisDown,
    });
  }

  return report;
}
