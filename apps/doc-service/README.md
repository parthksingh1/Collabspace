# Document Service

Manages collaborative documents with CRDT persistence, version history, and comments.

## Port
`4003`

## Responsibilities
- Document CRUD with workspace scoping
- CRDT (Yjs) update persistence with debounced writes
- Periodic compaction: merge accumulated updates into snapshots
- Version history with time-travel restore
- Comments with threading, @mentions, and resolution
- Full-text search via PostgreSQL `pg_trgm`
- Export to HTML, Markdown, PDF

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /documents | Create document |
| GET | /documents | List (paginated, filterable) |
| GET | /documents/:id | Get with metadata |
| PUT | /documents/:id | Update metadata |
| DELETE | /documents/:id | Soft delete |
| GET | /documents/:id/history | Version history |
| POST | /documents/:id/restore/:version | Restore version |
| POST | /documents/:id/export | Export (html/md/pdf) |
| POST | /documents/:id/comment | Add comment |
| GET | /documents/:id/comments | List comments |

## CRDT Persistence Strategy
1. WebSocket gateway receives CRDT updates from clients
2. Updates published to Kafka topic `document.events`
3. Document service consumes updates
4. Updates are **debounced** (1-second window) and batch-written to `document_updates` table
5. Every 100 updates, a **compaction** runs: merges all updates into a single snapshot
6. Loading a document: apply base snapshot + subsequent updates

## Database Tables
- `documents` — Metadata, latest snapshot
- `document_updates` — Individual CRDT updates (BYTEA)
- `document_snapshots` — Compacted snapshots
- `document_comments` — Threaded comments with positions
