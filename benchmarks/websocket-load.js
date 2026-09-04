// benchmarks/websocket-load.js
//
// Ramps 0 -> 5000 concurrent WebSocket connections against ws-gateway over two
// minutes. Every VU joins a random document room, sends one Y.js update every
// 500ms, and listens for updates broadcast by its peers.
//
// What this measures
//   ws_connect_time_ms   time from ws.connect() to `connection:established`
//   ws_join_time_ms      time from `room:join` to `room:joined`
//   ws_sync_latency_ms   time from a VU's own `doc:update` send to the first
//                        peer `doc:update` it receives afterwards. This is a
//                        proxy for sync latency, NOT a true round trip -- see
//                        the caveat block at the bottom of this file.
//   ws_messages_sent / ws_messages_received   raw throughput counters
//
// Run:
//   k6 run benchmarks/websocket-load.js
//   npm run bench:ws
//
// Env:
//   WS_URL               default ws://localhost:4001
//   JWT_SECRET           must match the gateway's JWT_SECRET (see .env)
//   TARGET_VUS           default 5000
//   DOC_COUNT            distinct doc rooms to spread VUs across, default 250
//   DURATION_HOLD        hold time at peak, default 1m
//   SESSION_MS           how long each VU stays connected, default 30000
//   UPDATE_INTERVAL_MS   default 500

import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { benchToken } from './lib/jwt.js';
import { randomUpdate } from './lib/yjs-fixtures.js';

// -- Tunables ---------------------------------------------------------------

const WS_URL = __ENV.WS_URL || 'ws://localhost:4001';
const JWT_SECRET = __ENV.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '5000', 10);
const DOC_COUNT = parseInt(__ENV.DOC_COUNT || '250', 10);
const HOLD = __ENV.DURATION_HOLD || '1m';
const SESSION_MS = parseInt(__ENV.SESSION_MS || '30000', 10);
const UPDATE_INTERVAL_MS = parseInt(__ENV.UPDATE_INTERVAL_MS || '500', 10);

// -- Custom metrics ---------------------------------------------------------

const connectTime = new Trend('ws_connect_time_ms', true);
const joinTime = new Trend('ws_join_time_ms', true);
const syncLatency = new Trend('ws_sync_latency_ms', true);
const messagesSent = new Counter('ws_messages_sent');
const messagesReceived = new Counter('ws_messages_received');
const peerUpdatesReceived = new Counter('ws_peer_updates_received');
const connectErrors = new Counter('ws_connect_errors');
const connectSuccess = new Rate('ws_connect_success');

// -- Options ----------------------------------------------------------------

export const options = {
  scenarios: {
    ws_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // 0 -> TARGET_VUS over two minutes, split into four legs so the ramp
        // curve is visible in the time series rather than being one cliff.
        { duration: '30s', target: Math.round(TARGET_VUS * 0.25) },
        { duration: '30s', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '30s', target: Math.round(TARGET_VUS * 0.75) },
        { duration: '30s', target: TARGET_VUS },
        { duration: HOLD, target: TARGET_VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Assertions about the system, not aspirations. If a run trips one,
    // RESULTS.md records the failure rather than the threshold being loosened.
    ws_connect_success: ['rate>0.99'],
    ws_connect_time_ms: ['p(95)<1000'],
    ws_sync_latency_ms: ['p(50)<100', 'p(95)<500'],
  },
  discardResponseBodies: true,
};

// -- VU body ----------------------------------------------------------------

export default function () {
  const vuId = __VU;
  const token = benchToken(vuId, JWT_SECRET);
  const documentId = 'bench-doc-' + (vuId % DOC_COUNT);
  const roomId = 'doc:' + documentId;
  const url = WS_URL + '/?token=' + encodeURIComponent(token);

  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    let joinSentAt = 0;
    let lastSelfUpdateAt = 0;

    socket.on('message', function (raw) {
      messagesReceived.add(1);

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }

      if (msg.type === 'connection:established') {
        connectTime.add(Date.now() - connectStart);
        connectSuccess.add(true);

        joinSentAt = Date.now();
        socket.send(
          JSON.stringify({ type: 'room:join', roomId: roomId, roomType: 'document' })
        );
        messagesSent.add(1);
        return;
      }

      if (msg.type === 'room:joined') {
        joinTime.add(Date.now() - joinSentAt);

        // Start the edit loop only once we are actually in the room.
        socket.setInterval(function () {
          lastSelfUpdateAt = Date.now();
          socket.send(
            JSON.stringify({
              type: 'doc:update',
              documentId: documentId,
              update: randomUpdate(),
            })
          );
          messagesSent.add(1);
        }, UPDATE_INTERVAL_MS);
        return;
      }

      if (msg.type === 'room:join_failed') {
        // MAX_ROOM_CAPACITY defaults to 100. With DOC_COUNT=250 and 5000 VUs
        // that is 20 per room, so this should not fire. If it does, it is a
        // real finding and belongs in RESULTS.md.
        connectErrors.add(1);
        socket.close();
        return;
      }

      if (msg.type === 'doc:update') {
        // A peer's update reached us. Attributed to our most recent send.
        // See caveat 1 at the bottom for why this is a proxy, not a true RTT.
        peerUpdatesReceived.add(1);
        if (lastSelfUpdateAt > 0) {
          const delta = Date.now() - lastSelfUpdateAt;
          if (delta >= 0 && delta <= UPDATE_INTERVAL_MS) {
            syncLatency.add(delta);
          }
        }
        return;
      }

      if (msg.type === 'error:rate_limit') {
        // RATE_LIMIT_MESSAGES_PER_SECOND defaults to 50; at 2 msg/s per VU we
        // are far under it. Counted so a regression is visible.
        connectErrors.add(1);
      }
    });

    socket.on('error', function (e) {
      if (e && e.error() !== 'websocket: close sent') {
        connectErrors.add(1);
        connectSuccess.add(false);
      }
    });

    socket.setTimeout(function () {
      socket.close();
    }, SESSION_MS);
  });

  check(res, { 'ws handshake returned 101': (r) => r && r.status === 101 });
  if (!res || res.status !== 101) {
    connectSuccess.add(false);
    connectErrors.add(1);
  }
}

// -- Summary ----------------------------------------------------------------

export function handleSummary(data) {
  const m = data.metrics;

  function pick(name, field) {
    if (!m[name] || !m[name].values) return null;
    const v = m[name].values[field];
    return v === undefined ? null : Number(v.toFixed(2));
  }

  let attempted = null;
  if (m.ws_connect_success && m.ws_connect_success.values) {
    attempted =
      (m.ws_connect_success.values.passes || 0) +
      (m.ws_connect_success.values.fails || 0);
  }

  let thresholdsPassed = true;
  Object.keys(m).forEach(function (k) {
    const t = m[k].thresholds;
    if (!t) return;
    Object.keys(t).forEach(function (name) {
      if (t[name] && t[name].ok === false) thresholdsPassed = false;
    });
  });

  const summary = {
    benchmark: 'websocket-load',
    generatedAt: new Date().toISOString(),
    config: {
      wsUrl: WS_URL,
      targetVus: TARGET_VUS,
      docRooms: DOC_COUNT,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      sessionMs: SESSION_MS,
      holdDuration: HOLD,
    },
    connections: {
      attempted: attempted,
      successRate: pick('ws_connect_success', 'rate'),
      errors: pick('ws_connect_errors', 'count'),
      connectTimeMs: {
        p50: pick('ws_connect_time_ms', 'med'),
        p95: pick('ws_connect_time_ms', 'p(95)'),
        p99: pick('ws_connect_time_ms', 'p(99)'),
        max: pick('ws_connect_time_ms', 'max'),
      },
      joinTimeMs: {
        p50: pick('ws_join_time_ms', 'med'),
        p95: pick('ws_join_time_ms', 'p(95)'),
        p99: pick('ws_join_time_ms', 'p(99)'),
      },
    },
    syncLatencyMs: {
      p50: pick('ws_sync_latency_ms', 'med'),
      p95: pick('ws_sync_latency_ms', 'p(95)'),
      p99: pick('ws_sync_latency_ms', 'p(99)'),
      max: pick('ws_sync_latency_ms', 'max'),
      samples: pick('ws_sync_latency_ms', 'count'),
      caveat:
        'Proxy metric: time from this VU last send to next peer update received. Not a clean RTT. See file footer.',
    },
    throughput: {
      messagesSent: pick('ws_messages_sent', 'count'),
      messagesReceived: pick('ws_messages_received', 'count'),
      peerUpdatesReceived: pick('ws_peer_updates_received', 'count'),
      sentPerSec: pick('ws_messages_sent', 'rate'),
      receivedPerSec: pick('ws_messages_received', 'rate'),
    },
    thresholdsPassed: thresholdsPassed,
  };

  return {
    'benchmarks/results/websocket-load.json': JSON.stringify(summary, null, 2),
    stdout:
      '\n=== websocket-load summary ===\n' +
      JSON.stringify(summary, null, 2) +
      '\n\nWritten to benchmarks/results/websocket-load.json\n',
  };
}

// -- Caveats ----------------------------------------------------------------
//
// 1. `ws_sync_latency_ms` is a proxy. k6's WebSocket API gives no correlation
//    id between a send and the peer message it triggers, and the gateway does
//    not echo updates back to the sender (broadcastToRoom excludes the sender).
//    So this metric measures "time from my last send until the next peer update
//    landed", bounded above by UPDATE_INTERVAL_MS. It is really measuring fanout
//    delay under load, not a clean request/response RTT. Do not quote it as
//    "CRDT sync latency" without this sentence attached.
//    benchmarks/crdt-sync-latency.ts measures true convergence time instead.
//
// 2. VUs replay pre-captured Y.js bytes rather than running a CRDT. See
//    benchmarks/lib/yjs-fixtures.js for why, and what it does and does not
//    prove.
//
// 3. A single k6 process will bottleneck on its own event loop somewhere below
//    5000 sockets on a laptop. If ws_connect_time_ms p95 climbs while the
//    gateway's own /metrics shows low CPU, you are measuring k6, not the
//    gateway. Distribute across machines (k6 --execution-segment) before
//    claiming a ceiling. On Linux, raise the fd limit first: ulimit -n 65535.
//
// 4. Every VU authenticates with a self-minted JWT. That deliberately skips
//    auth-service, so nothing here says anything about login throughput. That
//    is measured separately in benchmarks/api-throughput.js.
