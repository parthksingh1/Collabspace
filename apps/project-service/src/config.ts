export interface Config {
  port: number;
  nodeEnv: string;
  redisUrl: string;
  databaseUrl: string;
  corsOrigins: string[];
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaGroupId: string;
  aiServiceUrl: string;
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
    port: parseInt(requireEnv('PROJECT_PORT', '4006'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collabspace'),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    kafkaClientId: requireEnv('KAFKA_CLIENT_ID', 'project-service'),
    kafkaGroupId: requireEnv('KAFKA_GROUP_ID', 'project-service-group'),
    aiServiceUrl: requireEnv('AI_SERVICE_URL', 'http://localhost:4010'),
  };
}

export const config = loadConfig();
