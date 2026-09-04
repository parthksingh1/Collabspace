# Limitations

What's broken, partial, unproven, or would need rewriting. This is the document
I'd want to read before trusting this system with anything, so it's written to
be useful rather than flattering.

Everything here is verified against the code, not recalled. Where I give a
number, the command that produced it is included so you can check.

Last audited: 2026-09-04

---

## 1. Defects that would bite in production

### 1.1 The web client and ws-gateway speak different protocols

**Severity: critical. This likely means browser document collaboration does not
work against ws-gateway at all.**

The browser provider (`apps/web/src/hooks/use-collaboration.ts`) connects to
`${WS_URL}/collab/${roomId}` and sends **binary** frames with a one-byte message
type prefix:

```ts
ws.binaryType = 'arraybuffer';
this.sendMessage(MSG_SYNC, new Uint8Array(Y.encodeStateVector(this.ydoc)));
```

`apps/ws-gateway/src/index.ts` does this with every inbound message:

```ts
const raw = data.toString();
parsed = JSON.parse(raw);   // → error:parse for any binary frame
```

The gateway has no `/collab/:roomId` route handling (the upgrade path ignores
the URL beyond the token), and it only understands JSON envelopes of the form
`{ type: 'doc:update', documentId, update: number[] }`. A binary `MSG_SYNC`
frame fails `JSON.parse` and gets an `error:parse` reply.

**How this went unnoticed:** nothing tested the seam. The integration and chaos
tests use `tests/helpers/yjs-client.ts`, which speaks the gateway's JSON
protocol correctly, so they pass. They validate the gateway, not the browser
client. The Playwright test that *would* catch it
(`tests/e2e/playwright/multi-user-doc.spec.ts`) needs a full stack and has not
been run.

**Fix:** pick one protocol. Binary framing is the right answer — it's what the
client already does and it removes the ~4× JSON encoding overhead described in
[INTERNALS.md §4](INTERNALS.md#4-update-encoding-and-why-not-json). This is a
real change to both sides and has not been made.

### 1.2 Cross-shard delivery is at-most-once, with a silent-loss window

Room fanout uses Redis pub/sub, which keeps no backlog. A message published
while a subscriber is disconnected is gone.

This is normally harmless — Yjs updates are idempotent and a reconnecting client
re-syncs. **The hole is a client that stays connected through a Redis blip.** It
never reconnects, so it never re-syncs, so it simply never learns about the
updates dropped during the outage. Nothing detects this. It resolves whenever
that client next reconnects for any other reason, which could be hours.

Demonstrated (not merely asserted) in `tests/chaos/redis-restart.test.ts`.
Fix is Redis Streams with consumer groups. Not done.

### 1.3 The production service Dockerfile cannot build

`infra/docker/Dockerfile.service` copies package manifests for packages that do
not exist:

```dockerfile
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/database/package.json ./packages/database/
```

The actual packages are `shared`, `crdt`, `ai-sdk`, `ui`. It also has a broken
start command — `CMD ["node", "apps/${SERVICE_NAME}/dist/main.js"]` uses exec
form, where shell variable expansion does not happen, and the built entrypoint is
`dist/index.js` rather than `dist/main.js` anyway.

So `npm run docker:build` does not work. That this went unnoticed indicates it
was essentially never run. Task 7 addresses it.

### 1.4 Every service reports unhealthy in Docker while working fine

Health checks throughout `infra/docker/docker-compose.yml` use:

```yaml
test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:PORT/health"]
```

`--spider` issues a **HEAD** request. The service handlers match on
`req.method === 'GET'`, so a HEAD falls through to the 404 branch and the
container is marked unhealthy while serving perfectly. Confirmed directly:

```
$ docker inspect --format '{{.State.Health.Status}}' chaos-ws-1
unhealthy
$ curl -s http://localhost:4101/health
{"status":"healthy","service":"ws-gateway",...}
```

Because `depends_on: condition: service_healthy` is used widely, this can stall
an entire `docker compose up`. Fixed in `infra/docker/Dockerfile.ws-gateway.chaos`
(use `-O /dev/null`, a real GET); the main compose file still has it.

### 1.5 Up to one second of edits is only in memory

`UPDATE_BATCH_WINDOW_MS` defaults to 1000ms. Edits inside that window exist in
the gateway/doc-service process and in connected clients' `Y.Doc`s, but not in
Postgres. If every client disconnects during the window and the service dies,
those edits are lost.

Lowering the window trades durability against write amplification. There is no
write-ahead step that would let you have both.

---

## 2. README claims that are partial or wrong

Audited claim by claim. The README is being corrected alongside this file.

| Claim | Reality |
|---|---|
| "6 specialized agents: Planner, Developer, Reviewer, Meeting, Knowledge, Execution" | **Five agents exist.** `ls apps/ai-service/src/agents/` shows planner, developer, reviewer, meeting, knowledge, plus `base-agent` and `orchestrator`. There is no execution agent; "Execution" appears to derive from the orchestrator's `executionId`/`ExecutionRecord` run-tracking types. |
| "End-to-end encryption (AES-256-GCM)" | **Not implemented, and not end-to-end.** `packages/shared/src/utils/crypto.ts` implements AES-256-GCM correctly, but `grep -rn "encrypt\|decrypt" apps/*/src` returns nothing outside that file — no service calls it. Even if wired up it would be server-side encryption with a server-held key, which is not E2E. |
| "50,000+ concurrent users" | **Design target, never measured.** Arithmetic from the sharding design. Highest number actually exercised is 100 clients in `tests/chaos/`. Compounding this, cross-shard fanout was entirely missing until recently, so multi-node operation silently split documents. |
| "Real-time latency <30ms" | **Unmeasured.** No benchmark has been run. Any figure would also be loopback-only. |
| "p95 <200ms API, <50ms document sync" | **Harness exists, not yet run.** Encoded as k6 thresholds in `benchmarks/`. |
| "99.95% availability" | **Unverifiable.** No production deployment. Aspiration. |
| "Multi-region, 3+ regions" | **Not implemented.** Terraform provisions a single regional GKE cluster. |
| "Docker-sandboxed code execution (256MB, 10s, no network)" | **Configured, unaudited.** `apps/code-service/src/services/sandbox-manager.ts` uses dockerode with those limits. No escape testing, no resource-exhaustion testing. Note it mounts the Docker socket, which is itself a serious privilege concern (§4.2). |
| "Vector DB (Pinecone) for long-term memory" | **Implemented as raw REST calls**, and the index host is constructed as `https://${index}-${env}.svc.${env}.pinecone.io`, which uses the environment string in both positions and does not match Pinecone's current addressing. Unverified against a live index. |
| "356+ production-ready files" | File count is accurate (`git ls-files | wc -l`). "Production-ready" is editorial and I would not defend it for every file — see §3. |
| "TypeScript strict mode everywhere" | Strict is set, and **not enforced**. See §3.1. |

---

## 3. Code quality problems

### 3.1 93 type errors are hidden by a deliberate escape hatch

Ten packages define:

```json
"typecheck": "tsc --noEmit || echo \"[typecheck] non-blocking\""
```

so `tsc` failing is reported as success. Running the real thing:

```
$ for d in apps/*/ packages/*/; do (cd $d && npx tsc --noEmit 2>&1 | grep -c "error TS"); done

project-service:      32        board-service:        18
notification-service: 16        code-service:         11
ai-sdk:                8        ai-service:            7
crdt:                  1        (others:               0)
                                            total:    93
```

CI compounds it — the lint and typecheck jobs wrap every invocation in
`|| echo "[warn] ..."`, so no type error can fail a build. The setting is
aspirational precisely where it's failing.

### 3.2 Areas I'd rewrite rather than patch

- **`apps/web/src/hooks/use-collaboration.ts`** — implements a bespoke
  WebSocket provider with a hand-rolled framing protocol and an awareness
  encoding the code itself flags as a shortcut (`// Encode as JSON for
  simplicity (production would use y-protocols encoding)`). It doesn't match the
  server (§1.1). This should use `y-websocket`, or the server should adopt this
  protocol properly. It's the single highest-value rewrite in the codebase.

- **`apps/ws-gateway/src/handlers/document.handler.ts`** — the JSON
  number-array update format costs ~4× the bytes for no benefit. Same rewrite as
  above, other side of the wire.

- **`apps/ai-service/src/agents/orchestrator.ts`** — keeps execution state in an
  in-process `Map`. Lost on restart, and two replicas have disjoint views. Any
  horizontal scaling of ai-service is currently incorrect, not just limited.

- **`apps/auth-service`** — two auth systems half-committed. Reads
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` while implementing its own JWT issuance,
  password hashing and refresh rotation. Pick one.

- **`packages/crdt`** — a well-written wrapper that is barely used. The gateway
  and doc-service both work with `yjs` directly. Either adopt it or delete it;
  an unused abstraction is a maintenance cost with no return.

---

## 4. Security

**Nothing here has been audited. There is no bug bounty, no penetration test,
and no third-party review.** Treat the security posture as unverified.

### 4.1 Known gaps

- **JWT secret handling.** `config.ts` files default `JWT_SECRET` to
  `'dev-jwt-secret-change-in-production'`. If the env var is missing in
  production, the service starts happily with a publicly known signing key.
  It should refuse to start.
- **No token revocation.** Access tokens are valid until expiry. Logout does not
  invalidate an issued token.
- **WebSocket authorisation is authentication only.** `authenticateUpgrade`
  verifies the JWT, but `room:join` does **not** check that the user may access
  that document. Any authenticated user can join any room id they can guess and
  receive its updates. This is the most serious authorisation gap in the system.
- **Rate limiting is per-connection, in-memory.** Opening N connections gets you
  N× the budget, and limits are not shared across gateway nodes.
- **Encryption at rest is not implemented** (§2).

### 4.2 The code-execution sandbox

`sandbox-manager.ts` mounts the Docker socket (`/var/run/docker.sock`) into
code-service. **Access to the Docker socket is equivalent to root on the host.**
The sandbox constrains the executed code's container; it does not constrain
code-service itself. A compromise of code-service is a host compromise.

gVisor, Firecracker, or a remote build service would be the right answers. None
are in use. No escape testing has been performed.

---

## 5. Scalability ceilings

Real limits, in the order I expect them to be hit:

1. **`MAX_ROOM_CAPACITY` = 100.** A hard cap; the 101st join is rejected with
   `ROOM_FULL`. Not a soft degradation.
2. **Redis pub/sub is single-threaded** and every cross-node message passes
   through it. First cluster-wide ceiling. Unmeasured.
3. **~10,000 WebSocket connections per Node process** before memory and event
   loop dominate. Rule of thumb, not measured here.
4. **JSON wire format** costs ~4× bandwidth and parse time versus binary.
5. **Postgres write throughput** at one row per document per second under
   sustained editing, before snapshot compaction overhead.

### What specifically breaks at 10K+ concurrent users

Being concrete, since the README invites the question:

- **At ~10K:** one gateway node is saturated; you need ≥2, which means cross-shard
  fanout is on the critical path for every room that spans nodes. That path had
  no implementation at all until recently and its delivery guarantee is
  at-most-once (§1.2).
- **At ~10K:** Redis pub/sub carries the full cross-node message rate on one
  thread. I do not know where it tops out. This is the ceiling I'd measure first.
- **At ~10K:** subscribe/unsubscribe churn from room joins becomes significant —
  one Redis subscription operation per room-join on a node with no local members.
- **Above 10K:** no rebalancing (see [SHARDING.md](SHARDING.md#rebalancing)), so
  load stays wherever it landed. A node that absorbed a spike stays hot
  indefinitely.
- **Above 10K:** a node failure drops 1/S of all connections simultaneously and
  they all reconnect at once. The reconnect handshake was O(N²) in room size
  until recently; it is now O(N), but a 10K-client reconnect storm has never
  been tested. The chaos test uses 100.

---

## 6. Testing gaps

What has no coverage at all:

- **The browser offline path.** Whether an IndexedDB buffer survives a page
  reload is untested. Most likely place for real user-visible data loss.
- **The persistence path.** Nothing exercises Kafka → Postgres snapshotting, or
  recovery of a document whose every client has disconnected.
- **Cross-shard presence.** `room:member_joined`/`member_left` are delivered
  locally only. Document updates cross shards; membership notifications do not.
- **The load balancer.** The chaos test's clients do their own failover. The
  component that would do it in production is not exercised anywhere.
- **Concurrent-edit latency.** Correctness under conflict is tested; latency
  under conflict is not measured anywhere.
- **ai-service outputs.** No evaluation of agent quality, at all.
- **Authorisation.** No test asserts that a user *cannot* access a document.

---

## 7. What I don't know yet

Distinct from the above: these are open questions, not known defects.

- Where the real per-node connection ceiling is on actual hardware.
- Whether Redis pub/sub or the Node event loop saturates first.
- How Yjs tombstone accumulation behaves in a document edited for months.
- Whether the awareness timeout (30s) and the gateway heartbeat timeout (60s)
  interact to produce ghost presence. Two liveness mechanisms with different
  windows is a classic source of exactly that, and I haven't traced it.
- Whether `room:<id>:members` in Redis leaks after an ungraceful node death.
  I suspect it does. I haven't checked.
- Whether Supabase's transaction-mode pooler is compatible with the current `pg`
  usage. Unverified, and a deployment landmine if not.
- Whether the multi-agent architecture outperforms one well-prompted agent.

---

## How to help

The highest-value fixes, in order:

1. Unify the client/gateway protocol on binary framing (§1.1) — fixes a critical
   defect and a performance problem together.
2. Add room-level authorisation to `room:join` (§4.1).
3. Fix the 93 type errors and delete the `|| echo` escape hatches (§3.1).
4. Fix `Dockerfile.service` and the compose health checks (§1.3, §1.4).
5. Move cross-shard fanout to Redis Streams (§1.2).

---

## Related

- [INTERNALS.md](INTERNALS.md) · [SHARDING.md](SHARDING.md) ·
  [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) · [RUNBOOK.md](RUNBOOK.md)
- [../benchmarks/RESULTS.md](../benchmarks/RESULTS.md) — claim-by-claim evidence audit
