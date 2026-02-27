# CollabSpace Architecture

> **Version:** 2.0 &nbsp;|&nbsp; **Last updated:** 2026-04-13 &nbsp;|&nbsp; **Status:** Living document

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Architecture](#2-service-architecture)
3. [Data Architecture](#3-data-architecture)
4. [Real-Time Collaboration Engine](#4-real-time-collaboration-engine)
5. [WebSocket Sharding Strategy](#5-websocket-sharding-strategy)
6. [AI System Architecture](#6-ai-system-architecture)
7. [Event-Driven Architecture](#7-event-driven-architecture)
8. [Security Architecture](#8-security-architecture)
9. [Observability](#9-observability)
10. [Scaling & Performance](#10-scaling--performance)
11. [Multi-Tenant Architecture](#11-multi-tenant-architecture)
12. [Failover & Recovery](#12-failover--recovery)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
                                  +------------------+
                                  |   CDN (Static)   |
                                  +--------+---------+
                                           |
                                  +--------v---------+
            +-------------------->|  Load Balancer    |<--------------------+
            |                     |  (L7 / Ingress)   |                    |
            |                     +----+--------+-----+                    |
            |                          |        |                          |
            |                 HTTP/REST |        | WebSocket Upgrade       |
            |                          |        |                          |
    +-------v--------+        +--------v---+  +-v-----------+     +-------v--------+
    |   Web Client   |        |    API     |  |  WebSocket  |     |  Mobile/SDK    |
    |  (React SPA)   |        |  Gateway   |  |  Gateway    |     |   Clients      |
    |  Port: 3000    |        |  Port:4000 |  |  Port:4001  |     |                |
    +----------------+        +-----+------+  +------+------+     +----------------+
                                    |                |
                 +------------------+----------------+-------------------+
                 |                  |                |                   |
          +------v------+   +------v------+  +------v------+   +-------v------+
          |    Auth     |   |  Document   |  |    Code     |   |    Board     |
          |   Service   |   |   Service   |  |   Service   |   |   Service    |
          |  Port:4002  |   |  Port:4003  |  |  Port:4004  |   |  Port:4005   |
          +------+------+   +------+------+  +------+------+   +------+-------+
                 |                 |                |                  |
          +------v------+   +------v------+  +------v------+         |
          |   Project   |   |     AI      |  | Notification|         |
          |   Service   |   |   Service   |  |   Service   |         |
          |  Port:4006  |   |  Port:4008  |  |  Port:4007  |         |
          +------+------+   +------+------+  +------+------+         |
                 |                 |                |                  |
    +------------+-----------------+----------------+------------------+-----+
    |                                                                       |
    |                     Shared Infrastructure                             |
    |                                                                       |
    |  +------------+   +-----------+   +-----------+   +----------------+  |
    |  | PostgreSQL |   |   Redis   |   |   Kafka   |   | Vector DB      |  |
    |  | (per-svc)  |   |  Cluster  |   |  Cluster  |   | (Embeddings)   |  |
    |  +------------+   +-----------+   +-----------+   +----------------+  |
    |                                                                       |
    +-----------------------------------------------------------------------+
```

### 1.2 Design Philosophy

CollabSpace is built on four foundational principles:

**Distributed Microservices.** Each service owns its data, exposes a
well-defined API, and can be deployed, scaled, and versioned independently.
There are no cross-service database joins; inter-service communication flows
through HTTP calls (synchronous) and Kafka events (asynchronous).

**Event-Driven.** Every meaningful state change is published to Kafka. Other
services subscribe to the topics they care about, enabling loose coupling and
enabling features like real-time notifications, AI suggestions, and audit
trails without point-to-point integrations.

**Offline-First.** The document collaboration engine is built on CRDTs (Yjs).
Clients maintain a local `Y.Doc`; edits are applied locally first and synced to
the server when connectivity is available. This guarantees sub-millisecond local
response times and seamless offline editing.

**AI-Native.** AI is not bolted on as an afterthought. A dedicated AI service
provides a multi-LLM gateway with circuit breakers, an agent orchestrator that
can plan/act/observe in loops, persistent memory (short-term in Redis,
long-term in a vector database), and a predictive engine that watches
collaboration patterns and surfaces suggestions proactively.

### 1.3 Key Architectural Decisions & Tradeoffs

| Decision | Rationale | Tradeoff |
|---|---|---|
| Monorepo with Turborepo | Single version of truth, atomic refactors across services, shared `packages/` | CI time grows with repo size; mitigated by Turbo caching |
| Yjs CRDT over OT | No central sequencer, offline-first, mathematically proven convergence | Higher memory per doc (state vectors); compaction amortizes cost |
| Kafka over RabbitMQ | Durable log, consumer groups, replay capability, high throughput | Higher operational complexity; acceptable for the scale target |
| PostgreSQL per service | Full ACID, pg_trgm for search, JSONB for flexible schemas | More databases to manage; each is small and focused |
| Redis for sessions + rate limiting + presence | Sub-ms latency, built-in sorted sets for sliding window, pub/sub for sharding | Single point of failure if not clustered; mitigated by Sentinel/Cluster |
| Docker sandboxing for code execution | Process-level isolation, resource limits, no network | Cold-start latency; mitigated by container pooling |
| JWT at gateway level | Removes auth burden from downstream services, single verification point | Gateway becomes a chokepoint; mitigated by horizontal scaling |

### 1.4 Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (Node.js 20 LTS) |
| Build | Turborepo, esbuild |
| HTTP Framework | Express |
| WebSocket | `ws` (raw WebSocket, no Socket.IO overhead) |
| CRDT | Yjs + y-protocols |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 (ioredis client) |
| Message Broker | Apache Kafka (kafkajs client) |
| AI LLMs | Google Gemini (primary), OpenAI (fallback) |
| Vector DB | Pinecone / pgvector |
| Container Runtime | Docker |
| Orchestration | Kubernetes |
| IaC | Terraform |
| Metrics | Prometheus + prom-client |
| Dashboards | Grafana |
| Tracing | Jaeger (X-Request-Id propagation) |

---

## 2. Service Architecture

### 2.1 API Gateway (Port 4000)

**Purpose:** Single entry point for all client HTTP traffic. Authenticates
requests, enforces rate limits, routes to downstream services through a
reverse proxy, and wraps each proxy call in a circuit breaker.

**Responsibilities:**

- JWT verification and user context injection (`X-User-Id`, `X-User-Role`,
  `X-User-Email`, `X-User-Org-Id` headers)
- Sliding-window rate limiting at three tiers (auth, ai, default) plus a
  global cap
- Circuit breaker per downstream service (closed/open/half-open)
- Request ID generation and propagation (`X-Request-Id`)
- Prometheus metrics collection (request count, latency histogram, error rate,
  circuit breaker state)
- CORS enforcement, Helmet security headers, gzip compression
- Health-check aggregation across all services

**Key Endpoints:**

| Method | Path | Target Service |
|--------|------|----------------|
| `*` | `/api/auth/**` | auth-service |
| `*` | `/api/documents/**` | doc-service |
| `*` | `/api/code/**` | code-service |
| `*` | `/api/boards/**` | board-service |
| `*` | `/api/projects/**` | project-service |
| `*` | `/api/ai/**` | ai-service |
| `*` | `/api/notifications/**` | notification-service |
| `GET` | `/health` | Self |
| `GET` | `/metrics` | Prometheus scrape |

**Service Registry (from `config.ts`):**

```typescript
services: {
  auth:          { url: 'http://localhost:4002', timeout: 10_000 },
  documents:     { url: 'http://localhost:4003', timeout: 15_000 },
  code:          { url: 'http://localhost:4004', timeout: 30_000 },
  boards:        { url: 'http://localhost:4005', timeout: 15_000 },
  projects:      { url: 'http://localhost:4006', timeout: 15_000 },
  ai:            { url: 'http://localhost:4008', timeout: 60_000 },
  notifications: { url: 'http://localhost:4007', timeout: 10_000 },
}
```

**Circuit Breaker Configuration:**

```
failureThreshold:         5        (failures to trip open)
resetTimeoutMs:           10,000   (base backoff before half-open)
maxResetTimeoutMs:        120,000  (max exponential backoff)
halfOpenSuccessThreshold: 3        (probes to close)
windowSizeMs:             60,000   (sliding failure window)
```

State machine:

```
                  5 failures in 60s
    CLOSED ──────────────────────────> OPEN
       ^                                 |
       |  3 successful probes            |  timeout elapsed
       |                                 v
       +──────────────────────── HALF-OPEN
                                    |
                      1 failure     |
                      ─────────────>+ (re-open with exponential backoff)
```

**Rate Limiter Algorithm (Lua script on Redis sorted sets):**

```
ZREMRANGEBYSCORE key 0 (now - window_ms)   -- prune expired
count = ZCARD key                           -- count current window
if count < limit:
    ZADD key now member                     -- admit
    EXPIRE key (window + 10s)
    return [1, remaining, 0]
else:
    oldest = ZRANGE key 0 0 WITHSCORES
    retryAfterMs = oldest_score + window_ms - now
    return [0, 0, retryAfterMs]
```

**Dependencies:** Redis

**Data Owned:** None (stateless proxy)

**Scaling Strategy:** Horizontal. Fully stateless; add replicas behind the load
balancer. Rate limit state lives in Redis so all instances share counters.

---

### 2.2 Auth Service (Port 4002)

**Purpose:** Identity, authentication, authorization, and user management.

**Responsibilities:**

- User registration with email verification
- Login/logout with JWT access + refresh token pairs
- Password hashing with scrypt (Node.js `crypto.scrypt`)
- Token rotation: on refresh, the old refresh token is revoked and a new pair
  is issued
- Access token blacklist (Redis) for immediate logout
- RBAC with a 5-role hierarchy: `guest(0) < viewer(1) < member(2) < admin(3) < owner(4)`
- ABAC conditions: ownership, organization membership, time-based (business hours)
- Audit logging of authentication events

**Token Architecture:**

```
Access Token (JWT, 15m TTL):
{
  userId, email, role, orgId,
  type: "access",
  iss: "collabspace-auth",
  aud: "collabspace"
}

Refresh Token (JWT, 7d TTL):
{
  userId, tokenId,
  type: "refresh",
  iss: "collabspace-auth",
  aud: "collabspace"
}
```

Token storage in Redis:

```
refresh_token:{tokenId}  -> { userId, tokenHash, createdAt }   TTL: 7d
token_blacklist:{hash}   -> "1"                                 TTL: remaining token life
email_verify:{token}     -> userId                              TTL: configurable
password_reset:{token}   -> userId                              TTL: configurable
```

**RBAC Permission Matrix:**

| Resource | owner | admin | member | viewer | guest |
|---|---|---|---|---|---|
| organization | CRUD+M | R,U | R | R | -- |
| project | CRUD+M+E | CRUD+M+E | C,R,U | R | R |
| document | CRUD+M+E | CRUD+M+E | C,R,U | R | R |
| board | CRUD+M+E | CRUD+M+E | C,R,U | R | R |
| code_session | CRUD+M+E | CRUD+M+E | C,R,U | R | R |
| user | CRUD+M+I | R,U,I,M | R | R | -- |
| settings | R,U,M | R,U | R | -- | -- |
| billing | R,U,M | R | -- | -- | -- |
| audit_log | R,E | R | -- | -- | -- |

_Legend: C=Create, R=Read, U=Update, D=Delete, M=Manage, I=Invite, E=Export_

**ABAC Enhancement:**

Resource owners can update/delete their own resources even as viewers (but not
as guests). Combined ABAC check:

```
checkAbacPermission(ctx, resource, action, {
  requireOwnership?,       // ctx.userId === ctx.resourceOwnerId
  requireMembership?,      // ctx.orgId === ctx.userOrgId
  requireBusinessHours?,   // weekday 09:00-17:00 UTC
})
```

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Authenticate, return token pair |
| `POST` | `/auth/refresh` | Rotate tokens |
| `POST` | `/auth/logout` | Blacklist access token, revoke refresh token |
| `POST` | `/auth/verify-email` | Verify email token |
| `POST` | `/auth/forgot-password` | Generate reset token |
| `POST` | `/auth/reset-password` | Consume reset token, update password |
| `GET` | `/auth/me` | Current user profile |

**Dependencies:** PostgreSQL, Redis

**Data Owned:** `users`, `organizations`, `org_memberships`, `workspace_memberships`, `audit_logs`

**Scaling Strategy:** Horizontal. Token verification is stateless (JWT
signature check). Redis stores session state so instances are interchangeable.

---

### 2.3 WebSocket Gateway (Port 4001)

**Purpose:** Manages all persistent WebSocket connections for real-time
collaboration, presence, and live updates.

**Responsibilities:**

- Authenticate WebSocket upgrades (JWT verification before `handleUpgrade`)
- Connection lifecycle management (add, remove, heartbeat, timeout)
- Room system with typed rooms: `document`, `code`, `whiteboard`, `project`
- Consistent-hash sharding: room ID determines which shard owns the room
- Cross-shard messaging via Redis pub/sub
- Presence tracking (online/away/busy/offline) with per-user state
- Typing indicators and cursor position broadcasts
- Per-connection rate limiting with backpressure (buffer then drop)
- Message routing to type-specific handlers (`doc:*`, `code:*`, `wb:*`, `project:*`)

**Connection Manager Data Structures:**

```
connections:      Map<socketId, AuthenticatedSocket>
userConnections:  Map<userId, Set<socketId>>        (multi-tab support)
roomConnections:  Map<roomId, Set<socketId>>
```

**Heartbeat Protocol:**

```
Interval:  30s (configurable via config.heartbeatIntervalMs)
Mechanism: WebSocket ping/pong frames

Every 30s:
  for each connection:
    if !isAlive and (now - lastPing > timeout):
      terminate + remove
    else:
      isAlive = false
      send ping
      record pingSentAt

On pong:
  isAlive = true
  lastPing = now
  record heartbeat latency metric
```

**Message Protocol:**

```json
{
  "type": "room:join | room:leave | doc:* | code:* | wb:* | project:* | presence:* | ping",
  "roomId": "uuid",
  "roomType": "document | code | whiteboard | project",
  ...payload
}
```

**Rate Limiting (Backpressure):**

Per-connection rate limiter with a two-stage strategy:

1. **Buffer stage:** If the message rate exceeds the threshold, messages are
   queued in a per-connection buffer (up to a configurable max).
2. **Drop stage:** If the buffer is full, the message is dropped and the client
   receives an `error:rate_limit` message with `retryAfterMs`.
3. **Drain callback:** When the rate window reopens, buffered messages are
   replayed through `processMessage`.

**Key Message Types:**

| Type | Direction | Description |
|------|-----------|-------------|
| `connection:established` | Server to Client | Welcome message with socketId |
| `room:join` | Client to Server | Join a collaboration room |
| `room:joined` | Server to Client | Confirm join with member list |
| `room:leave` | Client to Server | Leave a room |
| `doc:sync` | Bidirectional | CRDT sync messages |
| `doc:awareness` | Bidirectional | Cursor/selection/typing state |
| `code:edit` | Bidirectional | Code file changes |
| `wb:element:*` | Bidirectional | Whiteboard element operations |
| `project:task:*` | Bidirectional | Task board updates |
| `presence:set` | Client to Server | Update presence state |
| `presence:typing` | Client to Server | Typing indicator |
| `ping` / `pong` | Bidirectional | Application-level keepalive |
| `error:rate_limit` | Server to Client | Backpressure notification |

**Dependencies:** Redis (pub/sub, presence, shard registry)

**Data Owned:** None (ephemeral connection state only)

**Scaling Strategy:** Horizontal with consistent-hash sharding. Each instance
is a shard; rooms are assigned to shards via the hash ring. Adding a new
instance triggers shard rebalancing (see Section 5).

---

### 2.4 Document Service (Port 4003)

**Purpose:** Collaborative rich-text documents with CRDT persistence, version
history, comments, and search.

**Responsibilities:**

- Document CRUD with workspace scoping
- Yjs CRDT persistence: debounced writes (500ms batch window) to avoid write
  storms; periodic compaction (merge N updates into 1 snapshot every 100
  updates)
- Version history via snapshots
- Threaded comments with position anchoring (from/to offsets, optional blockId)
- Full-text search using PostgreSQL `pg_trgm` trigram index
- Document export (HTML, Markdown, PDF)
- Kafka event publishing for all mutations

**CRDT Persistence Pipeline:**

```
Client Edit
    |
    v
Y.Doc (in-memory) ---update---> CRDTPersistence.storeUpdate()
    |                                    |
    |                            Accumulate in pendingUpdates Map
    |                                    |
    |                            Debounce timer (500ms)
    |                                    |
    |                            flushUpdates():
    |                              Y.mergeUpdates(pending)
    |                              storage.storeUpdate(merged)
    |                                    |
    |                            if updateCount >= 100:
    |                              compact():
    |                                doc = load full state
    |                                snapshot = Y.encodeStateAsUpdate(doc)
    |                                storage.storeSnapshot(snapshot)
    v
  Broadcast to room via WebSocket Gateway
```

**Document Loading:**

```
1. Load snapshot from storage (if exists)
2. Apply snapshot to new Y.Doc
3. Load all subsequent updates
4. Apply updates sequentially
5. Return hydrated Y.Doc
```

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents` | Create document (blank, meeting_notes, project_brief, technical_spec) |
| `GET` | `/documents` | List with search, pagination, workspace filter |
| `GET` | `/documents/:id` | Get document metadata |
| `PUT` | `/documents/:id` | Update metadata, collaborators |
| `DELETE` | `/documents/:id` | Soft delete |
| `GET` | `/documents/:id/export` | Export as HTML/MD/PDF |
| `POST` | `/documents/:id/comments` | Add comment (with position + threading) |
| `GET` | `/documents/:id/comments` | List comments (filterable by resolved state) |
| `PUT` | `/documents/:id/comments/:cid` | Update/resolve comment |

**Dependencies:** PostgreSQL, Redis, Kafka

**Data Owned:** `documents`, `document_updates`, `document_snapshots`,
`document_versions`, `comments`, `comment_replies`

**Scaling Strategy:** Horizontal. CRDT state is loaded on-demand from
PostgreSQL; in-memory `Y.Doc` instances are cached per node and can be
reconstructed from storage by any instance.

---

### 2.5 Code Service (Port 4004)

**Purpose:** Collaborative code editing, sandboxed execution, and contest mode.

**Responsibilities:**

- File CRUD with folder hierarchy (`parentFolderId`, `isFolder`)
- Multi-language code execution in Docker sandboxes
- Container security: 256MB RAM limit, 10s timeout, no network access, seccomp
  profile, non-root user, read-only filesystem
- Container pooling: pre-warm containers per language to reduce cold-start
- Contest mode with rooms, timed problems, auto-grading against test cases,
  leaderboard

**Supported Languages:**

| Language | Docker Image | File Extension |
|----------|-------------|----------------|
| JavaScript | `node:20-alpine` | `.js` |
| TypeScript | `node:20-alpine` + `tsx` | `.ts` |
| Python | `python:3.12-alpine` | `.py` |
| Java | `eclipse-temurin:21-alpine` | `.java` |
| C++ | `gcc:14-alpine` | `.cpp` |
| Go | `golang:1.22-alpine` | `.go` |
| Rust | `rust:1.77-alpine` | `.rs` |

**Execution Sandbox Configuration:**

```
Memory limit:    256 MB
CPU limit:       1 core
Timeout:         10 seconds
Network:         disabled (--network=none)
Filesystem:      read-only (--read-only)
User:            non-root (UID 1000)
Seccomp:         default Docker seccomp profile
Tmpfs:           /tmp (for compilation artifacts, 64MB)
```

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/code/files` | Create file/folder |
| `GET` | `/code/files` | List files (workspace, folder, language filter) |
| `GET` | `/code/files/:id` | Get file content |
| `PUT` | `/code/files/:id` | Update file |
| `DELETE` | `/code/files/:id` | Delete file |
| `POST` | `/code/execute` | Execute code snippet |
| `GET` | `/code/execute/:id` | Get execution result |
| `POST` | `/code/rooms` | Create contest room |
| `GET` | `/code/rooms` | List contest rooms |
| `GET` | `/code/rooms/:id` | Get room details |
| `POST` | `/code/rooms/:id/start` | Start contest timer |
| `POST` | `/code/rooms/:id/submit` | Submit solution for grading |
| `GET` | `/code/rooms/:id/leaderboard` | Get leaderboard |

**Dependencies:** PostgreSQL, Redis, Kafka, Docker

**Data Owned:** `code_files`, `code_executions`, `contest_rooms`,
`contest_submissions`, `test_cases`

**Scaling Strategy:** Horizontal. Code execution is stateless; container pool
size is per-node. Scale executor nodes independently from API nodes if needed.

---

### 2.6 Board Service (Port 4005)

**Purpose:** Collaborative whiteboard with shapes, connectors, sticky notes,
AI diagram generation, and export.

**Responsibilities:**

- Board CRUD with workspace scoping
- 12 element types with position, style, and z-index management
- Connector auto-routing between elements
- Real-time collaboration via WebSocket Gateway
- AI-powered diagram generation (flowcharts, mind maps, ER diagrams)
- Export pipeline: Canvas to SVG to PNG/PDF

**Element Types:**

| Type | Description |
|------|-------------|
| `rectangle` | Basic rectangle shape |
| `ellipse` | Circle / oval |
| `triangle` | Triangle shape |
| `line` | Straight line |
| `arrow` | Line with arrowhead |
| `text` | Free text block |
| `sticky_note` | Colored sticky note |
| `image` | Embedded image |
| `freehand` | Freehand drawing path |
| `connector` | Smart connector between elements |
| `group` | Group of elements |
| `frame` | Frame / section container |

**Element Data Model:**

```typescript
interface Element {
  id: string;
  boardId: string;
  type: ElementType;
  position: { x, y, width, height, rotation };
  style: { fill, stroke, strokeWidth, opacity, fontSize?, fontFamily? };
  content: string | null;
  zIndex: number;
  parentId: string | null;    // for groups
  connectedTo: string[];      // for connectors
  locked: boolean;
  metadata: Record<string, unknown>;
}
```

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/boards` | Create board |
| `GET` | `/boards` | List boards |
| `GET` | `/boards/:id` | Get board with elements |
| `PUT` | `/boards/:id` | Update board metadata |
| `DELETE` | `/boards/:id` | Soft delete |
| `POST` | `/boards/:id/elements` | Add element |
| `PUT` | `/boards/:id/elements/:eid` | Update element |
| `DELETE` | `/boards/:id/elements/:eid` | Remove element |
| `POST` | `/boards/:id/ai-generate` | AI diagram generation |
| `POST` | `/boards/:id/export` | Export as SVG/PNG/PDF |

**Dependencies:** PostgreSQL, Redis, Kafka, AI Service (for diagram generation)

**Data Owned:** `boards`, `board_elements`, `board_templates`

**Scaling Strategy:** Horizontal. Board state is in PostgreSQL; real-time sync
is handled by the WebSocket Gateway.

---

### 2.7 Project Service (Port 4006)

**Purpose:** Project management with tasks, sprints, dependencies, and
burndown tracking.

**Responsibilities:**

- Project CRUD with templates (blank, scrum, kanban, bug_tracking)
- Task management with a status state machine
- Auto-incrementing task keys via PostgreSQL trigger (e.g., `PROJ-1`, `PROJ-2`)
- Sprint management with burndown calculation
- Task dependency tracking with cycle detection
- Optimistic concurrency via version field on tasks
- Zod schema validation on all inputs

**Task Status State Machine:**

```
  backlog --> todo --> in_progress --> review --> done
     ^                    |              |
     |                    v              v
     +---------- (can return to backlog or todo)
```

**Auto-Incrementing Keys (PostgreSQL Trigger):**

```sql
CREATE OR REPLACE FUNCTION next_task_key()
RETURNS TRIGGER AS $$
DECLARE
  project_key TEXT;
  next_num    INTEGER;
BEGIN
  SELECT key INTO project_key FROM projects WHERE id = NEW.project_id;
  SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO next_num
    FROM tasks
   WHERE project_id = NEW.project_id;

  NEW.task_key     := project_key || '-' || next_num;
  NEW.sequence_number := next_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_key
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION next_task_key();
```

**Optimistic Concurrency:**

```sql
UPDATE tasks
   SET title = $1, status = $2, version = version + 1
 WHERE id = $3 AND version = $4;
-- If rowCount = 0 -> ConcurrencyConflictError
```

**Dependency Cycle Detection:**

Before creating a dependency edge `A -> B`, a DFS traversal from `B` checks
whether `A` is reachable. If so, the dependency is rejected with a
`CIRCULAR_DEPENDENCY` error.

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects` | Create project |
| `GET` | `/projects` | List projects (paginated, searchable) |
| `GET` | `/projects/:id` | Get project |
| `PUT` | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Archive project |
| `POST` | `/projects/:id/tasks` | Create task |
| `GET` | `/projects/:id/tasks` | List tasks (filterable by status, assignee) |
| `PUT` | `/projects/:id/tasks/:tid` | Update task (with version for OCC) |
| `POST` | `/projects/:id/tasks/:tid/dependencies` | Add dependency |
| `POST` | `/projects/:id/sprints` | Create sprint |
| `PUT` | `/projects/:id/sprints/:sid` | Update sprint |
| `GET` | `/projects/:id/sprints/:sid/burndown` | Get burndown data |
| `POST` | `/projects/:id/ai-suggest` | AI task suggestions |

**Dependencies:** PostgreSQL, Redis, Kafka

**Data Owned:** `projects`, `tasks`, `task_dependencies`, `sprints`,
`sprint_tasks`, `project_members`

**Scaling Strategy:** Horizontal. All state in PostgreSQL with optimistic
concurrency.

---

### 2.8 AI Service (Port 4008)

**Purpose:** Multi-LLM gateway, agent orchestration, memory, and predictive
intelligence.

**Responsibilities:**

- Multi-provider LLM abstraction (`BaseLLMProvider` -> `GeminiProvider`,
  `OpenAIProvider`)
- Dynamic routing: task type determines which model to use
- Circuit breaker per provider with automatic failover
- Rate limiting per provider (requests/min, tokens/min)
- 5 agent types with an agentic loop (plan -> think -> act -> observe)
- Agent orchestrator with sequential, parallel, and conditional workflows
- Tool-calling framework (7 built-in tools)
- Short-term memory (Redis, configurable TTL)
- Long-term memory (vector embeddings, semantic recall)
- Conflict predictor: detects when multiple users edit nearby lines
- Intent detector and suggestion engine
- Cost tracking per request

**Task-to-Model Routing:**

| Task Type | Primary Provider | Model Tier | Fallback |
|-----------|-----------------|------------|----------|
| `code_generation` | Gemini | Pro (gemini-2.5-pro) | OpenAI GPT-4o |
| `long_context` | Gemini | Pro (1M context) | OpenAI GPT-4o |
| `fast_response` | Gemini | Flash (gemini-2.0-flash) | OpenAI GPT-4o-mini |
| `embedding` | Gemini | text-embedding-004 | OpenAI text-embedding-3-small |
| `complex_reasoning` | Gemini | Pro | OpenAI GPT-4o |
| `general` | Gemini | Flash | OpenAI GPT-4o-mini |

**Provider Fallback Flow:**

```
Request(taskType, messages)
    |
    v
AIRouter.getAvailableProviders(taskType)
    |
    +-- For each provider (priority order):
    |     |
    |     +-- Check circuit breaker.canExecute()
    |     +-- Check rate limiter
    |     +-- Attempt request
    |     |     |
    |     |     +-- Success: track cost, return response
    |     |     +-- Failure: record failure in circuit breaker
    |     |                  log warning, try next provider
    |     |
    +-- All providers failed: throw last error
```

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ai/chat` | LLM chat completion |
| `POST` | `/ai/stream` | Streaming chat completion (SSE) |
| `POST` | `/ai/embed` | Generate embeddings |
| `POST` | `/ai/agents/execute` | Execute a single agent |
| `POST` | `/ai/agents/workflow` | Execute a multi-agent workflow |
| `GET` | `/ai/agents/:id/status` | Get agent execution status |
| `POST` | `/ai/agents/:id/cancel` | Cancel agent execution |
| `GET` | `/ai/agents/history` | Execution history |
| `POST` | `/ai/memory/store` | Store long-term memory |
| `POST` | `/ai/memory/recall` | Semantic recall from vector DB |
| `GET` | `/ai/memory/context/:wsId` | Get workspace context |
| `GET` | `/ai/providers/status` | Provider health + circuit state |
| `GET` | `/ai/cost` | Cost summary |

**Dependencies:** Redis, Kafka, Vector DB, External LLM APIs (Gemini, OpenAI)

**Data Owned:** Vector embeddings (long-term memory), execution history
(in-memory with periodic cleanup)

**Scaling Strategy:** Horizontal. LLM calls are I/O-bound; scale based on
concurrent request count. Agent concurrency is capped via
`agentConcurrencyLimit`.

---

### 2.9 Notification Service (Port 4007)

**Purpose:** Multi-channel notification dispatch driven by Kafka events.

**Responsibilities:**

- Kafka consumer subscribing to all 6 event topics
- Event-to-notification mapping (configurable rules)
- Multi-channel dispatch: in-app, email, push notifications
- Deduplication window (60s) to prevent notification spam
- Batch grouping for multiple related events
- Quiet hours support (per-user preference)
- Notification CRUD (mark read, dismiss, list)

**Kafka Topics Consumed:**

```
document.events  -> comment_added, mention
code.events      -> (future: execution_completed, contest_ended)
project.events   -> task_assigned, task_status_changed, sprint_completed
board.events     -> (future: board_shared)
ai.events        -> suggestion_generated
system.events    -> (future: system_error alerts)
```

**Event-to-Notification Mapping (excerpt):**

| Event | Notification Type | Recipients |
|-------|-------------------|------------|
| `document.comment_added` | comment | All document collaborators (except sender) |
| `document.mention` | mention | Mentioned user IDs |
| `project.task_assigned` | assignment | Assignee |
| `project.task_status_changed` | status_change | Assignee + reporter |
| `project.sprint_completed` | status_change | All project members |
| `ai.suggestion_generated` | ai_suggestion | Requesting user |

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications` | List user notifications |
| `PUT` | `/notifications/:id/read` | Mark as read |
| `PUT` | `/notifications/read-all` | Mark all as read |
| `DELETE` | `/notifications/:id` | Dismiss |
| `GET` | `/notifications/unread-count` | Unread badge count |
| `PUT` | `/notifications/preferences` | Update channel/quiet hours prefs |

**Dependencies:** PostgreSQL, Redis, Kafka

**Data Owned:** `notifications`, `notification_preferences`,
`notification_channels`

**Scaling Strategy:** Horizontal. Kafka consumer group ensures each partition
is processed by exactly one instance. Add instances to parallelize consumption.

---

## 3. Data Architecture

### 3.1 Database Schema Overview

Each service owns its PostgreSQL database. There are no cross-service joins.
Services reference entities from other services by UUID only.

```
auth-db (auth-service):
  ├── users              (id, email, password_hash, name, avatar, role, created_at, ...)
  ├── organizations      (id, name, slug, plan, owner_id, ...)
  ├── org_memberships    (id, org_id, user_id, role, ...)
  ├── workspace_memberships (id, workspace_id, user_id, role, ...)
  └── audit_logs         (id, user_id, action, resource, ip, timestamp, ...)

doc-db (doc-service):
  ├── documents          (id, title, workspace_id, owner_id, settings, deleted_at, ...)
  ├── document_updates   (id, document_id, update_data BYTEA, created_at)
  ├── document_snapshots (id, document_id, snapshot_data BYTEA, created_at)
  ├── document_versions  (id, document_id, version, snapshot_id, created_by, ...)
  ├── comments           (id, document_id, author_id, content, position JSONB,
  |                       parent_id, resolved, created_at, ...)
  └── document_collaborators (document_id, user_id, permission, ...)

code-db (code-service):
  ├── code_files         (id, name, language, content, workspace_id, owner_id,
  |                       parent_folder_id, is_folder, ...)
  ├── code_executions    (id, file_id, user_id, language, code, stdin, stdout,
  |                       stderr, exit_code, duration_ms, ...)
  ├── contest_rooms      (id, name, workspace_id, owner_id, problem JSONB,
  |                       time_limit_minutes, status, started_at, ...)
  ├── contest_submissions (id, room_id, user_id, code, language, score,
  |                        passed_tests, total_tests, ...)
  └── test_cases         (id, room_id, input, expected_output, is_hidden, ...)

board-db (board-service):
  ├── boards             (id, name, workspace_id, owner_id, settings, deleted_at, ...)
  ├── board_elements     (id, board_id, type, position JSONB, style JSONB,
  |                       content, z_index, parent_id, connected_to, locked, ...)
  └── board_templates    (id, name, elements JSONB, ...)

project-db (project-service):
  ├── projects           (id, name, key, description, workspace_id, settings JSONB,
  |                       owner_id, template, deleted_at, ...)
  ├── tasks              (id, project_id, task_key, sequence_number, title,
  |                       description, status, priority, assignee_id, reporter_id,
  |                       version, due_date, story_points, labels, ...)
  ├── task_dependencies  (id, task_id, depends_on_task_id, ...)
  ├── sprints            (id, project_id, name, start_date, end_date, goal, ...)
  ├── sprint_tasks       (sprint_id, task_id, ...)
  └── project_members    (project_id, user_id, role, ...)

notification-db (notification-service):
  ├── notifications      (id, recipient_id, sender_id, type, title, body,
  |                       entity_type, entity_id, read, created_at, ...)
  ├── notification_preferences (user_id, channel, enabled, quiet_hours JSONB, ...)
  └── notification_channels    (id, user_id, type, config JSONB, ...)
```

**Total: 25+ tables across 5 databases.**

### 3.2 Data Partitioning Strategy

Each service owns its database exclusively. Services do not access other
services' databases directly. Cross-service data is accessed via:

1. **Synchronous HTTP calls** (e.g., doc-service calls auth-service to validate
   a collaborator ID)
2. **Kafka events** (e.g., notification-service consumes project.events to know
   about task assignments)
3. **Denormalized caches** in Redis (e.g., user display names cached by
   doc-service to avoid constant auth-service calls)

```
+-------------+     HTTP      +-------------+
| doc-service | ------------> | auth-service |
+------+------+               +-------------+
       |
       | Kafka: document.events
       v
+------+------+
| notif-svc   |
+-------------+
```

### 3.3 Caching Strategy

Redis serves as the unified caching and real-time state layer:

| Key Pattern | Purpose | TTL | Service |
|---|---|---|---|
| `gw:rl:{tier}:ip:{ip}` | Rate limit counters (sorted sets) | window + 10s | API Gateway |
| `gw:rl:{tier}:user:{userId}` | Per-user rate limit | window + 10s | API Gateway |
| `gw:rl:global` | Global rate limit | window + 10s | API Gateway |
| `refresh_token:{tokenId}` | Active refresh token | 7 days | Auth Service |
| `token_blacklist:{hash}` | Revoked token | remaining TTL | Auth Service |
| `email_verify:{token}` | Email verification | configurable | Auth Service |
| `password_reset:{token}` | Password reset | configurable | Auth Service |
| `shard:{shardId}` | Shard registration | 120s | WS Gateway |
| `shards:active` | Active shard set | -- | WS Gateway |
| `presence:{userId}` | User presence state | -- | WS Gateway |
| `typing:{roomId}:{userId}` | Typing indicator | 5s | WS Gateway |
| `ai:mem:st:{key}` | Short-term AI memory | configurable | AI Service |
| `ai:mem:ctx:{wsId}:recent` | Recent interactions list | 24h | AI Service |
| `unread:{userId}` | Unread notification count | -- | Notification Service |

### 3.4 Event Sourcing via Kafka

Every service publishes domain events to Kafka topics. Events are the source of
truth for cross-service communication.

**Topics:**

| Topic | Producer(s) | Consumer(s) |
|---|---|---|
| `document.events` | doc-service | notification-service, ai-service |
| `code.events` | code-service | notification-service, ai-service |
| `project.events` | project-service | notification-service, ai-service |
| `board.events` | board-service | notification-service, ai-service |
| `ai.events` | ai-service | notification-service |
| `system.events` | ws-gateway, api-gateway | notification-service |

Consumer groups per service ensure at-least-once delivery:

```
Consumer Group: notification-consumer  (notification-service instances)
Consumer Group: ai-consumer            (ai-service instances)
```

---

## 4. Real-Time Collaboration Engine

### 4.1 CRDT Architecture

CollabSpace uses Yjs as its CRDT implementation. Every collaborative entity
(document, code file, whiteboard) is represented as a `Y.Doc` that can be
edited concurrently by multiple users with guaranteed eventual consistency.

```
 Client A (Browser)           Server (WS Gateway + Doc Service)           Client B (Browser)
 +------------------+         +-------------------------------+           +------------------+
 |                  |         |                               |           |                  |
 | Y.Doc (local)    | <-----> | Y.Doc (authoritative)         | <-------> | Y.Doc (local)    |
 |                  |  WebSocket  |                           |  WebSocket|                  |
 | Awareness        | <-----> | CRDTPersistence               | <-------> | Awareness        |
 | (cursor, typing) |         |   - debounced writes (500ms)  |           | (cursor, typing) |
 |                  |         |   - compaction (every 100 upd) |           |                  |
 +------------------+         |   - PostgreSQL storage         |           +------------------+
                              +-------------------------------+
```

### 4.2 Sync Protocol

The sync protocol is a two-phase handshake followed by incremental updates:

```
Client                                          Server
  |                                                |
  |  -------- SyncStep1 (state vector) --------->  |
  |                                                |
  |  <------- SyncStep2 (diff for client) ------   |
  |  <------- SyncStep1 (server state vector) --   |
  |                                                |
  |  -------- SyncStep2 (diff for server) ------>  |
  |                                                |
  |        [Both sides now synchronized]           |
  |                                                |
  |  -------- UPDATE (incremental) ------------->  |
  |  <------- UPDATE (from other clients) ------   |
  |                                                |
```

**Message types (from `sync-protocol.ts`):**

| Type | Code | Description |
|------|------|-------------|
| `SYNC_STEP1` | 0 | State vector: "here is what I have" |
| `SYNC_STEP2` | 1 | Diff: "here is what you are missing" |
| `UPDATE` | 2 | Incremental update (single edit) |
| `AWARENESS` | 3 | Cursor/selection/presence state |

**Wire format:** Each message is a binary `Uint8Array` encoded with lib0:

```
[varuint: messageType] [varuint8array: payload]
```

### 4.3 Awareness Protocol

Awareness state is separate from document state. It is ephemeral and not
persisted.

```typescript
interface AwarenessState {
  user: {
    userId: string;
    name: string;
    avatar: string | null;
    color: string;           // from 10-color palette, assigned on join
  };
  cursor: { anchor: number; head: number } | null;
  selection: { anchor: number; head: number } | null;
  isTyping: boolean;
  lastActive: number;        // epoch ms
}
```

Awareness updates are broadcast to all room members via the `AWARENESS`
message type. The `AwarenessManager` class wraps `y-protocols/awareness` and
provides:

- `setUser()` -- initialize presence with auto-assigned cursor color
- `setCursor()` -- update cursor position
- `setTyping()` -- toggle typing indicator
- `getConnectedUsers()` -- list all users currently in the document
- `encodeUpdate()` / `applyUpdate()` -- binary serialization for transport

### 4.4 Offline-First Design

```
Online Mode:                          Offline Mode:
+--------+   WebSocket   +--------+  +--------+
| Y.Doc  | <-----------> | Server |  | Y.Doc  |  (edits applied locally)
| (local)|               |        |  | (local)|
+--------+               +--------+  +---+----+
                                          |
                                      local changes accumulate
                                      in Y.Doc state
                                          |
                                  On Reconnect:
                                  1. initSync() sends SyncStep1
                                  2. Server responds with SyncStep2 (diff)
                                  3. Client sends SyncStep2 (its offline changes)
                                  4. Both sides converged
```

Because Yjs CRDTs are commutative and idempotent, applying the same update
twice is safe. No conflict resolution logic is needed -- the CRDT algorithm
guarantees convergence.

### 4.5 Conflict Resolution

**There are no conflicts.** This is a fundamental property of CRDTs:

- If two users type in the same position simultaneously, Yjs uses client IDs
  to deterministically order the concurrent insertions.
- If one user deletes text that another user is editing, the edit is applied
  to whatever remains after the delete.
- All replicas converge to the same state regardless of the order in which
  updates are applied.

### 4.6 Performance Optimizations

| Optimization | Mechanism | Impact |
|---|---|---|
| Debounced persistence | 500ms batch window; merge all pending updates into one | Reduces DB writes by ~10-50x |
| Compaction | Every 100 updates, full state is snapshotted | O(1) document load instead of O(N) update replay |
| Incremental updates | After initial sync, only diffs are transmitted | Typically 10-100 bytes per keystroke |
| Merged updates | `Y.mergeUpdates()` combines multiple small updates into one | Reduces storage size |
| Lazy document loading | `Y.Doc` instances are loaded on-demand, not at startup | Memory proportional to active documents only |

---

## 5. WebSocket Sharding Strategy

### 5.1 Consistent Hash Ring

The shard manager uses a consistent hash ring with 150 virtual nodes per
physical shard to distribute rooms evenly across WebSocket gateway instances.

```
                    Hash Ring (2^32 space)
                         0
                        /|\
                       / | \
                    S1   S2  S3    (physical shards)
                   / \  / \  / \
                 v0 v1 v0 v1 v0 v1  (virtual nodes, 150 each)

    Room "doc-abc" -> hash("doc-abc") -> nearest clockwise node -> Shard S2
```

**Hash function:** MD5 of the key, interpreted as a 32-bit unsigned integer:

```typescript
private hash(key: string): number {
  const digest = createHash('md5').update(key).digest();
  return ((digest[3] << 24) | (digest[2] << 16) | (digest[1] << 8) | digest[0]) >>> 0;
}
```

**Node lookup:** Binary search on the sorted hash array for the first hash >=
the key's hash. If past the end, wrap to index 0.

### 5.2 Shard Registration & Discovery

```
On startup:
  1. Register shard in Redis:
     HSET shard:{shardId} {id, host, port, connectionCount, roomCount, ...}
     SADD shards:active {shardId}
     EXPIRE shard:{shardId} 120

  2. Load all active shards from Redis
  3. Build hash ring with all shard IDs
  4. Subscribe to Redis pub/sub: "shards:join", "shards:leave"
  5. Publish own join: PUBLISH shards:join {shardInfo}

Periodic:
  - Every 30s: heartbeat (update lastHeartbeat, refresh TTL)
  - Every 60s: refresh shard registry (rebuild hash ring)

On shutdown:
  - SREM shards:active {shardId}
  - DEL shard:{shardId}
  - PUBLISH shards:leave {shardId}
```

### 5.3 Cross-Shard Messaging

When a message needs to reach a room that is not local to the current shard,
Redis pub/sub is used:

```
Client on Shard A sends message to Room X
    |
    v
Shard A: isLocalRoom("room-x") ?
    |
    +-- YES: broadcast directly to local room connections
    |
    +-- NO:  targetShard = hashRing.getNode("room-x")
             PUBLISH shard:{targetShard}:room-x {message}
                |
                v
         Shard B (subscribed to shard:{B}:room-x):
             broadcast to local room connections
```

**Channel naming:** `shard:{shardId}:{channel}` -- namespaced per shard to
avoid cross-talk.

### 5.4 Shard Rebalancing

When a node joins or leaves:

1. The hash ring is updated (addNode / removeNode).
2. Some rooms will now hash to a different shard.
3. Existing connections are **not** forcibly migrated. Instead:
   - New `room:join` requests will be routed to the new shard.
   - Existing connections continue until the client disconnects.
   - On reconnect, the client is routed to the correct shard.
4. For faster rebalancing, a `shards:rebalance` event can trigger clients to
   reconnect.

### 5.5 Connection Limits

| Parameter | Default | Configurable Via |
|---|---|---|
| Max connections per shard | 10,000 | `WS_MAX_CONNECTIONS` |
| Max rooms per shard | 5,000 | `WS_MAX_ROOMS` |
| Heartbeat interval | 30,000ms | `WS_HEARTBEAT_INTERVAL_MS` |
| Heartbeat timeout | 60,000ms | `WS_HEARTBEAT_TIMEOUT_MS` |
| Message rate limit | 100/s | `WS_RATE_LIMIT_PER_SEC` |
| Message buffer size | 50 | `WS_RATE_LIMIT_BUFFER` |

### 5.6 Sticky Sessions

For Kubernetes deployments, the WebSocket upgrade request must reach the same
pod for the lifetime of the connection:

```yaml
apiVersion: v1
kind: Service
metadata:
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "ws-shard"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "ws-gateway"
spec:
  ports:
    - port: 4001
      targetPort: 4001
  selector:
    app: ws-gateway
```

---

## 6. AI System Architecture

### 6.1 Multi-LLM Abstraction

```
                    +------------------+
                    |   AIRouter       |
                    | (task routing,   |
                    |  fallback,       |
                    |  cost tracking)  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+          +--------v--------+
     | GeminiProvider   |          | OpenAIProvider   |
     | (primary)        |          | (fallback)       |
     +---------+--------+          +---------+--------+
               |                             |
     +---------v--------+          +---------v--------+
     | CircuitBreaker   |          | CircuitBreaker   |
     | (per-provider)   |          | (per-provider)   |
     +------------------+          +------------------+
```

**`BaseLLMProvider` abstract class:**

```typescript
abstract class BaseLLMProvider {
  abstract name: string;
  abstract chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse>;
  abstract stream(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<string>;
  abstract embed(texts: string[]): Promise<number[][]>;
  protected retryWithBackoff<T>(fn, maxRetries=3, baseDelay=1000): Promise<T>;
}
```

**Retry logic:** Exponential backoff with jitter for retryable errors (429,
500, 503, ECONNRESET, timeout). Non-retryable errors are thrown immediately.

### 6.2 AI Router: Task-to-Model Selection

The `AIRouter` maps task types to preferred provider/model combinations. For
each request:

1. **Build candidate list** from `getPreferredProviderAndModel(taskType)`.
2. **Filter** by circuit breaker state (skip providers with open circuits).
3. **Check rate limits** (requests/min, tokens/min per provider).
4. **Try each candidate** in order; on failure, fall back to next.

**Cost Tracking:**

```typescript
const COST_TABLE = {
  'gemini-2.0-flash':        { input: 0.075, output: 0.30 },   // per 1M tokens
  'gemini-2.5-pro':          { input: 1.25,  output: 10.0 },
  'gpt-4o-mini':             { input: 0.15,  output: 0.60 },
  'gpt-4o':                  { input: 2.50,  output: 10.0 },
  'text-embedding-004':      { input: 0.0,   output: 0.0 },
  'text-embedding-3-small':  { input: 0.02,  output: 0.0 },
};
```

Every request logs `{ provider, model, promptTokens, completionTokens,
estimatedCostUsd }`. The last 10,000 records are kept in memory for the
`/ai/cost` endpoint.

### 6.3 Agent Lifecycle

Each agent follows a **plan-think-act-observe** loop with a configurable
maximum iteration count:

```
              +---------+
              |  idle   |
              +----+----+
                   |
            run(goal, context)
                   |
              +----v----+
         +--->| thinking |<----+
         |    +----+----+     |
         |         |          |
         |    LLM response    |
         |         |          |
         |    tool_call?      |
         |    /          \    |
         |  YES           NO  |
         |  |              |  |
         |  v              v  |
         | +------+  +------+ |
         | |acting|  | done | |
         | +--+---+  +------+ |
         |    |               |
         |  execute tool      |
         |    |               |
         | +--v--------+      |
         | | observing |      |
         | +--+--------+      |
         |    |               |
         +----+ (next iteration, up to maxIterations)
```

**`BaseAgent` abstract class (from `base-agent.ts`):**

```
Properties:
  - id, name, type, capabilities
  - systemPrompt (per agent type)
  - taskType (determines LLM model)
  - maxIterations (from config, typically 10)

Methods:
  - plan(goal, context) -> creates step-by-step plan via LLM
  - think(input, context) -> returns AgentAction (tool_call or respond)
  - act(action, context) -> executes tool, returns observation
  - observe(result) -> processes observation (subclass hook)
  - run(goal, context) -> main loop, returns AgentResult
  - cancel() -> sets cancellation flag
```

### 6.4 Agent Types

| Agent | Type Key | System Prompt Focus | Tools | Task Type |
|---|---|---|---|---|
| **PlannerAgent** | `planner` | Break goals into actionable steps, prioritize, estimate | manage-tasks, query-documents | `complex_reasoning` |
| **DeveloperAgent** | `developer` | Write, debug, refactor code; explain technical concepts | execute-code, search-codebase, query-documents | `code_generation` |
| **ReviewerAgent** | `reviewer` | Code review, quality analysis, security audit | search-codebase, query-documents | `code_generation` |
| **MeetingAgent** | `meeting` | Summarize meetings, extract action items, draft agendas | query-documents, manage-tasks, send-notification | `fast_response` |
| **KnowledgeAgent** | `knowledge` | Answer questions from project context, search documentation | query-documents, search-codebase, web-search | `long_context` |

### 6.5 Tool-Calling Framework

Seven built-in tools registered in the `ToolRegistry`:

| Tool | Description | Agents |
|---|---|---|
| `execute-code` | Run code in Docker sandbox | developer |
| `search-codebase` | Search files and code | developer, reviewer, knowledge |
| `query-documents` | Search/read documents | planner, developer, reviewer, meeting, knowledge |
| `manage-tasks` | Create/update tasks | planner, meeting |
| `send-notification` | Send notifications | meeting |
| `web-search` | Search the web | knowledge |

**Tool interface:**

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface ToolContext {
  userId: string;
  workspaceId: string;
  authToken?: string;
  metadata?: Record<string, unknown>;
}
```

### 6.6 Orchestrator: Multi-Agent Workflows

The `AgentOrchestrator` supports three execution modes:

**Sequential:** Steps execute in order. Each step can transform its goal based
on previous results.

```typescript
workflow: {
  mode: 'sequential',
  steps: [
    { id: 'plan', agentType: 'planner', goal: 'Create implementation plan' },
    { id: 'code', agentType: 'developer', goal: 'Implement the plan',
      transformGoal: (goal, results) => `${goal}\n\nPlan: ${results.get('plan')?.output}` },
    { id: 'review', agentType: 'reviewer', goal: 'Review the implementation' },
  ]
}
```

**Parallel:** Steps are topologically sorted by `dependsOn` edges. Independent
steps run concurrently; dependent steps wait.

**Conditional:** Steps have a `condition` function that receives previous
results. Steps whose conditions return `false` are skipped.

**Agent delegation:** A parent agent can delegate sub-tasks to child agents
via `orchestrator.delegateToAgent()`. The child receives a shared memory
context.

**Concurrency control:** `agentConcurrencyLimit` caps the number of
simultaneously running agents. Excess requests are rejected with a 429.

**Cleanup:** Every 30 minutes, execution records older than 1 hour are
purged from memory.

### 6.7 Memory System

**Short-Term Memory (Redis):**

```
Key:    ai:mem:st:{key}
Value:  JSON-serialized data
TTL:    configurable (default from config.memoryShortTermTtl)
```

Used for: recent conversation history, in-progress agent state, cached
suggestions.

**Long-Term Memory (Vector DB):**

```
1. Content -> aiRouter.embed([content]) -> vector (768/1536 dims)
2. vectorStore.upsert([{ id, values: vector, metadata: { content, timestamp, ... } }])
3. Recall: query -> embed -> vectorStore.query(queryVector, { topK, filter })
4. Results ranked by cosine similarity score
```

**Workspace Context Assembly:**

```
getWorkspaceContext(workspaceId):
  1. Fetch last 50 interactions from Redis list (ai:mem:ctx:{wsId}:recent)
  2. Semantic search long-term memory (top 10, filtered by workspaceId)
  3. Build contextSummary string
  4. Return { recentInteractions, relevantMemories, contextSummary }
```

### 6.8 Predictive Engine

**Conflict Predictor (`conflict-predictor.ts`):**

Tracks cursor positions and edit events across all active sessions. Detects
potential conflicts when:

1. **Cursor proximity:** Two users' cursors are within 10 lines in the same file.
   - <= 2 lines: `high` severity (confidence: 0.8-1.0)
   - <= 5 lines: `medium` severity (confidence: 0.5-0.7)
   - <= 10 lines: `low` severity (confidence: 0.3-0.5)

2. **Overlapping edits:** Two users edit overlapping line ranges within 60
   seconds. Always `high` severity, confidence 0.9.

**AI Resolution Suggestions:** When a conflict is detected, the predictor
can call the LLM to analyze the conflicting edits and suggest a resolution
strategy.

**Deduplication:** Predictions for the same file/user pair are deduplicated
within a 30-second window.

**Cleanup:** Stale data (> 10 minutes) is purged every 5 minutes.

---

## 7. Event-Driven Architecture

### 7.1 Kafka Topics

| Topic | Partition Key | Events |
|---|---|---|
| `document.events` | `documentId` | created, updated, deleted, collaborator_joined, collaborator_left, comment_added, mention |
| `code.events` | `fileId` | file_created, file_updated, execution_started, execution_completed |
| `project.events` | `projectId` | task_created, task_updated, task_assigned, task_status_changed, sprint_started, sprint_completed |
| `board.events` | `boardId` | element_created, element_updated, element_deleted, board_shared |
| `ai.events` | `agentId` | agent_started, agent_completed, suggestion_generated |
| `system.events` | `service` | user_connected, user_disconnected, error |

### 7.2 Event Schema

All events conform to a unified `BaseEvent` interface:

```typescript
interface BaseEvent<T extends string, P> {
  type: T;              // e.g., "document.created"
  payload: P;           // type-specific payload
  timestamp: number;    // epoch ms
  traceId: string;      // X-Request-Id for correlation
  source: string;       // originating service name
}
```

**Example event:**

```json
{
  "type": "project.task_status_changed",
  "payload": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "taskKey": "PROJ-42",
    "taskTitle": "Implement search",
    "oldStatus": "in_progress",
    "newStatus": "review",
    "userName": "Alice",
    "assigneeId": "user-123",
    "reporterId": "user-456"
  },
  "timestamp": 1713043200000,
  "traceId": "req_abc123",
  "source": "project-service"
}
```

### 7.3 Consumer Groups

| Consumer Group | Service | Topics |
|---|---|---|
| `notification-consumer` | notification-service | all 6 topics |
| `ai-consumer` | ai-service | document.events, code.events, project.events, board.events |

Kafka guarantees:

- **Within a partition:** Messages are delivered in order.
- **Across partitions:** No ordering guarantee (but events for the same entity
  share a partition key).
- **At-least-once delivery:** Consumers must be idempotent.

### 7.4 Event-to-Notification Mapping

The notification service's Kafka consumer (`KafkaNotificationConsumer`)
processes each message:

```
1. Parse event JSON
2. Build event key: "{topic_prefix}.{eventType}"
   e.g., "document.comment_added", "project.task_assigned"
3. Look up handler in EVENT_HANDLERS map
4. Handler returns { type, title, body, recipientIds } or null
5. Filter out sender from recipients
6. Build notification payloads
7. dispatcher.dispatchBatch(payloads)
```

### 7.5 Backpressure

Kafka consumer configuration:

```typescript
consumer.run({
  eachMessage: async (payload) => {
    await handleMessage(payload);  // sequential within partition
  }
});
```

For high-throughput scenarios:

- `eachBatch` mode with configurable batch size
- Manual commit offsets after successful processing
- Consumer lag monitored via Prometheus gauge

---

## 8. Security Architecture

### 8.1 Zero-Trust Model

Every service validates the caller's identity. The API Gateway verifies the
JWT and injects trusted headers:

```
Client                 API Gateway              Downstream Service
  |                        |                           |
  | Authorization: Bearer <JWT>                        |
  | --------------------> |                            |
  |                        | verify JWT                |
  |                        | extract claims             |
  |                        |                            |
  |                        | X-User-Id: user-123        |
  |                        | X-User-Role: member        |
  |                        | X-User-Email: a@b.com      |
  |                        | X-User-Org-Id: org-456     |
  |                        | X-Request-Id: req-789      |
  |                        | X-Forwarded-By: collabspace-gateway |
  |                        | ---------------------------> |
  |                        |                            | trust X-User-* headers
  |                        |                            | (reject if missing
  |                        |                            |  X-Forwarded-By header)
```

Direct access to downstream services (bypassing the gateway) is blocked at the
network level (Kubernetes NetworkPolicy).

### 8.2 Token Flow

```
Login:
  POST /auth/login { email, password }
    |
    v
  Verify password (scrypt hash comparison)
    |
    v
  Generate:
    accessToken  (JWT, signed with JWT_SECRET,     15m TTL)
    refreshToken (JWT, signed with JWT_REFRESH_SECRET, 7d TTL)
    |
    v
  Store refresh token hash in Redis: refresh_token:{tokenId}
    |
    v
  Return { accessToken, refreshToken, expiresIn: 900 }


Token Refresh:
  POST /auth/refresh { refreshToken }
    |
    v
  Verify refresh JWT signature + expiry
    |
    v
  Check Redis: refresh_token:{tokenId} exists?
    |            |
    | NO:        | YES: verify tokenHash matches
    | REJECT     |
    |            v
    |        Revoke old refresh token (DEL from Redis)
    |        Generate new token pair
    |        Store new refresh token in Redis
    |        Return new { accessToken, refreshToken }
    |
  This is token rotation: each refresh token is single-use.


Logout:
  POST /auth/logout
    |
    v
  Blacklist access token: SETEX token_blacklist:{hash} {remainingTTL} "1"
  Revoke refresh token: DEL refresh_token:{tokenId}
```

### 8.3 Rate Limiting

Three tiers enforced at the API Gateway level:

| Tier | Route Prefix | Limit | Window |
|---|---|---|---|
| `auth` | `/api/auth` | 20 requests | 60 seconds |
| `ai` | `/api/ai` | 30 requests | 60 seconds |
| `default` | everything else | 120 requests | 60 seconds |

**Per-IP limiting:** Applied to all requests.

**Per-user limiting:** If `X-User-Id` is present, a separate limit at 2x the
tier limit is enforced.

**Global limiting:** A system-wide cap (configurable, default 200/min) prevents
total overload.

**Algorithm:** Sliding window using Redis sorted sets with a Lua script
(atomic execution, no race conditions). See Section 2.1 for the Lua script.

**Fail-open:** If Redis is unavailable, the rate limiter allows all requests
through (logged as error).

### 8.4 Encryption

| Layer | Algorithm | Details |
|---|---|---|
| Passwords | scrypt (Node.js `crypto.scrypt`) | Salt: 16 bytes, keyLen: 64, cost: 16384 |
| At-rest | AES-256-GCM | Database-level encryption (PostgreSQL TDE or application-layer) |
| In-transit | TLS 1.3 | Terminated at load balancer; internal traffic via service mesh mTLS |
| Token hashing | SHA-256 | Refresh tokens stored as hashes; raw tokens never persisted |

### 8.5 Container Security (Code Execution)

```yaml
docker run:
  --memory=256m
  --cpus=1
  --network=none                # No network access
  --read-only                   # Read-only root filesystem
  --tmpfs /tmp:size=64m         # Writable temp for compilation
  --security-opt=no-new-privileges
  --security-opt seccomp=default
  --user 1000:1000              # Non-root
  --timeout 10s
```

**Defense in depth:**

1. No network: Cannot exfiltrate data or mine crypto.
2. Read-only FS: Cannot install packages or modify the image.
3. Memory limit: Cannot OOM the host.
4. CPU limit: Cannot monopolize compute.
5. Seccomp: Restricts system calls to a safe subset.
6. Non-root: Cannot escalate privileges.
7. Timeout: Hard kill after 10 seconds.

### 8.6 RBAC Permission Matrix

Full matrix showing all 5 roles against all resources and actions:

```
               | organization | project    | document   | board      | code_session | user       | settings  | billing   | audit_log
  ------------ | ------------ | ---------- | ---------- | ---------- | ------------ | ---------- | --------- | --------- | ---------
  owner        | C R U D M    | C R U D M E| C R U D M E| C R U D M E| C R U D M E  | C R U D M I| R U M     | R U M     | R E
  admin        | R U          | C R U D M E| C R U D M E| C R U D M E| C R U D M E  | R U I M    | R U       | R         | R
  member       | R            | C R U      | C R U      | C R U      | C R U        | R          | R         |           |
  viewer       | R            | R          | R          | R          | R            | R          |           |           |
  guest        |              | R          | R          | R          | R            |            |           |           |
```

_C=Create, R=Read, U=Update, D=Delete, M=Manage, I=Invite, E=Export_

---

## 9. Observability

### 9.1 Prometheus Metrics

**API Gateway Metrics (`collabspace_gateway_*`):**

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | method, path, status_code | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | method, path, status_code | Latency (buckets: 10ms to 10s) |
| `http_errors_total` | Counter | method, path, status_code | 4xx + 5xx errors |
| `active_connections` | Gauge | -- | Current active connections |
| `circuit_breaker_state` | Gauge | service | 0=closed, 1=half-open, 2=open |
| `proxy_duration_seconds` | Histogram | service, status_code | Downstream service latency |
| `rate_limit_rejections_total` | Counter | tier | Rejected requests by tier |

**WebSocket Gateway Metrics:**

| Metric | Type | Labels | Description |
|---|---|---|---|
| `ws_active_connections` | Gauge | shard | Current WebSocket connections |
| `ws_total_connections` | Counter | shard, event | Connected/disconnected events |
| `ws_messages_received_total` | Counter | type | Messages received by type prefix |
| `ws_message_latency_seconds` | Histogram | type | Message processing latency |
| `ws_heartbeat_latency_seconds` | Histogram | -- | Ping-pong round trip |
| `ws_disconnected_by_timeout` | Counter | -- | Connections killed by heartbeat timeout |

**Standard Node.js Metrics (auto-collected):**

- `process_cpu_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_active_handles_total`

**Histogram Bucket Configuration:**

```typescript
buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
// 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
```

**Path Normalization (to reduce cardinality):**

UUIDs and long IDs in paths are replaced with `:id`:

```
/api/documents/550e8400-e29b-... -> /api/documents/:id
/api/projects/:id/tasks/:id      -> /api/projects/:id/tasks/:id
```

### 9.2 Grafana Dashboards

**Service Overview Dashboard:**

```
+--------------------------------------------------+
| CollabSpace - Service Overview                    |
+--------------------------------------------------+
| [Request Rate]  [Error Rate]  [P50/P95/P99 Lat]  |
|                                                    |
| [Circuit Breaker States]  [Active Connections]     |
|                                                    |
| [Rate Limit Rejections]  [Downstream Latency]      |
+--------------------------------------------------+
```

**WebSocket Dashboard:**

```
+--------------------------------------------------+
| CollabSpace - WebSocket Connections               |
+--------------------------------------------------+
| [Connections by Shard]  [Rooms by Type]           |
|                                                    |
| [Message Rate]  [Message Latency by Type]          |
|                                                    |
| [Heartbeat Latency]  [Timeout Disconnects]         |
+--------------------------------------------------+
```

**Kafka Monitoring Dashboard:**

```
+--------------------------------------------------+
| CollabSpace - Kafka                               |
+--------------------------------------------------+
| [Consumer Lag by Group]  [Messages/s by Topic]     |
|                                                    |
| [Partition Distribution]  [Consumer Rebalances]    |
+--------------------------------------------------+
```

### 9.3 Distributed Tracing

Every request receives an `X-Request-Id` (UUID v4) at the API Gateway. This ID
is propagated through all downstream services:

```
Client Request
  |
  | X-Request-Id: (generated or preserved from client)
  v
API Gateway
  |
  | proxyReq.setHeader('X-Request-Id', requestId)
  v
Auth Service / Doc Service / ...
  |
  | logger.child({ traceId: req.headers['x-request-id'] })
  v
Kafka Event
  |
  | { traceId: requestId, ... }
  v
Notification Service
  |
  | logger.child({ traceId: event.traceId })
```

**Jaeger integration:** Services can export traces via OpenTelemetry SDK. The
`X-Request-Id` serves as the trace ID for correlation across services.

### 9.4 Structured Logging

All services use the shared `StructuredLogger` from `packages/shared`:

```typescript
interface LogEntry {
  timestamp: string;       // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;         // e.g., "api-gateway", "doc-service"
  traceId: string | null;  // X-Request-Id
  message: string;
  metadata: Record<string, unknown>;
}
```

**Output format:** Single-line JSON to stdout/stderr.

```json
{"timestamp":"2026-04-13T10:30:00.000Z","level":"info","service":"api-gateway","traceId":"req_abc","message":"Proxy route registered: /api/auth -> http://localhost:4002","metadata":{"service":"auth-service","timeout":10000}}
```

**Log levels:**

| Level | Priority | Output | Use |
|---|---|---|---|
| `debug` | 0 | stdout | Detailed debugging (disabled in production) |
| `info` | 1 | stdout | Normal operations, lifecycle events |
| `warn` | 2 | stderr | Degraded conditions, rate limits hit |
| `error` | 3 | stderr | Failures, exceptions, circuit breaker trips |

**Child loggers:** Created with `logger.child({ traceId, metadata })` to
propagate request context through the call chain without threading parameters.

---

## 10. Scaling & Performance

### 10.1 Horizontal Scaling

All 9 services are stateless. State lives in the infrastructure layer:

| State | Storage | Scaling Impact |
|---|---|---|
| User sessions | Redis (JWT + blacklist) | Any gateway instance can verify |
| Rate limit counters | Redis (sorted sets) | Shared across all gateway instances |
| WebSocket connections | In-memory + Redis registry | Shard-aware; add nodes to hash ring |
| CRDT documents | PostgreSQL + in-memory cache | Load on-demand; any instance can hydrate |
| Kafka offsets | Kafka __consumer_offsets | Consumer group rebalances automatically |

```
Kubernetes HPA Configuration (example):

apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: collabspace_gateway_active_connections
        target:
          type: AverageValue
          averageValue: "5000"
```

### 10.2 Connection Pooling

**PostgreSQL (pg Pool):**

```typescript
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,                    // max connections per service instance
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

**Redis (ioredis):**

```typescript
const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null;        // stop retrying
    return Math.min(times * 200, 5000); // exponential backoff
  },
  lazyConnect: true,
});
```

### 10.3 Caching Strategy

| Data | Cache Location | TTL | Invalidation |
|---|---|---|---|
| Document metadata | Redis | 5 min | On update event |
| User profiles | Redis | 15 min | On profile update |
| Presence state | Redis | No TTL | Updated on connect/disconnect |
| Unread counts | Redis | No TTL | Incremented on new notification, reset on read-all |
| Rate limit windows | Redis sorted sets | window + 10s | Self-expiring |
| AI suggestions | Redis | 10 min | On document change |
| CRDT state vectors | In-memory | Session lifetime | On document unload |

### 10.4 Database Indexes

```sql
-- Full-text search with pg_trgm (doc-service)
CREATE INDEX idx_documents_title_trgm ON documents USING gin (title gin_trgm_ops);
CREATE INDEX idx_documents_content_trgm ON documents USING gin (content gin_trgm_ops);

-- Partial index for soft deletes
CREATE INDEX idx_documents_active ON documents (workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Task lookups (project-service)
CREATE INDEX idx_tasks_project_status ON tasks (project_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assignee ON tasks (assignee_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_key ON tasks (task_key);

-- Notification queries
CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, read, created_at DESC);

-- Code file tree
CREATE INDEX idx_code_files_workspace ON code_files (workspace_id, parent_folder_id);
```

### 10.5 CDN for Static Assets

```
Client Browser
    |
    v
CDN (CloudFront / Cloudflare)
    |  cache-control: public, max-age=31536000, immutable
    |  (hashed filenames for cache busting)
    v
S3 / Origin Server
    |
    +-- /assets/js/main.[hash].js
    +-- /assets/css/styles.[hash].css
    +-- /assets/images/...
    +-- /assets/fonts/...
```

### 10.6 Load Testing

**k6 Scenarios:**

```javascript
export const options = {
  scenarios: {
    api_load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 500 },
        { duration: '5m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
    },
    websocket_connections: {
      executor: 'ramping-vus',
      stages: [
        { duration: '3m', target: 5000 },
        { duration: '5m', target: 10000 },
        { duration: '2m', target: 0 },
      ],
      exec: 'wsScenario',
    },
    document_collaboration: {
      executor: 'constant-vus',
      vus: 500,
      duration: '10m',
      exec: 'docCollabScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    ws_connecting: ['p(95)<1000'],
    ws_msgs_received: ['count>100000'],
  },
};
```

### 10.7 Performance Targets

| Metric | Target | How Measured |
|---|---|---|
| Concurrent users | 50,000 | Total WebSocket connections across all shards |
| Real-time latency | <30ms | Time from edit to display on another client (same shard) |
| API P95 latency | <500ms | Prometheus histogram |
| API P99 latency | <2000ms | Prometheus histogram |
| Document sync | <100ms | SyncStep1 to SyncStep2 round trip |
| Code execution | <10s | From submit to result (includes container spin-up) |
| AI response (fast) | <2s | Flash model chat completion |
| AI response (pro) | <10s | Pro model chat completion |
| Kafka consumer lag | <1000 | Messages behind head per partition |

---

## 11. Multi-Tenant Architecture

### 11.1 Organizational Hierarchy

```
Organization (tenant boundary)
    |
    +-- Workspace 1
    |     +-- Projects
    |     +-- Documents
    |     +-- Boards
    |     +-- Code Sessions
    |
    +-- Workspace 2
    |     +-- ...
    |
    +-- Members (org_memberships)
    +-- Billing
    +-- Settings
```

### 11.2 Workspace-Scoped Queries

All data access is filtered by `workspace_id`. This is enforced at the service
layer, not just the API layer:

```typescript
// Every query includes workspace_id
async function listDocuments(workspaceId: string, filters: Filters) {
  return query(
    `SELECT * FROM documents
      WHERE workspace_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3`,
    [workspaceId, filters.pageSize, filters.offset]
  );
}
```

**No cross-workspace data leakage:** Even if a user has the document ID, the
query will return nothing if the workspace_id does not match their current
workspace.

### 11.3 Plan-Based Limits

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| Workspaces | 1 | 5 | Unlimited |
| Members per workspace | 5 | 50 | Unlimited |
| Documents | 50 | 500 | Unlimited |
| Storage | 1 GB | 50 GB | Unlimited |
| Code execution / day | 50 | 500 | Unlimited |
| AI requests / day | 20 | 200 | Custom |
| Max collaborators / doc | 5 | 25 | 100 |
| Contest rooms | 1 active | 10 active | Unlimited |
| Export formats | HTML only | HTML, MD, PDF | HTML, MD, PDF + API |
| Priority support | -- | Email | Dedicated |

**Enforcement:** Plan limits are checked at the service layer before creating
resources. The auth service stores the organization's plan; services query it
via HTTP or cache it in Redis.

### 11.4 Isolated Code Execution

Each code execution runs in a fresh Docker container:

- **Per-user isolation:** Container is tagged with user ID; containers from
  different users never share state.
- **No persistence:** Container filesystem is ephemeral; destroyed after
  execution completes or times out.
- **Resource accounting:** Execution time and count are tracked per user per
  day against plan limits.

---

## 12. Failover & Recovery

### 12.1 Circuit Breaker (API Gateway)

The circuit breaker protects downstream services from cascading failures.
Implemented in `CircuitBreaker` class with exponential backoff:

```
State Transitions:

CLOSED (normal operation):
  - Failures tracked in a sliding window (60s).
  - On 5th failure: transition to OPEN.

OPEN (rejecting requests):
  - All requests immediately rejected with 503 + Retry-After header.
  - Backoff: 10s * 2^(consecutiveOpenings - 1), max 120s.
  - After backoff elapsed: transition to HALF-OPEN.

HALF-OPEN (probing):
  - Allow limited requests through.
  - 3 consecutive successes: transition to CLOSED, reset consecutiveOpenings.
  - 1 failure: transition to OPEN with increased backoff.

Backoff schedule (consecutiveOpenings):
  1st open:  10s
  2nd open:  20s
  3rd open:  40s
  4th open:  80s
  5th+ open: 120s (max)
```

### 12.2 Kafka Recovery

**At-least-once delivery:** Kafka consumers use auto-commit (or manual commit
after processing). If a consumer crashes, the uncommitted messages are
redelivered to another consumer in the group.

**Idempotent consumers:** Notification service deduplicates by entity ID +
event type within a 60-second window.

**Consumer group rebalancing:** When a consumer instance joins or leaves, Kafka
automatically redistributes partitions. Processing pauses briefly during
rebalancing.

### 12.3 Redis Recovery

```typescript
retryStrategy(times: number) {
  if (times > 5) return null;          // give up after 5 retries
  return Math.min(times * 200, 5000);  // 200ms, 400ms, 600ms, 800ms, 1000ms
}
```

**Fail-open for rate limiting:** If Redis is down, the rate limiter allows all
requests through rather than blocking the entire system. This is a deliberate
tradeoff: temporary over-admission is better than total outage.

**Fail-closed for auth:** If Redis is down, refresh token verification fails
(token cannot be looked up). Access tokens still work (JWT verification is
stateless).

### 12.4 Database Recovery

**Connection pool retry:**

```typescript
const pool = new Pool({
  max: 20,
  connectionTimeoutMillis: 5000,  // fail fast
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
  // Pool automatically replaces dead connections
});
```

**Transaction rollback:** All multi-step operations use database transactions.
On any error, the transaction is rolled back:

```typescript
async function createProjectWithDefaults(data, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const project = await client.query('INSERT INTO projects ...');
    await client.query('INSERT INTO project_members ...');
    await client.query('INSERT INTO tasks ...'); // default tasks
    await client.query('COMMIT');
    return project.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### 12.5 WebSocket Reconnection

Client-side reconnection with capped exponential backoff:

```typescript
class WebSocketClient {
  private reconnectAttempt = 0;
  private readonly maxBackoff = 30_000;  // 30 seconds

  private getReconnectDelay(): number {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt),
      this.maxBackoff
    );
    this.reconnectAttempt++;
    return delay;
  }

  // Reconnect sequence:
  //   Attempt 1:  1,000ms  (1s)
  //   Attempt 2:  2,000ms  (2s)
  //   Attempt 3:  4,000ms  (4s)
  //   Attempt 4:  8,000ms  (8s)
  //   Attempt 5: 16,000ms  (16s)
  //   Attempt 6: 30,000ms  (30s, capped)
  //   Attempt 7: 30,000ms  (30s, capped)
  //   ...

  private onReconnect(): void {
    this.reconnectAttempt = 0;  // Reset on successful connection
    this.initSync();            // Trigger CRDT sync to reconcile offline changes
  }
}
```

**On reconnect:**

1. Authenticate via JWT (may need token refresh first).
2. Rejoin all previously joined rooms.
3. Send `SyncStep1` for each document to reconcile offline changes.
4. Restore awareness state (cursor, presence).

### 12.6 Graceful Shutdown

All services implement graceful shutdown on `SIGTERM` and `SIGINT`:

```typescript
// WebSocket Gateway shutdown sequence:
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // 1. Stop accepting new connections
  rateLimiter.shutdown();

  // 2. Close existing connections (1001: Going Away)
  await connectionManager.shutdown();

  // 3. Deregister from shard registry
  await shardManager.shutdown();

  // 4. Close Redis connections
  await closeAllRedis();

  // 5. Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // 6. Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}
```

**Kubernetes readiness probe:** Services expose `/health` endpoints. During
shutdown, the health check returns unhealthy, causing Kubernetes to stop
routing traffic before the pod terminates.

---

## Appendix A: Repository Structure

```
collabspace/
  apps/
    api-gateway/           # Port 4000 - HTTP reverse proxy
    auth-service/          # Port 4002 - Authentication & authorization
    ws-gateway/            # Port 4001 - WebSocket connections
    doc-service/           # Port 4003 - Document collaboration
    code-service/          # Port 4004 - Code editing & execution
    board-service/         # Port 4005 - Whiteboard
    project-service/       # Port 4006 - Project management
    notification-service/  # Port 4007 - Notifications
    ai-service/            # Port 4008 - AI gateway & agents
    web/                   # React SPA client
  packages/
    shared/                # Types, utilities, logger, constants
    crdt/                  # Yjs sync protocol, persistence, awareness
    ai-sdk/                # Agent framework, provider abstractions
    ui/                    # React hooks and components
  infra/
    docker/                # Dockerfiles, docker-compose
    k8s/                   # Kubernetes manifests
    terraform/             # Cloud infrastructure as code
  tests/                   # Integration and E2E tests
  turbo.json               # Turborepo pipeline configuration
  tsconfig.json            # Root TypeScript config
  package.json             # Root workspace config
```

## Appendix B: Port Assignments

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Web Client (React SPA) | HTTP |
| 4000 | API Gateway | HTTP |
| 4001 | WebSocket Gateway | WS |
| 4002 | Auth Service | HTTP |
| 4003 | Document Service | HTTP |
| 4004 | Code Service | HTTP |
| 4005 | Board Service | HTTP |
| 4006 | Project Service | HTTP |
| 4007 | Notification Service | HTTP |
| 4008 | AI Service | HTTP |
| 5432 | PostgreSQL | TCP |
| 6379 | Redis | TCP |
| 9092 | Kafka | TCP |

## Appendix C: Environment Variables

| Variable | Service | Default | Description |
|---|---|---|---|
| `GATEWAY_PORT` | api-gateway | 4000 | Gateway listen port |
| `JWT_SECRET` | api-gateway, auth | dev-secret | JWT signing key |
| `JWT_REFRESH_SECRET` | auth | dev-refresh-secret | Refresh token signing key |
| `REDIS_URL` | all | redis://localhost:6379 | Redis connection string |
| `DATABASE_URL` | per service | -- | PostgreSQL connection string |
| `KAFKA_BROKERS` | per service | localhost:9092 | Kafka broker list |
| `CORS_ORIGINS` | api-gateway | localhost:3000,3001 | Allowed CORS origins |
| `NODE_ENV` | all | development | Environment |
| `LOG_LEVEL` | all | info | Minimum log level |
| `RATE_LIMIT_WINDOW_MS` | api-gateway | 60000 | Global rate limit window |
| `RATE_LIMIT_MAX` | api-gateway | 200 | Global rate limit max |
| `WS_SHARD_ID` | ws-gateway | auto-generated | Shard identifier |
| `WS_HEARTBEAT_INTERVAL_MS` | ws-gateway | 30000 | Heartbeat interval |
| `WS_HEARTBEAT_TIMEOUT_MS` | ws-gateway | 60000 | Connection timeout |
| `GEMINI_API_KEY` | ai-service | -- | Google Gemini API key |
| `OPENAI_API_KEY` | ai-service | -- | OpenAI API key |
| `AGENT_MAX_ITERATIONS` | ai-service | 10 | Max agent loop iterations |
| `AGENT_CONCURRENCY_LIMIT` | ai-service | 10 | Max concurrent agents |
| `MEMORY_SHORT_TERM_TTL` | ai-service | 3600 | Redis memory TTL (seconds) |
