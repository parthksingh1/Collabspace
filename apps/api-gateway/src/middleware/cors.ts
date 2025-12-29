import cors, { CorsOptions } from 'cors';
import { config } from '../config.js';

/**
 * CORS middleware configured with an allowlist of origins, credentials support,
 * and appropriate headers for the CollabSpace API.
 */

const allowedOrigins = new Set(config.corsOrigins);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (e.g., server-to-server, curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    // In development, allow all localhost origins
    if (config.nodeEnv === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],

  exposedHeaders: [
    'X-Request-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],

  maxAge: 86400, // 24 hours preflight cache
};

export const corsMiddleware = cors(corsOptions);
