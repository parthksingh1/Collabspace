import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom Metrics
const errorRate = new Rate('errors');
const wsLatency = new Trend('ws_latency');
const docSyncLatency = new Trend('doc_sync_latency');
const aiResponseTime = new Trend('ai_response_time');
const taskCreations = new Counter('task_creations');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';
const WS_URL = __ENV.WS_URL || 'ws://localhost:4001';

export const options = {
  scenarios: {
    // Scenario 1: API Load Test — Simulates normal API traffic
    api_load: {
      executor: 'ramping-vus',
      exec: 'apiLoadTest',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },   // Ramp to 200
        { duration: '3m', target: 1000 },   // Ramp to 1000
        { duration: '5m', target: 1000 },   // Hold at 1000
        { duration: '1m', target: 0 },      // Ramp down
      ],
      gracefulRampDown: '30s',
    },

    // Scenario 2: WebSocket Connections — Tests concurrent WS connections
    websocket_connections: {
      executor: 'ramping-vus',
      exec: 'websocketTest',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 2000 },
        { duration: '5m', target: 10000 },
        { duration: '2m', target: 10000 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },

    // Scenario 3: Document Collaboration — Simulates concurrent editing
    document_collab: {
      executor: 'constant-vus',
      exec: 'documentCollabTest',
      vus: 500,
      duration: '5m',
    },

    // Scenario 4: AI Endpoint Stress Test
    ai_stress: {
      executor: 'ramping-arrival-rate',
      exec: 'aiStressTest',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 0 },
      ],
    },

    // Scenario 5: Project Management — Task CRUD operations
    project_ops: {
      executor: 'constant-vus',
      exec: 'projectOpsTest',
      vus: 200,
      duration: '5m',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],      // 95th %ile < 200ms
    http_req_failed: ['rate<0.01'],                       // Error rate < 1%
    errors: ['rate<0.05'],                                // Custom error rate < 5%
    ws_latency: ['p(95)<30'],                             // WS latency < 30ms
    doc_sync_latency: ['p(95)<50'],                       // Doc sync < 50ms
    ai_response_time: ['p(95)<5000'],                     // AI < 5s
  },
};

// ─── Helper Functions ───

function getAuthToken() {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: `loadtest+${__VU}@collabspace.io`,
    password: 'LoadTest123!',
  }), { headers: { 'Content-Type': 'application/json' } });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return body.data?.accessToken || body.accessToken || '';
  }
  return '';
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

// ─── Scenario 1: API Load Test ───

export function apiLoadTest() {
  const token = getAuthToken();
  const headers = authHeaders(token);

  group('GET Endpoints', () => {
    // List documents
    let res = http.get(`${BASE_URL}/documents?page=1&pageSize=20`, { headers });
    check(res, { 'documents list 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // List projects
    res = http.get(`${BASE_URL}/projects?page=1&pageSize=20`, { headers });
    check(res, { 'projects list 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // Get notifications
    res = http.get(`${BASE_URL}/notifications?page=1&pageSize=20`, { headers });
    check(res, { 'notifications 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // Health check
    res = http.get(`${BASE_URL.replace('/api', '')}/health`);
    check(res, { 'health 200': (r) => r.status === 200 });
  });

  group('POST Endpoints', () => {
    // Create document
    const res = http.post(`${BASE_URL}/documents`, JSON.stringify({
      title: `Load Test Doc ${randomString(8)}`,
      workspaceId: '00000000-0000-0000-0000-000000000003',
    }), { headers });
    check(res, { 'create doc 201': (r) => r.status === 201 });
    errorRate.add(res.status !== 201);
  });

  sleep(randomIntBetween(1, 3));
}

// ─── Scenario 2: WebSocket Connections ───

export function websocketTest() {
  const token = getAuthToken();
  const url = `${WS_URL}?token=${token}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Join a room
      socket.send(JSON.stringify({
        type: 'room:join',
        payload: { roomId: `doc-room-${__VU % 100}`, roomType: 'document' },
        timestamp: Date.now(),
      }));

      // Periodic ping
      socket.setInterval(() => {
        const start = Date.now();
        socket.send(JSON.stringify({ type: 'ping', payload: { timestamp: start }, timestamp: start }));
      }, 5000);
    });

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'pong') {
          wsLatency.add(Date.now() - data.payload.timestamp);
        }
      } catch {}
    });

    socket.on('error', () => {
      errorRate.add(1);
    });

    // Stay connected for a while
    socket.setTimeout(() => {
      socket.close(1000);
    }, 30000 + randomIntBetween(0, 30000));
  });

  check(res, { 'ws connected': (r) => r && r.status === 101 });
}

// ─── Scenario 3: Document Collaboration ───

export function documentCollabTest() {
  const token = getAuthToken();
  const headers = authHeaders(token);
  const docId = `doc-${__VU % 50}`; // 50 shared documents

  group('Document Sync', () => {
    // Simulate CRDT update
    const updatePayload = {
      documentId: docId,
      update: Array.from({ length: randomIntBetween(50, 500) }, () => Math.floor(Math.random() * 256)),
      origin: `user-${__VU}`,
    };

    const start = Date.now();
    const res = http.post(`${BASE_URL}/documents/${docId}/sync`, JSON.stringify(updatePayload), { headers });
    docSyncLatency.add(Date.now() - start);

    check(res, { 'doc sync success': (r) => r.status === 200 || r.status === 201 });
    errorRate.add(res.status >= 400);
  });

  group('Get Document', () => {
    const res = http.get(`${BASE_URL}/documents/${docId}`, { headers });
    check(res, { 'get doc 200': (r) => r.status === 200 });
  });

  group('Comments', () => {
    const res = http.post(`${BASE_URL}/documents/${docId}/comment`, JSON.stringify({
      content: `Comment from VU ${__VU}: ${randomString(50)}`,
    }), { headers });
    check(res, { 'comment created': (r) => r.status === 201 || r.status === 200 });
  });

  sleep(randomIntBetween(2, 5));
}

// ─── Scenario 4: AI Stress Test ───

export function aiStressTest() {
  const token = getAuthToken();
  const headers = authHeaders(token);

  const prompts = [
    'Summarize the authentication service architecture',
    'Generate a function to parse WebSocket messages',
    'Review this code for security issues',
    'Break down the sprint planning into tasks',
    'Explain the CRDT merge strategy',
  ];

  const prompt = prompts[randomIntBetween(0, prompts.length - 1)];

  const start = Date.now();
  const res = http.post(`${BASE_URL}/ai/chat`, JSON.stringify({
    messages: [{ role: 'user', content: prompt }],
  }), { headers, timeout: '30s' });

  aiResponseTime.add(Date.now() - start);
  check(res, { 'ai response ok': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

// ─── Scenario 5: Project Operations ───

export function projectOpsTest() {
  const token = getAuthToken();
  const headers = authHeaders(token);
  const projectId = `proj-${__VU % 20}`;

  group('Task CRUD', () => {
    // Create task
    const createRes = http.post(`${BASE_URL}/projects/${projectId}/tasks`, JSON.stringify({
      title: `Task ${randomString(10)}`,
      description: 'Load test task',
      priority: ['critical', 'high', 'medium', 'low'][randomIntBetween(0, 3)],
      storyPoints: randomIntBetween(1, 13),
    }), { headers });

    check(createRes, { 'task created': (r) => r.status === 201 || r.status === 200 });
    taskCreations.add(1);

    if (createRes.status === 201 || createRes.status === 200) {
      const taskId = JSON.parse(createRes.body)?.data?.id;
      if (taskId) {
        // Update task status
        const statuses = ['todo', 'in_progress', 'review', 'done'];
        const newStatus = statuses[randomIntBetween(0, statuses.length - 1)];
        http.put(`${BASE_URL}/tasks/${taskId}/status`, JSON.stringify({ status: newStatus }), { headers });

        // Add comment
        http.post(`${BASE_URL}/tasks/${taskId}/comments`, JSON.stringify({
          content: `Test comment ${randomString(20)}`,
        }), { headers });
      }
    }

    // List tasks
    const listRes = http.get(`${BASE_URL}/projects/${projectId}/tasks?page=1&pageSize=50`, { headers });
    check(listRes, { 'tasks list 200': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(1, 3));
}
