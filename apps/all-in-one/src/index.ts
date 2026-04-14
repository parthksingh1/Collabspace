// ─────────────────────────────────────────────────────────────────────────────
// CollabSpace — all-in-one combined server.
// One Express app, one port, every API the frontend talks to. Designed for
// single-service deploys (Render free tier, Fly machine, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction, Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.PORT ?? process.env.APP_PORT ?? '4000', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '*')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ─── Demo identity ──────────────────────────────────────────────────────────

const DEMO_ORG = '00000000-0000-0000-0000-000000000001';
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';
const DEMO_WORKSPACE = '00000000-0000-0000-0000-000000000003';
const DEMO_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.demo-access.demo';

const DEMO_USER = {
  id: DEMO_USER_ID,
  email: 'admin@collabspace.io',
  name: 'Admin User',
  role: 'owner',
  orgId: DEMO_ORG,
  avatar: null,
  preferences: { theme: 'system', notifications: true, aiSuggestions: true },
};

// ─── App bootstrap ──────────────────────────────────────────────────────────

const app = express();
const server = createServer(app);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple request log (one line per request).
app.use((req: Request, _res: Response, next: NextFunction) => {
  const t = Date.now();
  _res.on('finish', () => {
    const ms = Date.now() - t;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.path} -> ${_res.statusCode} ${ms}ms`);
  });
  next();
});

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'collabspace-all-in-one',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    modules: ['auth', 'account', 'docs', 'code', 'boards', 'projects', 'ai', 'notifications', 'ws'],
  });
});

// ─── Auth middleware (demo-aware) ───────────────────────────────────────────

interface AuthedRequest extends Request {
  user?: { id: string; email: string; role: string; orgId: string };
}

function auth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }
  // For this combined deploy, anyone presenting a token (including the
  // demo token) is treated as the demo user. To harden later, replace with
  // JWT verification against a real secret.
  req.user = { id: DEMO_USER.id, email: DEMO_USER.email, role: DEMO_USER.role, orgId: DEMO_ORG };
  next();
}

const orgOf = (req: AuthedRequest) => req.user?.orgId ?? DEMO_ORG;
const userOf = (req: AuthedRequest) => req.user?.id ?? DEMO_USER_ID;

// ─── /auth ──────────────────────────────────────────────────────────────────

const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const { email, name } = req.body ?? {};
  res.status(201).json({
    success: true,
    data: {
      user: { ...DEMO_USER, email: email ?? DEMO_USER.email, name: name ?? DEMO_USER.name },
      accessToken: DEMO_TOKEN,
      refreshToken: 'demo.refresh',
    },
  });
});

authRouter.post('/login', (req, res) => {
  const { email } = req.body ?? {};
  res.json({
    success: true,
    data: {
      user: { ...DEMO_USER, email: email ?? DEMO_USER.email },
      accessToken: DEMO_TOKEN,
      refreshToken: 'demo.refresh',
    },
  });
});

authRouter.post('/demo-login', (_req, res) => {
  res.json({ success: true, data: { user: DEMO_USER, accessToken: DEMO_TOKEN, refreshToken: 'demo.refresh' } });
});

authRouter.post('/refresh', (_req, res) => {
  res.json({ success: true, data: { accessToken: DEMO_TOKEN, refreshToken: 'demo.refresh' } });
});

authRouter.post('/logout', (_req, res) => res.json({ success: true }));

authRouter.get('/me', (req, res) => {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    return;
  }
  res.json({ success: true, data: DEMO_USER });
});

authRouter.post('/forgot-password', (_req, res) => res.json({ success: true }));
authRouter.post('/reset-password', (_req, res) => res.json({ success: true }));
authRouter.post('/verify-email', (_req, res) => res.json({ success: true }));

app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

// ─── /account (billing, api-keys, integrations, templates, share-links, 2fa)

type ApiKey = { id: string; label: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null };
type Integration = { id: string; provider: string; connectedAt: string; config: Record<string, unknown> };
type ShareLink = { id: string; resourceKind: string; resourceId: string; visibility: string; access: string; expiresAt: string | null; url: string; createdAt: string };
type TwoFa = { secret: string; backupCodes: string[]; verifiedAt: string | null };

const apiKeys = new Map<string, ApiKey[]>();
const integrations = new Map<string, Integration[]>([
  [DEMO_ORG, [
    { id: 'i1', provider: 'slack', connectedAt: '2026-02-10T00:00:00.000Z', config: { channel: '#general' } },
    { id: 'i2', provider: 'github', connectedAt: '2026-01-15T00:00:00.000Z', config: {} },
  ]],
]);
const shareLinks = new Map<string, ShareLink[]>();
const twoFa = new Map<string, TwoFa>();

let subscription = {
  orgId: DEMO_ORG, plan: 'pro', cycle: 'annual', seats: 10,
  status: 'active', renewsAt: '2027-04-14T00:00:00.000Z',
};
const invoices = [
  { id: 'INV-2026-0412', amount: 120, currency: 'USD', status: 'paid', description: 'Pro plan — Annual (10 seats)', date: '2026-04-12T00:00:00.000Z' },
  { id: 'INV-2026-0312', amount: 120, currency: 'USD', status: 'paid', description: 'Pro plan — Annual (10 seats)', date: '2026-03-12T00:00:00.000Z' },
  { id: 'INV-2026-0212', amount: 96, currency: 'USD', status: 'paid', description: 'Pro plan — Annual (8 seats)', date: '2026-02-12T00:00:00.000Z' },
];

const templates = [
  { id: 't-prd', title: 'Product Requirements Doc', description: 'Structured PRD', category: 'doc', tags: ['Product'], featured: true, uses: 2481 },
  { id: 't-meeting', title: 'Meeting Notes', description: 'Agenda, decisions, action items', category: 'doc', tags: ['Meetings'], featured: false, uses: 8421 },
  { id: 't-flowchart', title: 'System Flowchart', description: 'Swimlanes + connectors', category: 'board', tags: ['Diagram'], featured: true, uses: 3184 },
  { id: 't-sprint', title: '2-Week Sprint', description: 'Backlog → done', category: 'project', tags: ['Agile'], featured: true, uses: 4213 },
  { id: 't-nextjs', title: 'Next.js Starter', description: 'App Router + TS + Tailwind', category: 'code', tags: ['Web'], featured: false, uses: 5271 },
];

const account = Router();
account.use(auth);

account.get('/billing/subscription', (_req, res) => res.json(subscription));
account.post('/billing/subscription', (req, res) => {
  subscription = { ...subscription, ...req.body, orgId: DEMO_ORG };
  res.json(subscription);
});
account.get('/billing/usage', (_req, res) => res.json({
  period: { start: '2026-04-01', end: '2026-04-30' },
  plan: subscription.plan,
  members: { used: 12, limit: 25 },
  storageBytes: { used: 52_220_000_000, limit: 100_000_000_000 },
  aiCredits: { used: 3420, limit: 5000 },
  messages: { used: 18432, limit: 50000 },
}));
account.get('/billing/invoices', (_req, res) => res.json(invoices));
account.get('/billing/plans', (_req, res) => res.json([
  { id: 'free', price: 0 }, { id: 'pro', price: 10 }, { id: 'business', price: 20 }, { id: 'enterprise', price: null },
]));

account.get('/api-keys', (req: AuthedRequest, res) => res.json(apiKeys.get(orgOf(req)) ?? []));
account.post('/api-keys', (req: AuthedRequest, res) => {
  const label = String(req.body?.label ?? '').trim();
  if (!label) { res.status(400).json({ error: 'label required' }); return; }
  const secret = 'cs_live_' + crypto.randomBytes(24).toString('base64url');
  const key: ApiKey = {
    id: 'k_' + crypto.randomBytes(6).toString('hex'),
    label, prefix: secret.slice(0, 12),
    scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : ['read'],
    createdAt: new Date().toISOString(), lastUsedAt: null,
  };
  const list = apiKeys.get(orgOf(req)) ?? [];
  list.unshift(key);
  apiKeys.set(orgOf(req), list);
  res.status(201).json({ ...key, secret });
});
account.delete('/api-keys/:id', (req: AuthedRequest, res) => {
  const org = orgOf(req);
  apiKeys.set(org, (apiKeys.get(org) ?? []).filter((k) => k.id !== req.params.id));
  res.status(204).end();
});

account.get('/integrations', (req: AuthedRequest, res) => res.json(integrations.get(orgOf(req)) ?? []));
account.post('/integrations/:provider/connect', (req: AuthedRequest, res) => {
  const list = integrations.get(orgOf(req)) ?? [];
  list.push({ id: 'i_' + crypto.randomBytes(4).toString('hex'), provider: req.params.provider, connectedAt: new Date().toISOString(), config: req.body?.config ?? {} });
  integrations.set(orgOf(req), list);
  res.status(201).json({ ok: true });
});
account.delete('/integrations/:provider', (req: AuthedRequest, res) => {
  const org = orgOf(req);
  integrations.set(org, (integrations.get(org) ?? []).filter((i) => i.provider !== req.params.provider));
  res.status(204).end();
});

account.get('/templates', (req, res) => {
  const cat = req.query.category as string | undefined;
  const q = (req.query.q as string | undefined)?.toLowerCase();
  res.json(
    templates
      .filter((t) => !cat || cat === 'all' || t.category === cat)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  );
});
account.post('/templates/:id/use', (req, res) => {
  const tpl = templates.find((t) => t.id === req.params.id);
  if (!tpl) { res.status(404).json({ error: 'not found' }); return; }
  tpl.uses += 1;
  res.json({ templateId: tpl.id, category: tpl.category, title: tpl.title, newId: 'n_' + crypto.randomBytes(6).toString('hex') });
});

account.get('/share-links/:kind/:id', (req, res) => {
  res.json(shareLinks.get(`${req.params.kind}:${req.params.id}`) ?? []);
});
account.post('/share-links/:kind/:id', (req, res) => {
  const key = `${req.params.kind}:${req.params.id}`;
  const link: ShareLink = {
    id: 'l_' + crypto.randomBytes(6).toString('hex'),
    resourceKind: req.params.kind, resourceId: req.params.id,
    visibility: req.body?.visibility ?? 'workspace',
    access: req.body?.access ?? 'view',
    expiresAt: req.body?.expiresAt ?? null,
    url: `https://app.collabspace.io/share/${req.params.kind}/${req.params.id}`,
    createdAt: new Date().toISOString(),
  };
  const list = shareLinks.get(key) ?? [];
  list.unshift(link);
  shareLinks.set(key, list);
  res.status(201).json(link);
});

account.post('/2fa/setup', (req: AuthedRequest, res) => {
  const secret = crypto.randomBytes(20).toString('hex').toUpperCase().slice(0, 32);
  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-')
  );
  twoFa.set(userOf(req), { secret, backupCodes, verifiedAt: null });
  res.json({ secret, otpAuthUrl: `otpauth://totp/CollabSpace:${userOf(req)}?secret=${secret}`, backupCodes });
});
account.post('/2fa/verify', (req: AuthedRequest, res) => {
  const rec = twoFa.get(userOf(req));
  if (!rec) { res.status(400).json({ error: '2FA not set up' }); return; }
  rec.verifiedAt = new Date().toISOString();
  twoFa.set(userOf(req), rec);
  res.json({ enabled: true, verifiedAt: rec.verifiedAt });
});
account.post('/2fa/disable', (req: AuthedRequest, res) => {
  twoFa.delete(userOf(req));
  res.status(204).end();
});
account.get('/2fa/status', (req: AuthedRequest, res) => {
  res.json({ enabled: !!twoFa.get(userOf(req))?.verifiedAt });
});

app.use('/account', account);
app.use('/api/account', account);

// ─── Workspaces ─────────────────────────────────────────────────────────────

const workspaces = Router();
workspaces.use(auth);
const demoWorkspaces = [
  { id: DEMO_WORKSPACE, name: 'Default Workspace', orgId: DEMO_ORG, description: 'Your first workspace', visibility: 'private', createdAt: new Date().toISOString() },
];
workspaces.get('/', (_req, res) => res.json(demoWorkspaces));
workspaces.get('/:id', (req, res) => {
  const ws = demoWorkspaces.find((w) => w.id === req.params.id) ?? demoWorkspaces[0];
  res.json(ws);
});
app.use('/workspaces', workspaces);
app.use('/api/workspaces', workspaces);

// ─── Documents / Code / Boards / Projects — demo CRUD ────────────────────────

type Doc = { id: string; title: string; content: string; workspaceId: string; createdAt: string; updatedAt: string };
const docs: Doc[] = [
  { id: 'd1', title: 'Welcome to CollabSpace', content: '<h1>Welcome</h1><p>Start editing this doc to see the collaborative editor in action.</p>', workspaceId: DEMO_WORKSPACE, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

function crudRouter<T extends { id: string }>(store: T[], make: (body: Record<string, unknown>) => T): Router {
  const r = Router();
  r.use(auth);
  r.get('/', (_req, res) => res.json(store));
  r.get('/:id', (req, res) => {
    const item = store.find((i) => i.id === req.params.id);
    if (!item) { res.status(404).json({ error: 'not found' }); return; }
    res.json(item);
  });
  r.post('/', (req, res) => {
    const item = make(req.body ?? {});
    store.unshift(item);
    res.status(201).json(item);
  });
  r.patch('/:id', (req, res) => {
    const idx = store.findIndex((i) => i.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'not found' }); return; }
    store[idx] = { ...store[idx], ...req.body };
    res.json(store[idx]);
  });
  r.delete('/:id', (req, res) => {
    const idx = store.findIndex((i) => i.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'not found' }); return; }
    store.splice(idx, 1);
    res.status(204).end();
  });
  return r;
}

const docsRouter = crudRouter(docs, (body) => ({
  id: crypto.randomBytes(8).toString('hex'),
  title: String(body.title ?? 'Untitled'),
  content: String(body.content ?? ''),
  workspaceId: String(body.workspaceId ?? DEMO_WORKSPACE),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
app.use('/documents', docsRouter);
app.use('/api/documents', docsRouter);

type CodeFile = { id: string; name: string; language: string; content: string; workspaceId: string; createdAt: string };
const codeFiles: CodeFile[] = [
  { id: 'c1', name: 'hello.ts', language: 'typescript', content: 'console.log("Hello, CollabSpace!");', workspaceId: DEMO_WORKSPACE, createdAt: new Date().toISOString() },
];
const codeRouter = crudRouter(codeFiles, (body) => ({
  id: crypto.randomBytes(8).toString('hex'),
  name: String(body.name ?? 'untitled.ts'),
  language: String(body.language ?? 'typescript'),
  content: String(body.content ?? ''),
  workspaceId: String(body.workspaceId ?? DEMO_WORKSPACE),
  createdAt: new Date().toISOString(),
}));
app.use('/code', codeRouter);
app.use('/api/code', codeRouter);
app.post('/api/code/execute', auth, (req, res) => {
  res.json({
    stdout: `[demo executor] would run:\n${(req.body?.code ?? '').slice(0, 200)}\n`,
    stderr: '',
    exitCode: 0,
    durationMs: 12,
  });
});

type Board = { id: string; title: string; elements: unknown[]; workspaceId: string; createdAt: string };
const boards: Board[] = [
  { id: 'b1', title: 'System Design Board', elements: [], workspaceId: DEMO_WORKSPACE, createdAt: new Date().toISOString() },
];
const boardRouter = crudRouter(boards, (body) => ({
  id: crypto.randomBytes(8).toString('hex'),
  title: String(body.title ?? 'Untitled board'),
  elements: Array.isArray(body.elements) ? (body.elements as unknown[]) : [],
  workspaceId: String(body.workspaceId ?? DEMO_WORKSPACE),
  createdAt: new Date().toISOString(),
}));
app.use('/boards', boardRouter);
app.use('/api/boards', boardRouter);

type Project = { id: string; name: string; description: string; workspaceId: string; createdAt: string };
const projects: Project[] = [
  { id: 'p1', name: 'Q2 Launch', description: 'Ship v2.0 by end of quarter', workspaceId: DEMO_WORKSPACE, createdAt: new Date().toISOString() },
];
const projectRouter = crudRouter(projects, (body) => ({
  id: crypto.randomBytes(8).toString('hex'),
  name: String(body.name ?? 'New Project'),
  description: String(body.description ?? ''),
  workspaceId: String(body.workspaceId ?? DEMO_WORKSPACE),
  createdAt: new Date().toISOString(),
}));
app.use('/projects', projectRouter);
app.use('/api/projects', projectRouter);

// Sprints + tasks (demo)
type Task = { id: string; title: string; status: string; projectId: string; createdAt: string };
const tasks: Task[] = [
  { id: 't1', title: 'Implement auth middleware', status: 'done', projectId: 'p1', createdAt: new Date().toISOString() },
  { id: 't2', title: 'Add rate limiter', status: 'in_progress', projectId: 'p1', createdAt: new Date().toISOString() },
];
const taskRouter = crudRouter(tasks, (body) => ({
  id: crypto.randomBytes(8).toString('hex'),
  title: String(body.title ?? 'New task'),
  status: String(body.status ?? 'todo'),
  projectId: String(body.projectId ?? 'p1'),
  createdAt: new Date().toISOString(),
}));
app.use('/tasks', taskRouter);
app.use('/api/tasks', taskRouter);

// ─── AI ─────────────────────────────────────────────────────────────────────

const aiRouter = Router();
aiRouter.use(auth);

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return `[demo AI — GEMINI_API_KEY not set] You asked: ${prompt.slice(0, 200)}`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)';
  } catch (err) {
    return `[AI error] ${err instanceof Error ? err.message : String(err)}`;
  }
}

aiRouter.post('/chat', async (req, res) => {
  const msg = String(req.body?.message ?? req.body?.prompt ?? '');
  const reply = await callGemini(msg);
  res.json({ reply, role: 'assistant', model: 'gemini-1.5-flash' });
});
aiRouter.post('/complete', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '');
  const reply = await callGemini(prompt);
  res.json({ completion: reply });
});
aiRouter.post('/summarize', async (req, res) => {
  const reply = await callGemini(`Summarize this in 3 bullet points:\n\n${req.body?.text ?? ''}`);
  res.json({ summary: reply });
});

app.use('/ai', aiRouter);
app.use('/api/ai', aiRouter);

// ─── Notifications ──────────────────────────────────────────────────────────

const notificationsRouter = Router();
notificationsRouter.use(auth);
const notifications = [
  { id: 'n1', title: 'Sarah commented on "API Design Doc"', read: false, createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
  { id: 'n2', title: 'Alex assigned you CS-42', read: false, createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
  { id: 'n3', title: 'Sprint "v2.1" starts tomorrow', read: false, createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
];
notificationsRouter.get('/', (_req, res) => res.json(notifications));
notificationsRouter.get('/unread-count', (_req, res) => res.json({ count: notifications.filter((n) => !n.read).length }));
notificationsRouter.post('/:id/read', (req, res) => {
  const n = notifications.find((x) => x.id === req.params.id);
  if (n) n.read = true;
  res.json({ ok: true });
});
notificationsRouter.post('/read-all', (_req, res) => {
  for (const n of notifications) n.read = true;
  res.json({ ok: true });
});

app.use('/notifications', notificationsRouter);
app.use('/api/notifications', notificationsRouter);

// ─── WebSocket (very light presence echo) ───────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string };
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        return;
      }
      // Broadcast everything else to all other clients (simple presence).
      const text = raw.toString();
      for (const client of wss.clients) {
        if (client !== socket && client.readyState === client.OPEN) {
          client.send(text);
        }
      }
    } catch {
      // ignore malformed frames
    }
  });
});

// ─── 404 + error handler ────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', path: req.path } });
});

app.use((err: Error & { statusCode?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[error]', err.message, err.stack);
  res.status(err.statusCode ?? 500).json({
    success: false,
    error: { code: err.code ?? 'INTERNAL_ERROR', message: err.message },
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CollabSpace all-in-one listening on :${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`  CORS: ${CORS_ORIGINS.join(', ') || '(default)'}`);
  // eslint-disable-next-line no-console
  console.log(`  Gemini: ${process.env.GEMINI_API_KEY ? 'configured' : 'not set (AI replies will be stubbed)'}`);
});
