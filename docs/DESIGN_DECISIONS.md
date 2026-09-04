# Design decisions

Why each significant piece of this system is what it is. Every entry has a
rationale and an honest "what I'd reconsider" — because a decision record that
only justifies is marketing, not engineering.

Where a decision turned out badly, I say so. Where I picked something for a weak
reason, I say that too.

---

## WebSocket over WebRTC

**Decision:** all real-time traffic goes through a server-mediated WebSocket
connection to `ws-gateway`. No peer-to-peer data channels.

**Why.** Three reasons, in order of weight:

1. **Persistence needs a server in the path.** A document has to survive
   everyone closing their laptop. With WebRTC, the CRDT state lives only in
   connected browsers; the moment the last peer leaves, so does the document,
   unless you run a server peer anyway — at which point you have the server and
   the P2P complexity.
2. **Scaling P2P is worse, not better.** WebRTC's cost is O(N²) connections per
   room. At 20 people that's 190 peer connections. Server-mediated is O(N).
   `y-webrtc` exists and works, but its own docs are clear that it's for small
   rooms.
3. **NAT traversal is an operational tax.** WebRTC needs STUN, and TURN relays
   for the ~10–15% of connections that can't traverse. Running TURN means
   bandwidth costs and another thing to page about.

**What I'd reconsider:** I gave up genuinely lower latency. A direct peer
connection between two people in the same office beats a round trip to a
datacentre, sometimes by a lot. A hybrid — WebRTC for the low-latency path,
WebSocket for persistence and fallback — is what a latency-sensitive product
would do, and it's what I'd explore if the measured numbers in
`benchmarks/RESULTS.md` ever showed the server hop dominating.

---

## Tiptap over Slate, or ProseMirror directly

**Decision:** Tiptap for the document editor.

**Why.** ProseMirror is the right document model — it's the most rigorous
rich-text engine in the JS ecosystem, and `y-prosemirror` is the best-maintained
CRDT binding that exists. That fixes the model. The question was only how much
of ProseMirror's API to write by hand.

ProseMirror direct means writing schema, plugin wiring, node views and command
chains yourself. Tiptap is a thin layer over exactly that, with the boilerplate
already done and a sane extension API — and critically, it does **not** hide
ProseMirror. When I need the underlying editor state I reach through and take
it, which `apps/web/src/components/documents/editor.tsx` does for the slash-command
plugin.

Slate I ruled out on collaboration support: its CRDT story has historically been
less mature, and its document model has changed shape across versions in ways
that would put the collaboration binding at risk.

**What I'd reconsider:** the extension count. The editor imports 18 Tiptap
extension packages, and each is a version I have to keep in step on every
upgrade. Tiptap's own major-version upgrades have been disruptive. If I were
starting again on a smaller feature set, ProseMirror directly would mean more
initial code and fewer things to break later.

---

## Monaco over CodeMirror 6

**Decision:** Monaco for the code editor.

**Why.** It's the editor from VS Code, and that buys two specific things:

1. **Parity users already expect.** Keybindings, multi-cursor, the command
   palette, the peek-definition UI — people arrive knowing them.
2. **A real LSP path.** Monaco's language-service interfaces map onto the
   Language Server Protocol closely enough that `monaco-languageclient` is a
   thin adapter. CodeMirror 6 can do LSP too, but more of the bridging is yours.

**What I'd reconsider — and this is the decision I'm least comfortable with.**
Monaco is heavy. It's on the order of several megabytes, it isn't designed for
tree-shaking, and it does not work on mobile browsers in any real sense. If the
code editor is a secondary feature of this product rather than its core — and it
is — then paying that bundle cost on a page many users never open is a bad trade.
CodeMirror 6 is a fraction of the size, genuinely modular, and works on touch
devices. **If I revisit one editor choice, it's this one.** I have not measured
the actual bundle impact, which is itself part of the problem.

---

## Kafka, Redis pub/sub, and Redis Streams

Three messaging mechanisms are plausible here. Two are used and one is not. The
split is deliberate, and the boundary is durability.

### Kafka — durable domain events

Topics in use: `document-updates`, `document-events`, `code.events`,
`board-events`, `project-events`, `task-events`, `sprint-events`,
`notification-events`.

**Why Kafka for these.** These events must not be lost. `document-updates` is
the path by which a keystroke becomes a row in Postgres
([INTERNALS.md §5](INTERNALS.md#5-persistence)); dropping one loses user data.
Kafka gives a durable, replayable, partitioned log with consumer groups —
partitioning by document id keeps a document's updates ordered, and a consumer
that falls over resumes from its committed offset instead of losing the window.

**What I'd reconsider:** Kafka is enormous for this workload. It's a broker plus
ZooKeeper (this compose file predates KRaft), it's the heaviest thing in
`docker compose up`, and it is the main reason a fresh clone is slow to start.
For a single-region deployment at this scale, **Redis Streams would very likely
be sufficient** — durable, replayable, consumer groups, already-running
dependency, a fraction of the operational weight. I chose Kafka partly because
it's the conventional answer for event streaming, which is a weaker reason than
I'd like. If I were cutting operational surface, this is the first thing I'd cut.

### Redis pub/sub — ephemeral fanout

Used for cross-shard room fanout (`room:<roomId>:fanout`) and shard registry
events (`shards:join` / `shards:leave`).

**Why pub/sub and not something durable.** Latency, and the fact that loss is
tolerable *here specifically*. Fanout carries CRDT updates, which are commutative
and idempotent, and a reconnecting client re-syncs from a state vector. A dropped
envelope costs latency, not correctness. Publishing has no durability overhead,
which is what you want on the keystroke path.

**What I'd reconsider.** That "loss is tolerable" argument has a hole I've
documented rather than fixed: it holds only if the client eventually reconnects.
A client that stays connected through a Redis blip never re-syncs and simply
never learns what it missed, with nothing detecting it
([SHARDING.md](SHARDING.md#delivery-guarantees-at-most-once)). Redis Streams
would close that with at-least-once delivery and a replayable backlog for the
same round trip. **This is a real gap, and the honest reason it isn't fixed is
that I found it late** — the chaos tests surfaced it.

### Redis Streams — not used

Worth stating plainly since the README mentions the trio: `XADD`/`XREAD` appear
nowhere in this codebase. Given the two entries above, that's arguably the wrong
outcome in both directions — Streams would be a better fit than Kafka for the
durable path *and* a better fit than pub/sub for the fanout path.

---

## Postgres via Supabase, over self-hosted

**Decision:** Postgres 16, addressed as Supabase in hosted environments, plain
Postgres in Docker locally.

**Why.** Supabase is Postgres — not a Postgres-like layer — so there's no
lock-in at the query level. Everything in `apps/doc-service` is ordinary SQL
against `pg`. What it buys is managed backups, connection pooling, row-level
security and auth primitives without me operating any of it. For a project with
no dedicated ops, that's the whole argument.

**What I'd reconsider — and this is a live inconsistency in the codebase.** Auth
is half-committed. `apps/auth-service` reads `SUPABASE_URL` and
`SUPABASE_ANON_KEY` from config *and* implements its own JWT issuance, password
hashing, refresh-token rotation and audit logging. Those are two auth systems,
and only one of them is actually load-bearing. Either lean on Supabase Auth and
delete a lot of code, or drop the Supabase auth config and own it properly. The
current state is the worst of both: the config implies a dependency that the
code doesn't really use.

Connection pooling is also unresolved. Supabase's pooler in transaction mode
doesn't support session-level features including prepared statements, and I have
not verified that the `pg` usage in doc-service is compatible. That's a
deployment landmine I know about and haven't defused.

---

## Multi-agent AI: what's actually there

**The README says six agents. There are five.**

`apps/ai-service/src/agents/` contains `planner-agent.ts`, `developer-agent.ts`,
`reviewer-agent.ts`, `meeting-agent.ts`, `knowledge-agent.ts`, plus
`base-agent.ts` and `orchestrator.ts`. There is no execution agent. The
"Execution" in the README appears to have come from the orchestrator's
`executionId` / `ExecutionRecord` types, which track a *run*, not an agent. The
README is being corrected.

The five that exist:

| Agent | What it uniquely does |
|---|---|
| **Planner** | Decomposes a goal into tasks with acceptance criteria. Structured JSON output feeding project-service. |
| **Developer** | Reads requirements and produces code changes. The one agent with code-execution tools. |
| **Reviewer** | Critiques a diff and reports issues. Adversarial by construction — separate from Developer so it isn't grading its own homework. |
| **Meeting** | Turns transcripts into summaries and action items. Extraction, not generation. |
| **Knowledge** | Retrieval over workspace content; the RAG path. |

**Why split at all rather than one agent with many tools.** Two reasons that
survive scrutiny, and one that doesn't:

- *Survives:* **separation of critic and author.** A Reviewer with no memory of
  writing the code gives better criticism than the same context asked to check
  itself.
- *Survives:* **prompt scope.** Each agent has a focused system prompt. One
  general agent needs a prompt covering every task, which degrades all of them.
- *Doesn't survive:* the implicit claim that five agents is a *principled*
  number. It isn't. It's the set of tasks I had in mind, drawn along the lines
  they naturally fell.

**What I'd reconsider.** The orchestrator holds `executions` in an in-process
`Map`. That means agent run state is lost on restart and doesn't survive
horizontal scaling — two ai-service replicas have two disjoint views. For
anything long-running that's a correctness problem, not just an inconvenience.
More broadly: I'd want evidence that the multi-agent split beats a single
well-prompted agent with good tools, and I don't have it. Nothing in
`benchmarks/` or `tests/` evaluates agent output quality at all.

---

## Turborepo monorepo

**Decision:** one repository, npm workspaces, Turborepo for task orchestration.

**Why.** Shared types between services are the main driver: `@collabspace/shared`
and `@collabspace/crdt` are imported across service boundaries, and in separate
repos every type change becomes a publish-and-bump cycle. Turborepo adds
dependency-aware task ordering and caching on top of workspaces without
requiring Bazel-scale investment.

**What I'd reconsider:** the Docker build story is the price, and it's steeper
than I expected. `infra/docker/Dockerfile.service` has to reason about workspace
layout to get layer caching right — and it currently gets it wrong, copying
`package.json` files for `packages/types`, `packages/config`, `packages/logger`
and `packages/database`, none of which exist. That build has been broken and
nobody noticed, which tells you how often it ran.

---

## TypeScript strict mode everywhere

**Decision:** `strict: true` in the root tsconfig, inherited by every package.

**Why.** The CRDT and messaging code passes `Uint8Array`s and untyped JSON across
service boundaries. `strictNullChecks` alone catches a category of bug that is
otherwise found in production.

**What I'd reconsider:** it isn't actually enforced. Several services have
`"typecheck": "tsc --noEmit || echo \"[typecheck] non-blocking\""`, and the CI
lint and typecheck jobs swallow failures with `|| echo "[warn] ..."`. So strict
mode is aspirational in exactly the places where it's failing. Fixing the
underlying errors and removing the escape hatches is worth more than the setting
itself. Task 6 addresses the CI half.

---

## Node's built-in test runner over Jest or Vitest

**Decision:** `node:test` with `tsx` for the tests added in `tests/`.

**Why.** No dependency, no transform config, no mocking framework to fight. The
integration and chaos tests are mostly "start real things, assert real
behaviour", which needs a runner and assertions and little else. `node:test`'s
subtest/skip model maps cleanly onto the skip-locally/fail-in-CI gate in
`tests/helpers/infra.ts`.

**What I'd reconsider:** no built-in coverage reporting worth using, weaker
watch mode, and worse failure output than Vitest. If the suite grows toward unit
tests with heavy mocking, Vitest becomes the better tool. Playwright is used for
browser tests regardless — that's not a competing choice.

---

## What I don't know yet

- **Whether the multi-agent split earns its complexity.** No evaluation exists.
- **The real cost of the Monaco bundle**, which is the input I'd need to settle
  the CodeMirror question.
- **Whether Kafka would actually be missed** if replaced with Redis Streams. I
  believe not, and I haven't tested the claim.
- **Whether Supabase's transaction-mode pooler is compatible** with the current
  `pg` usage.
- **Whether Tiptap's extension surface is worth its upgrade cost** over a longer
  horizon than this project has existed.

---

## Related

- [INTERNALS.md](INTERNALS.md) — how the CRDT layer works
- [SHARDING.md](SHARDING.md) — the messaging decisions in operational context
- [LIMITATIONS.md](LIMITATIONS.md) — where these decisions currently bite
