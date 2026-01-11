export interface CodeServiceConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  kafkaBrokers: string[];
  kafkaGroupId: string;
  corsOrigins: string[];
  jwtSecret: string;
  dockerSocketPath: string;
  executionTimeoutMs: number;
  executionMemoryLimitMb: number;
  containerPoolSize: number;
  maxConcurrentExecutions: number;
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function loadConfig(): CodeServiceConfig {
  return {
    port: parseInt(requireEnv('CODE_SERVICE_PORT', '4004'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collabspace'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    kafkaGroupId: requireEnv('KAFKA_GROUP_ID', 'code-service'),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
    jwtSecret: requireEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
    dockerSocketPath: requireEnv('DOCKER_SOCKET_PATH', '/var/run/docker.sock'),
    executionTimeoutMs: parseInt(requireEnv('EXECUTION_TIMEOUT_MS', '10000'), 10),
    executionMemoryLimitMb: parseInt(requireEnv('EXECUTION_MEMORY_LIMIT_MB', '256'), 10),
    containerPoolSize: parseInt(requireEnv('CONTAINER_POOL_SIZE', '5'), 10),
    maxConcurrentExecutions: parseInt(requireEnv('MAX_CONCURRENT_EXECUTIONS', '10'), 10),
  };
}

export const config = loadConfig();
