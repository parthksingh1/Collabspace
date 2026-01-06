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
  maxBoardElements: number;
  snapshotInterval: number;
  exportMaxWidth: number;
  exportMaxHeight: number;
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
    port: parseInt(requireEnv('BOARD_PORT', '4005'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collabspace'),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    kafkaClientId: requireEnv('KAFKA_CLIENT_ID', 'board-service'),
    kafkaGroupId: requireEnv('KAFKA_GROUP_ID', 'board-service-group'),
    aiServiceUrl: requireEnv('AI_SERVICE_URL', 'http://localhost:4010'),
    maxBoardElements: parseInt(requireEnv('MAX_BOARD_ELEMENTS', '5000'), 10),
    snapshotInterval: parseInt(requireEnv('SNAPSHOT_INTERVAL', '50'), 10),
    exportMaxWidth: parseInt(requireEnv('EXPORT_MAX_WIDTH', '4096'), 10),
    exportMaxHeight: parseInt(requireEnv('EXPORT_MAX_HEIGHT', '4096'), 10),
  };
}

export const config = loadConfig();
