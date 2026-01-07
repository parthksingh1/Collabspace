import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { boardRouter } from './routes/board.routes.js';
import { logger } from './utils/logger.js';
import { startConsumer } from './kafka/consumer.js';

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-User-Id', 'X-Workspace-Id'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'board-service', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/boards', boardRouter);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found' },
  });
});

// ---------------------------------------------------------------------------
// Centralized error handler
// ---------------------------------------------------------------------------

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  logger.error('Unhandled error', {
    message: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    code,
    statusCode,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode === 500 ? 'An internal server error occurred' : err.message,
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    },
  });
});

// ---------------------------------------------------------------------------
// Start server & Kafka consumer
// ---------------------------------------------------------------------------

app.listen(config.port, () => {
  logger.info(`Board service running on port ${config.port} [${config.nodeEnv}]`);
});

startConsumer().catch((err) => {
  logger.error('Failed to start Kafka consumer', { message: (err as Error).message });
});

export default app;
