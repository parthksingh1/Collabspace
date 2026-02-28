# Contributing to CollabSpace

Thank you for your interest in contributing to CollabSpace! This guide covers everything you need to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Adding a New Service](#adding-a-new-service)
- [Adding a Frontend Module](#adding-a-frontend-module)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive experience. Please be respectful, constructive, and professional in all interactions.

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20.0.0 | Runtime |
| npm | >= 10.0.0 | Package manager |
| Docker | >= 24.0 | Infrastructure containers |
| Git | >= 2.40 | Version control |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/collabspace.git
cd collabspace

# Install all dependencies (workspaces)
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure (PostgreSQL, Redis, Kafka)
npm run docker:up

# Start all services in development mode
npm run dev
```

### IDE Setup

**VS Code (recommended)**:
- Install extensions: ESLint, Prettier, Tailwind CSS IntelliSense, TypeScript
- The project includes workspace settings for consistent formatting

**Key shortcuts when developing**:
- `Ctrl+K` in the app opens the command palette
- `Ctrl+J` toggles the AI assistant

---

## Project Structure

```
collabspace/
├── apps/           # Deployable applications and services
│   ├── web/        # Next.js frontend
│   ├── api-gateway/
│   ├── ws-gateway/
│   ├── auth-service/
│   ├── doc-service/
│   ├── code-service/
│   ├── board-service/
│   ├── project-service/
│   ├── ai-service/
│   └── notification-service/
├── packages/       # Shared libraries
│   ├── shared/     # Types, utils, constants
│   ├── crdt/       # CRDT engine
│   ├── ai-sdk/     # AI abstraction layer
│   └── ui/         # React component library
├── infra/          # Infrastructure configs
├── tests/          # Integration and load tests
└── docs/           # Documentation
```

### Key Conventions

- **apps/** — Each service is an independent deployable unit with its own `package.json`
- **packages/** — Shared code imported by services via `@collabspace/` namespace
- **infra/** — Never contains application code, only configuration

---

## Development Workflow

### 1. Branch Strategy

```
main          ← production-ready code
  └── develop ← integration branch
       ├── feature/CS-42-websocket-sharding
       ├── fix/CS-55-rate-limit-bug
       └── docs/update-api-reference
```

**Branch naming**: `{type}/{ticket}-{short-description}`

Types: `feature`, `fix`, `refactor`, `docs`, `test`, `infra`

### 2. Making Changes

```bash
# Create a feature branch
git checkout -b feature/CS-42-websocket-sharding

# Make your changes
# ...

# Run checks before committing
npm run lint
npm run typecheck
npm run test

# Commit with conventional commit message
git commit -m "feat(ws-gateway): implement consistent-hash sharding for rooms"
```

### 3. Running Specific Services

```bash
# Run only the frontend
cd apps/web && npm run dev

# Run a specific backend service
cd apps/auth-service && npm run dev

# Run just the packages build (needed if you change shared types)
npx turbo run build --filter=@collabspace/shared
```

### 4. Working with the Database

```bash
# View the schema
cat infra/docker/init-db.sql

# Connect to local PostgreSQL
docker exec -it collabspace-postgres psql -U postgres -d collabspace

# Reset the database
npm run docker:down
npm run docker:up
```

---

## Coding Standards

### TypeScript

- **Strict mode** enabled everywhere (`strict: true` in tsconfig)
- Use `interface` for object shapes, `type` for unions/intersections
- No `any` — use `unknown` and narrow with type guards
- Prefer `const` over `let`, never use `var`

```typescript
// Good
interface UserData {
  id: string;
  name: string;
  email: string;
}

async function getUser(id: string): Promise<UserData | null> {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

// Bad
async function getUser(id: any): Promise<any> { ... }
```

### React / Frontend

- Functional components only (no class components)
- Use `'use client'` directive for client components in Next.js App Router
- TailwindCSS for all styling — no CSS modules or styled-components
- Use `cn()` utility for conditional class names
- Zustand for global state, React Query for server state

```tsx
// Good
'use client';
import { cn } from '@/lib/utils';

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-xs font-medium',
      variant === 'success' && 'bg-emerald-50 text-emerald-700',
      variant === 'error' && 'bg-red-50 text-red-700',
    )}>
      {children}
    </span>
  );
}
```

### Backend Services

- Express with typed request/response
- Zod for request validation
- Structured JSON logging via `createLogger()`
- Consistent error responses: `{ success: boolean, data?, error? }`
- Database access via query helper, never raw `pg` client

```typescript
// Standard route pattern
router.post('/items', async (req: Request, res: Response) => {
  try {
    const data = ItemSchema.parse(req.body);
    const item = await itemService.create(data);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
    }
    throw error; // Let error middleware handle it
  }
});
```

### File Naming

| Type | Convention | Example |
|------|-----------|---------|
| React components | PascalCase | `KanbanBoard.tsx` → exported as `KanbanBoard` |
| Hooks | camelCase with `use` prefix | `use-documents.ts` |
| Services | kebab-case with `.service` suffix | `document.service.ts` |
| Routes | kebab-case with `.routes` suffix | `auth.routes.ts` |
| Utils | kebab-case | `crypto.ts` |
| Types | kebab-case in shared, PascalCase exports | `types/index.ts` |

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes nor adds |
| `docs` | Documentation only |
| `test` | Adding/updating tests |
| `infra` | Infrastructure changes |
| `perf` | Performance improvement |
| `chore` | Maintenance (deps, config) |

### Scopes

Use the service/package name: `web`, `auth-service`, `ws-gateway`, `shared`, `crdt`, `ai-sdk`, `ui`, `k8s`, `docker`

### Examples

```
feat(ws-gateway): implement consistent-hash sharding for rooms
fix(auth-service): prevent token reuse after rotation
refactor(ai-service): extract prompt templates to separate module
docs(api): add WebSocket event documentation
test(project-service): add sprint burndown calculation tests
infra(k8s): increase ws-gateway HPA max to 50 replicas
```

---

## Pull Request Process

### 1. Before Opening a PR

- [ ] Code compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Tests pass: `npm run test`
- [ ] No secrets committed (check `.env` files)
- [ ] Documentation updated if API changed

### 2. PR Template

```markdown
## Summary
Brief description of what this PR does and why.

## Changes
- Added X to handle Y
- Modified Z to support W

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Load testing (if performance-sensitive)

## Screenshots (if UI changes)
Before | After
```

### 3. Review Checklist

Reviewers should check:
- [ ] Code follows project conventions
- [ ] No security vulnerabilities (SQL injection, XSS, etc.)
- [ ] Error handling is comprehensive
- [ ] No hardcoded secrets or credentials
- [ ] Database queries use parameterized inputs
- [ ] API responses follow standard format

### 4. Merge Strategy

- **Squash merge** for feature branches (clean history)
- **Merge commit** for release branches (preserve history)
- Delete branch after merge

---

## Testing

### Unit Tests

```bash
# Run all tests
npm run test

# Run tests for a specific service
npx turbo run test --filter=@collabspace/auth-service

# Run with coverage
npx turbo run test -- --coverage
```

### Load Tests

```bash
# Install k6
brew install k6  # macOS
# or: https://k6.io/docs/getting-started/installation/

# Run all scenarios
npm run load-test

# Run specific scenario
k6 run --env BASE_URL=http://localhost:4000/api tests/load/scenarios.js
```

---

## Adding a New Service

1. **Create the directory structure**:
   ```
   apps/my-service/
   ├── package.json
   ├── tsconfig.json
   └── src/
       ├── index.ts
       ├── config.ts
       ├── routes/
       ├── services/
       ├── utils/
       │   ├── db.ts
       │   ├── redis.ts
       │   └── logger.ts
       └── kafka/
           ├── consumer.ts
           └── producer.ts
   ```

2. **Register in API Gateway**: Add proxy route in `apps/api-gateway/src/routes/proxy.routes.ts`

3. **Add to Docker Compose**: Add service block in `infra/docker/docker-compose.yml`

4. **Add to Kubernetes**: Create deployment, service, and HPA in `infra/k8s/base/`

5. **Add Kafka topics**: Register topics in `packages/shared/src/constants/index.ts`

---

## Adding a Frontend Module

1. **Create the page**: `apps/web/src/app/(dashboard)/my-module/page.tsx`
2. **Create components**: `apps/web/src/components/my-module/`
3. **Create hooks**: `apps/web/src/hooks/use-my-module.ts`
4. **Add navigation**: Update `apps/web/src/components/layout/sidebar.tsx`
5. **Add to command palette**: Update `apps/web/src/components/ai/command-palette.tsx`

---

## Questions?

- Check existing [documentation](docs/)
- Search closed issues and PRs
- Open a new issue with the `question` label
