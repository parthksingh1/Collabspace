export interface ModelConfig {
  fast: string;
  pro: string;
  embed: string;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  models: ModelConfig;
  priority: number;
  enabled: boolean;
  rateLimit: { requestsPerMinute: number; tokensPerMinute: number };
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  maxConcurrentRequests: number;
}

export interface Config {
  port: number;
  nodeEnv: string;
  redisUrl: string;
  kafkaBrokers: string[];
  corsOrigins: string[];

  geminiApiKey: string;
  openaiApiKey: string;

  providers: Record<string, ProviderConfig>;

  userRateLimit: RateLimitConfig;
  agentMaxIterations: number;
  agentConcurrencyLimit: number;

  pineconeApiKey: string;
  pineconeEnvironment: string;
  pineconeIndexName: string;

  codeServiceUrl: string;
  projectServiceUrl: string;
  docServiceUrl: string;
  notificationServiceUrl: string;

  memoryShortTermTtl: number;
  memoryMaxContextTokens: number;
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function loadConfig(): Config {
  const geminiApiKey = requireEnv('GEMINI_API_KEY', '');
  const openaiApiKey = requireEnv('OPENAI_API_KEY', '');

  return {
    port: parseInt(requireEnv('AI_SERVICE_PORT', '4008'), 10),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    kafkaBrokers: requireEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    corsOrigins: requireEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),

    geminiApiKey,
    openaiApiKey,

    providers: {
      gemini: {
        name: 'gemini',
        apiKey: geminiApiKey,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        models: { fast: 'gemini-2.0-flash', pro: 'gemini-2.5-pro', embed: 'text-embedding-004' },
        priority: 1,
        enabled: geminiApiKey.length > 0,
        rateLimit: { requestsPerMinute: 60, tokensPerMinute: 1_000_000 },
      },
      openai: {
        name: 'openai',
        apiKey: openaiApiKey,
        baseUrl: 'https://api.openai.com/v1',
        models: { fast: 'gpt-4o-mini', pro: 'gpt-4o', embed: 'text-embedding-3-small' },
        priority: 2,
        enabled: openaiApiKey.length > 0,
        rateLimit: { requestsPerMinute: 60, tokensPerMinute: 800_000 },
      },
    },

    userRateLimit: {
      requestsPerMinute: parseInt(requireEnv('USER_RATE_LIMIT_RPM', '30'), 10),
      tokensPerMinute: parseInt(requireEnv('USER_RATE_LIMIT_TPM', '100000'), 10),
      maxConcurrentRequests: parseInt(requireEnv('USER_MAX_CONCURRENT', '5'), 10),
    },

    agentMaxIterations: parseInt(requireEnv('AGENT_MAX_ITERATIONS', '20'), 10),
    agentConcurrencyLimit: parseInt(requireEnv('AGENT_CONCURRENCY_LIMIT', '10'), 10),

    pineconeApiKey: requireEnv('PINECONE_API_KEY', ''),
    pineconeEnvironment: requireEnv('PINECONE_ENVIRONMENT', 'us-east-1'),
    pineconeIndexName: requireEnv('PINECONE_INDEX', 'collabspace'),

    codeServiceUrl: requireEnv('CODE_SERVICE_URL', 'http://localhost:4006'),
    projectServiceUrl: requireEnv('PROJECT_SERVICE_URL', 'http://localhost:4004'),
    docServiceUrl: requireEnv('DOC_SERVICE_URL', 'http://localhost:4005'),
    notificationServiceUrl: requireEnv('NOTIFICATION_SERVICE_URL', 'http://localhost:4007'),

    memoryShortTermTtl: parseInt(requireEnv('MEMORY_SHORT_TERM_TTL', '3600'), 10),
    memoryMaxContextTokens: parseInt(requireEnv('MEMORY_MAX_CONTEXT_TOKENS', '8000'), 10),
  };
}

export const config = loadConfig();
