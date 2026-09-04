# Playwright end-to-end tests

Two real browsers, one document, one running stack.

## Running

Playwright is not installed by default (it pulls a browser binary, ~150MB). One
time:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Then start the stack and run:

```bash
# 1. Infrastructure
docker compose -f infra/docker/docker-compose.yml up -d redis postgres

# 2. Services (separate shells, or npm run dev from the repo root)
cd apps/ws-gateway && npm run dev
cd apps/api-gateway && npm run dev
cd apps/doc-service && npm run dev
cd apps/web && npm run dev

# 3. Tests
npm run test:e2e
```

`JWT_SECRET` must match what the services are running with — the tests mint
their own tokens rather than logging in.

## Why there is no `webServer` block

Playwright can start a server for you. It is not configured here on purpose:
launching ten microservices from a test runner produces failures that cannot be
attributed to anything. When the stack is started separately, a failing test is
a failing test, and a stack that will not start is a stack that will not start.

## What these tests cover, and what they don't

Covered: the real editor, the real provider wiring, real WebSocket transport,
peer cursors with correct names, and text convergence after simultaneous typing.

Not covered:
- **Cursor latency is not asserted.** Playwright's polling resolution is coarser
  than the ~100ms quantity involved, so any assertion would be theatre. Real
  latency numbers come from `benchmarks/crdt-sync-latency.ts`.
- **The login flow.** Auth is seeded into `localStorage` directly.
- **Cross-shard behaviour.** Both browsers connect to the same gateway.
- **Browsers other than Chromium.**
- **Offline/reconnect in the browser**, including whether the IndexedDB buffer
  survives a page reload. That is the offline path most likely to lose data and
  it has no browser-level test.

Selectors lean on Tiptap's own class names (`.ProseMirror`,
`.collaboration-cursor__caret`) because the editor components carry no
`data-testid` attributes. That makes these tests sensitive to a Tiptap upgrade.
Adding test ids to `apps/web/src/components/documents/editor.tsx` would be the
right fix.
