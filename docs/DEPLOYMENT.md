# CollabSpace Deployment Guide

Complete guide for deploying CollabSpace across local development, staging (Docker Compose), and production (Kubernetes on GKE) environments.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup](#2-local-development-setup)
3. [Docker Compose Deployment (Staging)](#3-docker-compose-deployment-staging)
4. [Kubernetes Deployment (Production)](#4-kubernetes-deployment-production)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Database Management](#6-database-management)
7. [Monitoring & Alerting](#7-monitoring--alerting)
8. [SSL/TLS Configuration](#8-ssltls-configuration)
9. [Scaling Guide](#9-scaling-guide)
10. [Disaster Recovery](#10-disaster-recovery)
11. [Environment Variables Reference](#11-environment-variables-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### Required Tools

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 20.0+ | Runtime for all services |
| npm | 10.0+ | Package manager (workspaces) |
| Docker | 24.0+ | Container runtime |
| Docker Compose | 2.20+ | Multi-container orchestration |
| kubectl | 1.28+ | Kubernetes CLI |
| Terraform | 1.7+ | Infrastructure provisioning |
| Helm | 3.12+ | Kubernetes package manager |
| gcloud CLI | 460+ | Google Cloud operations |
| k6 | 0.49+ | Load testing |
| kustomize | 5.3+ | Kubernetes manifest management |

```bash
# Verify all tools are installed
node --version       # v20.x.x
npm --version        # 10.x.x
docker --version     # 24.x.x
docker compose version  # v2.20+
kubectl version --client
terraform --version  # v1.7+
helm version         # v3.12+
gcloud --version
k6 version
kustomize version
```

### Hardware Recommendations

| Environment | CPU | RAM | Disk | Notes |
|------------|-----|-----|------|-------|
| Local Development | 4 cores | 16 GB | 50 GB SSD | Docker Desktop needs 8 GB allocated |
| Staging (Docker Compose) | 8 cores | 32 GB | 100 GB SSD | Single machine running all 15+ containers |
| Production (GKE) | 3x e2-standard-4 (min) | 48 GB total (min) | 100 GB SSD per node | Auto-scales to 20 nodes |

### DNS and Domain Setup

CollabSpace uses `collabspace.io` as the primary domain. Configure DNS records before production deployment:

```
A     collabspace.io          -> <GKE_INGRESS_IP>
A     *.collabspace.io        -> <GKE_INGRESS_IP>
CNAME staging.collabspace.io  -> <STAGING_LB_IP>
CNAME grafana.collabspace.io  -> <GKE_INGRESS_IP>
```

Get the static IP after Terraform provisioning:

```bash
terraform output static_ip
```

---

## 2. Local Development Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/collabspace/collabspace.git
cd collabspace
```

### Step 2: Install Dependencies

CollabSpace is a Turborepo monorepo with npm workspaces. A single install handles all packages and apps.

```bash
npm install
```

This installs dependencies for:
- **Apps (10):** api-gateway, ws-gateway, auth-service, doc-service, code-service, board-service, project-service, notification-service, ai-service, web
- **Packages (4):** shared, crdt, ai-sdk, ui

### Step 3: Set Up Environment Variables

Create a `.env` file in `infra/docker/` for infrastructure services:

```bash
cp infra/docker/.env.example infra/docker/.env
```

If no `.env.example` exists, create `infra/docker/.env` with the following:

```bash
# Database
POSTGRES_USER=collabspace
POSTGRES_PASSWORD=localdev123
POSTGRES_DB=collabspace
POSTGRES_PORT=5432

# Redis
REDIS_PASSWORD=
REDIS_PORT=6379

# JWT
JWT_SECRET=local-dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=local-dev-refresh-secret-change-in-production
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Application
NODE_ENV=development
LOG_LEVEL=debug
IMAGE_TAG=latest

# AI (optional for local)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
AI_MODEL=gpt-4o
AI_MAX_TOKENS=4096

# OAuth (optional for local)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# SMTP (optional for local)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@collabspace.io

# Observability
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001

# Web
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Start Infrastructure Services Only

For local development, run PostgreSQL, Redis, Kafka, and observability in Docker while running application services natively with `npm run dev`:

```bash
# Start only infrastructure containers
docker compose -f infra/docker/docker-compose.yml up -d \
  postgres redis zookeeper kafka prometheus grafana jaeger
```

Wait for all infrastructure to become healthy:

```bash
# Check health of all running containers
docker compose -f infra/docker/docker-compose.yml ps

# Verify PostgreSQL is ready
docker exec collabspace-postgres pg_isready -U collabspace

# Verify Redis is ready
docker exec collabspace-redis redis-cli ping

# Verify Kafka is ready
docker exec collabspace-kafka kafka-topics --bootstrap-server localhost:9092 --list
```

### Step 5: Seed the Database

The `init-db.sql` script runs automatically on first PostgreSQL start and creates:
- Seven schemas: `auth`, `documents`, `code`, `boards`, `projects`, `notifications`, `ai`
- All tables, indexes, and triggers
- A default organization ("CollabSpace")
- An admin user: `admin@collabspace.io` / `Admin@123456`
- A default project ("Getting Started") with a welcome document

To run additional seeds or reset:

```bash
# Run migrations across all services that define them
npm run db:migrate

# Run seed scripts
npm run db:seed

# To reset the database entirely
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d postgres
# Wait for postgres to start, then init-db.sql runs again automatically
```

### Step 6: Run Application Services

Start all services in development mode with hot-reload via Turborepo:

```bash
# Start all services concurrently
npm run dev
```

This starts:
| Service | URL |
|---------|-----|
| Web (Next.js) | http://localhost:3000 |
| API Gateway | http://localhost:4000 |
| WebSocket Gateway | ws://localhost:4001 |
| Auth Service | http://localhost:4002 |
| Doc Service | http://localhost:4003 |
| Code Service | http://localhost:4004 |
| Board Service | http://localhost:4005 |
| Project Service | http://localhost:4006 |
| Notification Service | http://localhost:4007 |
| AI Service | http://localhost:4008 |

To run a single service:

```bash
# Run only the web app (and its dependencies)
npx turbo dev --filter=web

# Run only the API gateway
npx turbo dev --filter=api-gateway
```

### Step 7: Access Observability Tools

| Tool | URL | Credentials |
|------|-----|-------------|
| Grafana | http://localhost:3001 | admin / admin |
| Prometheus | http://localhost:9090 | None |
| Jaeger | http://localhost:16686 | None |

Grafana is auto-provisioned with Prometheus as a datasource via `infra/docker/grafana/provisioning/datasources/prometheus.yml` and pre-configured dashboards via `infra/docker/grafana/provisioning/dashboards/dashboard.yml`.

### Troubleshooting Common Local Issues

**Port conflicts:**

```bash
# Find what is using a port (e.g., 5432)
lsof -i :5432
# Or on Windows:
netstat -ano | findstr :5432
```

**PostgreSQL won't start:**

```bash
# Check logs
docker compose -f infra/docker/docker-compose.yml logs postgres

# Reset data volume
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d postgres
```

**Kafka broker not ready:**

Kafka requires Zookeeper to be healthy first. If Kafka fails, restart the full chain:

```bash
docker compose -f infra/docker/docker-compose.yml restart zookeeper
# Wait 15 seconds for Zookeeper to become healthy
docker compose -f infra/docker/docker-compose.yml restart kafka
```

**Node.js service can't connect to infrastructure:**

Ensure environment variables point to `localhost`, not Docker service names. When running services natively, database URL should be `postgresql://collabspace:localdev123@localhost:5432/collabspace`, not `postgres:5432`.

---

## 3. Docker Compose Deployment (Staging)

The full Docker Compose stack runs 15+ containers for staging or demo environments. The compose file lives at `infra/docker/docker-compose.yml`.

### Container Inventory

| Container | Image | Port | Role |
|-----------|-------|------|------|
| `collabspace-api-gateway` | collabspace/api-gateway | 4000 | REST API routing |
| `collabspace-ws-gateway` | collabspace/ws-gateway | 4001 | WebSocket connections |
| `collabspace-auth-service` | collabspace/auth-service | 4002 | Authentication & OAuth |
| `collabspace-doc-service` | collabspace/doc-service | 4003 | Document collaboration |
| `collabspace-code-service` | collabspace/code-service | 4004 | Code editing sessions |
| `collabspace-board-service` | collabspace/board-service | 4005 | Whiteboard collaboration |
| `collabspace-project-service` | collabspace/project-service | 4006 | Projects & tasks |
| `collabspace-notification-service` | collabspace/notification-service | 4007 | Notifications & email |
| `collabspace-ai-service` | collabspace/ai-service | 4008 | AI assistant |
| `collabspace-web` | collabspace/web | 3000 | Next.js frontend |
| `collabspace-postgres` | postgres:16-alpine | 5432 | Primary database |
| `collabspace-redis` | redis:7-alpine | 6379 | Cache & pub/sub |
| `collabspace-zookeeper` | cp-zookeeper:7.6.0 | 2181 | Kafka coordination |
| `collabspace-kafka` | cp-kafka:7.6.0 | 9092, 9093 | Event streaming |
| `collabspace-prometheus` | prom/prometheus:v2.51.0 | 9090 | Metrics collection |
| `collabspace-grafana` | grafana/grafana:10.4.0 | 3001 | Dashboards |
| `collabspace-jaeger` | jaegertracing/all-in-one:1.55 | 16686 | Distributed tracing |
| `collabspace-nginx` | nginx:1.25-alpine | 80, 443 | Reverse proxy & TLS |

### Building Images

All application services use a multi-stage Dockerfile (`infra/docker/Dockerfile.service`). The web app uses `infra/docker/Dockerfile.web`. Both produce slim Alpine-based images with non-root users.

```bash
# Build all images
docker compose -f infra/docker/docker-compose.yml build

# Build a specific service
docker compose -f infra/docker/docker-compose.yml build api-gateway

# Build with no cache (fresh build)
docker compose -f infra/docker/docker-compose.yml build --no-cache
```

The build process has three stages:
1. **deps** -- Installs npm dependencies with layer caching
2. **builder** -- Builds the service with Turborepo, then prunes dev dependencies
3. **runner** -- Slim production image with `dumb-init` for proper PID 1 signal handling

### Environment Variable Configuration

Create `infra/docker/.env` with production-appropriate values. See [Section 11](#11-environment-variables-reference) for the complete reference. Critical variables for staging:

```bash
NODE_ENV=production
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<random-256-bit-key>
JWT_REFRESH_SECRET=<random-256-bit-key>
IMAGE_TAG=staging
LOG_LEVEL=info
```

Generate secure secrets:

```bash
# Generate a 256-bit secret
openssl rand -base64 32
```

### Starting the Full Stack

```bash
# Start everything in detached mode
docker compose -f infra/docker/docker-compose.yml up -d

# Or use the npm alias
npm run docker:up
```

### Startup Order (depends_on)

Docker Compose enforces this startup sequence via health check conditions:

```
1. postgres, redis, zookeeper       (no dependencies)
2. kafka                            (depends on: zookeeper healthy)
3. auth-service                     (depends on: postgres, redis, kafka healthy)
4. api-gateway                      (depends on: redis, kafka, auth-service healthy)
5. ws-gateway                       (depends on: redis, kafka healthy)
6. doc-service, code-service,       (depends on: postgres, redis, kafka healthy)
   board-service, project-service,
   notification-service, ai-service
7. web                              (depends on: api-gateway healthy)
8. nginx                            (depends on: api-gateway, ws-gateway, web healthy)
9. prometheus                       (no dependencies)
10. grafana                         (depends on: prometheus healthy)
11. jaeger                          (no dependencies)
```

### Volume Mounts for Persistence

All data survives container restarts. Named volumes are defined at the bottom of `docker-compose.yml`:

| Volume | Container | Mount Point | Purpose |
|--------|-----------|-------------|---------|
| `postgres_data` | postgres | /var/lib/postgresql/data | Database files |
| `redis_data` | redis | /data | Redis AOF + RDB snapshots |
| `kafka_data` | kafka | /var/lib/kafka/data | Kafka logs/segments |
| `zookeeper_data` | zookeeper | /var/lib/zookeeper/data | ZK state |
| `zookeeper_logs` | zookeeper | /var/lib/zookeeper/log | ZK transaction logs |
| `prometheus_data` | prometheus | /prometheus | Metrics TSDB (15d retention) |
| `grafana_data` | grafana | /var/lib/grafana | Dashboards, users, config |
| `jaeger_data` | jaeger | /badger | Trace storage (Badger DB) |
| `nginx_certs` | nginx | /etc/nginx/certs | TLS certificates |
| `nginx_logs` | nginx | /var/log/nginx | Access/error logs |

Additionally, these bind mounts provide configuration:
- `./prometheus.yml` -> `/etc/prometheus/prometheus.yml` (read-only)
- `./alert_rules.yml` -> referenced by prometheus config
- `./grafana/provisioning/` -> `/etc/grafana/provisioning/` (read-only)
- `./nginx.conf` -> `/etc/nginx/nginx.conf` (read-only)
- `./init-db.sql` -> `/docker-entrypoint-initdb.d/01-init.sql` (read-only, runs on first start)

### Networking

All containers share a single bridge network named `collabspace` with subnet `172.28.0.0/16`. Services communicate using Docker DNS (container names resolve automatically).

```bash
# Inspect the network
docker network inspect infra_collabspace

# Verify service-to-service connectivity
docker exec collabspace-api-gateway wget -qO- http://auth-service:4002/health
```

### Health Checks

Every container defines a health check. Default parameters are set via the `x-healthcheck-defaults` anchor:
- Interval: 30s
- Timeout: 10s
- Retries: 3
- Start period: 40s

Infrastructure services use faster checks (10s interval). Monitor health with:

```bash
# View health status of all containers
docker compose -f infra/docker/docker-compose.yml ps

# Watch health in real time
watch docker compose -f infra/docker/docker-compose.yml ps
```

### Accessing Services

Through nginx (ports 80/443):
- Web UI: http://localhost/ (or https:// if certs are configured)
- API: http://localhost/api/
- WebSocket: ws://localhost/ws/

Direct access (bypassing nginx):
- Each service is exposed on its own port (see container inventory table above)

### Updating Services

```bash
# Rebuild and restart a single service with zero-downtime
docker compose -f infra/docker/docker-compose.yml up -d --build api-gateway

# Rebuild and restart all services
docker compose -f infra/docker/docker-compose.yml up -d --build

# Pull latest base images and rebuild
docker compose -f infra/docker/docker-compose.yml build --pull
docker compose -f infra/docker/docker-compose.yml up -d
```

### Viewing Logs

```bash
# Follow logs for all services
docker compose -f infra/docker/docker-compose.yml logs -f

# Follow logs for a specific service
docker compose -f infra/docker/docker-compose.yml logs -f api-gateway

# Show last 100 lines
docker compose -f infra/docker/docker-compose.yml logs --tail=100 api-gateway

# Show logs since a timestamp
docker compose -f infra/docker/docker-compose.yml logs --since="2025-01-15T10:00:00" api-gateway
```

JSON file logging is configured for all containers with rotation: max 10 MB per file, 3 files retained.

### Resource Allocation Recommendations (Staging)

| Service | CPU Limit | Memory Limit | Notes |
|---------|----------|-------------|-------|
| postgres | 2 cores | 4 GB | Set via `--shm-size` if needed |
| redis | 0.5 cores | 512 MB | Configured via `--maxmemory 512mb` |
| kafka | 1 core | 2 GB | Heap set by KAFKA_HEAP_OPTS |
| zookeeper | 0.5 cores | 512 MB | Lightweight |
| Each app service | 0.5 cores | 512 MB | 8 services total |
| nginx | 0.25 cores | 128 MB | Lightweight reverse proxy |
| prometheus | 0.5 cores | 1 GB | Depends on metric cardinality |
| grafana | 0.25 cores | 256 MB | Lightweight |
| jaeger | 0.5 cores | 512 MB | Badger storage engine |

### Shutting Down

```bash
# Stop all containers (preserves data)
docker compose -f infra/docker/docker-compose.yml down

# Stop and remove all data volumes (DESTRUCTIVE)
docker compose -f infra/docker/docker-compose.yml down -v

# Or use the npm alias
npm run docker:down
```

---

## 4. Kubernetes Deployment (Production)

### 4.1 Cluster Provisioning with Terraform

All infrastructure-as-code is in `infra/terraform/`. The following files define the complete GCP production environment:

| File | Purpose |
|------|---------|
| `main.tf` | Provider configuration, GCS backend for state, required API enablement |
| `variables.tf` | All input variables with defaults and validation |
| `networking.tf` | VPC, subnets (with pod/service CIDRs), Cloud NAT, firewall rules, static IP |
| `gke.tf` | GKE cluster (private, VPC-native, Workload Identity), 3 node pools |
| `database.tf` | Cloud SQL PostgreSQL 16 (HA), read replica, automated backups |
| `redis.tf` | Memorystore Redis 7 (HA), private service access |
| `storage.tf` | GCS buckets (assets + uploads), CDN backend bucket, IAM |
| `monitoring.tf` | Uptime checks, alert policies, notification channels, dashboard |
| `outputs.tf` | Cluster endpoint, database IPs, Redis host, static IP, bucket names |

#### Prerequisites

```bash
# Authenticate with GCP
gcloud auth login
gcloud auth application-default login

# Set the project
export PROJECT_ID="your-gcp-project-id"
gcloud config set project $PROJECT_ID

# Create the Terraform state bucket
gsutil mb -p $PROJECT_ID -l us-central1 gs://collabspace-terraform-state
gsutil versioning set on gs://collabspace-terraform-state
```

#### Initialize and Apply

```bash
cd infra/terraform

# Create a terraform.tfvars file
cat > terraform.tfvars <<'EOF'
project_id     = "your-gcp-project-id"
region         = "us-central1"
environment    = "production"
db_password    = "your-strong-db-password"
domain_name    = "collabspace.io"
alert_email    = "alerts@collabspace.io"

# Restrict master access in production
authorized_networks = [
  {
    cidr_block   = "203.0.113.0/24"
    display_name = "Office network"
  }
]
EOF

# Initialize Terraform
terraform init

# Review the plan
terraform plan -out=plan.tfplan

# Apply (creates ~25 resources, takes 15-25 minutes)
terraform apply plan.tfplan
```

#### What Gets Created

**Networking (`networking.tf`):**
- VPC (`collabspace-vpc`) with no auto-created subnets
- Primary subnet (`10.0.0.0/20`) with secondary ranges for pods (`10.4.0.0/14`) and services (`10.8.0.0/20`)
- Cloud Router + Cloud NAT for outbound internet access from private nodes
- Firewall rules: allow internal traffic, allow health checks, deny all other ingress
- Global static IP for the Ingress load balancer
- Private service connection for Cloud SQL and Memorystore

**GKE Cluster (`gke.tf`):**
- Regional cluster (3 zones) with private nodes, public endpoint
- Workload Identity enabled for pod-level GCP IAM
- Network policy (Calico), HTTP load balancing, HPA, DNS cache addons
- Binary authorization enforcement
- Managed Prometheus enabled
- Maintenance window: Sundays 2-6 AM UTC
- **Three node pools:**
  - `default-pool`: e2-standard-4, 3-20 nodes, general workloads
  - `compute-pool`: e2-standard-8, 1-10 nodes, tainted for AI service
  - `preemptible-pool`: e2-standard-4, 0-10 nodes, for batch/non-critical workloads

**Database (`database.tf`):**
- Cloud SQL PostgreSQL 16, `db-custom-4-16384` tier (4 vCPU, 16 GB RAM)
- Regional HA (automatic failover)
- 100 GB SSD with autoresize to 500 GB
- Private IP only, SSL required
- Automated daily backups at 3 AM UTC, 30 retained, PITR enabled (7-day transaction logs)
- Read replica for read-heavy queries
- Database flags: 500 max connections, slow query logging (>1s), pg_stat_statements

**Redis (`redis.tf`):**
- Memorystore Redis 7, STANDARD_HA tier, 5 GB
- Private service access, transit encryption
- allkeys-lru eviction, keyspace event notifications enabled
- Maintenance window: Sundays 3 AM UTC

**Storage (`storage.tf`):**
- `collabspace-assets-*`: Public bucket with CDN, versioning, lifecycle (Standard -> Nearline at 1y -> Coldline at 2y)
- `collabspace-uploads-*`: Private bucket, temp files auto-deleted after 30 days
- CDN backend with 1h default TTL, 24h max TTL, stale-while-revalidate

**Monitoring (`monitoring.tf`):**
- Email notification channel
- Uptime checks: web (HTTPS), API (/api/health)
- Alert policies: high latency (P95 > 500ms), error rate > 5%, uptime failure, resource exhaustion (CPU > 85%, memory > 90%, Cloud SQL CPU > 80%)

#### Connect to the Cluster

```bash
# Get the kubectl configuration command from Terraform output
terraform output kubeconfig_command

# Run it (example):
gcloud container clusters get-credentials collabspace-cluster \
  --region us-central1 \
  --project your-gcp-project-id

# Verify connectivity
kubectl cluster-info
kubectl get nodes
```

### 4.2 Deploying Applications with Kustomize

Kubernetes manifests are organized under `infra/k8s/` using Kustomize:

```
infra/k8s/
  base/
    namespace.yaml              # collabspace namespace
    configmap.yaml              # Shared configuration
    secrets.yaml                # Secret placeholders (base64)
    ingress.yaml                # Main + WebSocket ingress
    kustomization.yaml          # Base resource list
    api-gateway/
      deployment.yaml           # Deployment spec
      service.yaml              # ClusterIP service
      hpa.yaml                  # HorizontalPodAutoscaler
    ws-gateway/                 # Same structure for all services
    auth-service/
    doc-service/
    code-service/
    board-service/
    project-service/
    notification-service/
    ai-service/
    web/
    redis/
      statefulset.yaml          # 3-replica StatefulSet + Sentinel
    kafka/
      statefulset.yaml          # 3-replica Kafka + 3-replica ZK
    monitoring/
      prometheus.yaml
      grafana.yaml
      jaeger.yaml
      service-monitors.yaml
  overlays/
    staging/
      kustomization.yaml        # Staging overrides
      staging-config.yaml
    production/
      kustomization.yaml        # Production overrides
      production-config.yaml
```

#### Create the Namespace and Secrets

```bash
# Apply the namespace first
kubectl apply -f infra/k8s/base/namespace.yaml

# Create production secrets (do NOT commit real values to git)
kubectl create secret generic collabspace-secrets \
  --namespace=collabspace \
  --from-literal=JWT_SECRET="$(openssl rand -base64 32)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=DATABASE_URL="postgresql://collabspace:YOUR_PASSWORD@CLOUD_SQL_PRIVATE_IP:5432/collabspace" \
  --from-literal=REDIS_PASSWORD="" \
  --from-literal=GOOGLE_CLIENT_ID="your-google-client-id" \
  --from-literal=GOOGLE_CLIENT_SECRET="your-google-client-secret" \
  --from-literal=GITHUB_CLIENT_ID="your-github-client-id" \
  --from-literal=GITHUB_CLIENT_SECRET="your-github-client-secret" \
  --from-literal=OPENAI_API_KEY="sk-your-key" \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-your-key" \
  --from-literal=SMTP_HOST="smtp.sendgrid.net" \
  --from-literal=SMTP_USER="apikey" \
  --from-literal=SMTP_PASSWORD="your-sendgrid-api-key" \
  --dry-run=client -o yaml | kubectl apply -f -

# Create database credentials
kubectl create secret generic collabspace-db-credentials \
  --namespace=collabspace \
  --from-literal=POSTGRES_USER="collabspace" \
  --from-literal=POSTGRES_PASSWORD="YOUR_PASSWORD" \
  --from-literal=POSTGRES_DB="collabspace" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Use the Cloud SQL private IP from Terraform output:

```bash
terraform output database_private_ip
terraform output redis_host
```

#### Deploy with Kustomize

```bash
# Preview what will be applied
kustomize build infra/k8s/overlays/production | kubectl diff -f -

# Apply production overlay
kubectl apply -k infra/k8s/overlays/production

# Or use the npm alias
npm run k8s:deploy
```

#### Key Deployment Features

Every application Deployment includes:
- **Rolling update** strategy with `maxSurge: 1` and `maxUnavailable: 0` (zero-downtime)
- **Liveness probe:** `/health` endpoint (initial delay 30s, period 15s, 3 failures to restart)
- **Readiness probe:** `/health` endpoint (initial delay 10s, period 10s, 3 failures to remove from service)
- **Startup probe:** `/health` endpoint (initial delay 5s, period 5s, 12 failures allowed = 60s startup window)
- **Pod anti-affinity:** Prefers spreading replicas across different nodes
- **Graceful shutdown:** `preStop` hook with 5s sleep, `terminationGracePeriodSeconds: 30`
- **Prometheus annotations:** Auto-discovered scraping on `/metrics`
- **Revision history:** 5 revisions kept for rollback

The ConfigMap (`configmap.yaml`) provides service URLs using Kubernetes internal DNS:

```
http://auth-service.collabspace.svc.cluster.local:4002
http://doc-service.collabspace.svc.cluster.local:4003
...
```

#### StatefulSets: Redis and Kafka

**Redis** runs as a 3-replica StatefulSet with:
- Sentinel sidecar for automatic failover
- Redis exporter sidecar for Prometheus metrics
- 10 GB persistent volume per replica
- Custom `redis.conf` via ConfigMap (1 GB maxmemory, AOF persistence, allkeys-lru)

**Kafka** runs as a 3-replica StatefulSet with:
- 3-replica ZooKeeper ensemble (separate StatefulSet)
- Kafka exporter sidecar for consumer lag metrics
- 50 GB persistent volume per broker
- Replication factor 3, min ISR 2 for all topics
- Pod anti-affinity ensures brokers run on different nodes

#### Ingress with TLS

Two Ingress resources are defined in `infra/k8s/base/ingress.yaml`:

1. **Main Ingress** (`collabspace-ingress`): Routes `/api` to api-gateway, `/` to web frontend
   - cert-manager auto-provisions Let's Encrypt certificates
   - Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
   - Rate limiting: 100 req/s with 5x burst
   - CORS configured for `https://collabspace.io`
   - Gzip compression enabled
   - 50 MB max body size

2. **WebSocket Ingress** (`collabspace-ws-ingress`): Routes `/ws` to ws-gateway
   - Proxy timeout set to 7 days (604800s) for long-lived connections
   - Sticky sessions via cookie (`COLLABSPACE_WS`)
   - Upgrade headers for WebSocket protocol

### 4.3 Production Overlay

The production Kustomize overlay (`infra/k8s/overlays/production/kustomization.yaml`) applies these changes on top of the base:

**Increased Replicas:**

| Service | Base | Production |
|---------|------|------------|
| api-gateway | 3 | 5 |
| ws-gateway | 3 | 10 |
| auth-service | 3 | 5 |
| doc-service | 3 | 5 |
| code-service | 3 | 3 |
| board-service | 3 | 3 |
| project-service | 3 | 5 |
| notification-service | 3 | 3 |
| ai-service | 3 | 5 |
| web | 3 | 5 |

**Production Resource Limits (all backend services):**

| Resource | Base Request | Production Request | Base Limit | Production Limit |
|----------|-------------|-------------------|------------|-----------------|
| CPU | 500m | 1000m | 1000m | 2000m |
| Memory | 256Mi | 512Mi | 512Mi | 1Gi |

**Production HPA Scaling:**

| Service | Base Min/Max | Production Min/Max |
|---------|-------------|-------------------|
| api-gateway | 3/20 | 5/30 |
| ws-gateway | 3/20 | 10/100 |

**Production ConfigMap:** `LOG_LEVEL=warn`, `NODE_ENV=production`

**Image Tags:** Set by CI/CD to the release version (e.g., `v1.2.3`)

### 4.4 Rolling Updates and Rollback

```bash
# Deploy a new version (updates image tag)
kubectl set image deployment/api-gateway \
  api-gateway=gcr.io/your-project/api-gateway:v1.2.3 \
  -n collabspace

# Watch the rollout
kubectl rollout status deployment/api-gateway -n collabspace

# View rollout history
kubectl rollout history deployment/api-gateway -n collabspace

# Rollback to previous version
kubectl rollout undo deployment/api-gateway -n collabspace

# Rollback to a specific revision
kubectl rollout undo deployment/api-gateway -n collabspace --to-revision=3

# Rollback ALL services (emergency)
SERVICES="api-gateway ws-gateway auth-service doc-service code-service board-service project-service notification-service ai-service web"
for svc in $SERVICES; do
  kubectl rollout undo deployment/$svc -n collabspace
done
```

### 4.5 Scaling

```bash
# Manual scale a deployment
kubectl scale deployment/api-gateway --replicas=8 -n collabspace

# Edit HPA for a service
kubectl edit hpa api-gateway -n collabspace

# View current HPA status
kubectl get hpa -n collabspace

# Node pool auto-scaling is managed by GKE. To adjust:
gcloud container clusters update collabspace-cluster \
  --region us-central1 \
  --node-pool default-pool \
  --enable-autoscaling \
  --min-nodes 5 \
  --max-nodes 30
```

---

## 5. CI/CD Pipeline

### 5.1 Pipeline Overview

Three GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push to main, PRs | Lint, typecheck, test, build, deploy to staging |
| `deploy-production.yml` | Push tag `v*` | Build release images, deploy to production, smoke test, auto-rollback |
| `load-test.yml` | Manual dispatch | Run k6 load tests against a target URL |

### 5.2 CI Pipeline (`ci.yml`)

Runs on every push to `main` and every PR:

**Stage 1 -- Quality Checks (parallel):**
- **Lint:** `npx turbo lint` + Prettier check
- **Type Check:** `npx turbo typecheck`

**Stage 2 -- Tests (parallel matrix):**
- Runs tests for all 10 services in parallel using a matrix strategy
- Each test job spins up PostgreSQL 16 and Redis 7 as GitHub Actions service containers
- Test environment: `DATABASE_URL=postgresql://test:test@localhost:5432/collabspace_test`
- Coverage artifacts uploaded per service (7-day retention)

**Stage 3 -- Build Docker Images (after tests pass, main branch only):**
- Authenticates to GCP via Workload Identity Federation
- Builds all 10 images in parallel using Docker Buildx with GHA cache
- Pushes to Google Container Registry with tags: `<sha>`, `staging`, `latest`

**Stage 4 -- Deploy to Staging (after build):**
- Gets GKE credentials
- Updates image tags in `infra/k8s/overlays/staging` via `kustomize edit set image`
- Applies with `kustomize build | kubectl apply -f -`
- Waits for all 10 rollouts to complete (300s timeout each)
- Runs smoke test against the staging ingress IP

### 5.3 Production Deployment (`deploy-production.yml`)

Triggered by pushing a semver tag (e.g., `git tag v1.2.3 && git push --tags`):

1. **Build:** All 10 images tagged with the version (e.g., `v1.2.3`) and `production`
2. **Deploy:**
   - Saves current deployment state for rollback (`kubectl get deployments -o yaml`)
   - Updates production overlay image tags
   - Applies with Kustomize
   - Waits for rollout (600s timeout per service)
3. **Smoke Tests:**
   - Checks `https://collabspace.io/` for HTTP 200
   - Checks `https://collabspace.io/api/health` for HTTP 200
   - Checks `https://collabspace.io/api/auth/health` for HTTP 200
4. **Auto-Rollback:** If any step fails, all 10 deployments are rolled back
5. **Post-Deploy:** Annotates deployment in Grafana, creates GitHub deployment status

### 5.4 Load Testing (`load-test.yml`)

Manually triggered with parameters:

```bash
# Trigger via GitHub CLI
gh workflow run load-test.yml \
  --field target_url=https://staging.collabspace.io \
  --field duration=5m \
  --field vus=1000 \
  --field scenario=all
```

Parameters:
- `target_url`: URL to test (default: `https://staging.collabspace.io`)
- `duration`: Test duration (default: `5m`)
- `vus`: Max virtual users (default: `1000`)
- `scenario`: `all`, `api`, `websocket`, `collaboration`, or `ai`

Thresholds: P95 < 200ms, error rate < 1%. Results posted to Slack and as PR comments.

### 5.5 Docker Image Versioning

| Tag | When | Use |
|-----|------|-----|
| `<git-sha>` | Every CI build | Exact commit traceability |
| `staging` | Every CI build (main) | Current staging version |
| `latest` | Every CI build (main) | Latest main branch build |
| `v1.2.3` | Release tag push | Immutable release version |
| `production` | Release tag push | Current production version |

### 5.6 Environment Promotion

```
feature branch -> PR -> main -> staging (automatic)
                                  |
                        git tag v1.x.x -> production (automatic with approval)
```

The `staging` and `production` GitHub environments should have protection rules requiring manual approval for production.

### 5.7 Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity provider for keyless auth |
| `GCP_SERVICE_ACCOUNT` | Service account email for CI/CD |
| `GRAFANA_API_KEY` | API key for deployment annotations |
| `SLACK_WEBHOOK_URL` | Slack webhook for load test notifications |

---

## 6. Database Management

### Initial Schema Setup

The initialization script `infra/docker/init-db.sql` runs automatically when PostgreSQL starts with an empty data directory. It creates:

- **7 schemas:** auth, documents, code, boards, projects, notifications, ai
- **Extensions:** uuid-ossp, pg_trgm (trigram search), pgcrypto
- **20+ tables** with foreign keys, indexes, and triggers
- **Seed data:** Default organization, admin user, default project, welcome document
- **Auto-updating triggers** for `updated_at` columns on all major tables

### Running Migrations

```bash
# Run migrations across all services
npm run db:migrate

# Run migrations for a specific service
npx turbo db:migrate --filter=@collabspace/auth-service

# Run seeds (depends on migrations)
npm run db:seed
```

### Backup Strategy (Production)

Cloud SQL provides automated backups configured in `database.tf`:

| Feature | Setting |
|---------|---------|
| Automated daily backups | 3:00 AM UTC |
| Backup retention | 30 backups |
| Point-in-time recovery | Enabled, 7-day transaction log retention |
| Backup location | Same region (us-central1) |

```bash
# List backups
gcloud sql backups list --instance=collabspace-db-production

# Create an on-demand backup before major changes
gcloud sql backups create --instance=collabspace-db-production --async

# Restore from a backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=collabspace-db-production \
  --backup-instance=collabspace-db-production

# Point-in-time recovery
gcloud sql instances clone collabspace-db-production collabspace-db-recovery \
  --point-in-time="2025-06-15T10:30:00Z"
```

### Connection String Configuration

**Local Development:**
```
postgresql://collabspace:localdev123@localhost:5432/collabspace?schema=auth
```

**Docker Compose (services reference by container name):**
```
postgresql://collabspace:${POSTGRES_PASSWORD}@postgres:5432/collabspace?schema=auth
```

**Production (Cloud SQL private IP):**
```
postgresql://collabspace:PASSWORD@CLOUD_SQL_PRIVATE_IP:5432/collabspace?schema=auth
```

Each service appends its own schema: `?schema=auth`, `?schema=documents`, `?schema=code`, etc.

### Connection Pooling

Database flags configured in Cloud SQL:
- `max_connections`: 500
- `log_min_duration_statement`: 1000 (logs queries > 1 second)
- `shared_preload_libraries`: pg_stat_statements

Recommended application-side pool sizes per service (Node.js `pg` pool):
- **auth-service:** pool size 20 (high read traffic)
- **doc-service:** pool size 15
- **code-service:** pool size 10
- **board-service:** pool size 10
- **project-service:** pool size 15
- **notification-service:** pool size 10
- **ai-service:** pool size 10
- **Total:** ~90 connections per replica set. With 5 replicas, ~450 connections (under the 500 limit)

---

## 7. Monitoring & Alerting

### Prometheus

**Configuration:** `infra/docker/prometheus.yml`

Scrape config targets all application services and infrastructure exporters:

| Job | Target | Interval |
|-----|--------|----------|
| prometheus | localhost:9090 | 15s |
| api-gateway | api-gateway:4000 | 15s |
| ws-gateway | ws-gateway:4001 | 15s |
| auth-service | auth-service:4002 | 15s |
| doc-service | doc-service:4003 | 15s |
| code-service | code-service:4004 | 15s |
| board-service | board-service:4005 | 15s |
| project-service | project-service:4006 | 15s |
| notification-service | notification-service:4007 | 15s |
| ai-service | ai-service:4008 | 15s |
| redis | redis-exporter:9121 | 15s |
| postgres | postgres-exporter:9187 | 15s |
| kafka | kafka-exporter:9308 | 15s |
| nginx | nginx-exporter:9113 | 15s |
| node-exporter | node-exporter:9100 | 15s |
| cadvisor | cadvisor:8080 | 30s |

Storage retention: 15 days (`--storage.tsdb.retention.time=15d`). Admin API and lifecycle API enabled for remote management.

In Kubernetes, Managed Prometheus is enabled at the cluster level. Service monitors in `infra/k8s/base/monitoring/service-monitors.yaml` auto-discover pods with `prometheus.io/scrape: "true"` annotations.

### Grafana

**Auto-provisioned datasource:** Prometheus at `http://prometheus:9090`

**Pre-configured dashboards** are mounted from `infra/docker/grafana/dashboards/`.

To create custom dashboards:

1. Open Grafana at http://localhost:3001 (local) or https://grafana.collabspace.io (production)
2. Log in with admin credentials
3. Create dashboard > Add panel > Select Prometheus datasource
4. Use PromQL queries, e.g.:
   - Request rate: `sum(rate(http_requests_total[5m])) by (service)`
   - P95 latency: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))`
   - Error rate: `sum(rate(http_requests_total{status=~"5.."}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service)`

### Alert Rules

Defined in `infra/docker/alert_rules.yml` with three groups:

**Service Alerts (`collabspace_service_alerts`):**
| Alert | Condition | Severity |
|-------|-----------|----------|
| HighRequestLatency | P95 > 0.5s for 5m | warning |
| CriticalRequestLatency | P99 > 2s for 3m | critical |
| HighErrorRate | 5xx > 5% for 5m | critical |
| ServiceDown | `up == 0` for 1m | critical |
| HighMemoryUsage | > 512 MB for 5m | warning |
| HighCPUUsage | > 80% for 5m | warning |

**WebSocket Alerts (`collabspace_websocket_alerts`):**
| Alert | Condition | Severity |
|-------|-----------|----------|
| HighWebSocketConnections | > 10,000 active for 5m | warning |
| WebSocketConnectionDropRate | > 10/s drops for 3m | warning |

**Infrastructure Alerts (`collabspace_infrastructure_alerts`):**
| Alert | Condition | Severity |
|-------|-----------|----------|
| PostgresConnectionPoolExhausted | > 80% connections used for 5m | warning |
| RedisHighMemoryUsage | > 85% max memory for 5m | warning |
| RedisDown | `redis_up == 0` for 1m | critical |
| KafkaConsumerLag | > 10,000 lag for 10m | warning |
| KafkaBrokerDown | 0 brokers for 1m | critical |
| DiskSpaceWarning | < 15% free for 5m | warning |
| DiskSpaceCritical | < 5% free for 2m | critical |

In production (GCP), additional Cloud Monitoring alert policies are provisioned by Terraform:
- API Gateway P95 latency > 500ms
- 5xx error rate > 5%
- Uptime check failures
- Container CPU > 85%, Memory > 90%, Cloud SQL CPU > 80%

### Jaeger (Distributed Tracing)

All services send traces to Jaeger at `http://jaeger:14268/api/traces`. Access the UI at:
- Local: http://localhost:16686
- Production: Port-forward or expose via Ingress

The Jaeger deployment uses Badger for persistent storage. For production, consider switching to Elasticsearch or Cassandra for long-term trace retention.

Recommended sampling rate:
- Development: 100% (sample all)
- Staging: 10%
- Production: 1% (or adaptive sampling)

### Log Aggregation

Docker Compose uses `json-file` log driver with rotation (10 MB x 3 files). For production:

- **GKE:** Logs are automatically shipped to Cloud Logging. Use the GCP Console or `gcloud logging read`:

```bash
# Read logs for a specific service
gcloud logging read 'resource.type="k8s_container" AND resource.labels.container_name="api-gateway" AND resource.labels.namespace_name="collabspace"' \
  --limit=50 \
  --format="table(timestamp, textPayload)"
```

- **ELK Alternative:** Deploy Filebeat DaemonSet -> Elasticsearch -> Kibana for self-managed log aggregation.

---

## 8. SSL/TLS Configuration

### cert-manager for Automatic Let's Encrypt

Install cert-manager in the cluster:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Verify installation
kubectl get pods -n cert-manager

# Create ClusterIssuer for Let's Encrypt
cat <<'EOF' | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@collabspace.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

The Ingress resource in `infra/k8s/base/ingress.yaml` references this issuer:

```yaml
annotations:
  cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - collabspace.io
        - "*.collabspace.io"
      secretName: collabspace-tls
```

cert-manager automatically provisions and renews certificates.

### Nginx Ingress TLS Termination

Install nginx-ingress controller:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.loadBalancerIP=$(terraform output -raw static_ip) \
  --set controller.config.proxy-buffer-size=16k \
  --set controller.config.large-client-header-buffers="4 16k"
```

TLS is terminated at the nginx ingress. All traffic between the ingress and backend pods is HTTP (within the cluster VPC).

### Internal Service-to-Service Communication

By default, internal services communicate over plain HTTP within the cluster network. For environments requiring mTLS:

```bash
# Install Istio for automatic mTLS between all services
istioctl install --set profile=default
kubectl label namespace collabspace istio-injection=enabled
kubectl rollout restart deployment -n collabspace
```

This is optional -- the private GKE cluster with network policies provides strong isolation.

---

## 9. Scaling Guide

### Horizontal Pod Autoscaler Configuration

Each service has an HPA defined in `infra/k8s/base/<service>/hpa.yaml`. The base configuration:

```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
behavior:
  scaleUp:
    stabilizationWindowSeconds: 60
    policies:
      - type: Pods
        value: 2
        periodSeconds: 60
  scaleDown:
    stabilizationWindowSeconds: 300
    policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

Scale-up is aggressive (2 pods per minute) with a 60s stabilization window. Scale-down is conservative (1 pod per 2 minutes) with a 5-minute stabilization window.

### Service-Specific Scaling Guidance

| Service | Scaling Trigger | Notes |
|---------|----------------|-------|
| **api-gateway** | CPU, request rate | Stateless; scales linearly with traffic |
| **ws-gateway** | Connection count, memory | Long-lived connections consume memory. Scale on connections, not CPU. Production runs 10-100 replicas |
| **auth-service** | CPU | Login/token refresh spikes; scale for peak |
| **doc-service** | CPU, memory | CRDT operations are memory-intensive |
| **code-service** | CPU | Code execution can spike CPU |
| **board-service** | CPU, memory | Large board state in memory |
| **project-service** | CPU | Standard CRUD; scales predictably |
| **notification-service** | Kafka consumer lag | Scale based on event queue depth |
| **ai-service** | CPU, request queue | LLM API calls are slow; scale to handle concurrency. Uses `compute-pool` nodes (e2-standard-8) via node affinity + tolerations |
| **web** | CPU | Static asset serving + SSR; scales easily |

### Database Connection Pool Sizing

With production replica counts and a 500-connection Cloud SQL limit:

```
Total connections = sum(replicas * pool_size) for all services

Example:
  auth-service:    5 replicas x 20 = 100
  doc-service:     5 replicas x 15 = 75
  code-service:    3 replicas x 10 = 30
  board-service:   3 replicas x 10 = 30
  project-service: 5 replicas x 15 = 75
  notification:    3 replicas x 10 = 30
  ai-service:      5 replicas x 10 = 50
  Total: 390 connections (under 500 limit)
```

If scaling replicas further, either reduce pool size per instance or increase `max_connections` on Cloud SQL (may require a larger tier).

### Redis Memory Allocation

Production Memorystore is 5 GB with allkeys-lru eviction. Monitor with:

```bash
# Check Redis memory usage
kubectl exec -n collabspace redis-0 -- redis-cli info memory

# Key metrics to watch
# used_memory_human
# maxmemory_human
# evicted_keys (should be near 0 in normal operation)
```

Scale Redis by increasing `redis_memory_size_gb` in `terraform.tfvars` and re-applying.

### Kafka Partition and Replication Settings

Production Kafka (from `infra/k8s/base/kafka/statefulset.yaml`):
- **Brokers:** 3
- **Default partitions:** 6
- **Replication factor:** 3
- **Min in-sync replicas:** 2
- **Log retention:** 168 hours (7 days)

To increase throughput for a specific topic:

```bash
# Increase partitions (cannot be decreased)
kubectl exec -n collabspace kafka-0 -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --alter \
  --topic document-updates \
  --partitions 12
```

---

## 10. Disaster Recovery

### Database Recovery

**Cloud SQL HA:** Regional availability with automatic failover. If the primary instance fails, Cloud SQL promotes the standby (typically < 30 seconds).

**Automated Backups:** Daily at 3 AM UTC, 30 retained. Point-in-time recovery available for the last 7 days.

**Read Replica:** Available for read-heavy queries. In a disaster, can be promoted:

```bash
gcloud sql instances promote-replica collabspace-db-replica-production
```

**Cross-Region Replication (manual setup):**

```bash
gcloud sql instances create collabspace-db-dr \
  --master-instance-name=collabspace-db-production \
  --region=us-east1 \
  --tier=db-custom-4-16384
```

### Redis Recovery

**Memorystore HA:** STANDARD_HA tier provides automatic failover to a standby replica in a different zone.

**In-Cluster Redis (Kubernetes):** Sentinel sidecar monitors the master and promotes a replica on failure. Configuration in `infra/k8s/base/redis/statefulset.yaml`:

```
sentinel monitor collabspace-master redis-0.redis-headless... 6379 2
sentinel down-after-milliseconds collabspace-master 5000
sentinel failover-timeout collabspace-master 60000
```

Failover triggers when 2 out of 3 sentinels agree the master is down. Failover completes within 60 seconds.

### Kafka Recovery

**3-broker cluster** with replication factor 3 and min ISR 2:
- Can tolerate 1 broker failure with no data loss
- Can tolerate 1 broker failure with continued writes (ISR = 2 >= min ISR = 2)
- If 2 brokers fail, topics become read-only until a broker recovers

**Recovery steps for a failed broker:**

```bash
# Check broker status
kubectl get pods -n collabspace -l app.kubernetes.io/name=kafka

# If a pod is stuck, delete it (StatefulSet recreates it)
kubectl delete pod kafka-1 -n collabspace

# Verify topic replication after recovery
kubectl exec -n collabspace kafka-0 -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --describe \
  --under-replicated-partitions
```

### Application Recovery

Kubernetes handles application failures via liveness and readiness probes:
- **Crashed pod:** Kubelet restarts it automatically (liveness probe failure after 3 checks)
- **Slow startup:** Startup probe allows 60 seconds before liveness kicks in
- **Unresponsive pod:** Removed from Service endpoints (readiness probe failure)
- **Node failure:** Pods rescheduled to healthy nodes by the scheduler
- **Zone failure:** Pod anti-affinity spreads replicas across nodes/zones

### Runbook: Common Failure Scenarios

**Scenario 1: Single service is down**

```bash
# Check pod status
kubectl get pods -n collabspace -l app.kubernetes.io/name=api-gateway

# Check events
kubectl describe pod <pod-name> -n collabspace

# Check logs
kubectl logs <pod-name> -n collabspace --tail=100

# Restart the deployment
kubectl rollout restart deployment/api-gateway -n collabspace
```

**Scenario 2: Database connection failure**

```bash
# Verify Cloud SQL instance status
gcloud sql instances describe collabspace-db-production --format="value(state)"

# Check connection count
gcloud sql operations list --instance=collabspace-db-production --limit=5

# Test connectivity from a pod
kubectl exec -n collabspace deploy/api-gateway -- \
  wget -qO- "http://localhost:4000/health"

# Restart services that lost connections
kubectl rollout restart deployment -n collabspace
```

**Scenario 3: Kafka consumer lag growing**

```bash
# Check consumer lag
kubectl exec -n collabspace kafka-0 -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --all-groups

# Scale up consumer service
kubectl scale deployment/notification-service --replicas=6 -n collabspace

# Check if partitions need increasing
kubectl exec -n collabspace kafka-0 -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --describe --topic notifications
```

**Scenario 4: Full cluster unresponsive**

```bash
# Check node status
kubectl get nodes

# Check system pods
kubectl get pods -n kube-system

# If nodes are unhealthy, check GKE
gcloud container clusters describe collabspace-cluster --region us-central1

# Force node pool repair
gcloud container node-pools update default-pool \
  --cluster collabspace-cluster \
  --region us-central1 \
  --enable-autorepair
```

---

## 11. Environment Variables Reference

### Application Variables

| Variable | Default | Required | Services | Description |
|----------|---------|----------|----------|-------------|
| `NODE_ENV` | `production` | Yes | All | Environment: development, test, production |
| `PORT` | varies | Yes | All | Service listen port (4000-4008, 3000) |
| `LOG_LEVEL` | `info` | No | All | Logging level: debug, info, warn, error |
| `JWT_SECRET` | -- | Yes | All except web | Secret for signing JWT access tokens |
| `JWT_REFRESH_SECRET` | -- | Yes | auth-service | Secret for signing refresh tokens |
| `JWT_EXPIRY` | `15m` | No | auth-service | Access token expiration |
| `JWT_REFRESH_EXPIRY` | `7d` | No | auth-service | Refresh token expiration |
| `DATABASE_URL` | -- | Yes | auth, doc, code, board, project, notification, ai | PostgreSQL connection string with schema |
| `REDIS_URL` | -- | Yes | All except web | Redis connection URL |
| `REDIS_PASSWORD` | (empty) | No | Redis container | Redis AUTH password |
| `KAFKA_BROKERS` | -- | Yes | All except web | Comma-separated Kafka broker addresses |
| `JAEGER_ENDPOINT` | -- | No | All except web | Jaeger collector HTTP endpoint |

### Service-Specific Variables

| Variable | Default | Required | Services | Description |
|----------|---------|----------|----------|-------------|
| `AUTH_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for auth service |
| `DOC_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for doc service |
| `CODE_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for code service |
| `BOARD_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for board service |
| `PROJECT_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for project service |
| `NOTIFICATION_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for notification service |
| `AI_SERVICE_URL` | -- | Yes | api-gateway | Internal URL for AI service |
| `GOOGLE_CLIENT_ID` | -- | No | auth-service | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | -- | No | auth-service | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | -- | No | auth-service | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | -- | No | auth-service | GitHub OAuth client secret |
| `OPENAI_API_KEY` | -- | No | ai-service | OpenAI API key |
| `ANTHROPIC_API_KEY` | -- | No | ai-service | Anthropic API key |
| `AI_MODEL` | `gpt-4o` | No | ai-service | Default AI model |
| `AI_MAX_TOKENS` | `4096` | No | ai-service | Max tokens per AI response |
| `SMTP_HOST` | -- | No | notification-service | SMTP server hostname |
| `SMTP_PORT` | `587` | No | notification-service | SMTP server port |
| `SMTP_USER` | -- | No | notification-service | SMTP authentication user |
| `SMTP_PASSWORD` | -- | No | notification-service | SMTP authentication password |
| `SMTP_FROM` | `noreply@collabspace.io` | No | notification-service | Sender email address |

### Infrastructure Variables

| Variable | Default | Required | Services | Description |
|----------|---------|----------|----------|-------------|
| `POSTGRES_USER` | `collabspace` | Yes | postgres | Database superuser name |
| `POSTGRES_PASSWORD` | -- | Yes | postgres | Database superuser password |
| `POSTGRES_DB` | `collabspace` | Yes | postgres | Default database name |
| `IMAGE_TAG` | `latest` | No | All app containers | Docker image tag |

### Frontend Variables

| Variable | Default | Required | Services | Description |
|----------|---------|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Yes | web | Public API gateway URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4001` | Yes | web | Public WebSocket gateway URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Yes | web | Public application URL |

### Observability Variables

| Variable | Default | Required | Services | Description |
|----------|---------|----------|----------|-------------|
| `GRAFANA_ADMIN_USER` | `admin` | No | grafana | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | No | grafana | Grafana admin password |
| `GRAFANA_ROOT_URL` | `http://localhost:3001` | No | grafana | Grafana external URL |
| `PROMETHEUS_PORT` | `9090` | No | prometheus | Prometheus host port mapping |
| `GRAFANA_PORT` | `3001` | No | grafana | Grafana host port mapping |

---

## 12. Troubleshooting

### Service Won't Start

```bash
# Check pod status and events (Kubernetes)
kubectl get pods -n collabspace
kubectl describe pod <pod-name> -n collabspace

# Check container logs (Docker Compose)
docker compose -f infra/docker/docker-compose.yml logs --tail=50 api-gateway

# Check container logs (Kubernetes)
kubectl logs <pod-name> -n collabspace --tail=100
kubectl logs <pod-name> -n collabspace --previous  # logs from crashed container

# Check health endpoint directly
curl -v http://localhost:4000/health

# Verify dependencies are running
docker compose -f infra/docker/docker-compose.yml ps
# All dependencies should show "healthy" status
```

Common causes:
- Database not ready (check `depends_on` and health checks)
- Missing environment variables (check `.env` file or Kubernetes secrets)
- Port already in use (check with `lsof -i :<port>`)
- Insufficient memory (check Docker Desktop memory allocation)

### WebSocket Disconnects

```bash
# Check ws-gateway logs for disconnect reasons
kubectl logs -n collabspace -l app.kubernetes.io/name=ws-gateway --tail=100

# Check active connection count
curl http://localhost:4001/metrics | grep ws_active_connections

# Check nginx timeout settings
kubectl get ingress collabspace-ws-ingress -n collabspace -o yaml | grep timeout
```

The WebSocket Ingress sets `proxy-read-timeout` and `proxy-send-timeout` to 604800 seconds (7 days). If connections drop sooner:
- Check client-side keepalive interval
- Verify sticky sessions are working (cookie `COLLABSPACE_WS`)
- In Kubernetes, ensure pod anti-affinity is not causing excessive rescheduling
- Check if HPA is scaling down and terminating pods with active connections (increase `stabilizationWindowSeconds`)

### High Latency

```bash
# Check P95 latency per service
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))' \
  | jq '.data.result[] | {service: .metric.service, p95: .value[1]}'

# Check database query performance
kubectl exec -n collabspace deploy/api-gateway -- \
  node -e "const pg = require('pg'); // check slow queries"

# Check if Redis is slow
kubectl exec -n collabspace redis-0 -- redis-cli --latency-history

# Check Kafka consumer lag (indicates event processing delays)
kubectl exec -n collabspace kafka-0 -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --all-groups

# Check connection pool usage (PostgreSQL)
docker exec collabspace-postgres psql -U collabspace -c \
  "SELECT count(*) as total, state FROM pg_stat_activity GROUP BY state;"
```

Common causes:
- Slow database queries (enable pg_stat_statements, check missing indexes)
- Redis connection timeout (check network, increase pool size)
- Cold start after deployment (startup probe allows 60s)
- Insufficient CPU (check HPA metrics, consider scaling up)

### Kafka Consumer Lag

```bash
# Check consumer group lag
kubectl exec -n collabspace kafka-0 -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --group notification-service

# Check topic partition count
kubectl exec -n collabspace kafka-0 -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --describe --topic notifications

# Increase consumer instances
kubectl scale deployment/notification-service --replicas=6 -n collabspace

# Increase partitions if consumers > partitions
kubectl exec -n collabspace kafka-0 -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --alter --topic notifications --partitions 12
```

Note: Consumer instances beyond partition count provide no benefit. Ensure `partitions >= consumer_instances`.

### Database Connection Exhaustion

```bash
# Check current connections
docker exec collabspace-postgres psql -U collabspace -c \
  "SELECT count(*) as total, usename, application_name, state
   FROM pg_stat_activity
   GROUP BY usename, application_name, state
   ORDER BY total DESC;"

# Check max connections setting
docker exec collabspace-postgres psql -U collabspace -c \
  "SHOW max_connections;"

# Kill idle connections older than 10 minutes
docker exec collabspace-postgres psql -U collabspace -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND state_change < NOW() - INTERVAL '10 minutes'
   AND usename != 'postgres';"

# In production, increase max_connections via Terraform
# Edit variables.tf db_tier to a larger instance, or add a database flag
```

Fix: Reduce per-service pool size, add connection pooler (PgBouncer), or scale to a larger Cloud SQL tier.

### Out of Disk Space

```bash
# Check disk usage (Docker)
docker system df
docker system prune -f  # Remove unused images, containers, networks

# Check disk usage (Kubernetes)
kubectl exec -n collabspace kafka-0 -- df -h /var/lib/kafka/data

# For Kafka, reduce retention
kubectl exec -n collabspace kafka-0 -- kafka-configs \
  --bootstrap-server localhost:9092 \
  --alter --entity-type topics \
  --entity-name document-updates \
  --add-config retention.ms=86400000  # 1 day instead of 7

# For PostgreSQL, check table sizes
docker exec collabspace-postgres psql -U collabspace -c \
  "SELECT schemaname, tablename,
          pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
   FROM pg_tables
   WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
   ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
   LIMIT 20;"
```

### Complete Stack Won't Start After Clean Pull

```bash
# Full reset procedure
docker compose -f infra/docker/docker-compose.yml down -v
docker system prune -f
npm ci
docker compose -f infra/docker/docker-compose.yml build --no-cache
docker compose -f infra/docker/docker-compose.yml up -d

# Monitor startup
docker compose -f infra/docker/docker-compose.yml logs -f
```

### Checking Overall Health (Quick Diagnostic)

```bash
# All-in-one health check script
echo "=== Container Status ==="
docker compose -f infra/docker/docker-compose.yml ps

echo -e "\n=== Service Health ==="
for port in 4000 4001 4002 4003 4004 4005 4006 4007 4008 3000; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health 2>/dev/null || echo "DOWN")
  echo "Port $port: $STATUS"
done

echo -e "\n=== Infrastructure ==="
docker exec collabspace-postgres pg_isready -U collabspace 2>/dev/null && echo "PostgreSQL: OK" || echo "PostgreSQL: DOWN"
docker exec collabspace-redis redis-cli ping 2>/dev/null && echo "Redis: OK" || echo "Redis: DOWN"
docker exec collabspace-kafka kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1 && echo "Kafka: OK" || echo "Kafka: DOWN"
```
