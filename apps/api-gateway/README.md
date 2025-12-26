# API Gateway

Central entry point for all CollabSpace API requests. Handles routing, authentication, rate limiting, and circuit breaking.

## Port
`4000` (configurable via `API_GATEWAY_PORT`)

## Responsibilities
- Reverse proxy to all backend services via `http-proxy-middleware`
- JWT verification at the gateway level (injects X-User-* headers)
- Sliding-window rate limiting with Redis (3 tiers: auth/api/ai)
- Circuit breaker per downstream service (closed → open → half-open)
- Request ID generation for distributed tracing
- CORS, compression, and security headers
- Prometheus metrics endpoint (`/metrics`)
- Health check aggregation (`/health`)

## Route Map

| Path | Target Service | Port |
|------|---------------|------|
| `/api/auth/*` | auth-service | 4002 |
| `/api/documents/*` | doc-service | 4003 |
| `/api/code/*` | code-service | 4004 |
| `/api/boards/*` | board-service | 4005 |
| `/api/projects/*` | project-service | 4006 |
| `/api/notifications/*` | notification-service | 4007 |
| `/api/ai/*` | ai-service | 4008 |

## Key Files
```
src/
├── index.ts                     # Express app, middleware stack
├── config.ts                    # Service registry with URLs
├── routes/proxy.routes.ts       # Proxy configuration for all services
├── middleware/
│   ├── auth.middleware.ts       # JWT verification, X-User-* headers
│   ├── rate-limiter.ts          # Redis sliding-window limiter
│   ├── request-id.ts            # UUID request ID generation
│   ├── cors.ts                  # CORS with allowlist
│   ├── compression.ts           # Response compression
│   └── error-handler.ts         # Centralized error formatting
├── services/
│   ├── circuit-breaker.ts       # Circuit breaker with failure tracking
│   └── health-check.ts          # Downstream health aggregation
└── metrics/prometheus.ts        # Request count, latency, error metrics
```
