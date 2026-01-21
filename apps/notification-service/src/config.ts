export interface Config {
  port: number;
  nodeEnv: string;
  redisUrl: string;
  databaseUrl: string;
  corsOrigins: string[];
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaGroupId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  emailRateLimit: number;
  emailRateWindow: number;
  deduplicationWindowMs: number;
  batchWindowMs: number;
  batchMaxSize: number;
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
    port: parseInt(requireEnv('NOTIFICATION_PORT', '4007'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collabspace'),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    kafkaClientId: requireEnv('KAFKA_CLIENT_ID', 'notification-service'),
    kafkaGroupId: requireEnv('KAFKA_GROUP_ID', 'notification-service-group'),
    smtpHost: requireEnv('SMTP_HOST', 'localhost'),
    smtpPort: parseInt(requireEnv('SMTP_PORT', '587'), 10),
    smtpUser: requireEnv('SMTP_USER', ''),
    smtpPass: requireEnv('SMTP_PASS', ''),
    smtpFrom: requireEnv('SMTP_FROM', 'CollabSpace <noreply@collabspace.dev>'),
    emailRateLimit: parseInt(requireEnv('EMAIL_RATE_LIMIT', '10'), 10),
    emailRateWindow: parseInt(requireEnv('EMAIL_RATE_WINDOW', '3600'), 10),
    deduplicationWindowMs: parseInt(requireEnv('DEDUP_WINDOW_MS', '300000'), 10),
    batchWindowMs: parseInt(requireEnv('BATCH_WINDOW_MS', '60000'), 10),
    batchMaxSize: parseInt(requireEnv('BATCH_MAX_SIZE', '10'), 10),
  };
}

export const config = loadConfig();
