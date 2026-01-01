import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.routes.js';
import { logger } from './utils/logger.js';

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '1mb' }));
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
  res.json({ status: 'healthy', service: 'auth-service', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Demo mode — works without database for local development
// ---------------------------------------------------------------------------

const DEMO_USER = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'admin@collabspace.io',
  name: 'Admin User',
  role: 'owner',
  orgId: '00000000-0000-0000-0000-000000000001',
  avatar: null,
  preferences: { theme: 'system', notifications: true, aiSuggestions: true },
};

const DEMO_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDIiLCJlbWFpbCI6ImFkbWluQGNvbGxhYnNwYWNlLmlvIiwicm9sZSI6Im93bmVyIiwib3JnSWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJpYXQiOjE3MTM2NDAwMDAsImV4cCI6MTgxMzY0MDAwMH0.demo';

app.post('/auth/demo-login', (_req: Request, res: Response) => {
  logger.info('Demo login used');
  res.json({
    success: true,
    data: {
      user: DEMO_USER,
      accessToken: DEMO_TOKEN,
      refreshToken: 'demo-refresh-token',
    },
  });
});

app.get('/auth/me', (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.includes('demo')) {
    return res.json({ success: true, data: DEMO_USER });
  }
  next();
});

// ---------------------------------------------------------------------------
// Routes — real auth (requires PostgreSQL)
// ---------------------------------------------------------------------------

app.use('/auth', authRouter);

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
// Start server
// ---------------------------------------------------------------------------

app.listen(config.port, () => {
  logger.info(`Auth service running on port ${config.port} [${config.nodeEnv}]`);
});

export default app;
