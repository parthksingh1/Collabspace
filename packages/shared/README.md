# @collabspace/shared

Shared types, utilities, constants, and error definitions used across all CollabSpace services.

## Usage

```typescript
import {
  // Types
  User, Document, Task, ApiResponse, PaginatedResponse,
  // Constants
  KAFKA_TOPICS, REDIS_KEYS, WS_EVENTS, PERMISSIONS, RATE_LIMITS,
  // Utils
  generateId, slugify, retry, debounce, throttle, deepMerge,
  validateEmail, hashString, formatBytes, parseJSON, chunk, sleep,
  // Errors
  AppError, NotFoundError, UnauthorizedError, ValidationError,
  // Logger
  createLogger,
  // Crypto
  encrypt, decrypt, hashPassword, verifyPassword, generateToken,
} from '@collabspace/shared';
```

## Contents

| Module | Description |
|--------|-------------|
| `types/index.ts` | 19+ domain types (User, Document, Task, Project, etc.) |
| `types/events.ts` | Kafka/WebSocket event type definitions |
| `constants/index.ts` | Topics, Redis keys, WebSocket events, permissions, rate limits |
| `utils/index.ts` | 15 utility functions (retry, debounce, throttle, etc.) |
| `utils/errors.ts` | Error hierarchy (AppError, NotFoundError, etc.) |
| `utils/logger.ts` | Structured JSON logger with service context |
| `utils/crypto.ts` | AES-256-GCM encryption, scrypt password hashing |
