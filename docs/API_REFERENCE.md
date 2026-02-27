# CollabSpace API Reference

> **Base URL:** `http://localhost:4000/api/`
>
> **WebSocket URL:** `ws://localhost:4001/`

---

## Table of Contents

- [Overview](#overview)
  - [Standard Response Wrapper](#standard-response-wrapper)
  - [Authentication](#authentication)
  - [Rate Limiting](#rate-limiting)
  - [Pagination](#pagination)
  - [Error Codes](#error-codes)
- [Auth Service](#auth-service) (`/api/auth/`)
- [Document Service](#document-service) (`/api/documents/`)
- [Code Service](#code-service) (`/api/code/`)
- [Board Service](#board-service) (`/api/boards/`)
- [Project Service](#project-service) (`/api/projects/`)
- [AI Service](#ai-service) (`/api/ai/`)
- [Notification Service](#notification-service) (`/api/notifications/`)
- [WebSocket Events](#websocket-events)

---

## Overview

### Standard Response Wrapper

All REST API responses follow a consistent envelope format:

```jsonc
// Success
{
  "success": true,
  "data": { /* resource-specific payload */ }
}

// Success with pagination
{
  "success": true,
  "data": [ /* array of items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": [ /* optional validation details */ ]
  }
}
```

### Authentication

All endpoints except those marked **Public** require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

The API Gateway verifies the JWT and forwards the following headers to downstream services:

| Header | Description |
|--------|-------------|
| `X-User-Id` | Authenticated user's UUID |
| `X-User-Email` | Authenticated user's email |
| `X-User-Role` | User role (`admin`, `member`, etc.) |
| `X-User-Org-Id` | Organization UUID (if applicable) |
| `X-Request-Id` | Distributed tracing request identifier |
| `X-Forwarded-By` | Always `collabspace-gateway` |

**JWT Structure (access token):**

```jsonc
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "member",
  "orgId": "uuid",        // optional
  "type": "access",
  "iss": "collabspace-auth",
  "aud": "collabspace",
  "iat": 1700000000,
  "exp": 1700000900       // 15 minutes
}
```

### Rate Limiting

Rate limits are enforced at the API Gateway using a sliding-window algorithm backed by Redis.

| Tier | Limit | Window |
|------|-------|--------|
| `auth` (all `/api/auth/*` routes) | 20 requests | 60 seconds |
| `ai` (all `/api/ai/*` routes) | 30 requests | 60 seconds |
| `default` (all other routes) | 120 requests | 60 seconds |

**Per-user limits** are 2x the tier limit for authenticated users.

Every response includes the following headers:

| Header | Type | Description |
|--------|------|-------------|
| `X-RateLimit-Limit` | `number` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | `number` | Remaining requests in the current window |
| `X-RateLimit-Reset` | `number` | Unix timestamp (seconds) when the window resets |
| `Retry-After` | `number` | Seconds to wait (only present on `429` responses) |

**429 Response:**

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Please try again later.",
    "retryAfter": 12
  }
}
```

### Pagination

Paginated endpoints accept the following query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number (1-based) |
| `pageSize` / `limit` | `integer` | `20` | Items per page (max 100) |

The response includes a `pagination` object:

```json
{
  "page": 1,
  "limit": 20,
  "total": 142,
  "totalPages": 8
}
```

Some endpoints (e.g., Notification list) use a `hasMore: boolean` field instead of `totalPages`.

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or query parameter validation failed |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing or invalid authorization header |
| `TOKEN_EXPIRED` | 401 | Access token has expired; use refresh endpoint |
| `INVALID_TOKEN` | 401 | JWT is malformed or signature verification failed |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Resource already exists (e.g., duplicate email) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `BAD_GATEWAY` | 502 | Upstream service unreachable |
| `SERVICE_UNAVAILABLE` | 503 | Circuit breaker is open; upstream temporarily unavailable |
| `EXECUTION_ERROR` | 500 | Code execution failed |
| `AGENT_ERROR` | 500 | AI agent execution failed |
| `MEMORY_ERROR` | 500 | AI memory store/recall operation failed |
| `SUBMISSION_ERROR` | 500 | Contest solution submission failed |
| `RATE_LIMIT_EXCEEDED` | 429 | AI-specific per-user token rate limit exceeded |

---

## Auth Service

**Base path:** `/api/auth`

### POST /api/auth/register

Register a new user account.

- **Auth:** Public
- **Rate limit:** `auth` tier (20/min)

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `email` | `string` | Yes | Valid email, max 255 chars |
| `password` | `string` | Yes | 8-128 chars, must contain uppercase, lowercase, digit, and special character |
| `name` | `string` | Yes | 1-100 chars |

```json
{
  "email": "jane@example.com",
  "password": "S3cure!Pass",
  "name": "Jane Doe"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "role": "member",
      "email_verified": false,
      "created_at": "2026-04-13T10:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "dGhpcyBpcyBh...",
      "expiresIn": 900
    },
    "verificationToken": "abc123-verification-token"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Validation failed (missing/invalid fields) |
| 409 | `CONFLICT` | Email already registered |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |

---

### POST /api/auth/login

Authenticate with email and password.

- **Auth:** Public
- **Rate limit:** `auth` tier (20/min)

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | `string` | Yes |
| `password` | `string` | Yes |

```json
{
  "email": "jane@example.com",
  "password": "S3cure!Pass"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "role": "member",
      "avatar_url": "https://cdn.example.com/avatars/jane.png",
      "email_verified": true,
      "org_id": "org-uuid-here"
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "dGhpcyBpcyBh...",
      "expiresIn": 900
    }
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Invalid email or password |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |

---

### POST /api/auth/refresh

Refresh an expired access token. The old refresh token is revoked (token rotation).

- **Auth:** Public
- **Rate limit:** `auth` tier (20/min)

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | `string` | Yes |

```json
{
  "refreshToken": "dGhpcyBpcyBh..."
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "bmV3IHJlZnJlc2g...",
      "expiresIn": 900
    }
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Invalid or expired refresh token |

---

### POST /api/auth/logout

Invalidate the refresh token and blacklist the current access token.

- **Auth:** Required
- **Rate limit:** `auth` tier (20/min)

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | `string` | Yes |

```json
{
  "refreshToken": "dGhpcyBpcyBh..."
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "message": "Successfully logged out"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |

---

### POST /api/auth/forgot-password

Request a password reset email. Always returns success to prevent email enumeration.

- **Auth:** Public
- **Rate limit:** `auth` tier (20/min)

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | `string` | Yes |

```json
{
  "email": "jane@example.com"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "message": "If the email exists, a password reset link has been sent"
  }
}
```

---

### POST /api/auth/reset-password

Reset password using a valid reset token.

- **Auth:** Public
- **Rate limit:** `auth` tier (20/min)

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `token` | `string` | Yes | Reset token from email |
| `password` | `string` | Yes | Same rules as registration password |

```json
{
  "token": "reset-token-from-email",
  "password": "N3wS3cure!Pass"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "message": "Password has been reset successfully"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid or expired reset token |

---

### GET /api/auth/me

Get the currently authenticated user's profile.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "role": "member",
      "avatar_url": "https://cdn.example.com/avatars/jane.png",
      "email_verified": true,
      "org_id": "org-uuid-here",
      "created_at": "2026-04-13T10:00:00.000Z",
      "updated_at": "2026-04-13T12:00:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 401 | `TOKEN_EXPIRED` | Access token has expired |

---

### POST /api/auth/verify-email

Verify email address using the verification token sent during registration.

- **Auth:** Public

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `token` | `string` | Yes |

```json
{
  "token": "email-verification-token"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "message": "Email verified successfully"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid or expired verification token |

---

## Document Service

**Base path:** `/api/documents`

All endpoints require authentication.

### POST /api/documents

Create a new document.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | Yes | 1-500 chars |
| `workspaceId` | `string (uuid)` | Yes | Workspace to create document in |
| `template` | `string` | No | One of: `blank`, `meeting_notes`, `project_brief`, `technical_spec` |
| `settings` | `object` | No | Arbitrary key-value settings |

```json
{
  "title": "Sprint 14 Planning Notes",
  "workspaceId": "ws-uuid-here",
  "template": "meeting_notes",
  "settings": { "font": "inter" }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "title": "Sprint 14 Planning Notes",
    "workspace_id": "ws-uuid-here",
    "owner_id": "user-uuid",
    "template": "meeting_notes",
    "settings": { "font": "inter" },
    "version": 1,
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T10:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 401 | `UNAUTHORIZED` | Not authenticated |

---

### GET /api/documents

List documents in a workspace with pagination, search, and filtering.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspaceId` | `string (uuid)` | Yes | -- | Filter by workspace |
| `page` | `integer` | No | `1` | Page number |
| `pageSize` | `integer` | No | `20` | Items per page (max 100) |
| `search` | `string` | No | -- | Full-text search in title |
| `ownerId` | `string (uuid)` | No | -- | Filter by document owner |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-uuid",
        "title": "Sprint 14 Planning Notes",
        "owner_id": "user-uuid",
        "version": 3,
        "created_at": "2026-04-13T10:00:00.000Z",
        "updated_at": "2026-04-13T14:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

---

### GET /api/documents/:id

Retrieve a single document by ID, including its CRDT content (base64-encoded).

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "title": "Sprint 14 Planning Notes",
    "workspace_id": "ws-uuid",
    "owner_id": "user-uuid",
    "version": 3,
    "settings": {},
    "collaborators": ["user-uuid-2"],
    "hasContent": true,
    "contentBase64": "base64-encoded-yjs-state...",
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T14:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Document not found |

---

### PUT /api/documents/:id

Update document metadata (title, settings, collaborators).

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | No | 1-500 chars |
| `settings` | `object` | No | Arbitrary key-value settings |
| `collaborators` | `string[] (uuid[])` | No | Array of user UUIDs |

```json
{
  "title": "Updated Title",
  "collaborators": ["user-uuid-2", "user-uuid-3"]
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "title": "Updated Title",
    "collaborators": ["user-uuid-2", "user-uuid-3"],
    "version": 4,
    "updated_at": "2026-04-13T15:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 404 | `NOT_FOUND` | Document not found |

---

### DELETE /api/documents/:id

Soft-delete a document.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Document not found |

---

### GET /api/documents/:id/history

Get version history for a document.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "version": 3,
      "author_id": "user-uuid",
      "created_at": "2026-04-13T14:00:00.000Z",
      "summary": "Edited section 2"
    },
    {
      "version": 2,
      "author_id": "user-uuid-2",
      "created_at": "2026-04-13T12:00:00.000Z",
      "summary": "Added agenda items"
    }
  ]
}
```

---

### POST /api/documents/:id/restore/:version

Restore a document to a specific version.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |
| `version` | `integer` | Version number to restore (must be >= 1) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "title": "Sprint 14 Planning Notes",
    "version": 5,
    "restored_from": 2,
    "updated_at": "2026-04-13T16:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid version number |
| 404 | `NOT_FOUND` | Document or version not found |

---

### POST /api/documents/:id/export

Export a document in the specified format.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Request Body:**

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `format` | `string` | Yes | `html`, `md`, `pdf` |

```json
{
  "format": "md"
}
```

**Response `200 OK`:**

Returns the exported file with appropriate `Content-Type` header:

| Format | Content-Type |
|--------|-------------|
| `html` | `text/html` |
| `md` | `text/markdown` |
| `pdf` | `application/pdf` |

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid format |
| 404 | `NOT_FOUND` | Document not found or empty |

---

### POST /api/documents/:id/comment

Add a comment to a document, optionally anchored to a text range.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes | 1-10,000 chars |
| `position` | `object` | No | Anchor position in the document |
| `position.from` | `integer` | No | Start offset (>= 0) |
| `position.to` | `integer` | No | End offset (>= 0) |
| `position.blockId` | `string` | No | Block identifier |
| `parentId` | `string (uuid)` | No | Parent comment ID (for threaded replies) |

```json
{
  "content": "Should we add a risk section here?",
  "position": { "from": 450, "to": 512 },
  "parentId": null
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "document_id": "doc-uuid",
    "author_id": "user-uuid",
    "content": "Should we add a risk section here?",
    "position": { "from": 450, "to": 512 },
    "parent_id": null,
    "resolved": false,
    "created_at": "2026-04-13T10:30:00.000Z"
  }
}
```

---

### GET /api/documents/:id/comments

List comments for a document.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `includeResolved` | `boolean` | `false` | Include resolved comments |
| `page` | `integer` | `1` | Page number |
| `pageSize` | `integer` | `50` | Items per page (max 100) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "comments": [
      {
        "id": "comment-uuid",
        "author_id": "user-uuid",
        "content": "Should we add a risk section here?",
        "position": { "from": 450, "to": 512 },
        "resolved": false,
        "replies": [],
        "created_at": "2026-04-13T10:30:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 50
  }
}
```

---

### POST /api/documents/:id/comments/:commentId/resolve

Resolve (close) a comment thread.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Document ID |
| `commentId` | `string (uuid)` | Comment ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "resolved": true,
    "resolved_by": "user-uuid",
    "resolved_at": "2026-04-13T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Comment not found |

---

## Code Service

**Base path:** `/api/code`

All endpoints require authentication (enforced by the API Gateway).

### POST /api/code/files

Create a new code file or folder.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | File or folder name |
| `workspaceId` | `string (uuid)` | Yes | -- | Workspace ID |
| `language` | `string` | No | `javascript` | Programming language |
| `content` | `string` | No | `""` | Initial file content |
| `parentFolderId` | `string (uuid)` | No | -- | Parent folder ID |
| `isFolder` | `boolean` | No | `false` | Create a folder instead of a file |

```json
{
  "name": "solution.ts",
  "workspaceId": "ws-uuid",
  "language": "typescript",
  "content": "export function solve() {}"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "solution.ts",
    "language": "typescript",
    "workspace_id": "ws-uuid",
    "owner_id": "user-uuid",
    "content": "export function solve() {}",
    "is_folder": false,
    "parent_folder_id": null,
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T10:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | `name` and `workspaceId` are required |

---

### GET /api/code/files

List code files in a workspace with optional filtering.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `workspaceId` | `string (uuid)` | -- | Filter by workspace |
| `parentFolderId` | `string (uuid)` | -- | Filter by parent folder |
| `language` | `string` | -- | Filter by language |
| `page` | `integer` | `1` | Page number |
| `pageSize` | `integer` | `50` | Items per page |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "file-uuid",
        "name": "solution.ts",
        "language": "typescript",
        "is_folder": false,
        "updated_at": "2026-04-13T14:00:00.000Z"
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 50
  }
}
```

---

### GET /api/code/files/:id

Get a single code file with its content.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | File ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "solution.ts",
    "language": "typescript",
    "content": "export function solve() { ... }",
    "workspace_id": "ws-uuid",
    "owner_id": "user-uuid",
    "is_folder": false,
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T14:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | File not found |

---

### PUT /api/code/files/:id

Update a code file (name, content, language, etc.).

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | File ID |

**Request Body:** Any subset of file fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | File name |
| `content` | `string` | File content |
| `language` | `string` | Programming language |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "solution.ts",
    "content": "// updated content",
    "updated_at": "2026-04-13T15:00:00.000Z"
  }
}
```

---

### DELETE /api/code/files/:id

Delete a code file.

- **Auth:** Required

**Response `204 No Content`:** (empty body)

---

### POST /api/code/execute

Execute code in a sandboxed environment.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Source code to execute |
| `language` | `string` | Yes | One of: `javascript`, `typescript`, `python`, `java`, `cpp`, `go`, `rust` |
| `stdin` | `string` | No | Standard input data |
| `fileId` | `string (uuid)` | No | Associated file ID for tracking |

```json
{
  "code": "console.log('Hello, World!');",
  "language": "javascript",
  "stdin": ""
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "executionId": "exec-uuid",
    "status": "completed",
    "stdout": "Hello, World!\n",
    "stderr": "",
    "exitCode": 0,
    "executionTimeMs": 45,
    "memoryUsedBytes": 8192000
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | `code` and `language` required, or unsupported language |
| 500 | `EXECUTION_ERROR` | Sandbox execution failure |

---

### GET /api/code/execute/:executionId

Get the result of a previous code execution.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `executionId` | `string` | Execution ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "executionId": "exec-uuid",
    "status": "completed",
    "stdout": "Hello, World!\n",
    "stderr": "",
    "exitCode": 0,
    "executionTimeMs": 45,
    "memoryUsedBytes": 8192000
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Execution not found |

---

### POST /api/code/rooms

Create a coding room (contest mode).

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Room name |
| `description` | `string` | No | -- | Room description |
| `workspaceId` | `string (uuid)` | Yes | -- | Workspace ID |
| `problem` | `object` | Yes | -- | Problem definition (title, description, test cases) |
| `timeLimitMinutes` | `integer` | No | `60` | Time limit in minutes |

```json
{
  "name": "Algorithm Challenge #3",
  "workspaceId": "ws-uuid",
  "problem": {
    "title": "Two Sum",
    "description": "Given an array of integers...",
    "testCases": [
      { "input": "[2,7,11,15], 9", "expected": "[0,1]" }
    ]
  },
  "timeLimitMinutes": 45
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "room-uuid",
    "name": "Algorithm Challenge #3",
    "workspace_id": "ws-uuid",
    "owner_id": "user-uuid",
    "status": "waiting",
    "problem": { "..." : "..." },
    "time_limit_minutes": 45,
    "created_at": "2026-04-13T10:00:00.000Z"
  }
}
```

---

### GET /api/code/rooms

List coding rooms.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspaceId` | `string (uuid)` | Filter by workspace |
| `status` | `string` | Filter by status (`waiting`, `active`, `completed`) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "room-uuid",
      "name": "Algorithm Challenge #3",
      "status": "waiting",
      "participant_count": 5,
      "time_limit_minutes": 45,
      "created_at": "2026-04-13T10:00:00.000Z"
    }
  ]
}
```

---

### GET /api/code/rooms/:id

Get a coding room by ID.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "room-uuid",
    "name": "Algorithm Challenge #3",
    "status": "active",
    "problem": { "..." : "..." },
    "participants": ["user-uuid-1", "user-uuid-2"],
    "started_at": "2026-04-13T10:05:00.000Z",
    "ends_at": "2026-04-13T10:50:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Room not found |

---

### POST /api/code/rooms/:id/start

Start a coding contest in a room.

- **Auth:** Required (room owner)

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "room-uuid",
    "status": "active",
    "started_at": "2026-04-13T10:05:00.000Z",
    "ends_at": "2026-04-13T10:50:00.000Z"
  }
}
```

---

### POST /api/code/rooms/:id/submit

Submit a solution to the contest problem.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Solution source code |
| `language` | `string` | Yes | Programming language |

```json
{
  "code": "function twoSum(nums, target) { ... }",
  "language": "javascript"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "submission-uuid",
    "room_id": "room-uuid",
    "user_id": "user-uuid",
    "status": "accepted",
    "passed_tests": 5,
    "total_tests": 5,
    "execution_time_ms": 32,
    "submitted_at": "2026-04-13T10:25:00.000Z"
  }
}
```

---

### GET /api/code/rooms/:id/leaderboard

Get the contest leaderboard for a room.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "user_id": "user-uuid",
      "user_name": "Jane Doe",
      "passed_tests": 5,
      "total_tests": 5,
      "execution_time_ms": 32,
      "submitted_at": "2026-04-13T10:25:00.000Z"
    },
    {
      "rank": 2,
      "user_id": "user-uuid-2",
      "user_name": "John Smith",
      "passed_tests": 4,
      "total_tests": 5,
      "execution_time_ms": 120,
      "submitted_at": "2026-04-13T10:30:00.000Z"
    }
  ]
}
```

---

## Board Service

**Base path:** `/api/boards`

All endpoints require authentication. User ID is read from the `X-User-Id` header (set by the API Gateway). Workspace-scoped endpoints also require `X-Workspace-Id`.

### POST /api/boards

Create a new whiteboard.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | No | 1-500 chars (defaults to "Untitled Board") |
| `workspace_id` | `string (uuid)` | No | Workspace ID (falls back to `X-Workspace-Id` header) |
| `settings` | `object` | No | Board settings (see below) |
| `viewport` | `object` | No | Initial viewport `{ x, y, zoom }` |

**Settings object:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `background` | `string` | -- | Background color or pattern |
| `gridEnabled` | `boolean` | -- | Show grid |
| `gridSize` | `integer` | -- | Grid cell size (5-100) |
| `snapToGrid` | `boolean` | -- | Snap elements to grid |
| `showMinimap` | `boolean` | -- | Display minimap |

```json
{
  "title": "Architecture Diagram",
  "workspace_id": "ws-uuid",
  "settings": {
    "background": "#ffffff",
    "gridEnabled": true,
    "gridSize": 20,
    "snapToGrid": true
  }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "board-uuid",
    "title": "Architecture Diagram",
    "workspace_id": "ws-uuid",
    "owner_id": "user-uuid",
    "settings": { "..." : "..." },
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T10:00:00.000Z"
  }
}
```

---

### GET /api/boards

List boards in a workspace (paginated).

- **Auth:** Required
- **Headers:** `X-Workspace-Id` required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `20` | Items per page (max 100) |
| `search` | `string` | -- | Search in title |
| `sort_by` | `string` | `updated_at` | One of: `created_at`, `updated_at`, `title` |
| `sort_order` | `string` | `desc` | `asc` or `desc` |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "board-uuid",
      "title": "Architecture Diagram",
      "thumbnail_url": "https://...",
      "element_count": 24,
      "updated_at": "2026-04-13T14:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

---

### GET /api/boards/:id

Get a board with all its elements.

- **Auth:** Required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (uuid)` | Board ID |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "board-uuid",
    "title": "Architecture Diagram",
    "settings": { "gridEnabled": true, "gridSize": 20 },
    "viewport": { "x": 0, "y": 0, "zoom": 1 },
    "elements": [
      {
        "id": "elem-uuid",
        "type": "rectangle",
        "position": { "x": 100, "y": 200, "width": 150, "height": 80, "rotation": 0 },
        "style": { "fill": "#4A90D9", "stroke": "#2C5F8A", "strokeWidth": 2 },
        "properties": { "text": "API Gateway" },
        "z_index": 1,
        "locked": false
      }
    ],
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T14:00:00.000Z"
  }
}
```

---

### PUT /api/boards/:id

Update board metadata.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | No | 1-500 chars |
| `settings` | `object` | No | Board settings |
| `viewport` | `object` | No | `{ x: number, y: number, zoom: number }` |
| `thumbnail_url` | `string` | No | Valid URL |

**Response `200 OK`:** Updated board object.

---

### DELETE /api/boards/:id

Soft-delete a board.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Board deleted successfully"
}
```

---

### POST /api/boards/:id/elements

Add one or more elements to a board. Supports both single-element and batch creation.

- **Auth:** Required

**Single element request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | One of: `rectangle`, `ellipse`, `triangle`, `line`, `arrow`, `text`, `sticky_note`, `image`, `freehand`, `connector`, `group`, `frame` |
| `position` | `object` | Yes | `{ x, y, width, height, rotation? }` |
| `style` | `object` | No | See style schema below |
| `properties` | `object` | No | Type-specific properties |
| `z_index` | `integer` | No | Stacking order |
| `group_id` | `string (uuid)` | No | Parent group ID |
| `locked` | `boolean` | No | Lock element |

**Style object:**

| Field | Type | Description |
|-------|------|-------------|
| `fill` | `string` | Fill color |
| `stroke` | `string` | Stroke color |
| `strokeWidth` | `number` | Stroke width (>= 0) |
| `opacity` | `number` | 0-1 |
| `fontSize` | `number` | Font size (>= 1) |
| `fontFamily` | `string` | Font family |
| `textAlign` | `string` | Text alignment |
| `borderRadius` | `number` | Border radius (>= 0) |
| `dashPattern` | `number[]` | Dash pattern array |
| `arrowHead` | `string` | `none`, `arrow`, `diamond`, `circle` |
| `arrowTail` | `string` | `none`, `arrow`, `diamond`, `circle` |

**Batch request:**

```json
{
  "elements": [
    {
      "type": "rectangle",
      "position": { "x": 100, "y": 200, "width": 150, "height": 80 },
      "style": { "fill": "#4A90D9" },
      "properties": { "text": "Service A" }
    },
    {
      "type": "arrow",
      "position": { "x": 250, "y": 240, "width": 100, "height": 1 },
      "style": { "stroke": "#333", "arrowHead": "arrow" }
    }
  ]
}
```

**Response `201 Created`:** Created element(s).

---

### PUT /api/boards/:id/elements/:elementId

Update an existing element.

- **Auth:** Required

**Request Body:** Any subset of element fields (`position`, `style`, `properties`, `z_index`, `group_id`, `locked`).

**Response `200 OK`:** Updated element.

---

### DELETE /api/boards/:id/elements/:elementId

Delete an element from a board.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Element deleted successfully"
}
```

---

### POST /api/boards/:id/export

Export a board as PNG, SVG, or PDF.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `format` | `string` | Yes | -- | `png`, `svg`, `pdf` |
| `width` | `integer` | No | -- | Output width (100-8192) |
| `height` | `integer` | No | -- | Output height (100-8192) |
| `scale` | `number` | No | -- | Scale factor (0.5-4) |
| `background` | `string` | No | -- | Background color |
| `padding` | `integer` | No | -- | Padding in pixels (0-200) |

**Response `200 OK`:** Binary file with appropriate headers:

```
Content-Type: image/png | image/svg+xml | application/pdf
Content-Disposition: attachment; filename="board-name.png"
```

---

### GET /api/boards/:id/history

Get version history (snapshots) for a board.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `20` | Items per page (max 100) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "snapshot-uuid",
      "version": 5,
      "author_id": "user-uuid",
      "element_count": 24,
      "created_at": "2026-04-13T14:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### POST /api/boards/:id/ai/generate

Generate a diagram from a natural-language prompt using AI.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | `string` | Yes | 3-2000 chars, natural language description |

```json
{
  "prompt": "Create a microservices architecture diagram with API gateway, auth service, user service, and a message queue"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "elements": [
      {
        "id": "elem-uuid",
        "type": "rectangle",
        "position": { "x": 300, "y": 100, "width": 160, "height": 80 },
        "style": { "fill": "#4A90D9" },
        "properties": { "text": "API Gateway" }
      }
    ],
    "description": "Microservices architecture with 4 services connected through an API gateway and message queue",
    "diagramType": "architecture"
  }
}
```

---

### POST /api/boards/:id/ai/to-code

Convert a board diagram to code representation.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "code": "graph TD\n  A[API Gateway] --> B[Auth Service]\n  ...",
    "language": "mermaid"
  }
}
```

---

### POST /api/boards/:id/ai/suggest-layout

AI suggests layout improvements for the board.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "elementId": "elem-uuid",
        "currentPosition": { "x": 100, "y": 500 },
        "suggestedPosition": { "x": 300, "y": 200 },
        "reason": "Better vertical alignment with related elements"
      }
    ]
  }
}
```

---

### POST /api/boards/:id/ai/recognize

Recognize handwriting from freehand elements.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `elementIds` | `string[]` | No | Specific freehand element IDs to recognize (all if omitted) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "recognitions": [
      {
        "elementId": "freehand-elem-uuid",
        "recognizedText": "Hello World",
        "confidence": 0.92
      }
    ]
  }
}
```

---

## Project Service

**Base path:** `/api/projects`

All endpoints require authentication. Workspace ID is read from the `X-Workspace-Id` header.

### POST /api/projects

Create a new project.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | 1-255 chars |
| `description` | `string` | No | Max 5000 chars |
| `key` | `string` | Yes | 2-10 chars, starts with letter, alphanumeric only (e.g., `PROJ`) |
| `workspace_id` | `string (uuid)` | No | Falls back to `X-Workspace-Id` header |
| `template` | `string` | No | `blank`, `scrum`, `kanban`, `bug_tracking` |
| `settings` | `object` | No | Project settings (see below) |

**Settings object:**

| Field | Type | Description |
|-------|------|-------------|
| `defaultAssignee` | `string (uuid) \| null` | Default task assignee |
| `statuses` | `string[]` | Custom status list |
| `priorities` | `string[]` | Custom priority list |

```json
{
  "name": "CollabSpace v2",
  "key": "CS2",
  "template": "scrum",
  "settings": {
    "statuses": ["backlog", "todo", "in_progress", "review", "done"]
  }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "project-uuid",
    "name": "CollabSpace v2",
    "key": "CS2",
    "workspace_id": "ws-uuid",
    "owner_id": "user-uuid",
    "template": "scrum",
    "settings": { "..." : "..." },
    "created_at": "2026-04-13T10:00:00.000Z"
  }
}
```

---

### GET /api/projects

List projects in a workspace.

- **Auth:** Required
- **Headers:** `X-Workspace-Id` required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `20` | Items per page (max 100) |
| `search` | `string` | -- | Search in name |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "project-uuid",
      "name": "CollabSpace v2",
      "key": "CS2",
      "task_count": 47,
      "updated_at": "2026-04-13T14:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

---

### GET /api/projects/:id

Get a project by ID.

- **Auth:** Required

**Response `200 OK`:** Full project object with settings.

---

### PUT /api/projects/:id

Update project metadata.

- **Auth:** Required

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | No |
| `description` | `string` | No |
| `settings` | `object` | No |

**Response `200 OK`:** Updated project object.

---

### DELETE /api/projects/:id

Delete a project.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

---

### Tasks

#### POST /api/projects/:projectId/tasks

Create a task within a project.

- **Auth:** Required
- **Headers:** `X-Workspace-Id` required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | Yes | 1-500 chars |
| `description` | `string` | No | Max 50,000 chars (Markdown) |
| `assignee_id` | `string (uuid)` | No | Assignee user ID |
| `priority` | `string` | No | `critical`, `high`, `medium`, `low` |
| `labels` | `string[]` | No | Up to 20 labels, each max 100 chars |
| `story_points` | `integer` | No | 0-100 |
| `due_date` | `string` | No | `YYYY-MM-DD` format |
| `parent_id` | `string (uuid)` | No | Parent task ID (for subtasks) |
| `sprint_id` | `string (uuid)` | No | Sprint to assign to |

```json
{
  "title": "Implement WebSocket reconnection",
  "description": "Add automatic reconnection with exponential backoff...",
  "priority": "high",
  "labels": ["backend", "websocket"],
  "story_points": 5,
  "sprint_id": "sprint-uuid"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "task-uuid",
    "key": "CS2-42",
    "project_id": "project-uuid",
    "title": "Implement WebSocket reconnection",
    "status": "backlog",
    "priority": "high",
    "labels": ["backend", "websocket"],
    "story_points": 5,
    "sprint_id": "sprint-uuid",
    "assignee_id": null,
    "version": 1,
    "created_at": "2026-04-13T10:00:00.000Z"
  }
}
```

---

#### GET /api/projects/:projectId/tasks

List tasks for a project with extensive filtering options.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `50` | Items per page (max 100) |
| `status` | `string` | -- | `backlog`, `todo`, `in_progress`, `review`, `done` |
| `assignee_id` | `string (uuid)` | -- | Filter by assignee |
| `priority` | `string` | -- | `critical`, `high`, `medium`, `low` |
| `label` | `string` | -- | Filter by label |
| `sprint_id` | `string (uuid)` | -- | Filter by sprint |
| `search` | `string` | -- | Full-text search |
| `sort_by` | `string` | `position` | `created_at`, `updated_at`, `priority`, `due_date`, `position` |
| `sort_order` | `string` | `asc` | `asc`, `desc` |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "task-uuid",
      "key": "CS2-42",
      "title": "Implement WebSocket reconnection",
      "status": "in_progress",
      "priority": "high",
      "assignee_id": "user-uuid",
      "story_points": 5,
      "labels": ["backend", "websocket"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 47,
    "totalPages": 1
  }
}
```

---

#### GET /api/projects/tasks/:id

Get a task with full details.

- **Auth:** Required

**Response `200 OK`:** Full task object including description, comments count, subtasks, relationships.

---

#### PUT /api/projects/tasks/:id

Update a task. Requires `version` for optimistic concurrency control.

- **Auth:** Required
- **Headers:** `X-Workspace-Id` required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | No | 1-500 chars |
| `description` | `string` | No | Max 50,000 chars |
| `priority` | `string` | No | `critical`, `high`, `medium`, `low` |
| `labels` | `string[]` | No | Up to 20 labels |
| `story_points` | `integer` | No | 0-100 |
| `due_date` | `string \| null` | No | `YYYY-MM-DD` or null to clear |
| `parent_id` | `string (uuid) \| null` | No | Parent task or null |
| `sprint_id` | `string (uuid) \| null` | No | Sprint or null |
| `position` | `integer` | No | Sort position (>= 0) |
| `version` | `integer` | **Yes** | Current version for optimistic locking |

**Response `200 OK`:** Updated task with incremented version.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 409 | `CONFLICT` | Version mismatch (task was modified by another user) |

---

#### DELETE /api/projects/tasks/:id

Soft-delete a task.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

#### PUT /api/projects/tasks/:id/status

Change task status with transition validation.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `status` | `string` | Yes | `backlog`, `todo`, `in_progress`, `review`, `done` |

**Response `200 OK`:** Updated task.

---

#### PUT /api/projects/tasks/:id/assign

Assign or unassign a task.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assignee_id` | `string (uuid) \| null` | Yes | User ID or `null` to unassign |

**Response `200 OK`:** Updated task.

---

#### PUT /api/projects/tasks/:id/move

Move a task to a different project or sprint.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | `string (uuid)` | No | Target project ID |
| `sprint_id` | `string (uuid) \| null` | No | Target sprint ID or null |

**Response `200 OK`:** Updated task.

---

#### POST /api/projects/tasks/:id/comments

Add a comment to a task.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes | 1-10,000 chars |

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "task_id": "task-uuid",
    "author_id": "user-uuid",
    "content": "I'll pick this up tomorrow.",
    "created_at": "2026-04-13T10:30:00.000Z"
  }
}
```

---

#### GET /api/projects/tasks/:id/comments

List comments for a task.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default |
|-----------|------|---------|
| `page` | `integer` | `1` |
| `limit` | `integer` | `50` |

**Response `200 OK`:** Paginated list of comments.

---

#### GET /api/projects/tasks/:id/activity

Get the activity log for a task.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default |
|-----------|------|---------|
| `page` | `integer` | `1` |
| `limit` | `integer` | `50` |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "activity-uuid",
      "action": "status_changed",
      "actor_id": "user-uuid",
      "changes": { "from": "todo", "to": "in_progress" },
      "created_at": "2026-04-13T11:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 12, "totalPages": 1 }
}
```

---

#### POST /api/projects/tasks/:id/subtasks

Create a subtask under an existing task. Accepts the same body as task creation.

- **Auth:** Required

**Response `201 Created`:** Created subtask.

---

#### POST /api/projects/tasks/:id/relationships

Add a relationship between two tasks.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `target_task_id` | `string (uuid)` | Yes | The other task |
| `type` | `string` | Yes | `blocks`, `is_blocked_by`, `relates_to`, `duplicate_of` |

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "rel-uuid",
    "source_task_id": "task-uuid",
    "target_task_id": "other-task-uuid",
    "type": "blocks"
  }
}
```

---

#### DELETE /api/projects/tasks/:id/relationships/:relationshipId

Remove a task relationship.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Relationship removed"
}
```

---

#### POST /api/projects/tasks/:id/ai/breakdown

AI breaks down a task into suggested subtasks.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "subtasks": [
      { "title": "Research reconnection strategies", "story_points": 2, "priority": "medium" },
      { "title": "Implement exponential backoff", "story_points": 3, "priority": "high" }
    ]
  }
}
```

---

#### POST /api/projects/tasks/:id/ai/suggest-priority

AI suggests a priority for a task based on context.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "suggested_priority": "high",
    "confidence": 0.85,
    "reasoning": "This task blocks two other high-priority items and has an approaching deadline."
  }
}
```

---

### Sprints

#### POST /api/projects/:projectId/sprints

Create a new sprint.

- **Auth:** Required
- **Headers:** `X-Workspace-Id` required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | 1-255 chars |
| `goal` | `string` | No | Max 2000 chars |
| `start_date` | `string` | No | `YYYY-MM-DD` format |
| `end_date` | `string` | No | `YYYY-MM-DD` format |

```json
{
  "name": "Sprint 14",
  "goal": "Complete WebSocket layer and AI chat integration",
  "start_date": "2026-04-14",
  "end_date": "2026-04-28"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "sprint-uuid",
    "project_id": "project-uuid",
    "name": "Sprint 14",
    "goal": "Complete WebSocket layer and AI chat integration",
    "status": "planning",
    "start_date": "2026-04-14",
    "end_date": "2026-04-28",
    "created_at": "2026-04-13T10:00:00.000Z"
  }
}
```

---

#### GET /api/projects/:projectId/sprints

List sprints for a project.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default |
|-----------|------|---------|
| `page` | `integer` | `1` |
| `limit` | `integer` | `20` |

**Response `200 OK`:** Paginated list of sprints.

---

#### PUT /api/projects/sprints/:id

Update sprint metadata.

- **Auth:** Required

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | No |
| `goal` | `string` | No |
| `start_date` | `string` | No |
| `end_date` | `string` | No |

**Response `200 OK`:** Updated sprint.

---

#### POST /api/projects/sprints/:id/start

Start a sprint. Changes status from `planning` to `active`.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "sprint-uuid",
    "status": "active",
    "started_at": "2026-04-14T09:00:00.000Z"
  }
}
```

---

#### POST /api/projects/sprints/:id/complete

Complete a sprint. Handles incomplete tasks.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `move_incomplete_to` | `string` | Yes | `backlog` or `next_sprint` |
| `next_sprint_id` | `string (uuid)` | No | Required if `move_incomplete_to` is `next_sprint` |

```json
{
  "move_incomplete_to": "next_sprint",
  "next_sprint_id": "next-sprint-uuid"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "sprint-uuid",
    "status": "completed",
    "completed_at": "2026-04-28T17:00:00.000Z",
    "completed_points": 34,
    "total_points": 40,
    "moved_tasks": 3
  }
}
```

---

#### GET /api/projects/sprints/:id/burndown

Get burndown chart data for a sprint.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "sprint_id": "sprint-uuid",
    "total_points": 40,
    "daily": [
      { "date": "2026-04-14", "remaining": 40, "ideal": 40, "completed": 0 },
      { "date": "2026-04-15", "remaining": 35, "ideal": 37.1, "completed": 5 },
      { "date": "2026-04-16", "remaining": 30, "ideal": 34.3, "completed": 10 }
    ]
  }
}
```

---

#### GET /api/projects/sprints/:id/velocity

Get velocity metrics across recent sprints.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `count` | `integer` | `6` | Number of past sprints to include |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "sprints": [
      { "id": "sprint-uuid-1", "name": "Sprint 12", "committed": 35, "completed": 30 },
      { "id": "sprint-uuid-2", "name": "Sprint 13", "committed": 40, "completed": 38 }
    ],
    "average_velocity": 34,
    "trend": "increasing"
  }
}
```

---

### Project AI Endpoints

#### POST /api/projects/:id/ai/plan-sprint

AI generates a sprint plan.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetPoints` | `number` | No | Target story points for the sprint |

**Response `200 OK`:** Sprint plan with suggested tasks and assignments.

---

#### POST /api/projects/:id/ai/report

AI generates a project status report.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | `string` | No | Report start date |
| `endDate` | `string` | No | Report end date |

**Response `200 OK`:** Generated project report.

---

#### POST /api/projects/:id/ai/predict-delivery

AI predicts delivery date based on velocity data.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "predicted_date": "2026-06-15",
    "confidence": 0.78,
    "remaining_points": 120,
    "average_velocity": 34,
    "risk_factors": ["Two sprints had below-average velocity"]
  }
}
```

---

## AI Service

**Base path:** `/api/ai`

All endpoints require authentication. Rate limited to 30 requests/minute at the gateway level, plus per-user token-based rate limiting within the service.

### POST /api/ai/chat

Chat with the AI assistant. Supports both streaming (SSE) and non-streaming modes.

- **Auth:** Required
- **Rate limit:** `ai` tier (30/min) + per-user token limit

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `messages` | `array` | Yes | -- | Conversation messages |
| `messages[].role` | `string` | Yes | -- | `system`, `user`, `assistant`, `tool` |
| `messages[].content` | `string` | Yes | -- | Message content |
| `messages[].name` | `string` | No | -- | Tool name (for tool messages) |
| `messages[].toolCallId` | `string` | No | -- | Tool call ID (for tool results) |
| `model` | `string` | No | -- | Model override |
| `temperature` | `number` | No | -- | 0-2 |
| `maxTokens` | `integer` | No | -- | 1-128,000 |
| `systemPrompt` | `string` | No | -- | System prompt override |
| `stream` | `boolean` | No | `false` | Enable SSE streaming |

```json
{
  "messages": [
    { "role": "user", "content": "Explain the Observer pattern" }
  ],
  "stream": true
}
```

**Non-streaming response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "content": "The Observer pattern is a behavioral design pattern...",
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 12, "completionTokens": 245, "totalTokens": 257 },
    "finishReason": "stop"
  }
}
```

**Streaming response (SSE):**

```
Content-Type: text/event-stream

data: {"content":"The "}

data: {"content":"Observer "}

data: {"content":"pattern..."}

data: [DONE]
```

---

### POST /api/ai/complete

Text completion (non-streaming).

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | `string` | Yes | -- | Text to complete (1-100,000 chars) |
| `model` | `string` | No | -- | Model override |
| `temperature` | `number` | No | `0.7` | 0-2 |
| `maxTokens` | `integer` | No | `2048` | 1-16,000 |
| `systemPrompt` | `string` | No | -- | System prompt override |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "completion": "completed text here...",
    "model": "gemini-1.5-flash",
    "usage": { "promptTokens": 50, "completionTokens": 120, "totalTokens": 170 }
  }
}
```

---

### POST /api/ai/embed

Generate vector embeddings for text.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `texts` | `string[]` | Yes | 1-100 texts, each non-empty |

```json
{
  "texts": ["Introduction to microservices", "Event-driven architecture"]
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "embeddings": [
      [0.0123, -0.0456, 0.0789, "..."],
      [0.0321, -0.0654, 0.0987, "..."]
    ],
    "dimensions": 768,
    "count": 2
  }
}
```

---

### POST /api/ai/summarize

Summarize content in various formats.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `content` | `string` | Yes | -- | Text to summarize (1-500,000 chars) |
| `maxLength` | `integer` | No | `500` | Max summary length (50-5000) |
| `format` | `string` | No | `paragraph` | `paragraph`, `bullets`, `structured` |

The `structured` format returns sections: TL;DR, Key Points, Decisions Made, Action Items, Open Questions.

```json
{
  "content": "Meeting transcript text here...",
  "format": "structured",
  "maxLength": 1000
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "summary": "## TL;DR\nThe team agreed to...\n\n## Key Points\n- ...",
    "format": "structured",
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 2400, "completionTokens": 350, "totalTokens": 2750 }
  }
}
```

---

### POST /api/ai/generate-code

Generate code from a description.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `description` | `string` | Yes | -- | What to generate (1-10,000 chars) |
| `language` | `string` | No | `typescript` | Target language |
| `context` | `string` | No | -- | Additional context (existing code, requirements) |
| `style` | `string` | No | -- | Coding style preferences |

```json
{
  "description": "A rate limiter using the token bucket algorithm",
  "language": "typescript",
  "context": "This will be used in an Express.js middleware"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "code": "export class TokenBucketRateLimiter {\n  ...\n}",
    "language": "typescript",
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 85, "completionTokens": 420, "totalTokens": 505 }
  }
}
```

---

### POST /api/ai/review-code

Review code for bugs, security issues, performance, and quality.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Code to review (1-100,000 chars) |
| `language` | `string` | No | Programming language hint |
| `focus` | `string[]` | No | Focus areas (defaults to `["bugs", "security", "performance", "code quality"]`) |
| `context` | `string` | No | Additional context about the codebase |

```json
{
  "code": "function processPayment(amount, card) { ... }",
  "language": "javascript",
  "focus": ["security", "bugs"]
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "review": {
      "summary": "Found 2 critical and 1 moderate issue",
      "issues": [
        {
          "severity": "critical",
          "category": "security",
          "line": 12,
          "description": "Credit card number logged to console",
          "suggestion": "Remove console.log or mask the card number"
        }
      ],
      "score": 4
    },
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 200, "completionTokens": 380, "totalTokens": 580 }
  }
}
```

---

### POST /api/ai/explain

Explain code, concepts, errors, or architecture.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `content` | `string` | Yes | -- | Content to explain (1-50,000 chars) |
| `type` | `string` | No | `code` | `code`, `concept`, `error`, `architecture` |
| `level` | `string` | No | `intermediate` | `beginner`, `intermediate`, `expert` |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "explanation": "This code implements...",
    "type": "code",
    "level": "intermediate",
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 150, "completionTokens": 300, "totalTokens": 450 }
  }
}
```

---

### POST /api/ai/suggest-tasks

AI breaks down a description into actionable tasks for sprint planning.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `description` | `string` | Yes | -- | Work description (1-20,000 chars) |
| `teamSize` | `integer` | No | `3` | Number of team members |
| `sprintLength` | `integer` | No | `14` | Sprint length in days |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "plan": {
      "tasks": [
        {
          "title": "Design database schema",
          "description": "...",
          "estimate_hours": 4,
          "priority": "high",
          "dependencies": []
        }
      ],
      "total_estimate_hours": 120,
      "recommended_sprints": 2
    },
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 500, "completionTokens": 800, "totalTokens": 1300 }
  }
}
```

---

### POST /api/ai/diagram

Generate a diagram from a description.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `description` | `string` | Yes | -- | Diagram description (1-10,000 chars) |
| `type` | `string` | No | `flowchart` | `flowchart`, `sequence`, `class`, `erd`, `architecture` |
| `format` | `string` | No | `mermaid` | `mermaid`, `plantuml`, `ascii` |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "diagram": "graph TD\n  A[User] -->|HTTP| B[API Gateway]\n  B --> C[Auth Service]\n  B --> D[Doc Service]",
    "type": "architecture",
    "format": "mermaid",
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 60, "completionTokens": 150, "totalTokens": 210 }
  }
}
```

---

### POST /api/ai/translate

Translate text between languages.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | Yes | Text to translate (1-50,000 chars) |
| `from` | `string` | Yes | Source language |
| `to` | `string` | Yes | Target language |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "translation": "Translated text here...",
    "from": "English",
    "to": "Spanish",
    "model": "gemini-1.5-pro",
    "usage": { "promptTokens": 80, "completionTokens": 90, "totalTokens": 170 }
  }
}
```

---

### Agents

#### POST /api/ai/agents/run

Execute an AI agent with a goal.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | `planner`, `developer`, `reviewer`, `meeting`, `knowledge`, `execution` |
| `goal` | `string` | Yes | Agent goal / instructions |
| `context` | `object` | No | Additional context for the agent |

```json
{
  "type": "developer",
  "goal": "Implement a rate limiter middleware for Express",
  "context": { "language": "typescript", "framework": "express" }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "exec-uuid",
    "agentType": "developer",
    "goal": "Implement a rate limiter middleware for Express",
    "status": "completed",
    "steps": [
      { "action": "research", "result": "Found token bucket algorithm suitable" },
      { "action": "generate_code", "result": "Generated TokenBucketLimiter class" }
    ],
    "result": { "code": "...", "explanation": "..." },
    "startedAt": "2026-04-13T10:00:00.000Z",
    "completedAt": "2026-04-13T10:00:12.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Missing `type`/`goal` or invalid agent type |
| 500 | `AGENT_ERROR` | Agent execution failed |

---

#### GET /api/ai/agents/:executionId

Get the status of an agent execution.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "exec-uuid",
    "agentType": "developer",
    "status": "running",
    "steps": [
      { "action": "research", "result": "..." }
    ],
    "startedAt": "2026-04-13T10:00:00.000Z",
    "completedAt": null
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Execution not found |

---

#### POST /api/ai/agents/:executionId/cancel

Cancel a running agent execution.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "exec-uuid",
    "status": "cancelled"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Execution not found or already completed |

---

#### GET /api/ai/agents

Get agent execution history for the current user.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `integer` | `20` | Number of results |
| `offset` | `integer` | `0` | Skip N results |

**Response `200 OK`:** Array of past agent executions.

---

#### POST /api/ai/agents/plan

Run the planner agent for sprint planning (convenience endpoint).

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | `string (uuid)` | Yes | Project to plan for |
| `goal` | `string` | No | Planning goal override |
| `context` | `object` | No | Additional context |

**Response `201 Created`:** Agent execution result.

---

#### POST /api/ai/agents/review

Run the reviewer agent (convenience endpoint).

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes | Content to review |
| `contentType` | `string` | Yes | Type of content (`code`, `document`, `design`) |
| `context` | `object` | No | Additional context |

**Response `201 Created`:** Agent execution result.

---

#### POST /api/ai/agents/develop

Run the developer agent (convenience endpoint).

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | `string` | Yes | Development task description |
| `language` | `string` | No | Target programming language |
| `context` | `object` | No | Additional context |

**Response `201 Created`:** Agent execution result.

---

### Memory

#### POST /api/ai/memory/store

Store a memory for the AI to recall later.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `content` | `string` | Yes | -- | Memory content |
| `metadata` | `object` | No | -- | Arbitrary metadata |
| `workspaceId` | `string (uuid)` | No | -- | Scope to workspace |
| `memoryType` | `string` | No | `knowledge` | Memory type tag |

```json
{
  "content": "The team uses PostgreSQL for the main database and Redis for caching",
  "workspaceId": "ws-uuid",
  "memoryType": "knowledge",
  "metadata": { "source": "meeting_notes", "date": "2026-04-10" }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "id": "memory-uuid"
  }
}
```

---

#### POST /api/ai/memory/recall

Recall relevant memories using semantic search.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | `string` | Yes | -- | Semantic search query |
| `topK` | `integer` | No | `5` | Number of results to return |
| `workspaceId` | `string (uuid)` | No | -- | Filter by workspace |
| `filters` | `object` | No | -- | Additional metadata filters |

```json
{
  "query": "What database does the team use?",
  "topK": 3,
  "workspaceId": "ws-uuid"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "memory-uuid",
      "content": "The team uses PostgreSQL for the main database and Redis for caching",
      "score": 0.92,
      "metadata": { "source": "meeting_notes", "date": "2026-04-10" }
    }
  ]
}
```

---

#### DELETE /api/ai/memory/:id

Delete (forget) a stored memory.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "memory-uuid",
    "deleted": true
  }
}
```

---

#### GET /api/ai/memory/context/:workspaceId

Get the full memory context for a workspace.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "workspaceId": "ws-uuid",
    "memories": [ "..." ],
    "summary": "This workspace focuses on..."
  }
}
```

---

## Notification Service

**Base path:** `/api/notifications`

All endpoints require authentication. User ID is read from the `X-User-Id` header.

### GET /api/notifications

List the current user's notifications.

- **Auth:** Required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number |
| `pageSize` | `integer` | `20` | Items per page |
| `type` | `string` | -- | Filter by notification type |
| `read` | `boolean` | -- | Filter by read status |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "notif-uuid",
      "type": "mention",
      "title": "Jane mentioned you in Sprint 14 Planning Notes",
      "body": "Should we add a risk section here?",
      "resource_type": "document",
      "resource_id": "doc-uuid",
      "read": false,
      "created_at": "2026-04-13T10:30:00.000Z"
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20,
  "hasMore": false
}
```

---

### GET /api/notifications/unread-count

Get the count of unread notifications.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "count": 7
  }
}
```

---

### PUT /api/notifications/:id/read

Mark a single notification as read.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "notif-uuid",
    "read": true
  }
}
```

---

### PUT /api/notifications/read-all

Mark all notifications as read.

- **Auth:** Required

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "markedRead": 7
  }
}
```

---

### DELETE /api/notifications/:id

Delete a notification.

- **Auth:** Required

**Response `204 No Content`:** (empty body)

---

### PUT /api/notifications/preferences

Update notification preferences for the current user.

- **Auth:** Required

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | `string` | No | Notification channel (`email`, `push`, `in_app`) |
| `notificationType` | `string` | No | Notification type to configure |
| `enabled` | `boolean` | No | Enable/disable the channel for this type |
| `quietHours` | `object` | No | Quiet hours configuration |

```json
{
  "channel": "email",
  "notificationType": "mention",
  "enabled": true,
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "08:00",
    "timezone": "America/New_York"
  }
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

---

## WebSocket Events

**URL:** `ws://localhost:4001/`

### Connection

Connect via WebSocket with authentication token passed as a query parameter, `Authorization` header, or `access_token` cookie:

```
ws://localhost:4001/?token=<accessToken>
```

Or:

```
Authorization: Bearer <accessToken>
```

Or cookie:

```
Cookie: access_token=<accessToken>
```

**On successful connection, the server sends:**

```json
{
  "type": "connection:established",
  "socketId": "sock_1_1713000000000",
  "userId": "user-uuid",
  "timestamp": "2026-04-13T10:00:00.000Z"
}
```

**Authentication failures reject the upgrade with HTTP status 401:**

```json
{ "error": "NO_TOKEN" }
{ "error": "TOKEN_EXPIRED" }
{ "error": "INVALID_TOKEN" }
```

### Message Format

All messages are JSON objects with a required `type` field:

```json
{ "type": "message.type", "...": "..." }
```

### Error Messages

The server may send error messages at any time:

| Type | Description |
|------|-------------|
| `error:parse` | Invalid JSON sent |
| `error:validation` | Missing required fields |
| `error:rate_limit` | Message rate limit exceeded |
| `error:internal` | Server-side processing error |
| `error:unknown_type` | Unrecognized message type |

```json
{
  "type": "error:rate_limit",
  "message": "Message rate limit exceeded, message dropped",
  "retryAfterMs": 1000
}
```

---

### Room Management

#### room:join

Join a collaborative room.

**Client sends:**

```json
{
  "type": "room:join",
  "roomId": "doc:document-uuid",
  "roomType": "document",
  "metadata": {}
}
```

Room types: `document`, `code`, `whiteboard`, `project`.

Room ID format: `<type>:<resource-uuid>` (e.g., `doc:abc-123`, `code:file-uuid`, `wb:board-uuid`, `project:proj-uuid`).

**Server responds:**

```json
{
  "type": "room:joined",
  "roomId": "doc:document-uuid",
  "roomType": "document",
  "members": [
    { "socketId": "sock_1_...", "userId": "user-uuid-1" },
    { "socketId": "sock_2_...", "userId": "user-uuid-2" }
  ]
}
```

**On failure:**

```json
{
  "type": "room:join_failed",
  "roomId": "doc:document-uuid",
  "error": "Access denied"
}
```

---

#### room:leave

Leave a room.

**Client sends:**

```json
{
  "type": "room:leave",
  "roomId": "doc:document-uuid"
}
```

**Server responds:**

```json
{
  "type": "room:left",
  "roomId": "doc:document-uuid"
}
```

---

### Ping/Pong (Application-Level)

**Client sends:**

```json
{ "type": "ping" }
```

**Server responds:**

```json
{
  "type": "pong",
  "timestamp": "2026-04-13T10:00:05.000Z"
}
```

---

### Presence Events

#### presence:set

Set your presence state.

**Client sends:**

```json
{
  "type": "presence:set",
  "state": "online",
  "metadata": { "currentView": "document-editor" }
}
```

States: `online`, `away`, `busy`, `offline`.

---

#### presence:typing

Broadcast typing indicator.

**Client sends:**

```json
{
  "type": "presence:typing",
  "roomId": "doc:document-uuid",
  "isTyping": true
}
```

**Broadcast to room:**

```json
{
  "type": "presence:typing",
  "roomId": "doc:document-uuid",
  "userId": "user-uuid",
  "isTyping": true,
  "timestamp": "2026-04-13T10:00:05.000Z"
}
```

---

### Document Events

All document events require the client to have joined a `doc:<documentId>` room.

#### doc:sync:step1

Initial CRDT sync handshake. Client sends its Y.js state vector.

**Client sends:**

```json
{
  "type": "doc:sync:step1",
  "documentId": "doc-uuid",
  "stateVector": [1, 2, 3, 4, 5]
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "doc:sync:step1",
  "documentId": "doc-uuid",
  "stateVector": [1, 2, 3, 4, 5],
  "fromUserId": "user-uuid"
}
```

---

#### doc:sync:step2

Sync step 2 response: the diff/update the receiver is missing.

**Client sends:**

```json
{
  "type": "doc:sync:step2",
  "documentId": "doc-uuid",
  "update": [10, 20, 30, 40]
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "doc:sync:step2",
  "documentId": "doc-uuid",
  "update": [10, 20, 30, 40],
  "fromUserId": "user-uuid"
}
```

---

#### doc:update

Incremental CRDT update (Y.js encoded).

**Client sends:**

```json
{
  "type": "doc:update",
  "documentId": "doc-uuid",
  "update": [10, 20, 30, 40]
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "doc:update",
  "documentId": "doc-uuid",
  "update": [10, 20, 30, 40],
  "fromUserId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### doc:awareness

Y.js awareness protocol update (cursor, selection, user info).

**Client sends:**

```json
{
  "type": "doc:awareness",
  "documentId": "doc-uuid",
  "clientId": 12345,
  "state": {
    "user": { "name": "Jane", "color": "#4A90D9" },
    "cursor": { "anchor": 120, "head": 120 }
  }
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "doc:awareness",
  "documentId": "doc-uuid",
  "clientId": 12345,
  "state": { "..." : "..." },
  "userId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### doc:cursor

Lightweight cursor position update.

**Client sends:**

```json
{
  "type": "doc:cursor",
  "documentId": "doc-uuid",
  "anchor": 120,
  "head": 145,
  "userName": "Jane",
  "userColor": "#4A90D9"
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "doc:cursor",
  "documentId": "doc-uuid",
  "userId": "user-uuid",
  "anchor": 120,
  "head": 145,
  "userName": "Jane",
  "userColor": "#4A90D9",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

### Code Events

All code events require the client to have joined a `code:<fileId>` room.

#### code:sync:step1

Initial CRDT sync for code files.

**Client sends:**

```json
{
  "type": "code:sync:step1",
  "fileId": "file-uuid",
  "stateVector": [1, 2, 3]
}
```

**Broadcast:** Same as document sync, with `fileId` instead of `documentId`.

---

#### code:sync:step2

Code sync step 2 response.

**Client sends:**

```json
{
  "type": "code:sync:step2",
  "fileId": "file-uuid",
  "update": [10, 20, 30]
}
```

---

#### code:update

Incremental CRDT update for code.

**Client sends:**

```json
{
  "type": "code:update",
  "fileId": "file-uuid",
  "update": [10, 20, 30]
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "code:update",
  "fileId": "file-uuid",
  "update": [10, 20, 30],
  "fromUserId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### code:cursor

Code editor cursor position.

**Client sends:**

```json
{
  "type": "code:cursor",
  "fileId": "file-uuid",
  "line": 42,
  "column": 15,
  "userName": "Jane",
  "userColor": "#4A90D9"
}
```

**Broadcast to room:**

```json
{
  "type": "code:cursor",
  "fileId": "file-uuid",
  "userId": "user-uuid",
  "line": 42,
  "column": 15,
  "userName": "Jane",
  "userColor": "#4A90D9",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### code:execute:request

Request code execution from within a collaborative session.

**Client sends:**

```json
{
  "type": "code:execute:request",
  "fileId": "file-uuid",
  "executionId": "exec-uuid",
  "language": "python",
  "code": "print('Hello')",
  "stdin": ""
}
```

**Server acknowledges to sender:**

```json
{
  "type": "code:execute:ack",
  "executionId": "exec-uuid",
  "fileId": "file-uuid",
  "status": "queued",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "code:execute:started",
  "executionId": "exec-uuid",
  "fileId": "file-uuid",
  "userId": "user-uuid",
  "language": "python",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### code:execute:result

Execution result broadcast to the room (from server).

**Broadcast to all room members:**

```json
{
  "type": "code:execute:result",
  "fileId": "file-uuid",
  "executionId": "exec-uuid",
  "stdout": "Hello\n",
  "stderr": "",
  "exitCode": 0,
  "executionTimeMs": 45,
  "memoryUsedBytes": 8192000,
  "timestamp": "2026-04-13T10:01:01.000Z"
}
```

---

#### code:terminal:output

Streaming terminal output during execution.

**Broadcast to all room members:**

```json
{
  "type": "code:terminal:output",
  "fileId": "file-uuid",
  "executionId": "exec-uuid",
  "stream": "stdout",
  "data": "Processing line 42...\n",
  "userId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.500Z"
}
```

---

### Whiteboard Events

All whiteboard events require the client to have joined a `wb:<boardId>` room.

#### wb:element:create

Create new element(s) on the whiteboard.

**Client sends:**

```json
{
  "type": "wb:element:create",
  "boardId": "board-uuid",
  "elements": [
    {
      "id": "elem-uuid",
      "type": "rectangle",
      "x": 100,
      "y": 200,
      "width": 150,
      "height": 80,
      "style": { "fill": "#4A90D9" },
      "content": "API Gateway"
    }
  ]
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "wb:element:create",
  "boardId": "board-uuid",
  "elements": [ "..." ],
  "userId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### wb:element:update

Update existing element(s).

**Client sends:**

```json
{
  "type": "wb:element:update",
  "boardId": "board-uuid",
  "elements": [
    {
      "id": "elem-uuid",
      "x": 150,
      "y": 250,
      "style": { "fill": "#E74C3C" }
    }
  ]
}
```

---

#### wb:element:delete

Delete element(s).

**Client sends:**

```json
{
  "type": "wb:element:delete",
  "boardId": "board-uuid",
  "elementIds": ["elem-uuid-1", "elem-uuid-2"]
}
```

---

#### wb:viewport:sync

Synchronize viewport position (transient, not persisted).

**Client sends:**

```json
{
  "type": "wb:viewport:sync",
  "boardId": "board-uuid",
  "viewport": { "x": 500, "y": 300, "zoom": 1.5 }
}
```

---

#### wb:laser

Laser pointer for presentations (ephemeral, high frequency).

**Client sends:**

```json
{
  "type": "wb:laser",
  "boardId": "board-uuid",
  "x": 450,
  "y": 320,
  "active": true
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "wb:laser",
  "boardId": "board-uuid",
  "x": 450,
  "y": 320,
  "active": true,
  "userId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### wb:batch

Batch multiple operations in a single message.

**Client sends:**

```json
{
  "type": "wb:batch",
  "boardId": "board-uuid",
  "operations": [
    { "op": "create", "elements": [ "..." ] },
    { "op": "update", "elements": [ "..." ] },
    { "op": "delete", "elementIds": ["elem-uuid"] }
  ]
}
```

---

### Project Events

All project events require the client to have joined a `project:<projectId>` room.

#### project:task:create

Real-time task creation notification.

**Client sends:**

```json
{
  "type": "project:task:create",
  "projectId": "project-uuid",
  "task": {
    "id": "task-uuid",
    "title": "New task",
    "description": "",
    "status": "backlog",
    "priority": "medium",
    "assigneeId": null,
    "columnId": "backlog",
    "order": 0
  }
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "project:task:create",
  "projectId": "project-uuid",
  "task": { "..." : "..." },
  "userId": "user-uuid",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```

---

#### project:task:update

Real-time task field updates.

**Client sends:**

```json
{
  "type": "project:task:update",
  "projectId": "project-uuid",
  "taskId": "task-uuid",
  "changes": {
    "status": "in_progress",
    "assigneeId": "user-uuid"
  }
}
```

---

#### project:task:delete

Real-time task deletion.

**Client sends:**

```json
{
  "type": "project:task:delete",
  "projectId": "project-uuid",
  "taskId": "task-uuid"
}
```

---

#### project:kanban:move

Move a task card between Kanban columns.

**Client sends:**

```json
{
  "type": "project:kanban:move",
  "projectId": "project-uuid",
  "taskId": "task-uuid",
  "fromColumnId": "todo",
  "toColumnId": "in_progress",
  "newOrder": 2
}
```

---

#### project:kanban:reorder

Reorder tasks within a Kanban column.

**Client sends:**

```json
{
  "type": "project:kanban:reorder",
  "projectId": "project-uuid",
  "columnId": "in_progress",
  "taskOrders": [
    { "taskId": "task-1", "order": 0 },
    { "taskId": "task-2", "order": 1 },
    { "taskId": "task-3", "order": 2 }
  ]
}
```

---

#### project:sprint:timer

Sprint timer synchronization (broadcast to all members including sender).

**Client sends:**

```json
{
  "type": "project:sprint:timer",
  "projectId": "project-uuid",
  "sprintId": "sprint-uuid",
  "action": "start",
  "endsAt": "2026-04-28T17:00:00.000Z"
}
```

Actions: `start`, `pause`, `resume`, `stop`, `sync`.

---

#### project:presence

Project board presence (who is viewing/editing what).

**Client sends:**

```json
{
  "type": "project:presence",
  "projectId": "project-uuid",
  "viewingTaskId": "task-uuid",
  "editingField": "description"
}
```

**Broadcast to room (excluding sender):**

```json
{
  "type": "project:presence",
  "projectId": "project-uuid",
  "userId": "user-uuid",
  "viewingTaskId": "task-uuid",
  "editingField": "description",
  "timestamp": "2026-04-13T10:01:00.000Z"
}
```
