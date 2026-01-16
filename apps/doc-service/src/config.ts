export interface DocServiceConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  kafkaBrokers: string[];
  kafkaGroupId: string;
  corsOrigins: string[];
  jwtSecret: string;
  snapshotThreshold: number;
  updateBatchWindowMs: number;
  maxDocumentSizeBytes: number;
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function loadConfig(): DocServiceConfig {
  return {
    port: parseInt(requireEnv('DOC_SERVICE_PORT', '4003'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collabspace'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    kafkaGroupId: requireEnv('KAFKA_GROUP_ID', 'doc-service'),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
    jwtSecret: requireEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
    snapshotThreshold: parseInt(requireEnv('SNAPSHOT_THRESHOLD', '100'), 10),
    updateBatchWindowMs: parseInt(requireEnv('UPDATE_BATCH_WINDOW_MS', '1000'), 10),
    maxDocumentSizeBytes: parseInt(requireEnv('MAX_DOCUMENT_SIZE_BYTES', '10485760'), 10), // 10MB
  };
}

export const config = loadConfig();
