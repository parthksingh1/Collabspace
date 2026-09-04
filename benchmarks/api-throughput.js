// benchmarks/api-throughput.js
//
// REST API throughput and latency against the API gateway, at three load
// levels: 100, 500 and 1000 concurrent users.
//
// Endpoints exercised (paths from apps/api-gateway/src/routes/proxy.routes.ts):
//   POST /api/auth/login       -> auth-service
//   POST /api/documents        -> doc-service   (create)
//   GET  /api/documents        -> doc-service   (list, paginated)
//   PUT  /api/documents/:id    -> doc-service   (update)
//
// Each level runs as its own scenario, staggered with `startTime`, so the three
// results are independent rather than one continuous ramp. That makes the
// per-level numbers directly comparable.
//
// Run:
//   npm run bench:api
//   LEVELS=100,500 k6 run benchmarks/api-throughput.js
//
// Env:
//   BASE_URL     default http://localhost:4000
//   JWT_SECRET   must match the services' JWT_SECRET
//   LOGIN_EMAIL / LOGIN_PASSWORD   credentials for the login-path scenario
//   LEVEL_DURATION               hold time per level, default 1m
//   WORKSPACE_ID                 workspace the docs are created in

import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { benchToken } from './lib/jwt.js';

// -- Config -----------------------------------------------------------------

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const JWT_SECRET = __ENV.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const LEVEL_DURATION = __ENV.LEVEL_DURATION || '1m';
const RAMP = __ENV.RAMP || '30s';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || 'bench-workspace';
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || 'admin@collabspace.io';
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || 'Admin123!';

// -- Per-endpoint metrics ---------------------------------------------------
//
// k6's built-in http_req_duration aggregates every request. These split it out
// so a slow login does not hide a fast document list.

const loginLatency = new Trend('api_login_ms', true);
const docCreateLatency = new Trend('api_doc_create_ms', true);
const docListLatency = new Trend('api_doc_list_ms', true);
const docUpdateLatency = new Trend('api_doc_update_ms', true);

const requests = new Counter('api_requests_total');
const failures = new Counter('api_failures_total');
const successRate = new Rate('api_success_rate');

// -- Scenarios --------------------------------------------------------------

const LEVELS = (__ENV.LEVELS || '100,500,1000')
  .split(',')
  .map(function (s) {
    return parseInt(s.trim(), 10);
  })
  .filter(function (n) {
    return n > 0;
  });

function durationToSeconds(d) {
  const m = /^(\d+)(s|m)$/.exec(d);
  if (!m) return 60;
  return m[2] === 'm' ? parseInt(m[1], 10) * 60 : parseInt(m[1], 10);
}

const rampSec = durationToSeconds(RAMP);
const holdSec = durationToSeconds(LEVEL_DURATION);
const levelSec = rampSec * 2 + holdSec + 10; // ramp up + hold + ramp down + gap

const scenarios = {};
LEVELS.forEach(function (vus, i) {
  scenarios['level_' + vus] = {
    executor: 'ramping-vus',
    startVUs: 0,
    startTime: i * levelSec + 's',
    stages: [
      { duration: RAMP, target: vus },
      { duration: LEVEL_DURATION, target: vus },
      { duration: RAMP, target: 0 },
    ],
    gracefulRampDown: '10s',
    tags: { level: String(vus) },
    exec: 'apiMix',
  };
});

export const options = {
  scenarios: scenarios,
  thresholds: {
    // README claims p95 < 200ms for API responses. Encoded as a threshold so a
    // regression fails the run rather than quietly drifting.
    'http_req_duration{expected_response:true}': ['p(95)<200'],
    api_success_rate: ['rate>0.99'],
    api_doc_list_ms: ['p(95)<200'],
    api_doc_create_ms: ['p(95)<300'],
  },
};

// -- Helpers ----------------------------------------------------------------

function authHeaders(token) {
  return {
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  };
}

function record(res, trend) {
  requests.add(1);
  trend.add(res.timings.duration);
  const ok = res.status >= 200 && res.status < 300;
  successRate.add(ok);
  if (!ok) failures.add(1, { status: String(res.status) });
  return ok;
}

// -- VU body ----------------------------------------------------------------

export function apiMix() {
  // Self-minted token for the document endpoints. Login is measured separately
  // and deliberately at a lower rate: it runs bcrypt, so hammering it measures
  // password hashing rather than the API path.
  const token = benchToken(__VU, JWT_SECRET);
  let documentId = null;

  group('auth: login', function () {
    // 1 in 20 iterations, to keep bcrypt from dominating the aggregate.
    if (__ITER % 20 !== 0) return;

    const res = http.post(
      BASE_URL + '/api/auth/login',
      JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } },
    );
    record(res, loginLatency);
    check(res, {
      'login 200 or 401': function (r) {
        return r.status === 200 || r.status === 401;
      },
    });
  });

  group('documents: create', function () {
    const res = http.post(
      BASE_URL + '/api/documents',
      JSON.stringify({
        title: 'Bench doc VU' + __VU + ' iter' + __ITER,
        workspaceId: WORKSPACE_ID,
      }),
      Object.assign(authHeaders(token), { tags: { endpoint: 'doc_create' } }),
    );
    if (record(res, docCreateLatency)) {
      try {
        const body = res.json();
        if (body && body.data && body.data.id) documentId = body.data.id;
      } catch (e) {
        // Non-JSON body on a 2xx is itself a finding; the counter above caught it.
      }
    }
    check(res, { 'doc create 201': function (r) { return r.status === 201; } });
  });

  group('documents: list', function () {
    const res = http.get(
      BASE_URL + '/api/documents?workspaceId=' + WORKSPACE_ID + '&page=1&pageSize=20',
      Object.assign(authHeaders(token), { tags: { endpoint: 'doc_list' } }),
    );
    record(res, docListLatency);
    check(res, { 'doc list 200': function (r) { return r.status === 200; } });
  });

  group('documents: update', function () {
    if (!documentId) return;
    const res = http.put(
      BASE_URL + '/api/documents/' + documentId,
      JSON.stringify({ title: 'Bench doc VU' + __VU + ' updated' }),
      Object.assign(authHeaders(token), { tags: { endpoint: 'doc_update' } }),
    );
    record(res, docUpdateLatency);
    check(res, { 'doc update 200': function (r) { return r.status === 200; } });
  });
}

export default function () {
  apiMix();
}

// -- Summary ----------------------------------------------------------------

export function handleSummary(data) {
  const m = data.metrics;

  function pick(name, field) {
    if (!m[name] || !m[name].values) return null;
    const v = m[name].values[field];
    return v === undefined ? null : Number(v.toFixed(2));
  }

  function endpoint(name) {
    return {
      p50: pick(name, 'med'),
      p95: pick(name, 'p(95)'),
      p99: pick(name, 'p(99)'),
      max: pick(name, 'max'),
      samples: pick(name, 'count'),
    };
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
    benchmark: 'api-throughput',
    generatedAt: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      levels: LEVELS,
      rampPerLevel: RAMP,
      holdPerLevel: LEVEL_DURATION,
      workspaceId: WORKSPACE_ID,
    },
    aggregate: {
      requestsTotal: pick('api_requests_total', 'count'),
      failuresTotal: pick('api_failures_total', 'count'),
      successRate: pick('api_success_rate', 'rate'),
      requestsPerSec: pick('http_reqs', 'rate'),
      httpReqDurationMs: {
        p50: pick('http_req_duration', 'med'),
        p95: pick('http_req_duration', 'p(95)'),
        p99: pick('http_req_duration', 'p(99)'),
      },
    },
    endpoints: {
      login: endpoint('api_login_ms'),
      documentCreate: endpoint('api_doc_create_ms'),
      documentList: endpoint('api_doc_list_ms'),
      documentUpdate: endpoint('api_doc_update_ms'),
    },
    thresholdsPassed: thresholdsPassed,
    caveats: [
      'Percentiles are aggregated across all concurrency levels. For per-level numbers, run one level at a time with LEVELS=100 (etc.) and record each run separately.',
      'Document endpoints use self-minted JWTs, so auth-service is not in that path.',
      'Login runs on 1 in 20 iterations because bcrypt would otherwise dominate the aggregate.',
    ],
  };

  return {
    'benchmarks/results/api-throughput.json': JSON.stringify(summary, null, 2),
    stdout:
      '\n=== api-throughput summary ===\n' +
      JSON.stringify(summary, null, 2) +
      '\n\nWritten to benchmarks/results/api-throughput.json\n',
  };
}

// -- Caveats ----------------------------------------------------------------
//
// 1. The three levels run back to back in one k6 process, and handleSummary
//    aggregates across all of them. To get a clean per-level table, run three
//    times with LEVELS=100, LEVELS=500, LEVELS=1000 and copy each JSON out
//    before the next run overwrites it. RESULTS.md documents this.
//
// 2. Every create leaves a row behind. Over a long run that grows the documents
//    table and the list endpoint gets slower for reasons that have nothing to
//    do with the code. Truncate between runs if you care about comparability.
//
// 3. This measures the gateway plus one downstream service. It says nothing
//    about Kafka lag, the AI service, or anything behind a circuit breaker.
