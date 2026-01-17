import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { documentRouter } from './routes/document.routes.js';
import { startConsumer, stopConsumer } from './kafka/consumer.js';
import { disconnectProducer } from './kafka/producer.js';
import { closeRedis } from './utils/redis.js';
import { closePool } from './utils/db.js';

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();

// ── Global middleware ───────────────────────────────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
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

// ── Health check ────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'doc-service',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ──────────────────────────────────────────────────────────────────

app.use('/documents', documentRouter);

// ── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found' },
  });
});

// ── Error handler ───────────────────────────────────────────────────────────

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

// ── Start server ────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    // Start Kafka consumer
    await startConsumer();
    logger.info('Kafka consumer started');
  } catch (err) {
    logger.warn('Failed to start Kafka consumer (will retry on next message)', {
      error: (err as Error).message,
    });
  }

  app.listen(config.port, () => {
    logger.info(`Doc service running on port ${config.port} [${config.nodeEnv}]`);
  });
}

// ── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await stopConsumer();
    await disconnectProducer();
    await closeRedis();
    await closePool();
  } catch (err) {
    logger.error('Error during shutdown', { error: (err as Error).message });
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

start();

export default app;
