export interface WsGatewayConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  redisUrl: string;
  kafkaBrokers: string[];
  shardId: string;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  /** How often this shard re-asserts its registry entry. Also the worst-case
   *  time for the registry to heal after Redis loses its data. */
  shardHeartbeatIntervalMs: number;
  /** How often the local hash ring is rebuilt from the registry. */
  shardRegistryRefreshMs: number;
  maxRoomCapacity: number;
  rateLimitMessagesPerSecond: number;
  rateLimitBurstSize: number;
  metricsPort: number;
  corsOrigins: string[];
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function loadConfig(): WsGatewayConfig {
  return {
    port: parseInt(process.env.PORT ?? requireEnv('WS_GATEWAY_PORT', '4001'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    jwtSecret: requireEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    shardId: requireEnv('SHARD_ID', `shard-${process.pid}`),
    heartbeatIntervalMs: parseInt(requireEnv('HEARTBEAT_INTERVAL_MS', '30000'), 10),
    heartbeatTimeoutMs: parseInt(requireEnv('HEARTBEAT_TIMEOUT_MS', '60000'), 10),
    shardHeartbeatIntervalMs: parseInt(requireEnv('SHARD_HEARTBEAT_INTERVAL_MS', '30000'), 10),
    shardRegistryRefreshMs: parseInt(requireEnv('SHARD_REGISTRY_REFRESH_MS', '60000'), 10),
    maxRoomCapacity: parseInt(requireEnv('MAX_ROOM_CAPACITY', '100'), 10),
    rateLimitMessagesPerSecond: parseInt(requireEnv('RATE_LIMIT_MESSAGES_PER_SECOND', '50'), 10),
    rateLimitBurstSize: parseInt(requireEnv('RATE_LIMIT_BURST_SIZE', '100'), 10),
    metricsPort: parseInt(requireEnv('METRICS_PORT', '9101'), 10),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
  };
}

export const config = loadConfig();
