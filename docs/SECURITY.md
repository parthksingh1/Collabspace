# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, **do not open a public issue**. Instead:

1. Email: security@collabspace.io
2. Include: description, reproduction steps, impact assessment
3. We will acknowledge within 24 hours and provide a timeline for a fix

---

## Security Architecture Overview

CollabSpace follows a **defense-in-depth** approach with multiple layers of security controls.

### Authentication

| Mechanism | Details |
|-----------|---------|
| **Access Tokens** | JWT (HS256), 15-minute expiry, contains userId, role, orgId |
| **Refresh Tokens** | Opaque tokens stored in Redis with hash verification, 7-day expiry |
| **Token Rotation** | New refresh token issued on each refresh; old one invalidated |
| **Token Blacklist** | Redis-backed blacklist checked on every authenticated request |
| **Password Hashing** | scrypt with 16-byte salt, N=16384, r=8, p=1 |

### Authorization

**RBAC (Role-Based Access Control)**

| Role | Documents | Code | Boards | Projects | Admin |
|------|-----------|------|--------|----------|-------|
| **Owner** | CRUD + Admin | CRUD + Admin | CRUD + Admin | CRUD + Admin | Full |
| **Admin** | CRUD | CRUD | CRUD | CRUD | Partial |
| **Member** | CRU | CRU | CRU | CRU | None |
| **Viewer** | R | R | R | R | None |
| **Guest** | R (limited) | None | R (limited) | R (limited) | None |

**ABAC (Attribute-Based Access Control)** — Additional conditions:
- `isOwner`: User created the resource
- `isMember`: User is a member of the workspace
- `isWithinBusinessHours`: Time-based access restrictions (optional)
- Resource-level sharing overrides

### Encryption

| Layer | Method | Details |
|-------|--------|---------|
| **In Transit** | TLS 1.3 | Nginx terminates SSL, internal communication on private network |
| **At Rest** | AES-256-GCM | PBKDF2-derived keys, unique IV per encryption |
| **Passwords** | scrypt | Timing-safe comparison to prevent timing attacks |
| **Tokens** | SHA-256 hash | Refresh tokens stored as hashes, not plaintext |

### API Security

| Control | Implementation |
|---------|---------------|
| **Rate Limiting** | Sliding window algorithm with Redis sorted sets + Lua scripts |
| **Input Validation** | Zod schemas on all API boundaries |
| **SQL Injection** | Parameterized queries only (`$1, $2` placeholders) |
| **XSS** | React auto-escaping + Content-Security-Policy headers |
| **CSRF** | SameSite cookies + custom headers |
| **CORS** | Strict origin allowlist |
| **Headers** | X-Frame-Options: DENY, X-Content-Type-Options: nosniff |

### Rate Limit Tiers

| Tier | Limit | Applied To |
|------|-------|-----------|
| **Auth** | 20 requests/min | Login, register, password reset |
| **API** | 120 requests/min | Standard API endpoints |
| **AI** | 30 requests/min | AI chat, agent execution |
| **WebSocket** | 100 messages/sec | Per-connection message rate |

### Code Execution Sandbox

Code submitted for execution runs in isolated Docker containers with:

| Constraint | Value |
|-----------|-------|
| **Memory** | 256 MB max |
| **CPU** | 0.5 cores |
| **Timeout** | 10 seconds |
| **Network** | Disabled |
| **Filesystem** | Read-only (except /tmp) |
| **User** | Non-root (nobody) |
| **Seccomp** | Default Docker seccomp profile |
| **Capabilities** | All dropped |

Containers are destroyed after execution. No persistent state between runs.

### Infrastructure Security

- **Kubernetes**: Pod security standards (restricted), network policies, RBAC
- **Docker**: Non-root users in all containers, read-only root filesystems
- **Database**: Private IP only (no public access), encrypted connections
- **Redis**: Password-protected, private network only
- **Secrets**: Kubernetes Secrets (consider Sealed Secrets or External Secrets for production)

---

## Audit Logging

All state-changing operations are logged to the `audit_logs` table:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    actor_id UUID,        -- Who performed the action
    action VARCHAR(100),  -- What action was taken
    resource_type VARCHAR(50), -- What type of resource
    resource_id VARCHAR(255),  -- Which specific resource
    metadata JSONB,       -- Additional context
    ip_address INET,      -- Client IP
    created_at TIMESTAMPTZ
);
```

Logged actions include:
- User login/logout/registration
- Password changes and resets
- Role and permission changes
- Document/code/board creation and deletion
- Task status changes
- AI agent executions
- Admin operations

---

## Dependency Security

- **npm audit**: Run on every CI build
- **Dependabot**: Automated dependency update PRs
- **Lockfile**: `package-lock.json` committed and enforced
- **No eval()**: Static analysis prevents dynamic code execution in application code

---

## Incident Response

1. **Detection**: Monitoring alerts (Prometheus/Grafana) or user reports
2. **Triage**: Assess severity (P0-P3) and impact scope
3. **Containment**: Isolate affected service, rotate compromised credentials
4. **Fix**: Deploy patch, update affected users
5. **Post-mortem**: Document incident, update security controls

---

## Compliance Considerations

CollabSpace is designed with the following compliance frameworks in mind:

- **GDPR**: Data export/deletion capabilities, consent management, audit trails
- **SOC 2**: Access controls, monitoring, incident response procedures
- **OWASP Top 10**: All categories addressed (injection, broken auth, XSS, etc.)

---

## Security Contacts

- **Security Team**: security@collabspace.io
- **Bug Bounty**: Responsible disclosure program (contact for details)
