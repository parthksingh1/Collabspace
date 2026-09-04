# tests/

Four layers, each answering a different question.

| Layer | Question it answers | Needs | Command |
|---|---|---|---|
| `apps/*/tests`, `packages/*/tests` | Does each package hold together? | nothing | `npm test` |
| `integration/` | Do the CRDT semantics and the wire protocol behave? | ws-gateway (partly) | `npm run test:integration` |
| `chaos/` | Does it survive a node or Redis dying? | Docker | `npm run test:chaos` |
| `e2e/playwright/` | Does it work in a real browser? | full stack + Playwright | `npm run test:e2e` |
| `load/`, `../benchmarks/` | How fast, and at what scale? | k6 + running services | `npm run bench:all` |

## The skip-or-fail rule

Integration and chaos tests need real services. Rather than choosing between a
suite that is always red on a fresh clone and one that silently passes without
running, they do this:

- **`REQUIRE_INFRA` unset** (a developer's laptop): missing infrastructure means
  the affected tests skip, printing the exact command to start what is missing.
- **`REQUIRE_INFRA=1`** (CI): missing infrastructure is a hard failure, so CI
  cannot go green on a suite that never ran.

The integration suite is split so this matters less than it sounds: its
CRDT-semantics tests run in-process with no gateway at all and always execute.
Only the "through ws-gateway" describes need a server.

```bash
# What actually runs on a bare clone:
npm run test:integration     # 11 pass, 6 skip

# With a gateway up:
WS_URL=ws://localhost:4001 REQUIRE_INFRA=1 npm run test:integration   # 17 pass
```

## Chaos tests run one at a time

Each chaos suite owns the whole Docker topology and tears it down on entry, so
running them in parallel means one suite destroys the other's cluster mid-test.
`npm run test:chaos` chains them (`test:chaos:ws` then `test:chaos:redis`)
rather than relying on `--test-concurrency`, which Node does not apply to
separate files reliably.

Expect roughly two minutes: the first run also builds the gateway image.

## Helpers

`helpers/` is shared by the integration and chaos suites:

- `jwt.ts` — signs HS256 tokens, so tests do not depend on auth-service
- `infra.ts` — health probes and the skip-or-fail gate
- `yjs-client.ts` — a headless Yjs peer speaking the gateway's document
  protocol, including the sync handshake, offline buffering and failover
- `compose.ts` — `docker compose` orchestration for the chaos topology

## What is not tested

Stated plainly, because a test directory implies more coverage than exists:

- **The browser offline path.** Whether an IndexedDB buffer survives a page
  reload is untested, and it is the most likely place for real data loss.
- **The persistence path.** Nothing exercises Kafka → Postgres snapshotting, or
  what happens to a document whose every client has disconnected.
- **Cross-shard presence.** `room:member_joined` / `member_left` are delivered
  locally only; document updates cross shards, membership notifications do not.
- **The web client's protocol.** The browser provider speaks binary frames while
  ws-gateway parses JSON — see `docs/LIMITATIONS.md`. No test covers that seam,
  which is exactly why it went unnoticed.
- **Load beyond 100 clients** in chaos, or 2 browsers in e2e.
- **Anything in ai-service, code execution sandboxing, or billing.**
