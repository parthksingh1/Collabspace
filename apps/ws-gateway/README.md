# WebSocket Gateway

Real-time WebSocket server for CollabSpace. Handles collaborative editing, presence tracking, and live updates.

## Port
`4001` (configurable via `WS_GATEWAY_PORT`)

## Responsibilities
- WebSocket connection management with authentication
- Room-based message routing (document, code, whiteboard, project rooms)
- **Consistent-hash sharding**: rooms are assigned to shards via hash ring
- **Cross-shard messaging**: Redis pub/sub for messages across server instances
- Presence tracking: online/away/busy status, cursor positions, typing indicators
- CRDT sync protocol: SyncStep1 → SyncStep2 → incremental updates
- Awareness protocol for collaborative cursors
- Heartbeat (30s ping/pong) with dead connection cleanup
- Per-connection rate limiting with backpressure
- Prometheus metrics for connections, messages/sec, rooms

## Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `room:join` | Client → Server | Join a collaboration room |
| `room:leave` | Client → Server | Leave a room |
| `ping` / `pong` | Bidirectional | Heartbeat |
| `doc:sync_step1` | Bidirectional | CRDT state vector exchange |
| `doc:sync_step2` | Bidirectional | CRDT diff exchange |
| `doc:update` | Bidirectional | Incremental CRDT update |
| `doc:awareness` | Bidirectional | Cursor/selection/presence |
| `code:update` | Bidirectional | Code file CRDT update |
| `code:execute` | Client → Server | Request code execution |
| `code:output` | Server → Client | Execution stdout/stderr |
| `board:element_*` | Bidirectional | Whiteboard element changes |
| `task:update` | Server → Client | Real-time task changes |
| `presence:update` | Bidirectional | User presence changes |

## Scaling Strategy
- Horizontal scaling via consistent hash ring
- Each server handles a subset of rooms
- New servers trigger rebalancing with minimal room migration
- Target: 10K connections per instance, 50K+ total with 5+ instances

## Key Files
```
src/
├── index.ts                      # HTTP + WebSocket server
├── connection-manager.ts         # Track connections by userId/roomId
├── room-manager.ts               # Room lifecycle, member tracking
├── shard-manager.ts              # Consistent hashing, Redis pub/sub
├── presence-manager.ts           # User presence in Redis
├── handlers/
│   ├── document.handler.ts       # CRDT sync for documents
│   ├── code.handler.ts           # Code collaboration + execution
│   ├── whiteboard.handler.ts     # Whiteboard element sync
│   └── project.handler.ts       # Task real-time updates
├── middleware/
│   ├── auth.middleware.ts        # Token verification on upgrade
│   └── rate-limiter.ts           # Per-connection message limiting
└── metrics.ts                    # WebSocket-specific Prometheus metrics
```
