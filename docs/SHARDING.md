# Sharding in ws-gateway

How the WebSocket tier scales horizontally, what the consistent-hash ring
actually does (less than you'd guess from reading `shard-manager.ts`), and how
messages reach a user connected to a different node.

Read [INTERNALS.md](INTERNALS.md) first if you want the CRDT context.

---

## The problem

A WebSocket connection is pinned to one process. That's the whole difficulty.

An HTTP request can go to any replica; a WebSocket connection lives on exactly
one node for its lifetime. So when Alice and Bob open the same document and the
load balancer puts them on different gateway nodes, Alice's keystroke arrives at
node 1 and Bob's socket is on node 2. Node 1 has no way to reach Bob directly.

Two families of answer:

1. **Routing** — make sure everyone in a room lands on the same node. Needs
   sticky, room-aware routing at the edge and breaks when that node dies.
2. **Fanout** — let clients land anywhere, and relay room messages between
   nodes over a shared bus.

This codebase contains scaffolding for (1) and an implementation of (2). It is
important to be clear about which is which, because the code reads like (1).

---

## What exists

```
                         ┌──────────────────┐
                         │  Load balancer   │
                         │ (nginx/ingress)  │
                         │  round-robin,    │
                         │  NOT room-aware  │
                         └────┬────────┬────┘
                              │        │
              Alice ──────────┘        └────────── Bob
              (doc:xyz)                            (doc:xyz)
                    │                                   │
          ┌─────────▼─────────┐             ┌───────────▼───────┐
          │   ws-gateway 1    │             │   ws-gateway 2    │
          │  SHARD_ID=shard-1 │             │  SHARD_ID=shard-2 │
          │                   │             │                   │
          │ rooms: doc:xyz    │             │ rooms: doc:xyz    │
          │ members: [Alice]  │             │ members: [Bob]    │
          └────────┬──────────┘             └─────────┬─────────┘
                   │                                  │
                   │   SUBSCRIBE room:doc:xyz:fanout  │
                   │   PUBLISH   room:doc:xyz:fanout  │
                   │                                  │
              ┌────▼──────────────────────────────────▼────┐
              │                  Redis                     │
              │                                            │
              │  pub/sub:  room:<roomId>:fanout            │
              │  registry: shards:active  (SET)            │
              │            shard:<id>     (HASH, TTL 120s) │
              │  rooms:    room:<id>:members, room:<id>:meta│
              └────────────────────────────────────────────┘
```

Alice types. Node 1 delivers to its own members and publishes to
`room:doc:xyz:fanout`. Node 2 is subscribed because it holds Bob, receives the
envelope, and delivers to Bob. Bob sees the keystroke.

---

## The consistent-hash ring

`apps/ws-gateway/src/shard-manager.ts` implements a textbook consistent-hash
ring. It works. It is also, at the time of writing, **not used to route
anything**.

### How it's built

- **Hash function: MD5**, taking the first four bytes of the digest as a
  little-endian `uint32`.

  ```ts
  const digest = createHash('md5').update(key).digest();
  return ((digest[3] << 24) | (digest[2] << 16) | (digest[1] << 8) | digest[0]) >>> 0;
  ```

  MD5 is a poor choice on the merits — it's cryptographically broken and slower
  than the non-cryptographic hashes designed for this (xxHash, MurmurHash3).
  It's defensible only because none of its weaknesses matter for bucket
  assignment: we need uniform distribution, not collision resistance. It's in
  Node's stdlib, which is why it's here. I'd use xxHash if I were choosing again.

- **150 virtual nodes per shard.** Each physical shard is hashed onto the ring
  150 times as `shard-1:v0` … `shard-1:v149`. Without virtual nodes, three
  shards means three points on a 2³²-wide ring and wildly uneven splits. 150 is
  the conventional figure (it's what Ketama uses); the standard deviation of
  load across shards falls roughly as 1/√V, so 150 puts you in the low
  single-digit percent.

- **Lookup is a binary search** over the sorted hash array for the first
  virtual node clockwise of the key's hash, wrapping at the end.

### What it's used for

Nothing. `getShardForRoom()` and `isLocalRoom()` have no callers anywhere in the
codebase. I verified this rather than assuming it:

```bash
$ grep -rn "getShardForRoom\|isLocalRoom" apps/ws-gateway/src/
apps/ws-gateway/src/shard-manager.ts:155:  getShardForRoom(roomId: string): string {
apps/ws-gateway/src/shard-manager.ts:159:  isLocalRoom(roomId: string): boolean {
```

Definitions only. The ring is correct, tested by its own logic, and inert.

**Why it's still here:** it's the mechanism you need for room-affinity routing,
which is the next real scaling step (see §6). Deleting it would mean rewriting
it later. But describing this system as "consistently hashed" would be
misleading, and the README should not.

---

## Cross-shard fanout

Implemented in `apps/ws-gateway/src/cross-shard-broadcast.ts`.

### Channel per room

One Redis pub/sub channel per active room: `room:<roomId>:fanout`. A node
subscribes when its first local member joins that room and unsubscribes when its
last one leaves, tracked by refcount.

**Why per-room and not per-shard.** `ShardManager.broadcastToAllShards()`
already existed and would have given cross-node delivery for free by publishing
to a `shard:<id>:<channel>` channel per node. I didn't use it. With per-shard
channels, every node receives every room's traffic and discards the ~99% that
isn't its business. At N nodes that's N× the global message rate hitting every
process — precisely the amplification that prevents horizontal scaling from
helping. Per-room channels mean a node only receives traffic for rooms it
actually holds. Redis handles a large number of channels far better than it
handles pointless fanout.

The trade-off is real: many short-lived channels mean subscribe/unsubscribe
churn on room join/leave, and Redis pub/sub subscription state is per-connection
and not free. For rooms with a handful of members that churn is measurable. I
judged it the better problem to have. It is not measured.

### The envelope

```ts
interface FanoutEnvelope {
  originShard: string;  // loop prevention
  payload: string;      // the already-serialised client message
  sentAt: number;       // for a receive-side latency histogram
}
```

### Loop prevention

Redis pub/sub delivers a published message to **every** subscriber of the
channel, including the publisher. Without a guard, a node would receive its own
broadcast and deliver it locally a second time; if it also re-published, the
message would circulate forever.

`originShard` is the guard, and it is the first thing the receive handler checks:

```ts
if (envelope.originShard === config.shardId) return;
```

That single line is the only thing between this design and an infinite loop.

`excludeSocketId` is deliberately *not* carried across nodes: the excluded
socket is on the origin node by definition, so peers have nothing to exclude.

### Delivery guarantees: at-most-once

Redis pub/sub has **no persistence and no backlog**. A message published while a
subscriber is disconnected is gone, with no redelivery and no error. Cross-shard
fanout inherits this exactly.

`tests/chaos/redis-restart.test.ts` demonstrates it rather than asserting it:
publishing to a channel with no subscribers returns a receiver count of `0`, and
`EXISTS` on the channel returns `0` — Redis is stating that the message went
nowhere and it kept no copy.

**Why this is survivable:** Yjs updates are commutative and idempotent
([INTERNALS.md §1.5](INTERNALS.md#15-the-properties-that-everything-else-depends-on)),
and a reconnecting client performs a state-vector handshake that pulls whatever
it missed. A dropped envelope therefore costs latency, not correctness.

**Why that's conditional, and the condition matters:** it only holds if the
client *does* eventually reconnect and re-sync. A client that stays connected
through a Redis blip never reconnects, never re-syncs, and simply never learns
about the updates that were dropped during the outage. Nothing detects this. It
resolves the next time that client reconnects for any reason — which could be
hours. **This is the weakest guarantee in the system.**

Streams (`XADD`/consumer groups) would give at-least-once with a replayable
backlog and would close that hole. That's the right fix and it isn't done.

---

## Failure modes

### A gateway node dies

**Immediately affected: every client on that node.** With `S` roughly equal
shards, that's ~1/S of all connections. Two nodes → 50%. Ten nodes → 10%. There
is no partial failure; a killed process drops every socket it held.

What happens, verified in `tests/chaos/ws-node-failure.test.ts` with 100 clients
across two nodes and a `SIGKILL`:

1. Sockets close. Clients reconnect (in the test, to the surviving node).
2. On rejoin, each client sends `doc:sync:step1` with its state vector and
   receives what it missed.
3. **No document content is lost**, because surviving peers still hold the
   `Y.Doc` in memory. Every pre-kill edit is present after recovery.
4. The dead shard's `shard:<id>` hash expires after its 120s TTL and it leaves
   the ring.

**What that test does not prove, stated because the distinction is easy to
lose:** there is no load balancer in the chaos topology. The test client holds a
list of gateway URLs and rotates to the next itself. In production that job
belongs to nginx or the ingress, and **that component is not exercised by any
test**. A client that only knows one address would not recover, and nothing here
would catch it.

Also unproven: recovery when *every* client of a document was on the killed
node. Then no peer holds the state and recovery depends entirely on the
Kafka→Postgres persistence path, which the chaos topology doesn't even run. That
is the scenario I'd most want covered and it is not covered.

### Redis dies or restarts

Redis carries three things, and they fail differently:

| What | Effect of a Redis wipe | Recovery |
|---|---|---|
| Shard registry (`shards:active`, `shard:<id>`) | Ring empties | Self-heals within one shard heartbeat |
| Cross-shard fanout (pub/sub) | Messages during the outage are lost | Subscriptions re-established on reconnect |
| Presence and cursors | Lost | Regenerated as users act |

Document content is unaffected — it lives in client memory and Postgres, never
in Redis except as a 300s cache.

**A bug that was here and is now fixed, because it's instructive.**
`sendHeartbeat()` used to refresh only the `shard:<id>` hash. Membership in the
`shards:active` set was added by `sadd` exactly once, in `initialize()`. So after
any Redis data loss the set stayed empty, `refreshShardRegistry()` read nothing,
and **every node rebuilt an empty hash ring and stayed that way until restarted.**
The heartbeat now re-asserts the whole registration idempotently
(`SADD` + `HSET` + `EXPIRE` in one `MULTI`), so the registry heals within one
interval. Covered by `tests/chaos/redis-restart.test.ts`.

The general lesson: **a heartbeat that refreshes only part of a registration is
a heartbeat that cannot recover from data loss.**

### A network partition between nodes

Not tested, and the honest answer is that behaviour is poor. Two nodes that can
each reach Redis but not each other are fine — fanout goes through Redis. Two
nodes that can't reach Redis are each isolated: local room members still sync
with each other, remote ones don't, and neither node knows. Documents diverge
silently for the duration and reconcile only when clients reconnect.

There is no split-brain *detection*. The `no-split-brain` chaos test checks that
both nodes agree on the registry after a restart; it does not detect an ongoing
partition.

---

## Rebalancing

There isn't any. This is the section most likely to be assumed rather than read,
so: **rooms are never migrated between nodes.**

- A node joining publishes to `shards:join` and every node adds it to its ring.
  No existing connections move. The new node takes traffic only as new
  connections arrive.
- A node leaving is removed from the ring. Its clients reconnect wherever the
  load balancer sends them.
- Load imbalance persists until connections naturally churn. A node that was up
  during a traffic spike stays hot; a node that joined afterwards stays cold.

Because routing doesn't use the ring (§2), ring rebalancing would currently have
no observable effect anyway. Both facts have to change together.

---

## Scaling limits, honestly

The README's "50,000+ concurrent users" is arithmetic from this design, not a
measurement. The arithmetic:

- A Node process handles order-10,000 idle WebSocket connections before memory
  and event-loop pressure dominate. At ~10 KB per connection that's ~100 MB of
  socket state before any application data.
- So 50,000 users needs ~5–10 nodes.
- Fanout cost scales with *room* membership, not cluster size, because of the
  per-room channel design. A 20-person document costs the same per keystroke
  whether there are 2 nodes or 20.

Where I expect it to break first, in order:

1. **Redis pub/sub throughput.** Single-threaded. Every cross-node message
   passes through one process. This is the first hard ceiling and I have not
   measured where it is.
2. **Subscribe/unsubscribe churn** at high room-join rates.
3. **The JSON wire format.** Updates are sent as JSON arrays of numbers, roughly
   4× the binary size ([INTERNALS.md §4](INTERNALS.md#4-update-encoding-and-why-not-json)).
   At scale that's 4× the bandwidth and 4× the parse cost, for nothing.
4. **Rooms larger than `MAX_ROOM_CAPACITY` (100).** Joins are rejected outright.

None of these numbers are measured. `benchmarks/RESULTS.md` records what is.

---

## What I'd do next

In the order I'd actually do it:

1. **Binary framing.** Biggest win per unit of work, and it also fixes the
   client/gateway protocol mismatch in `LIMITATIONS.md`.
2. **Redis Streams instead of pub/sub** for fanout, to get at-least-once and
   close the silent-loss window in §3.
3. **Room-affinity routing** using the ring that already exists, so members of a
   room share a node and fanout is only needed at the edges.
4. **Measure Redis pub/sub throughput** and find the real ceiling instead of
   estimating it.

---

## What I don't know yet

- Where the actual per-node connection ceiling is on real hardware.
- The cost of subscribe/unsubscribe churn under realistic join/leave rates.
- Whether the 120s shard TTL and the 30s heartbeat are well-matched under load —
  a node that GC-pauses past its TTL would be evicted from the ring and I don't
  know how it recovers.
- How this behaves with Redis Cluster rather than a single instance. Pub/sub in
  cluster mode has different propagation semantics and none of it is tested.
- Whether room membership in Redis (`room:<id>:members`) is ever cleaned up
  correctly after an ungraceful node death. I suspect it leaks. I haven't
  checked.

---

## Related

- [INTERNALS.md](INTERNALS.md) — CRDT model and persistence
- [LIMITATIONS.md](LIMITATIONS.md) — known defects
- [RUNBOOK.md](RUNBOOK.md) — inspecting shard state in Redis
- `tests/chaos/` — the tests behind the failure-mode claims here
