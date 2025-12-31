# Auth Service

Authentication and authorization service for CollabSpace.

## Responsibilities
- User registration, login, and session management
- JWT access + refresh token issuance and rotation
- Password hashing (scrypt) and reset flows
- Email verification
- RBAC (5 roles) + ABAC (ownership, membership, time-based conditions)
- Token blacklisting via Redis
- Audit logging for all auth events

## Port
`4002` (configurable via `AUTH_PORT`)

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | No | Register new user |
| POST | /auth/login | No | Login with credentials |
| POST | /auth/refresh | No | Rotate tokens |
| POST | /auth/logout | Yes | Invalidate session |
| POST | /auth/forgot-password | No | Send reset email |
| POST | /auth/reset-password | No | Reset with token |
| GET | /auth/me | Yes | Get current user |
| POST | /auth/verify-email | No | Verify email |

## Dependencies
- **PostgreSQL**: users, organizations, sessions, audit_logs tables
- **Redis**: token blacklist, rate limiting, password reset tokens

## Key Files
```
src/
├── index.ts                    # Express app setup
├── config.ts                   # Environment configuration
├── routes/auth.routes.ts       # All API endpoints
├── middleware/
│   ├── authenticate.ts         # JWT verification
│   ├── authorize.ts            # RBAC + ABAC middleware
│   └── rate-limiter.ts         # Token bucket rate limiter
├── services/
│   ├── token.service.ts        # JWT generation, verification, rotation
│   ├── user.service.ts         # User CRUD, password hashing
│   └── rbac.service.ts         # Role/permission matrix
├── utils/
│   ├── db.ts                   # PostgreSQL connection pool
│   ├── redis.ts                # Redis client
│   ├── validation.ts           # Zod schemas
│   ├── errors.ts               # Error hierarchy
│   └── logger.ts               # Structured logging
└── db/schema.sql               # Database schema
```

## Running
```bash
npm run dev    # Development with hot reload
npm run build  # Compile TypeScript
npm run start  # Production mode
```
