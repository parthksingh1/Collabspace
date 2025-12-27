import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// Middleware
import { corsMiddleware } from './middleware/cors.js';
import { compressionMiddleware } from './middleware/compression.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { slidingWindowRateLimiter } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';

// Routes
import { proxyRouter } from './routes/proxy.routes.js';

// Metrics and health
import { metricsMiddleware, metricsRouter } from './metrics/prometheus.js';
import { performHealthCheck } from './services/health-check.js';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// ---------------------------------------------------------------------------
// Global middleware (order matters)
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet());

// CORS
app.use(corsMiddleware);

// Response compression
app.use(compressionMiddleware);

// Request ID for distributed tracing
app.use(requestIdMiddleware);

// Prometheus metrics collection
app.use(metricsMiddleware);

// Parse JSON bodies (needed for some middleware, but proxy will forward raw bodies)
app.use(express.json({ limit: '2mb' }));

// Rate limiting
app.use(slidingWindowRateLimiter);

// Request logging
app.use((req: Request, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.headers['x-request-id'] as string,
    ip: req.ip,
  });
  next();
});

// ---------------------------------------------------------------------------
// Health & metrics endpoints (before auth, these are public)
// ---------------------------------------------------------------------------

app.get('/health', async (_req: Request, res: Response) => {
  const report = await performHealthCheck();

  const statusCode = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(report);
});

app.use(metricsRouter);

// ---------------------------------------------------------------------------
// Authentication (applied to all routes below)
// ---------------------------------------------------------------------------

app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Proxy routes to downstream services
// ---------------------------------------------------------------------------

app.use(proxyRouter);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested API endpoint does not exist',
    },
  });
});

// ---------------------------------------------------------------------------
// Centralized error handler
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = app.listen(config.port, () => {
  logger.info(`API Gateway running on port ${config.port} [${config.nodeEnv}]`);
  logger.info(`Registered services: ${Object.keys(config.services).join(', ')}`);
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
