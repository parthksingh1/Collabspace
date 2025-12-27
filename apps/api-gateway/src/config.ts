// ---------------------------------------------------------------------------
// API Gateway configuration and service registry
// ---------------------------------------------------------------------------

export interface ServiceEntry {
  name: string;
  url: string;
  healthPath: string;
  timeout: number;
}

export interface GatewayConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  redisUrl: string;
  corsOrigins: string[];
  services: Record<string, ServiceEntry>;
  globalRateLimit: { windowMs: number; max: number };
}

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: GatewayConfig = {
  port: parseInt(env('GATEWAY_PORT', '4000'), 10),
  nodeEnv: env('NODE_ENV', 'development'),
  jwtSecret: env('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),

  services: {
    auth: {
      name: 'auth-service',
      url: env('AUTH_SERVICE_URL', 'http://localhost:4002'),
      healthPath: '/health',
      timeout: 10000,
    },
    documents: {
      name: 'doc-service',
      url: env('DOC_SERVICE_URL', 'http://localhost:4003'),
      healthPath: '/health',
      timeout: 15000,
    },
    code: {
      name: 'code-service',
      url: env('CODE_SERVICE_URL', 'http://localhost:4004'),
      healthPath: '/health',
      timeout: 30000,
    },
    boards: {
      name: 'board-service',
      url: env('BOARD_SERVICE_URL', 'http://localhost:4005'),
      healthPath: '/health',
      timeout: 15000,
    },
    projects: {
      name: 'project-service',
      url: env('PROJECT_SERVICE_URL', 'http://localhost:4006'),
      healthPath: '/health',
      timeout: 15000,
    },
    ai: {
      name: 'ai-service',
      url: env('AI_SERVICE_URL', 'http://localhost:4008'),
      healthPath: '/health',
      timeout: 60000,
    },
    notifications: {
      name: 'notification-service',
      url: env('NOTIFICATION_SERVICE_URL', 'http://localhost:4007'),
      healthPath: '/health',
      timeout: 10000,
    },
  },

  globalRateLimit: {
    windowMs: parseInt(env('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(env('RATE_LIMIT_MAX', '200'), 10),
  },
};
