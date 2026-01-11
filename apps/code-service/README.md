# Code Service

Code editing, sandboxed execution, and contest mode for CollabSpace.

## Port
`4004`

## Responsibilities
- Code file CRUD with CRDT collaboration support
- **Docker-sandboxed code execution** with resource limits
- Multi-language support: JavaScript, TypeScript, Python, Java, C++, Go, Rust
- Contest mode: timed coding rooms with problem statements and auto-grading
- Leaderboard with scoring by correctness + speed + efficiency
- File tree management for workspaces

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /code/files | Create file |
| GET | /code/files | List files |
| GET | /code/files/:id | Get file |
| PUT | /code/files/:id | Update file |
| DELETE | /code/files/:id | Delete file |
| POST | /code/execute | Execute code in sandbox |
| GET | /code/execute/:id | Get execution result |
| POST | /code/rooms | Create coding room |
| GET | /code/rooms/:id | Get room with participants |
| POST | /code/rooms/:id/start | Start contest timer |
| POST | /code/rooms/:id/submit | Submit solution |
| GET | /code/rooms/:id/leaderboard | Get leaderboard |

## Sandbox Security

| Constraint | Value |
|-----------|-------|
| Memory | 256 MB max |
| CPU | 0.5 cores |
| Timeout | 10 seconds |
| Network | Disabled |
| Filesystem | Read-only (except /tmp) |
| User | non-root (nobody) |

## Container Pooling
- Pre-warmed containers per language for fast cold start
- Containers are destroyed after execution
- Pool replenished asynchronously in background
