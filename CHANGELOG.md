# Changelog

All notable changes to CollabSpace are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Week of 2026-09-01 — Evidence pass

A deliberate pass to make every claim in the README checkable. No new features;
depth, proof and honesty only. Several defects surfaced as a direct result of
writing the tests, and are recorded here rather than quietly fixed.

#### Added
- `benchmarks/` — k6 WebSocket load test (ramps to 5,000 connections), k6 REST
  throughput test at 100/500/1,000 concurrent users, and a Node script measuring
  true CRDT convergence latency across 2/4/8/16 real Y.Doc peers. Scripts:
  `bench:ws`, `bench:crdt`, `bench:api`.
- `benchmarks/RESULTS.md` — methodology, the rules for collecting numbers, and a
  claim-by-claim audit of the README against its evidence. Measured cells
  currently read "not yet run"; k6 is not installed on the development machine
  and no numbers were invented.
- `tests/integration/` — CRDT convergence and offline reconciliation. 11 tests
  run with no infrastructure at all; 17 with a gateway running.
- `tests/chaos/` — two-node gateway topology in Docker. Kills a node with 100
  clients attached and restarts Redis mid-session, asserting no data loss.
- `tests/e2e/playwright/` — two browsers editing one document, asserting peer
  cursors and text convergence.
- `docs/INTERNALS.md`, `docs/SHARDING.md`, `docs/DESIGN_DECISIONS.md`,
  `docs/LIMITATIONS.md`, `docs/RUNBOOK.md`.
- `collabspace_*` Prometheus metrics across ws-gateway, doc-service and
  ai-service, plus `/metrics` endpoints on the latter two, and a provisioned
  Grafana dashboard at `infra/grafana/dashboards/collabspace.json`.
- CI: integration tests on push to main with real services, chaos tests on main,
  a nightly `bench-smoke.yml`, and a TypeScript error ratchet that blocks new
  type errors without requiring the existing 93 to be fixed first.

#### Fixed
- **Cross-shard message fanout was never implemented.** `ShardManager`'s
  publish/subscribe methods were dead code and `RoomManager.broadcastToRoom`
  only reached sockets on the local process. With more than one gateway node, a
  document silently split into isolated groups that never saw each other's
  edits, with no error surfaced anywhere. Added per-room Redis pub/sub fanout
  with origin-shard loop prevention; single-node behaviour is unchanged.
- **The shard registry could not recover from Redis data loss.** The heartbeat
  refreshed the `shard:<id>` hash but only startup ever added the node to
  `shards:active`, so after any Redis restart every node rebuilt an empty hash
  ring and stayed that way until restarted. The heartbeat now re-asserts the
  whole registration idempotently.
- **`doc:sync:step2` was broadcast to the whole room**, making a single
  reconnect cost O(N²) messages each carrying a full state diff. Fifty
  simultaneous reconnects saturated the rate limiter and stalled. Replies are
  now addressed to the client that asked, falling back to broadcast when that
  client is on another shard.

#### Changed
- README: "6 specialized agents" corrected to 5 (there is no Execution agent);
  "end-to-end encryption" corrected to note the AES-256-GCM utility exists but
  is called from nowhere; "356+ production-ready files" replaced with the actual
  tracked count; "Scale Targets" replaced by "Verified Scale" separating design
  targets from measured results.

#### Known issues
- The web client sends binary WebSocket frames while ws-gateway only parses
  JSON, so browser document collaboration likely does not work against the
  gateway at all. Documented in `docs/LIMITATIONS.md`; not fixed, because it
  requires rewriting one side's protocol.
- `room:join` performs no authorisation — any authenticated user can join any
  room id they can guess.
- 93 TypeScript errors across six packages remain, now visible and ratcheted.

---

## [1.0.1] - 2026-04-15

### Week of 2026-04-13 — Deployment and UI expansion

#### Added
- `all-in-one` service: a single combined server so the whole stack fits on a
  free-tier host without running nine separate services.
- Account management routes in auth-service, with matching api-gateway proxy
  configuration.
- Web: workspace switcher for multi-tenant use, focus/presentation mode,
  interactive keyboard shortcuts panel, social sharing and collaboration modal,
  and several new dashboard views and sub-pages.
- UI package: toggle switch, skeleton loading state and progress bar primitives.
- Supabase-compatible database schema (single public schema, no `GRANT`
  statements) in `infra/supabase`.
- Lint, typecheck and test scripts plus smoke tests across all 14 packages, to
  get CI passing.

#### Fixed
- Services now bind to `$PORT` so Render web services start correctly.
- TypeScript errors blocking the Render deploy in ws-gateway and auth-service.
- `all-in-one` `rootDir` set to `./src` so `tsc` emits `dist/index.js`.
- Login page UI and authentication flow.

#### Changed
- Dashboard shell, navigation structure and sidebar links.

---

## [1.0.0] - 2026-04-13

### Initial Release

Complete implementation of CollabSpace — AI-powered collaboration operating system.

### Added

#### Platform
- Monorepo setup with Turborepo, npm workspaces, and TypeScript strict mode
- 4 shared packages: `@collabspace/shared`, `@collabspace/crdt`, `@collabspace/ai-sdk`, `@collabspace/ui`
- 9 microservices with Express, PostgreSQL, Redis, and Kafka integration
- Next.js 14 frontend with App Router, TailwindCSS, Zustand, and React Query

#### Collaborative Document Editor
- Tiptap rich-text editor with 12+ extensions
- Yjs CRDT for real-time conflict-free collaboration
- Multi-cursor presence with user names and colors
- Inline comments with threading, @mentions, and resolution
- Version history with time-travel and restore
- Offline editing with automatic sync on reconnect
- Slash command menu for quick insertions

#### Collaborative Code Editor
- Monaco Editor (VS Code engine) with syntax highlighting
- CRDT-based real-time collaboration
- Docker-sandboxed code execution (7 languages)
- Contest mode with timed rooms, auto-grading, and leaderboards
- File tree with folder management
- Integrated terminal output panel

#### Collaborative Whiteboard
- Infinite canvas with pan, zoom, and grid snapping
- 12 element types (rectangles, ellipses, arrows, text, sticky notes, etc.)
- Connector auto-routing between shapes
- Properties panel with fill, stroke, opacity, layer controls
- Export to PNG, SVG, PDF
- AI-powered diagram generation from text prompts

#### Project Management
- Kanban board with drag-and-drop
- List view with sortable columns and inline editing
- Timeline/Gantt view with dependency visualization
- Sprint management with burndown charts and velocity tracking
- Auto-incrementing task keys (PROJ-1, PROJ-2, ...)
- Task relationships: blocks, is-blocked-by, relates-to, duplicate-of

#### Multi-Agent AI System
- 6 specialized agents: Planner, Developer, Reviewer, Meeting, Knowledge, Execution
- Agent Orchestrator for multi-agent workflows
- Multi-LLM gateway: Gemini (primary) + OpenAI (fallback)
- Dynamic model routing by task type
- Tool-calling framework with 6 built-in tools
- Short-term (Redis) + long-term (vector DB) memory
- Predictive collaboration: conflict prediction, intent detection

#### Security
- JWT authentication with access/refresh token rotation
- RBAC (5 roles) + ABAC (ownership, membership conditions)
- AES-256-GCM encryption for data at rest
- Sliding-window rate limiting with Redis
- Comprehensive audit logging
- Sandboxed code execution with resource limits

#### Infrastructure
- Docker Compose for development (15 containers)
- Kubernetes manifests with Kustomize (base + staging + production overlays)
- Terraform for GKE, Cloud SQL, Memorystore, networking
- CI/CD with GitHub Actions (lint, test, build, deploy)
- Prometheus + Grafana monitoring with auto-provisioned dashboards
- Jaeger distributed tracing
- k6 load testing (5 scenarios, 50K user target)

#### Frontend
- Next.js 14 with App Router and server components
- Dark/light/system theme with smooth transitions
- Command palette (Ctrl+K) for quick navigation and AI commands
- Real-time WebSocket connection with auto-reconnect
- AI chat sidebar with streaming responses
- Notification system with in-app, email, and push support
- Settings page with profile, security, appearance, AI preferences
- Team management with role-based invitations
- Analytics dashboard with activity charts and AI insights
- Responsive design for all screen sizes

### Architecture Decisions
- **CRDT over OT**: Chose Yjs CRDT for offline-first support and simpler conflict resolution
- **Microservices over monolith**: Independent scaling, deployment, and team ownership
- **Kafka over Redis Streams**: Better durability, partitioning, and consumer group support
- **Multi-LLM over single provider**: Resilience and task-optimized model routing
- **Consistent hashing for WebSocket**: Efficient room distribution with minimal rebalancing
