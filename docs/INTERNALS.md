# Internals

How real-time collaboration actually works in CollabSpace. This is the document
I wish I'd had when I started: what Yjs stores, why the wire format looks the
way it does, when state hits Postgres, and where I made choices that a reader
might reasonably question.

Everything here describes code in this repository. Where the implementation
diverges from what I'd consider correct, I say so rather than describing the
intent as if it were the code.

---

## 1. How Yjs represents text

The mental model most people start with — "a document is a string, and edits are
`splice()` calls on it" — is exactly the model that cannot work when two people
edit at once. Index 5 on my machine is not index 5 on yours the moment you've
typed a character I haven't seen.

Yjs solves this by never using indices as identity.

### 1.1 Items and the doubly linked list

A `Y.Text` is not a string. It's a doubly linked list of **items**, where each
item is a run of characters plus the metadata needed to place it deterministically.

An item carries roughly:

```
Item {
  id:      ID { client: number, clock: number }   // unique, permanent
  origin:  ID | null      // the item this was inserted *after*
  rightOrigin: ID | null  // the item this was inserted *before*
  content: ContentString("hello") | ContentDeleted(len) | ...
  deleted: boolean        // tombstone flag
  left / right: Item      // list pointers, local only
}
```

The important part is `id`. Every item is identified by `(clientID, clock)` and
that identity never changes, no matter what happens around it. `origin` and
`rightOrigin` reference *items*, not positions. So "insert after the item with
id (7, 42)" means the same thing on every replica, forever, regardless of what
else got inserted in the meantime.

Rendering to a string is a traversal: walk the list left to right, skip
tombstoned items, concatenate the content.

### 1.2 Client IDs

Each `Y.Doc` picks a random 32-bit `clientID` at construction. It's not tied to a
user, a session or a connection — open the same document in two tabs and you have
two client IDs. This matters more than it sounds:

- **Reconnecting with a fresh `Y.Doc` gets you a new client ID.** The old ID's
  items don't disappear; they're still in everyone's state. This is why
  reconnection is cheap and doesn't need server coordination.
- **Client ID collisions are possible but negligible.** It's a random 32-bit
  integer; the birthday bound puts a 50% collision chance somewhere around 77,000
  concurrent documents-with-clients. Yjs accepts this. So do I, and it's worth
  knowing rather than discovering.

`clientID` is also the tie-breaker for concurrent inserts at the same position.
`tests/integration/crdt-convergence.test.ts` pins this down: with client IDs 1
and 2 both inserting at index 4 of `ABCDEFGH`, the result is `ABCDXYEFGH` — the
lower client ID's item comes first. That assertion exists as a canary. If a Yjs
upgrade changes tie-breaking, the test fails loudly instead of the change
surfacing as a mysterious cursor jump in production.

### 1.3 Lamport clocks, and what they are not

Each client keeps a monotonically increasing `clock`, incremented per unit of
content it produces. `(clientID, clock)` is the Lamport timestamp.

What the clock gives you: a **partial order**. If two items come from the same
client, the lower clock happened first. That's it.

What it does not give you: any way to compare items from different clients.
There is no global "this edit happened before that one". Yjs doesn't need one —
the conflict resolution is structural (via `origin`/`rightOrigin`), not temporal.
The clock's real job is bookkeeping: it lets a **state vector** —
`Map<clientID, clock>` — summarise "everything I have" in a few dozen bytes, so a
peer can compute exactly the delta you're missing.

This is what makes sync efficient. `Y.encodeStateVector(doc)` is tiny;
`Y.encodeStateAsUpdate(doc, theirStateVector)` returns only the missing items.
`tests/helpers/yjs-client.ts` uses exactly this pair for the reconnect handshake.

### 1.4 Deletion is a tombstone

`ytext.delete(4, 6)` doesn't remove anything. It flags six characters' worth of
items as deleted and records the range in a **delete set**. The items stay in the
list because other clients may still reference them as `origin`.

Two consequences I care about:

- **A delete never "claims" a range.** If I delete `"quick "` while you insert
  `"ZZ"` in the middle of it, your insert survives — it's anchored to items, and
  tombstoning its neighbours doesn't tombstone it. The merged result is
  `The ZZbrown fox`. That's asserted in `crdt-convergence.test.ts`, and it
  surprises people, so it's worth stating: **concurrent inserts into deleted
  text are kept, not discarded.**
- **Documents only grow.** Tombstones accumulate. Yjs garbage-collects them when
  it can, but a document that has been heavily edited carries history it can
  never fully shed. See §5 and `LIMITATIONS.md`.

### 1.5 The properties that everything else depends on

Three, and the entire reconnect/offline story rests on them:

| Property | Meaning | Where it's tested |
|---|---|---|
| Commutative | Update order doesn't matter | `crdt-convergence.test.ts` — applies updates forward and reversed, same result |
| Idempotent | Applying twice == applying once | same test, applies every update twice |
| Associative | Grouping doesn't matter | implied by `Y.mergeUpdates()` being usable at all |

Because of these, "did this client already get that update?" is a question I
never have to answer. Sending it again is free. That is why the cross-shard
fanout in §4 can be at-most-once and still be safe.

---

## 2. Why Yjs, over Automerge, over OT

I evaluated three approaches. Honest version of the reasoning:

### Operational Transformation (Google Docs, ShareDB)

OT transforms each operation against concurrent ones so indices stay meaningful.
It produces compact operations and small documents — no tombstones.

The cost is that **correctness requires a central server**. Client-side OT with
N-way peer concurrency needs transformation functions satisfying properties
(TP1/TP2) that are notoriously hard to get right; the literature has a long
history of published algorithms later shown incorrect.[^1] Every serious OT
deployment I know of funnels operations through one authoritative server that
imposes a total order.

I rejected OT because I wasn't confident I could implement it correctly, and
"probably correct concurrency control" is not a thing worth shipping. That is
the actual reason, not a performance argument.

### Automerge

Automerge is a CRDT library with a genuinely nicer API — you mutate a plain
JavaScript object and it produces changes. It also has a well-specified binary
format and strong provenance (Kleppmann et al.).[^2]

I didn't pick it because at the time of writing, Yjs has the better performance
profile for text specifically and a substantially larger ecosystem of editor
bindings. Kleppmann's own benchmarking work on CRDT text performance is the
reference point here.[^3] Automerge 2.0 closed much of that gap; if I were
choosing today I'd re-run the comparison rather than assume the old answer holds.

**What I'd reconsider:** this decision is the one most likely to be stale. I made
it on ecosystem maturity, and ecosystems move.

### Yjs — what I actually chose

- Fast for text, with a well-documented internal model.[^4]
- `y-prosemirror` exists and is maintained, which matters because the document
  editor is Tiptap (ProseMirror). Without that binding I'd be writing the
  hardest part myself.
- `y-protocols` gives sync and awareness as separate, small, reusable pieces.
- The update format is stable across versions.

**What I'd reconsider:** Yjs's docs are good on *usage* and thin on *guarantees*.
Several behaviours this codebase depends on — conflict ordering, tombstone
retention — I established by writing tests rather than by reading a spec. Those
tests are load-bearing.

[^1]: Sun & Ellis, "Operational transformation in real-time group editors: issues, algorithms, and achievements", CSCW '98. See also Imine et al., "Proving correctness of transformation functions in real-time groupware" (2003), which found flaws in previously published transformation functions.
[^2]: Kleppmann & Beresford, "A Conflict-Free Replicated JSON Datatype", IEEE TPDS 2017. <https://arxiv.org/abs/1608.03960>
[^3]: Kleppmann, "CRDTs: The Hard Parts" (2020) and the `crdt-benchmarks` suite. <https://github.com/dmonad/crdt-benchmarks>
[^4]: Jahns, "Yjs internals". <https://docs.yjs.dev/api/internals>

---

## 3. The awareness protocol

Cursors, selections, names and colours are **not** in the document. They're in a
separate channel called awareness, and the distinction is the whole design.

### Why it's separate

Awareness state is ephemeral and high-frequency. Cursor position changes on every
keystroke and every arrow key. If it lived in the `Y.Doc`, every cursor twitch
would become a permanent, tombstoned, persisted CRDT item. The document would
grow without bound and the history would be unreadable.

So awareness is a plain last-writer-wins map: `clientID -> state`. No merge
semantics, no history, no persistence. The newest value for a client wins, and
when a client goes away its entry is removed. That's the correct trade — losing
a cursor update costs nothing, because another one is a keystroke away.

### The state shape

From `packages/crdt/src/awareness.ts`:

```ts
interface AwarenessState {
  user:      { userId, name, avatar, color };
  cursor:    { anchor, head } | null;
  selection: { anchor, head } | null;
  isTyping:  boolean;
  lastActive: number;
}
```

Colours come from a fixed 10-entry palette, assigned round-robin. With more than
10 simultaneous editors, colours repeat — a real limitation of the presence UI,
not a bug.

### Propagation and timeouts

Awareness has a liveness mechanism the document doesn't need: entries expire.
A client that vanishes without a clean disconnect leaves a stale cursor, so
`y-protocols/awareness` times entries out (30s by default) and
`removeAwarenessStates` clears them. This is why a ghost cursor eventually
disappears rather than haunting the document forever.

`anchor` and `head` are **absolute integer offsets**, which is a real weakness.
If a peer inserts text before my cursor, my reported offset is stale until I send
a new one, so remote carets drift slightly during heavy concurrent editing. Yjs
provides *relative positions* (anchored to item IDs) precisely for this, and
using them would be the correct fix. It isn't done. See `LIMITATIONS.md`.

---

## 4. Update encoding, and why not JSON

### The binary format

`Y.encodeStateAsUpdate()` produces a compact binary encoding built on `lib0`:

- **Variable-length integers.** Small numbers cost one byte. Clocks and lengths
  are usually small.
- **Run-length encoding of client IDs and clocks.** Consecutive items from one
  client compress to a client ID plus a count.
- **Structural sharing of origins.** A left-neighbour reference is usually
  implicit rather than a full ID.

Concretely, from `benchmarks/lib/regenerate-fixtures.cjs`: a single-character
insert into a `Y.Text` that already holds ~45 characters encodes to **24 bytes**.
That's a real measurement from this repo, not a quoted figure.

JSON for the same operation — `{"type":"insert","clientId":123456789,"clock":42,"origin":{"client":123456789,"clock":41},"content":"x"}` — is around 110 bytes, and that's before the base64 or array expansion needed to carry binary anywhere.

At one update per keystroke per user, a 4x wire-size difference is the difference
between comfortable and not.

### Where the codebase throws that away

This is the part I'd rather not have to write.

The ws-gateway document protocol (`apps/ws-gateway/src/handlers/document.handler.ts`)
carries updates as **JSON arrays of numbers**:

```json
{ "type": "doc:update", "documentId": "abc", "update": [1, 2, 132, 216, ...] }
```

A 24-byte update becomes roughly 90–100 bytes of JSON text — every byte
rendered as one to three ASCII digits plus a comma. **We pay for a compact
binary format and then encode it in the least compact way available.**

Why it's like that: JSON envelopes made every message uniform, debuggable in a
browser network tab, and trivially routable by `type` prefix. That was a real
convenience during development and it is not worth the ongoing cost.

The fix is to send binary WebSocket frames with a one-byte message type header —
which the web client already does (`apps/web/src/hooks/use-collaboration.ts`
sends `MSG_SYNC`/`MSG_AWARENESS` framed binary). The two sides do not currently
agree on a protocol. That mismatch is documented in `LIMITATIONS.md` and is the
most significant known defect in the codebase.

---

## 5. Persistence

The path from a keystroke to a durable row:

```
browser edit
  │
  ▼
Y.Doc.on('update')  ── binary update
  │
  ▼
ws-gateway  ── doc:update  (JSON envelope)
  │           ├── broadcast to local room members
  │           ├── publish to room fanout channel (other gateway nodes)
  │           └── produce to Kafka topic `document-updates`
  ▼
doc-service Kafka consumer
  │
  ▼
CrdtPersistenceService.queueUpdate()
  │   debounce UPDATE_BATCH_WINDOW_MS (default 1000ms) per document
  ▼
persistBatch()
  ├── merge all pending updates into one via a scratch Y.Doc
  ├── BEGIN
  ├── UPDATE documents SET version = version + 1
  ├── INSERT INTO document_updates (update_data BYTEA, version)
  ├── if updates-since-snapshot >= SNAPSHOT_THRESHOLD (100) → compact
  └── COMMIT
```

### Why debounce, and what it costs

Without batching, a fast typist generates ~10 database writes per second per
document. The 1000ms debounce collapses a burst into one merged update and one
row. The merge is `Y.applyUpdate` into a scratch doc followed by
`Y.encodeStateAsUpdate` — the CRDT properties in §1.5 make it safe.

The cost is stated plainly: **up to one second of edits is only in memory**. A
gateway or doc-service crash inside that window loses them from the database.
They usually survive anyway because connected peers hold them in their own
`Y.Doc`s — but if every client disconnects during the window, those edits are
gone. That is a real durability gap, not a theoretical one.

### Snapshots and compaction

Reconstructing a document by replaying every update is O(edits). After 100
updates since the last snapshot, `compactToSnapshot` writes a full
`document_snapshots` row so loading is O(1) snapshot + a bounded tail.

Load path (`loadDocument`):

1. Redis `doc:<id>:state`, 300s TTL — the common case.
2. Otherwise: latest snapshot, then all `document_updates` with a higher version.
3. Cache the reconstructed state back into Redis.

### What I don't know yet about persistence

- **I haven't measured the compaction pause.** `compactToSnapshot` runs inside
  the same transaction as the batch insert, so a large document's compaction
  holds a row lock. How long, and at what document size it becomes a problem, is
  unmeasured. It's on the list in `benchmarks/RESULTS.md`.
- **Snapshot threshold of 100 is a guess.** It was not derived from measurement.
- **I don't know how the Redis cache behaves under invalidation races.** Two
  doc-service instances loading the same cold document will both reconstruct and
  both `setex`. That's wasteful but not incorrect. Whether there's a window where
  a stale cached state can be served after a write, I have not proven either way.

---

## 6. Sharding and cross-node fanout

Covered in depth in [SHARDING.md](SHARDING.md). The short version, because it's
easy to get a wrong impression from the code:

- A consistent-hash ring with 150 virtual nodes per shard exists in
  `apps/ws-gateway/src/shard-manager.ts` and correctly maps rooms to shards.
- **Nothing routes clients using it.** `getShardForRoom()` and `isLocalRoom()`
  have no callers. Clients connect wherever the load balancer sends them.
- Cross-node delivery works by **fanout, not routing**: one Redis pub/sub channel
  per room (`room:<roomId>:fanout`), subscribed to while a node holds local
  members of that room. See `apps/ws-gateway/src/cross-shard-broadcast.ts`.

Until recently this fanout did not exist at all, and a document opened by users
on two different gateway nodes silently split into two divergent copies with no
error surfaced anywhere. `tests/chaos/ws-node-failure.test.ts` now covers it.

---

## 7. What I don't know yet

The honest list, beyond the per-section notes above:

- **I have never run this at the scale the README talks about.** Everything I
  know about its behaviour above ~100 concurrent clients is inference from the
  design, not observation. `benchmarks/RESULTS.md` is explicit about which
  numbers are measured (currently: none) and which are targets.
- **I don't know how large a document has to get before Yjs tombstone
  accumulation becomes a practical problem.** Yjs GCs what it can; I haven't
  characterised the residual.
- **I don't know whether the awareness timeout interacts badly with the
  gateway's 60s heartbeat timeout.** Two independent liveness mechanisms with
  different windows is exactly the kind of thing that produces confusing ghost
  presence, and I haven't traced it.
- **I don't understand the failure behaviour of the Kafka leg well.** If
  `document-updates` is unavailable, `persistUpdateToKafka` logs and continues,
  so edits keep flowing to peers and silently stop being persisted. There is no
  alert on that. It should be a metric and it isn't.
- **The vector-memory and multi-agent internals are not documented here at all.**
  This document covers collaboration only. That is a gap, not an omission by
  design.

---

## Related

- [SHARDING.md](SHARDING.md) — the ring, fanout, and failure modes
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) — why each major dependency
- [LIMITATIONS.md](LIMITATIONS.md) — what's broken, partial, or unproven
- [RUNBOOK.md](RUNBOOK.md) — debugging a stuck or divergent document
- [../benchmarks/RESULTS.md](../benchmarks/RESULTS.md) — measured numbers
