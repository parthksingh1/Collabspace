/**
 * scripts/seed-demo.ts
 *
 * Seeds a demo workspace so a first-time visitor sees something real instead of
 * an empty shell. An empty demo makes a working product look broken.
 *
 * Creates:
 *   - 1 organization + 1 workspace
 *   - 2 demo users (password login, so anyone can sign in and try it)
 *   - 3 documents with actual prose, stored as both Tiptap JSON and a real Yjs
 *     CRDT state so the collaborative editor has something to load
 *   - 1 project with a kanban board of 12 tasks across four statuses
 *   - 1 whiteboard with a small system diagram
 *
 * Idempotent: re-running updates the same rows rather than duplicating. Every
 * id is derived deterministically from a fixed namespace, so the demo document
 * URLs stay stable across re-seeds — which matters if you've put one in a README
 * or a job application.
 *
 * Usage:
 *   npm run db:seed:demo
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-demo.ts
 *   npx tsx scripts/seed-demo.ts --reset     # delete demo data first
 *
 * Safety: only ever touches rows under the demo organization slug. `--reset`
 * deletes that organization and cascades; it cannot touch anything else.
 */

import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import * as Y from 'yjs';

// ── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://collabspace:collabspace_dev_password@localhost:5432/collabspace';

const DEMO_ORG_SLUG = 'collabspace-demo';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoPass123!';
const RESET = process.argv.includes('--reset');

/**
 * Deterministic UUIDs from a fixed namespace.
 *
 * Using random ids would change every demo URL on each re-seed. Hashing a
 * stable name gives the same id forever, so a link to the demo document keeps
 * working after the database is rebuilt.
 */
function stableId(name: string): string {
  const h = createHash('sha256').update(`collabspace-demo:${name}`).digest('hex');
  // Format as a v4-shaped UUID. It is not a real v4 (the bits aren't random),
  // but Postgres only cares that it parses as a UUID.
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

// ── Demo content ─────────────────────────────────────────────────────────────

const USERS = [
  {
    id: stableId('user:ada'),
    email: 'ada@collabspace.demo',
    name: 'Ada Okafor',
    role: 'admin',
    avatarUrl: null,
  },
  {
    id: stableId('user:rin'),
    email: 'rin@collabspace.demo',
    name: 'Rin Takahashi',
    role: 'member',
    avatarUrl: null,
  },
];

const ORG_ID = stableId('org');
const WORKSPACE_ID = stableId('workspace');
const PROJECT_ID = stableId('project');
const BOARD_ID = stableId('board');

/** Documents, as paragraphs. Converted to both Tiptap JSON and Yjs state below. */
const DOCUMENTS = [
  {
    id: stableId('doc:launch-plan'),
    title: 'Q3 Launch Plan',
    author: USERS[0]!,
    paragraphs: [
      'We are shipping the collaborative editor to general availability at the end of Q3. This document is the single source of truth for scope, sequencing and the things we have decided not to do.',
      'Scope: real-time document editing with presence, offline support with automatic reconciliation, and version history. Everything else is explicitly out of scope for this launch, including the whiteboard AI features and the contest mode in the code editor.',
      'Sequencing: the blocker is the client/gateway protocol work. Nothing downstream of that can be scheduled until it lands, so it gets the first two weeks and a dedicated owner.',
      'Risks: we have never run the system above a hundred concurrent clients. The benchmarks exist but have not been run on representative hardware, so our scale numbers are architecture arithmetic rather than measurements. Treat any capacity claim in the launch material as unverified until that changes.',
      'What we are not doing: multi-region. The Terraform provisions a single regional cluster and making it multi-region is a quarter of work on its own.',
    ],
  },
  {
    id: stableId('doc:architecture-notes'),
    title: 'Architecture Notes — Real-time Layer',
    author: USERS[1]!,
    paragraphs: [
      'Notes from reading through the WebSocket tier. Recording these while they are fresh rather than trusting that I will remember.',
      'Documents are Yjs CRDTs. Every edit produces a binary update that is commutative and idempotent, which is why reconnection is cheap: a client sends its state vector and gets back exactly what it is missing, and applying an update twice is harmless.',
      'Cross-node delivery is fanout, not routing. Each room gets a Redis pub/sub channel, and a gateway node subscribes while it holds at least one member of that room. There is a consistent-hash ring in the code but nothing currently routes with it.',
      'The delivery guarantee is at-most-once. Redis pub/sub keeps no backlog, so anything published while a subscriber is disconnected is simply gone. This is survivable because clients re-sync on reconnect, but a client that stays connected through an outage never learns what it missed.',
      'Open question I have not resolved: what happens to a document whose every client disconnects during the persistence debounce window. In principle those edits exist only in memory. I have not tested it.',
    ],
  },
  {
    id: stableId('doc:onboarding'),
    title: 'Welcome to CollabSpace',
    author: USERS[0]!,
    paragraphs: [
      'This is a demo workspace. Everything in it is seeded data, so feel free to edit, break and delete anything — re-running the seed script puts it all back.',
      'Try this: open this document in two browser windows side by side. You should see the other window\'s cursor with a name label, and text typed in one appearing in the other. That is the CRDT layer doing its job.',
      'Then try this: disconnect one window from the network, keep typing in it, and reconnect. The two documents should merge without losing anything from either side. That behaviour is covered by tests in tests/integration/offline-reconciliation.test.ts if you want to see it asserted rather than demonstrated.',
      'The project board and whiteboard in this workspace are also seeded. The AI features will not do anything unless an API key is configured.',
      'If something here does not work, docs/LIMITATIONS.md is an honest list of what is broken or unproven. It is probably in there.',
    ],
  },
];

const TASKS = [
  { title: 'Unify client and gateway on binary framing', status: 'in_progress', priority: 'urgent', points: 8, assignee: 0, labels: ['protocol', 'blocker'] },
  { title: 'Add room-level authorisation to room:join', status: 'in_progress', priority: 'urgent', points: 3, assignee: 1, labels: ['security'] },
  { title: 'Fix the 93 TypeScript errors behind the non-blocking escape hatch', status: 'todo', priority: 'high', points: 13, assignee: null, labels: ['tech-debt'] },
  { title: 'Move cross-shard fanout to Redis Streams', status: 'todo', priority: 'high', points: 8, assignee: 0, labels: ['reliability'] },
  { title: 'Run the load benchmarks on representative hardware', status: 'todo', priority: 'high', points: 5, assignee: 1, labels: ['benchmarks'] },
  { title: 'Browser-level test for the offline IndexedDB buffer', status: 'todo', priority: 'medium', points: 5, assignee: null, labels: ['testing'] },
  { title: 'Use Yjs relative positions for cursors instead of absolute offsets', status: 'todo', priority: 'medium', points: 5, assignee: 1, labels: ['editor'] },
  { title: 'Alert when Kafka persistence fails silently', status: 'backlog', priority: 'medium', points: 3, assignee: null, labels: ['observability'] },
  { title: 'Evaluate replacing Kafka with Redis Streams', status: 'backlog', priority: 'low', points: 8, assignee: null, labels: ['infra'] },
  { title: 'Measure the Monaco bundle cost', status: 'backlog', priority: 'low', points: 2, assignee: 0, labels: ['frontend'] },
  { title: 'Implement cross-shard presence for member join/leave', status: 'done', priority: 'medium', points: 5, assignee: 0, labels: ['presence'] },
  { title: 'Chaos test: kill a gateway node mid-session', status: 'done', priority: 'high', points: 5, assignee: 1, labels: ['testing'] },
];

/** A small architecture diagram, in the whiteboard's element format. */
const BOARD_ELEMENTS = [
  { id: 'e1', type: 'rectangle', x: 80, y: 60, width: 200, height: 80, fill: '#e0e7ff', stroke: '#6366f1', strokeWidth: 2, text: 'Browser\n(Tiptap + Yjs)' },
  { id: 'e2', type: 'rectangle', x: 380, y: 60, width: 200, height: 80, fill: '#dcfce7', stroke: '#16a34a', strokeWidth: 2, text: 'ws-gateway\n(shard 1)' },
  { id: 'e3', type: 'rectangle', x: 380, y: 200, width: 200, height: 80, fill: '#dcfce7', stroke: '#16a34a', strokeWidth: 2, text: 'ws-gateway\n(shard 2)' },
  { id: 'e4', type: 'ellipse', x: 690, y: 130, width: 160, height: 80, fill: '#fee2e2', stroke: '#dc2626', strokeWidth: 2, text: 'Redis\npub/sub' },
  { id: 'e5', type: 'rectangle', x: 380, y: 340, width: 200, height: 70, fill: '#fef9c3', stroke: '#ca8a04', strokeWidth: 2, text: 'Postgres' },
  { id: 'c1', type: 'arrow', x: 280, y: 100, points: [[0, 0], [100, 0]], stroke: '#64748b', strokeWidth: 2, label: 'WebSocket' },
  { id: 'c2', type: 'arrow', x: 580, y: 100, points: [[0, 0], [110, 40]], stroke: '#64748b', strokeWidth: 2 },
  { id: 'c3', type: 'arrow', x: 580, y: 240, points: [[0, 0], [110, -60]], stroke: '#64748b', strokeWidth: 2 },
  { id: 'c4', type: 'arrow', x: 480, y: 280, points: [[0, 0], [0, 60]], stroke: '#64748b', strokeWidth: 2, label: 'Kafka' },
  { id: 'n1', type: 'sticky', x: 690, y: 260, width: 180, height: 120, fill: '#fef08a', text: 'At-most-once.\nNo backlog — anything published during an outage is gone.' },
  { id: 't1', type: 'text', x: 80, y: 20, text: 'Real-time layer', fontSize: 22, fill: '#0f172a' },
];

// ── Content conversion ───────────────────────────────────────────────────────

/** Tiptap/ProseMirror JSON for the `content` column. */
function tiptapDoc(paragraphs: string[]): object {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

/**
 * A real Yjs document state for the `content_crdt` column.
 *
 * This matters: without it the collaborative editor loads an empty Y.Doc and
 * the seeded prose only appears in whatever view reads the JSON column, which
 * makes the demo look half-broken. Writing genuine CRDT state means the editor
 * opens with the text already there.
 *
 * The XmlFragment structure mirrors what y-prosemirror produces for a document
 * of paragraphs.
 */
function yjsState(paragraphs: string[]): Buffer {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');

  const nodes = paragraphs.map((text) => {
    const para = new Y.XmlElement('paragraph');
    para.insert(0, [new Y.XmlText(text)]);
    return para;
  });
  fragment.insert(0, nodes);

  // Only the XmlFragment is written. A Y.Doc cannot hold both an XmlFragment
  // and a Y.Text under the same key — Yjs throws "Type with the name default
  // has already been defined with a different constructor" — and 'default' is
  // the key y-prosemirror uses, so the editor wins. Headless clients in
  // tests/helpers/yjs-client.ts read `getText('default')` and would therefore
  // not see this content, but they never open seeded documents: they generate
  // their own document ids.
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

// ── Seeding ──────────────────────────────────────────────────────────────────

async function reset(client: Client): Promise<void> {
  // Scoped to the demo org. Cascades take out the workspace and everything in
  // it. This cannot reach anything outside the demo data.
  const res = await client.query('DELETE FROM public.organizations WHERE slug = $1', [
    DEMO_ORG_SLUG,
  ]);
  console.log(`  reset: removed ${res.rowCount ?? 0} demo organization(s) and cascaded`);

  await client.query('DELETE FROM public.user_profiles WHERE email LIKE $1', [
    '%@collabspace.demo',
  ]);
}

async function seed(client: Client): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // -- Organization ---------------------------------------------------------

  await client.query(
    `INSERT INTO public.organizations (id, name, slug, plan)
     VALUES ($1, $2, $3, 'pro')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [ORG_ID, 'CollabSpace Demo', DEMO_ORG_SLUG],
  );
  console.log('  organization: CollabSpace Demo');

  // -- Users ----------------------------------------------------------------

  for (const user of USERS) {
    await client.query(
      `INSERT INTO public.user_profiles
         (id, email, name, password_hash, avatar_url, role, org_id, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         org_id = EXCLUDED.org_id,
         updated_at = NOW()`,
      [user.id, user.email, user.name, passwordHash, user.avatarUrl, user.role, ORG_ID],
    );
    console.log(`  user: ${user.name} <${user.email}>`);
  }

  // -- Workspace ------------------------------------------------------------

  await client.query(
    `INSERT INTO public.workspaces (id, org_id, name, description, visibility, created_by)
     VALUES ($1, $2, $3, $4, 'public', $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [
      WORKSPACE_ID,
      ORG_ID,
      'Product Team',
      'Seeded demo workspace. Everything here is fake data — edit freely.',
      USERS[0]!.id,
    ],
  );
  console.log('  workspace: Product Team');

  for (const user of USERS) {
    // workspace_members has a composite primary key (workspace_id, user_id) and
    // no surrogate id column.
    await client.query(
      `INSERT INTO public.workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [WORKSPACE_ID, user.id, user.role],
    );
  }

  // -- Documents ------------------------------------------------------------

  for (const doc of DOCUMENTS) {
    await client.query(
      `INSERT INTO public.documents
         (id, workspace_id, title, content, content_crdt, version, created_by)
       VALUES ($1, $2, $3, $4, $5, 1, $6)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         content_crdt = EXCLUDED.content_crdt,
         updated_at = NOW()`,
      [
        doc.id,
        WORKSPACE_ID,
        doc.title,
        JSON.stringify(tiptapDoc(doc.paragraphs)),
        yjsState(doc.paragraphs),
        doc.author.id,
      ],
    );
    console.log(`  document: ${doc.title}`);
  }

  // -- Project and tasks ----------------------------------------------------

  await client.query(
    `INSERT INTO public.projects (id, workspace_id, name, description, key_prefix, created_by)
     VALUES ($1, $2, $3, $4, 'DEMO', $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [
      PROJECT_ID,
      WORKSPACE_ID,
      'Real-time Platform',
      'Work queue for the collaboration layer.',
      USERS[0]!.id,
    ],
  );
  console.log('  project: Real-time Platform');

  let taskNumber = 1;
  const statusPositions: Record<string, number> = {};

  for (const task of TASKS) {
    statusPositions[task.status] = (statusPositions[task.status] ?? 0) + 1;
    const assignee = task.assignee === null ? null : USERS[task.assignee]!.id;

    await client.query(
      `INSERT INTO public.tasks
         (id, project_id, task_number, title, description, status, priority,
          story_points, labels, assignee_id, reporter_id, position, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         assignee_id = EXCLUDED.assignee_id,
         updated_at = NOW()`,
      [
        stableId(`task:${task.title}`),
        PROJECT_ID,
        taskNumber++,
        task.title,
        '',
        task.status,
        task.priority,
        task.points,
        JSON.stringify(task.labels),
        assignee,
        USERS[0]!.id,
        statusPositions[task.status]!,
        task.status === 'done' ? new Date().toISOString() : null,
      ],
    );
  }
  console.log(`  tasks: ${TASKS.length} across ${Object.keys(statusPositions).length} statuses`);

  // -- Whiteboard -----------------------------------------------------------

  await client.query(
    `INSERT INTO public.boards (id, workspace_id, title, elements, viewport, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       elements = EXCLUDED.elements,
       updated_at = NOW()`,
    [
      BOARD_ID,
      WORKSPACE_ID,
      'Real-time Layer Diagram',
      JSON.stringify(BOARD_ELEMENTS),
      JSON.stringify({ x: 0, y: 0, zoom: 1 }),
      USERS[1]!.id,
    ],
  );
  console.log(`  whiteboard: Real-time Layer Diagram (${BOARD_ELEMENTS.length} elements)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
  } catch (err) {
    console.error(`\nCould not connect to Postgres at ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
    console.error(`  ${(err as Error).message}\n`);
    console.error('Is the database running? Try:');
    console.error('  docker compose -f infra/docker/docker-compose.yml up -d postgres\n');
    process.exit(1);
  }

  try {
    console.log(`\nSeeding demo data into ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}\n`);

    if (RESET) {
      console.log('Resetting existing demo data...');
      await reset(client);
      console.log('');
    }

    await client.query('BEGIN');
    await seed(client);
    await client.query('COMMIT');

    console.log('\nDone. Sign in with either:');
    for (const user of USERS) {
      console.log(`  ${user.email}  /  ${DEMO_PASSWORD}`);
    }
    console.log(`\nDemo document: /documents/${DOCUMENTS[2]!.id}`);
    console.log(`Kanban board:  /projects/${PROJECT_ID}`);
    console.log(`Whiteboard:    /boards/${BOARD_ID}\n`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(`\nSeeding failed: ${(err as Error).message}`);
    console.error(
      '\nIf this is a missing table, the schema has not been applied yet:\n' +
        '  docker compose -f infra/docker/docker-compose.yml exec -T postgres \\\n' +
        '    psql -U collabspace -d collabspace < infra/supabase/init.sql\n',
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

// ── Limitations ──────────────────────────────────────────────────────────────
//
// - The Yjs state written to `content_crdt` builds an XmlFragment shaped the way
//   y-prosemirror produces one, but it is constructed by hand rather than by
//   running ProseMirror. If the editor's schema changes, seeded documents could
//   load with the wrong structure. There is no test covering this.
// - Task statuses ('backlog', 'todo', 'in_progress', 'done') are assumed to
//   match what the kanban UI expects. The schema column is a free-text TEXT with
//   no CHECK constraint, so a mismatch would seed silently and show empty
//   columns.
// - Whiteboard element shapes are inferred from the board handler's message
//   types, not from a schema. Same failure mode: wrong shape seeds fine and
//   renders as nothing.
// - No AI conversations, notifications or code files are seeded. Those parts of
//   the demo will still look empty.
