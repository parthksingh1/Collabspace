export interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  bcryptRounds: number;
  redisUrl: string;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  corsOrigins: string[];
  emailVerificationTtl: number;
  passwordResetTtl: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function loadConfig(): Config {
  return {
    port: parseInt(requireEnv('AUTH_PORT', '4002'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    jwtSecret: requireEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
    jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
    jwtAccessExpiry: requireEnv('JWT_ACCESS_EXPIRY', '15m'),
    jwtRefreshExpiry: requireEnv('JWT_REFRESH_EXPIRY', '7d'),
    bcryptRounds: parseInt(requireEnv('BCRYPT_ROUNDS', '12'), 10),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collabspace'),
    supabaseUrl: requireEnv('SUPABASE_URL', 'http://localhost:54321'),
    supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY', ''),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
    emailVerificationTtl: parseInt(requireEnv('EMAIL_VERIFICATION_TTL', '86400'), 10),
    passwordResetTtl: parseInt(requireEnv('PASSWORD_RESET_TTL', '3600'), 10),
    rateLimitWindowMs: parseInt(requireEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    rateLimitMaxRequests: parseInt(requireEnv('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  };
}

export const config = loadConfig();
