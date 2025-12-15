<p align="center">
  <img src="https://img.shields.io/badge/CollabSpace-AI%20Collaboration%20OS-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyTDIgN2wxMCA1IDEwLTV6Ii8+PHBhdGggZD0iTTIgMTdsMTAgNSAxMC01Ii8+PHBhdGggZD0iTTIgMTJsMTAgNSAxMC01Ii8+PC9zdmc+" alt="CollabSpace"/>
</p>

<h1 align="center">CollabSpace</h1>

<p align="center">
  <strong>AI-Powered Collaboration Operating System</strong><br/>
  Docs &bull; Code &bull; Whiteboard &bull; Project Management &bull; AI Agents
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/Node.js-20+-green?logo=node.js" alt="Node.js"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis" alt="Redis"/>
  <img src="https://img.shields.io/badge/Kafka-3.6-231F20?logo=apachekafka" alt="Kafka"/>
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker" alt="Docker"/>
  <img src="https://img.shields.io/badge/Kubernetes-Ready-326CE5?logo=kubernetes" alt="K8s"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License"/>
</p>

---

## Overview

CollabSpace is a **next-generation, AI-powered collaboration platform** that unifies real-time document editing, code collaboration, whiteboarding, and project management into a single workspace. Unlike traditional tools, CollabSpace features a **multi-agent AI system** where autonomous agents work alongside humans to plan sprints, review code, generate diagrams, and accelerate every aspect of teamwork.

### Why CollabSpace?

| Traditional Tools | CollabSpace |
|---|---|
| Separate apps for docs, code, boards, tasks | **Unified workspace** with deep cross-module integration |
| AI bolted on as a chatbot | **Multi-agent AI system** that autonomously executes work |
| Single-server architecture | **Distributed microservices** with 50K+ concurrent user support |
| Polling-based updates | **Real-time CRDT sync** with <30ms latency |
| Cloud-only | **Offline-first** with automatic reconciliation |

---

## Key Features

### Collaborative Document Editor
- **Tiptap** rich-text editor with full formatting (headings, lists, code blocks, tables, images)
- **Yjs CRDT** for conflict-free real-time collaboration
- Multi-cursor presence with user names and colors
- Inline comments, @mentions, threaded discussions
- Version history with time-travel and restore
- Offline editing with automatic sync on reconnect
- Slash command menu for quick insertions

### Collaborative Code Editor
- **Monaco Editor** (VS Code engine) with 7+ language support
- Real-time collaboration via CRDT synchronization
- **Docker-sandboxed code execution** (256MB RAM, 10s timeout, no network)
- Contest mode with timed coding rooms, auto-grading, and leaderboards
- File tree with folder management
- Integrated terminal output panel

### Collaborative Whiteboard
- **Infinite canvas** with pan, zoom, and grid snapping
- 12 element types: rectangles, ellipses, lines, arrows, text, sticky notes, freehand, connectors, groups, frames
- Real-time CRDT sync for all element changes
- Properties panel with fill, stroke, opacity, layer controls
- Export to PNG, SVG, PDF
- AI-powered: prompt-to-diagram, diagram-to-code, auto-layout

### Project Management
- **Kanban board** with drag-and-drop (powered by @hello-pangea/dnd)
- List view with sortable columns and inline editing
- Timeline/Gantt view with dependency arrows
- Sprint management with burndown charts and velocity tracking
- Task relationships (blocks, is blocked by, relates to)
- Automatic task key generation (PROJ-1, PROJ-2, ...)
- AI-powered task breakdown and sprint planning

### Multi-Agent AI System
- **6 specialized agents**: Planner, Developer, Reviewer, Meeting, Knowledge, Execution
- **Agent Orchestrator** for multi-agent workflows and inter-agent communication
- Multi-LLM architecture: **Gemini** (primary) + **OpenAI** (fallback)
- Dynamic routing: code tasks to coding models, long context to Gemini Pro
- Tool-calling framework with codebase search, code execution, task management
- Short-term memory (Redis) + long-term memory (vector DB)
- Predictive collaboration: conflict prediction, intent detection, cursor heatmaps

### Advanced Platform Features
- End-to-end encryption (AES-256-GCM)
- RBAC + ABAC authorization with 5 roles and resource-level permissions
- Comprehensive audit logging
- Real-time notifications (in-app, email, push) with deduplication and batching
- Command palette (Ctrl+K) for quick navigation and AI commands
- Dark/light/system theme support
- Responsive design across all screen sizes

---

## Architecture

```
                                    ┌──────────────┐
                                    │   CDN/Edge   │
                                    └──────┬───────┘
                                           │
                               ┌───────────┴───────────┐
                               │     Nginx / Ingress    │
                               │   (SSL, Rate Limit)    │
                               └───┬───────────────┬───┘
                                   │               │
                          ┌────────┴────┐  ┌───────┴──────┐
                          │ Next.js App │  │  API Gateway  │
                          │  (Port 3000)│  │  (Port 4000)  │
                          └─────────────┘  └───┬───────────┘
                                               │
              ┌────────────┬───────────┬───────┴───────┬─────────────┐
              │            │           │               │             │
        ┌─────┴─────┐ ┌───┴────┐ ┌────┴────┐  ┌──────┴──────┐ ┌────┴────┐
        │   Auth    │ │  Doc   │ │  Code   │  │  Board      │ │Project  │
        │  Service  │ │Service │ │ Service │  │  Service    │ │Service  │
        │  (4002)   │ │(4003)  │ │ (4004)  │  │  (4005)     │ │(4006)   │
        └───────────┘ └────────┘ └─────────┘  └─────────────┘ └─────────┘
              │            │           │               │             │
              │        ┌───┴───────────┴───────────────┴─────────────┘
              │        │
        ┌─────┴────────┴────┐      ┌──────────────┐     ┌───────────────┐
        │ WebSocket Gateway │      │  AI Service   │     │ Notification  │
        │     (4001)        │      │   (4008)      │     │   Service     │
        │  Sharded Rooms    │      │  Multi-Agent  │     │   (4007)      │
        └───────┬───────────┘      └───────┬───────┘     └───────┬───────┘
                │                          │                     │
       ┌────────┴──────────────────────────┴─────────────────────┘
       │
  ┌────┴────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐
  │  Redis  │  │PostgreSQL│  │   Kafka    │  │  Vector DB   │
  │ Cluster │  │(Supabase)│  │  Cluster   │  │  (Pinecone)  │
  └─────────┘  └──────────┘  └────────────┘  └──────────────┘
```

> For detailed architecture documentation, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, TypeScript, TailwindCSS, Zustand, React Query |
| **Editors** | Tiptap (documents), Monaco Editor (code), Canvas API (whiteboard) |
| **Real-time** | WebSocket (ws), Yjs CRDT, y-protocols |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL 16 (via Supabase), Redis 7 |
| **Messaging** | Apache Kafka |
| **AI** | Gemini API, OpenAI API, Custom Agent Framework |
| **Vector DB** | Pinecone |
| **Containers** | Docker, Kubernetes (GKE) |
| **IaC** | Terraform |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Prometheus, Grafana, Jaeger |

---

## Monorepo Structure

```
collabspace/
├── apps/
│   ├── web/                     # Next.js 14 frontend (60 files)
│   ├── api-gateway/             # API Gateway with circuit breaker (15 files)
│   ├── ws-gateway/              # WebSocket Gateway with sharding (17 files)
│   ├── auth-service/            # Authentication & authorization (17 files)
│   ├── doc-service/             # Document collaboration service (15 files)
│   ├── code-service/            # Code editor & execution service (15 files)
│   ├── board-service/           # Whiteboard service (17 files)
│   ├── project-service/         # Project management service (19 files)
│   ├── ai-service/              # AI orchestration & agents (36 files)
│   └── notification-service/    # Multi-channel notifications (16 files)
├── packages/
│   ├── shared/                  # Shared types, utils, constants (10 files)
│   ├── crdt/                    # CRDT engine wrapper (7 files)
│   ├── ai-sdk/                  # AI abstraction layer (14 files)
│   └── ui/                      # Shared UI components (25 files)
├── infra/
│   ├── docker/                  # Docker Compose, Dockerfiles, nginx
│   ├── k8s/                     # Kubernetes manifests (base + overlays)
│   └── terraform/               # GKE, Cloud SQL, Redis, networking
├── tests/
│   └── load/                    # k6 load testing scenarios
├── docs/                        # Documentation
├── .github/workflows/           # CI/CD pipelines
├── turbo.json                   # Turborepo configuration
├── package.json                 # Root workspace config
└── tsconfig.json                # Root TypeScript config
```

**Total: 356+ production-ready files**

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **Docker** & Docker Compose
- **Git**

### 1. Clone & Install

```bash
git clone https://github.com/your-org/collabspace.git
cd collabspace
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your API keys:
#   - GEMINI_API_KEY
#   - OPENAI_API_KEY (optional, fallback)
#   - PINECONE_API_KEY (for AI memory)
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL, Redis, Kafka, and monitoring stack
npm run docker:up
```

This starts:
- PostgreSQL (port 5432) with auto-migration
- Redis (port 6379)
- Kafka + ZooKeeper (port 9092)
- Prometheus (port 9090)
- Grafana (port 3001)
- Jaeger (port 16686)

### 4. Start Development Servers

```bash
# Start all services in development mode
npm run dev
```

Or start individual services:

```bash
# Terminal 1: Frontend
cd apps/web && npm run dev

# Terminal 2: API Gateway
cd apps/api-gateway && npm run dev

# Terminal 3: WebSocket Gateway
cd apps/ws-gateway && npm run dev

# Terminal 4: Auth Service
cd apps/auth-service && npm run dev

# ... (repeat for other services)
```

### 5. Access the Application

| Service | URL |
|---------|-----|
| **Web App** | http://localhost:3000 |
| **API Gateway** | http://localhost:4000 |
| **WebSocket** | ws://localhost:4001 |
| **Grafana** | http://localhost:3001 |
| **Jaeger** | http://localhost:16686 |
| **Prometheus** | http://localhost:9090 |

Default admin credentials:
- Email: `admin@collabspace.io`
- Password: `Admin123!`

---

## Development

### Available Scripts

```bash
npm run dev          # Start all services in dev mode
npm run build        # Build all packages and services
npm run lint         # Lint all packages
npm run test         # Run all tests
npm run typecheck    # Type-check all TypeScript
npm run clean        # Clean all build artifacts

npm run docker:build # Build Docker images
npm run docker:up    # Start Docker infrastructure
npm run docker:down  # Stop Docker infrastructure

npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database with sample data

npm run load-test    # Run k6 load tests
```

### Adding a New Service

1. Create a new directory under `apps/`
2. Add `package.json` with `@collabspace/` namespace
3. Add `tsconfig.json` extending root config
4. Register proxy route in `apps/api-gateway/src/routes/proxy.routes.ts`
5. Add Docker config in `infra/docker/docker-compose.yml`
6. Add Kubernetes manifests in `infra/k8s/base/`

### Code Style

- TypeScript strict mode everywhere
- Functional components with hooks in React
- TailwindCSS for all styling (no CSS modules)
- Zod for runtime validation
- Structured JSON logging

---

## Deployment

### Docker Compose (Development/Staging)

```bash
docker-compose -f infra/docker/docker-compose.yml up -d
```

### Kubernetes (Production)

```bash
# Apply base manifests
kubectl apply -k infra/k8s/base/

# Apply production overlay
kubectl apply -k infra/k8s/overlays/production/
```

### Terraform (GKE Infrastructure)

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

> For detailed deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Scale Targets

| Metric | Target | How |
|--------|--------|-----|
| Concurrent users | **50,000+** | WebSocket sharding + horizontal scaling |
| Real-time latency | **<30ms** | Redis pub/sub + edge routing |
| API response time | **p95 <200ms** | Connection pooling + caching |
| Document sync | **<50ms** | CRDT + debounced persistence |
| Multi-region | **3+ regions** | GKE regional clusters + Cloud CDN |
| Availability | **99.95%** | Kubernetes HA + circuit breakers |

---

## Monitoring & Observability

- **Prometheus** scrapes metrics from all services (`/metrics` endpoint)
- **Grafana** dashboards for request rates, latency, error rates, WebSocket connections, Kafka lag
- **Jaeger** for distributed tracing across services
- **Structured logging** in JSON format with correlation IDs

Access Grafana at `http://localhost:3001` (auto-provisioned dashboards).

---

## Security

- **Authentication**: JWT with access/refresh token rotation
- **Authorization**: RBAC (5 roles) + ABAC (ownership, time-based conditions)
- **Encryption**: AES-256-GCM for data at rest, TLS 1.3 in transit
- **Rate Limiting**: Sliding window per-IP and per-user with Redis
- **Input Validation**: Zod schemas on all API boundaries
- **Audit Logging**: All state-changing actions logged with actor, IP, timestamp
- **Container Security**: Non-root users, read-only filesystems, seccomp profiles
- **Code Execution Sandbox**: Docker containers with no network, memory/CPU limits

> For security policies and incident response, see [docs/SECURITY.md](docs/SECURITY.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | This file — project overview and quick start |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture deep-dive |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Complete API endpoint documentation |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide (Docker, K8s, Terraform) |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Development workflow and guidelines |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and policies |

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with care by the CollabSpace team<br/>
  <strong>Docs &bull; Code &bull; Whiteboard &bull; Projects &bull; AI — All in One</strong>
</p>
