import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

// ── Connection metrics ────────────────────────────────────────────────────────

export const activeConnections = new Gauge({
  name: 'ws_active_connections',
  help: 'Number of currently active WebSocket connections',
  labelNames: ['shard'] as const,
  registers: [registry],
});

export const totalConnections = new Counter({
  name: 'ws_connections_total',
  help: 'Total number of WebSocket connections since startup',
  labelNames: ['shard', 'status'] as const,
  registers: [registry],
});

// ── Message metrics ───────────────────────────────────────────────────────────

export const messagesReceived = new Counter({
  name: 'ws_messages_received_total',
  help: 'Total messages received from clients',
  labelNames: ['type', 'room_type'] as const,
  registers: [registry],
});

export const messagesSent = new Counter({
  name: 'ws_messages_sent_total',
  help: 'Total messages sent to clients',
  labelNames: ['type', 'room_type'] as const,
  registers: [registry],
});

export const messageLatency = new Histogram({
  name: 'ws_message_latency_seconds',
  help: 'Message processing latency in seconds',
  labelNames: ['type'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

// ── Room metrics ──────────────────────────────────────────────────────────────

export const activeRooms = new Gauge({
  name: 'ws_active_rooms',
  help: 'Number of active rooms on this shard',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const roomMembersGauge = new Gauge({
  name: 'ws_room_members',
  help: 'Number of members per room',
  labelNames: ['room_id', 'room_type'] as const,
  registers: [registry],
});

// ── Rate limiting metrics ─────────────────────────────────────────────────────

export const droppedMessages = new Counter({
  name: 'ws_messages_dropped_total',
  help: 'Total messages dropped due to rate limiting',
  labelNames: ['reason'] as const,
  registers: [registry],
});

// ── Heartbeat metrics ─────────────────────────────────────────────────────────

export const heartbeatLatency = new Summary({
  name: 'ws_heartbeat_latency_seconds',
  help: 'Heartbeat round-trip latency',
  percentiles: [0.5, 0.9, 0.99],
  registers: [registry],
});

export const disconnectedByTimeout = new Counter({
  name: 'ws_disconnected_timeout_total',
  help: 'Total connections closed due to heartbeat timeout',
  registers: [registry],
});

// ── Cross-shard fanout metrics ────────────────────────────────────────────────
//
// Added alongside the cross-shard broadcast path. `published` and `received`
// should track each other across the cluster: if a node publishes steadily and
// its peers receive nothing, room fanout is broken and documents are silently
// splitting.

export const crossShardPublished = new Counter({
  name: 'ws_cross_shard_published_total',
  help: 'Room messages published to peer shards via Redis pub/sub',
  labelNames: ['shard'] as const,
  registers: [registry],
});

export const crossShardReceived = new Counter({
  name: 'ws_cross_shard_received_total',
  help: 'Room messages received from peer shards and delivered locally',
  labelNames: ['origin_shard'] as const,
  registers: [registry],
});

export const crossShardDropped = new Counter({
  name: 'ws_cross_shard_dropped_total',
  help: 'Cross-shard envelopes dropped, by reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});

// ── collabspace_* canonical metrics ───────────────────────────────────────────
//
// The ws_* metrics above predate these and are kept so existing dashboards and
// alerts do not break. These are the names the Grafana dashboard in
// infra/grafana/dashboards/collabspace.json queries, and the ones documented as
// the public contract.
//
// Every metric here is incremented from a real code path. Nothing is declared
// speculatively — if a metric exists, something increments it, and the wiring
// point is named in the comment.

/** Incremented/decremented in ConnectionManager.addConnection/removeConnection. */
export const collabspaceWsConnectionsActive = new Gauge({
  name: 'collabspace_ws_connections_active',
  help: 'WebSocket connections currently held by this gateway node',
  labelNames: ['shard'] as const,
  registers: [registry],
});

/**
 * direction: "in" for client→server, "out" for server→client.
 * type: the message type prefix (doc, code, wb, project, room, presence, ...).
 *
 * Incremented in index.ts processMessage() for inbound and in
 * ConnectionManager.broadcastToRoom/sendToUser for outbound.
 */
export const collabspaceWsMessagesTotal = new Counter({
  name: 'collabspace_ws_messages_total',
  help: 'WebSocket messages by direction and type',
  labelNames: ['direction', 'type'] as const,
  registers: [registry],
});

/**
 * doc_type: document | code | whiteboard | project.
 * Incremented in each handler when a CRDT update crosses the gateway.
 */
export const collabspaceCrdtUpdatesTotal = new Counter({
  name: 'collabspace_crdt_updates_total',
  help: 'CRDT updates relayed, by collaboration surface. Only document and code carry Yjs payloads; whiteboard and project relay discrete JSON ops and are deliberately not counted here.',
  labelNames: ['doc_type'] as const,
  registers: [registry],
});

/**
 * Server-side handling time for a message, in milliseconds: parse, route,
 * handler, local fanout, and the cross-shard publish call.
 *
 * NOT end-to-end sync latency. It does not include either network hop, and it
 * cannot — the gateway has no clock shared with the client. End-to-end
 * convergence is measured by benchmarks/crdt-sync-latency.ts instead. The name
 * is the one specified for the dashboard contract; this comment is here so
 * nobody reads a panel of it as user-perceived latency.
 */
export const collabspaceSyncLatencyMs = new Histogram({
  name: 'collabspace_sync_latency_ms',
  help: 'Server-side message handling time in ms (not end-to-end sync latency)',
  labelNames: ['type'] as const,
  buckets: [0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [registry],
});
