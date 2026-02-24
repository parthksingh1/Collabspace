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
