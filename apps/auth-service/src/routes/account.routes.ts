import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { AccessTokenPayload } from '../services/token.service.js';

// ---------------------------------------------------------------------------
// In-memory stores. Swap to Postgres when productionising.
// These endpoints exist so the UI has a live surface without a migration.
// ---------------------------------------------------------------------------

type PlanId = 'free' | 'pro' | 'business' | 'enterprise';
type BillingCycle = 'monthly' | 'annual';

type Subscription = {
  orgId: string;
  plan: PlanId;
  cycle: BillingCycle;
  seats: number;
  status: 'active' | 'past_due' | 'cancelled';
  renewsAt: string;
  updatedAt: string;
};

type Invoice = {
  id: string;
  orgId: string;
  amount: number;
  currency: 'USD';
  status: 'paid' | 'open' | 'void';
  description: string;
  date: string;
  pdfUrl: string;
};

type ApiKey = {
  id: string;
  orgId: string;
  userId: string;
  label: string;
  prefix: string;
  hash: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

type Integration = {
  id: string;
  orgId: string;
  provider: string;
  connectedAt: string;
  connectedBy: string;
  config: Record<string, unknown>;
};

type ShareLink = {
  id: string;
  resourceKind: 'document' | 'board' | 'project' | 'code';
  resourceId: string;
  visibility: 'restricted' | 'workspace' | 'public';
  access: 'view' | 'comment' | 'edit';
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  url: string;
};

type TwoFaRecord = {
  userId: string;
  secret: string;
  backupCodes: string[];
  verifiedAt: string | null;
};

type Template = {
  id: string;
  title: string;
  description: string;
  category: 'doc' | 'board' | 'project' | 'code';
  tags: string[];
  featured: boolean;
  uses: number;
};

// Seeded demo state ---------------------------------------------------------
const DEMO_ORG = '00000000-0000-0000-0000-000000000001';

const subscriptions = new Map<string, Subscription>([
  [
    DEMO_ORG,
    {
      orgId: DEMO_ORG,
      plan: 'pro',
      cycle: 'annual',
      seats: 10,
      status: 'active',
      renewsAt: '2027-04-14T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    },
  ],
]);

const invoices = new Map<string, Invoice[]>([
  [
    DEMO_ORG,
    [
      { id: 'INV-2026-0412', orgId: DEMO_ORG, amount: 120, currency: 'USD', status: 'paid', description: 'Pro plan — Annual (10 seats)', date: '2026-04-12T00:00:00.000Z', pdfUrl: '#' },
      { id: 'INV-2026-0312', orgId: DEMO_ORG, amount: 120, currency: 'USD', status: 'paid', description: 'Pro plan — Annual (10 seats)', date: '2026-03-12T00:00:00.000Z', pdfUrl: '#' },
      { id: 'INV-2026-0212', orgId: DEMO_ORG, amount: 96, currency: 'USD', status: 'paid', description: 'Pro plan — Annual (8 seats)', date: '2026-02-12T00:00:00.000Z', pdfUrl: '#' },
    ],
  ],
]);

const apiKeys = new Map<string, ApiKey[]>();
const integrations = new Map<string, Integration[]>([
  [
    DEMO_ORG,
    [
      { id: 'i1', orgId: DEMO_ORG, provider: 'slack', connectedAt: '2026-02-10T00:00:00.000Z', connectedBy: 'admin', config: { channel: '#general' } },
      { id: 'i2', orgId: DEMO_ORG, provider: 'github', connectedAt: '2026-01-15T00:00:00.000Z', connectedBy: 'admin', config: {} },
    ],
  ],
]);

const shareLinks = new Map<string, ShareLink[]>();
const twoFa = new Map<string, TwoFaRecord>();

const templates: Template[] = [
  { id: 't-prd', title: 'Product Requirements Doc', description: 'Structured PRD with problem, goals, users, scope, metrics.', category: 'doc', tags: ['Product'], featured: true, uses: 2481 },
  { id: 't-meeting', title: 'Meeting Notes', description: 'Agenda, decisions, action items with owners.', category: 'doc', tags: ['Meetings'], featured: false, uses: 8421 },
  { id: 't-flowchart', title: 'System Flowchart', description: 'Swimlanes, shapes, and smart connectors.', category: 'board', tags: ['Diagram'], featured: true, uses: 3184 },
  { id: 't-sprint', title: '2-Week Sprint', description: 'Backlog → in-progress → review → done.', category: 'project', tags: ['Agile'], featured: true, uses: 4213 },
  { id: 't-nextjs', title: 'Next.js Starter', description: 'App Router + TypeScript + Tailwind.', category: 'code', tags: ['Web'], featured: false, uses: 5271 },
];

// Helpers -------------------------------------------------------------------

function orgOf(req: Request): string {
  return (
    (req.headers['x-organization-id'] as string | undefined) ||
    req.user?.orgId ||
    DEMO_ORG
  );
}

function userOf(req: Request): string {
  return req.user?.userId || 'demo-user';
}

function id(prefix = ''): string {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function planPrice(plan: PlanId, cycle: BillingCycle): number {
  const table: Record<PlanId, { monthly: number; annual: number }> = {
    free: { monthly: 0, annual: 0 },
    pro: { monthly: 12, annual: 10 },
    business: { monthly: 24, annual: 20 },
    enterprise: { monthly: 0, annual: 0 },
  };
  return table[plan][cycle];
}

// ---------------------------------------------------------------------------
export const accountRouter = Router();

// Demo-aware auth: real JWTs go through `authenticate`, demo tokens fall back
// to the seeded demo user so the UI works without running Postgres.
function demoAwareAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.includes('demo')) {
    req.user = {
      userId: '00000000-0000-0000-0000-000000000002',
      email: 'admin@collabspace.io',
      role: 'owner',
      orgId: DEMO_ORG,
      type: 'access',
    } as AccessTokenPayload;
    next();
    return;
  }
  void authenticate(req, res, next);
}

accountRouter.use(demoAwareAuth);

// ─── Billing ───────────────────────────────────────────────────────────────

accountRouter.get('/billing/subscription', (req, res) => {
  const org = orgOf(req);
  res.json(subscriptions.get(org) ?? subscriptions.get(DEMO_ORG));
});

accountRouter.post('/billing/subscription', (req, res) => {
  const org = orgOf(req);
  const plan = req.body?.plan as PlanId | undefined;
  const cycle = (req.body?.cycle as BillingCycle) ?? 'annual';
  const seats = typeof req.body?.seats === 'number' ? req.body.seats : undefined;

  if (!plan || !['free', 'pro', 'business', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const current = subscriptions.get(org) ?? subscriptions.get(DEMO_ORG)!;
  const updated: Subscription = {
    ...current,
    orgId: org,
    plan,
    cycle,
    seats: seats ?? current.seats,
    updatedAt: new Date().toISOString(),
  };
  subscriptions.set(org, updated);
  res.json(updated);
});

accountRouter.get('/billing/usage', (req, res) => {
  const org = orgOf(req);
  const sub = subscriptions.get(org) ?? subscriptions.get(DEMO_ORG)!;
  res.json({
    period: { start: '2026-04-01', end: '2026-04-30' },
    plan: sub.plan,
    members: { used: 12, limit: sub.plan === 'business' ? null : 25 },
    storageBytes: { used: 52_220_000_000, limit: sub.plan === 'business' ? 1_000_000_000_000 : 100_000_000_000 },
    aiCredits: { used: 3420, limit: sub.plan === 'pro' ? 5000 : 200 },
    messages: { used: 18432, limit: 50000 },
  });
});

accountRouter.get('/billing/invoices', (req, res) => {
  const org = orgOf(req);
  res.json(invoices.get(org) ?? invoices.get(DEMO_ORG) ?? []);
});

accountRouter.get('/billing/plans', (_req, res) => {
  res.json([
    { id: 'free', price: planPrice('free', 'annual') },
    { id: 'pro', price: planPrice('pro', 'annual') },
    { id: 'business', price: planPrice('business', 'annual') },
    { id: 'enterprise', price: null },
  ]);
});

// ─── API Keys ──────────────────────────────────────────────────────────────

accountRouter.get('/api-keys', (req, res) => {
  const org = orgOf(req);
  const list = (apiKeys.get(org) ?? []).map((k) => ({
    id: k.id,
    label: k.label,
    prefix: k.prefix,
    scopes: k.scopes,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
  }));
  res.json(list);
});

accountRouter.post('/api-keys', (req, res) => {
  const org = orgOf(req);
  const user = userOf(req);
  const label = (req.body?.label as string | undefined)?.trim();
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : ['read'];
  if (!label) return res.status(400).json({ error: 'label is required' });

  const secret = 'cs_live_' + crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  const key: ApiKey = {
    id: id('k_'),
    orgId: org,
    userId: user,
    label,
    prefix: secret.slice(0, 12),
    hash,
    scopes,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  const list = apiKeys.get(org) ?? [];
  list.unshift(key);
  apiKeys.set(org, list);

  // The plaintext is returned exactly once.
  res.status(201).json({ id: key.id, label, scopes, prefix: key.prefix, secret });
});

accountRouter.delete('/api-keys/:id', (req, res) => {
  const org = orgOf(req);
  const list = apiKeys.get(org) ?? [];
  const next = list.filter((k) => k.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Not found' });
  apiKeys.set(org, next);
  res.status(204).end();
});

// ─── Integrations ──────────────────────────────────────────────────────────

const PROVIDERS = ['slack', 'github', 'linear', 'jira', 'google', 'figma', 'zoom', 'notion'] as const;

accountRouter.get('/integrations', (req, res) => {
  const org = orgOf(req);
  res.json(integrations.get(org) ?? []);
});

accountRouter.post('/integrations/:provider/connect', (req, res) => {
  const org = orgOf(req);
  const user = userOf(req);
  const provider = req.params.provider;
  if (!PROVIDERS.includes(provider as typeof PROVIDERS[number])) {
    return res.status(400).json({ error: 'Unknown provider' });
  }
  const list = integrations.get(org) ?? [];
  if (list.some((i) => i.provider === provider)) {
    return res.status(409).json({ error: 'Already connected' });
  }
  const entry: Integration = {
    id: id('i_'),
    orgId: org,
    provider,
    connectedAt: new Date().toISOString(),
    connectedBy: user,
    config: req.body?.config ?? {},
  };
  list.push(entry);
  integrations.set(org, list);
  res.status(201).json(entry);
});

accountRouter.delete('/integrations/:provider', (req, res) => {
  const org = orgOf(req);
  const list = integrations.get(org) ?? [];
  const next = list.filter((i) => i.provider !== req.params.provider);
  if (next.length === list.length) return res.status(404).json({ error: 'Not connected' });
  integrations.set(org, next);
  res.status(204).end();
});

// ─── Templates ─────────────────────────────────────────────────────────────

accountRouter.get('/templates', (req, res) => {
  const category = req.query.category as string | undefined;
  const q = (req.query.q as string | undefined)?.toLowerCase();
  const filtered = templates
    .filter((t) => !category || category === 'all' || t.category === category)
    .filter(
      (t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  res.json(filtered);
});

accountRouter.post('/templates/:id/use', (req, res) => {
  const tpl = templates.find((t) => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  tpl.uses += 1;
  res.json({ templateId: tpl.id, category: tpl.category, title: tpl.title, newId: id('n_') });
});

// ─── Share Links ───────────────────────────────────────────────────────────

accountRouter.get('/share-links/:kind/:id', (req, res) => {
  const key = `${req.params.kind}:${req.params.id}`;
  res.json(shareLinks.get(key) ?? []);
});

accountRouter.post('/share-links/:kind/:id', (req, res) => {
  const user = userOf(req);
  const { kind, id: resourceId } = req.params;
  const key = `${kind}:${resourceId}`;
  const link: ShareLink = {
    id: id('l_'),
    resourceKind: kind as ShareLink['resourceKind'],
    resourceId,
    visibility: req.body?.visibility ?? 'workspace',
    access: req.body?.access ?? 'view',
    expiresAt: req.body?.expiresAt ?? null,
    createdBy: user,
    createdAt: new Date().toISOString(),
    url: `https://app.collabspace.io/share/${kind}/${resourceId}`,
  };
  const list = shareLinks.get(key) ?? [];
  list.unshift(link);
  shareLinks.set(key, list);
  res.status(201).json(link);
});

accountRouter.delete('/share-links/:linkId', (req, res) => {
  const { linkId } = req.params;
  let removed = false;
  for (const [k, v] of shareLinks.entries()) {
    const next = v.filter((l) => l.id !== linkId);
    if (next.length !== v.length) {
      shareLinks.set(k, next);
      removed = true;
      break;
    }
  }
  if (!removed) return res.status(404).json({ error: 'Link not found' });
  res.status(204).end();
});

// ─── Two-Factor Authentication ─────────────────────────────────────────────

accountRouter.post('/2fa/setup', (req, res) => {
  const user = userOf(req);
  const secret = crypto.randomBytes(20).toString('hex').toUpperCase().slice(0, 32);
  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-')
  );
  twoFa.set(user, { userId: user, secret, backupCodes, verifiedAt: null });
  res.json({
    secret,
    otpAuthUrl: `otpauth://totp/CollabSpace:${user}?secret=${secret}&issuer=CollabSpace`,
    backupCodes,
  });
});

accountRouter.post('/2fa/verify', (req, res) => {
  const user = userOf(req);
  const rec = twoFa.get(user);
  const code = (req.body?.code as string | undefined)?.trim();
  if (!rec) return res.status(400).json({ error: '2FA not set up' });
  if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid code' });
  // Demo: accept any 6-digit code. Production would validate TOTP against the secret.
  rec.verifiedAt = new Date().toISOString();
  twoFa.set(user, rec);
  res.json({ enabled: true, verifiedAt: rec.verifiedAt });
});

accountRouter.post('/2fa/disable', (req, res) => {
  const user = userOf(req);
  twoFa.delete(user);
  res.status(204).end();
});

accountRouter.get('/2fa/status', (req, res) => {
  const user = userOf(req);
  const rec = twoFa.get(user);
  res.json({ enabled: !!rec?.verifiedAt });
});
