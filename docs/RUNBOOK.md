# Runbook

Operational procedures for CollabSpace: restarting services safely, debugging a
stuck or divergent document, and the failure modes I've actually hit.

Written for whoever is on the other end of a "the document is frozen" message,
including future me.

> **Scope warning.** This system has never run in production. These procedures
> are derived from the code and from the chaos tests in `tests/chaos/`, not from
> production incidents. Where a step is untested, it says so.

---

## Quick reference

| Symptom | Jump to |
|---|---|
| Document frozen for one user | [§4.1](#41-one-user-is-stuck-everyone-else-is-fine) |
| Two users see different text | [§4.2](#42-two-users-see-different-content-divergence) |
| Everyone in a document is stuck | [§4.3](#43-everyone-in-one-document-is-stuck) |
| Container says unhealthy but works | [§5.1](#51-a-container-is-unhealthy-but-responds-fine) |
| Edits stopped persisting | [§5.3](#53-edits-are-syncing-but-not-persisting) |
| Need to restart a service | [§3](#3-restarting-services-without-losing-data) |

---

## 1. Where state lives

You cannot debug this system without knowing which copy of the truth you're
looking at.

| State | Lives in | Survives service restart? | Survives Redis loss? |
|---|---|---|---|
| Document content (authoritative) | Postgres `document_updates` + `document_snapshots` | Yes | Yes |
| Document content (live) | Each client's in-memory `Y.Doc` | Yes (clients keep it) | Yes |
| Document content (cache) | Redis `doc:<id>:state`, 300s TTL | Yes | No — rebuilt on read |
| Up to 1s of recent edits | doc-service batch buffer | **No** | n/a |
| Room membership | Gateway process memory + `room:<id>:members` | No | No |
| Shard registry | Redis `shards:active`, `shard:<id>` | No | No — heals in one heartbeat |
| Presence / cursors | Redis, short TTL | No | No |

**The key insight for most incidents:** clients hold the document. A gateway
restart is nearly always safe because every connected client can re-supply the
state. The dangerous case is when *no* client holds it.

---

## 2. Health and log basics

### Health endpoints

```bash
curl -s localhost:4001/health | jq   # ws-gateway
curl -s localhost:4000/health | jq   # api-gateway
curl -s localhost:4003/health | jq   # doc-service
```

ws-gateway returns the fields that matter most:

```json
{
  "status": "healthy",
  "shard": "shard-1",
  "connections": 1247,
  "rooms": 89,
  "fanoutSubscriptions": 89
}
```

**`fanoutSubscriptions` should equal `rooms`.** A persistent gap means this node
is not subscribed to some rooms' cross-shard channels, so its clients are not
receiving remote updates — documents are silently splitting. That is the single
most useful number on this endpoint.

### Logs across services

```bash
# All services, follow
docker compose -f infra/docker/docker-compose.yml logs -f

# One service, last 200 lines
docker compose -f infra/docker/docker-compose.yml logs --tail 200 ws-gateway

# Follow several at once
docker compose -f infra/docker/docker-compose.yml logs -f ws-gateway doc-service

# Grep across everything for one document
docker compose -f infra/docker/docker-compose.yml logs --no-color \
  | grep "doc_abc123"
```

Logs are structured JSON, so `jq` works:

```bash
docker compose -f infra/docker/docker-compose.yml logs --no-color ws-gateway \
  | grep '^{' | jq -c 'select(.level == "error")'
```

**Correlation:** `documentId` and `userId` appear in most document-path log
lines, and `socketId` in gateway lines. There is no cross-service trace id on the
WebSocket path — Jaeger covers HTTP through api-gateway only. Correlating a
keystroke from browser to Postgres means grepping `documentId` in each service
separately. That's a real gap.

### Metrics

```bash
curl -s localhost:4001/metrics | grep -E "^ws_(active_connections|cross_shard)"
```

The cross-shard counters are the ones to watch:

```
ws_cross_shard_published_total{shard="shard-1"}   # this node published
ws_cross_shard_received_total{origin_shard="..."} # this node received
ws_cross_shard_dropped_total{reason="..."}        # should stay at 0
```

**If `published` is climbing on every node but `received` is flat, cross-node
fanout is broken and documents are diverging.** Any nonzero `dropped` needs
investigating.

---

## 3. Restarting services without losing data

### 3.1 ws-gateway

**Safe.** It holds no authoritative state. Clients reconnect and re-sync from a
state vector.

```bash
docker compose -f infra/docker/docker-compose.yml restart ws-gateway
```

The process handles `SIGTERM` (`shutdown()` in `index.ts`): it stops the rate
limiter, closes connections, tears down fanout subscriptions, deregisters the
shard, and closes Redis, with a 10s forced exit.

With more than one node, do them **one at a time** and wait for
`fanoutSubscriptions` to recover before the next:

```bash
docker compose restart ws-gateway-1
until curl -sf localhost:4101/health | jq -e '.status == "healthy"' >/dev/null; do
  sleep 1
done
```

Restarting all nodes simultaneously means every client reconnects at once. That
reconnect storm has not been tested above 100 clients.

### 3.2 doc-service — the one that can lose data

**Not automatically safe.** doc-service holds up to `UPDATE_BATCH_WINDOW_MS`
(1000ms) of un-persisted edits in `CrdtPersistenceService.batches`.

`SIGTERM` handling flushes pending batches, so a **graceful** stop is safe. A
`SIGKILL` or an OOM kill is not.

```bash
# Good: graceful, gives the flush time to complete
docker compose stop -t 30 doc-service && docker compose start doc-service

# Bad: kills the process, loses the current batch
docker kill collabspace-doc-service
```

Even after a hard kill, the edits usually survive — connected clients still hold
them and re-push on the next update. They're lost only if every client also
disconnected. Don't rely on that.

### 3.3 Redis

**Survivable but disruptive.** Verified in `tests/chaos/redis-restart.test.ts`:
gateways survive, document content is unaffected, the shard registry heals within
one shard heartbeat (`SHARD_HEARTBEAT_INTERVAL_MS`, default 30s).

What you lose: all presence and cursors, the `doc:<id>:state` cache (rebuilt on
next read), and **any cross-shard message published during the outage**, with no
redelivery ([SHARDING.md](SHARDING.md#delivery-guarantees-at-most-once)).

```bash
docker compose restart redis
# Confirm the registry healed:
docker compose exec redis redis-cli SMEMBERS shards:active
```

If `shards:active` is still empty after ~60s, the heartbeat is not running —
check gateway logs for `Shard heartbeat failed`.

### 3.4 Postgres

Requires a maintenance window. doc-service has no write-ahead buffer beyond the
1s batch, so writes during the outage fail and are logged, not retried. Stop
doc-service first:

```bash
docker compose stop -t 30 doc-service
docker compose restart postgres
# wait for readiness
until docker compose exec -T postgres pg_isready -U collabspace; do sleep 1; done
docker compose start doc-service
```

---

## 4. Debugging a stuck document

### 4.1 One user is stuck, everyone else is fine

Almost always that user's connection, not the document.

```bash
# 1. Is their socket actually connected? Check the node they're on.
curl -s localhost:4001/health | jq '.connections'

# 2. Are they in the room?
docker compose exec redis redis-cli SMEMBERS "room:doc:<documentId>:members"

# 3. Their presence entry
docker compose exec redis redis-cli --scan --pattern "presence:<userId>*"
```

In the browser console, the provider's state is the fastest check:

```js
// Is the socket open and did it sync?
// (via the useCollaboration hook's returned state)
```

**Most common cause:** an expired JWT. The upgrade is rejected with
`TOKEN_EXPIRED` and, depending on client handling, may retry silently forever.
Check gateway logs:

```bash
docker compose logs ws-gateway | grep -i "auth failed"
```

**Resolution:** have them reload. It re-mints a token and forces a fresh sync
handshake.

### 4.2 Two users see different content (divergence)

This is the serious one. Work through it in order — the causes are ranked by how
often they turn out to be responsible.

**Step 1 — are they on different gateway nodes?**

```bash
for port in 4101 4102; do
  echo "node :$port"
  curl -s localhost:$port/health | jq '{shard, rooms, fanoutSubscriptions}'
done
```

If `fanoutSubscriptions < rooms` on either node, cross-shard fanout is the
cause. Check the counters:

```bash
curl -s localhost:4101/metrics | grep ws_cross_shard
curl -s localhost:4102/metrics | grep ws_cross_shard
```

`published` rising with `received` flat on the peer means messages aren't
crossing. Check Redis connectivity from the gateway:

```bash
docker compose exec ws-gateway-1 sh -c 'nc -z redis 6379 && echo reachable'
docker compose exec redis redis-cli PUBSUB CHANNELS "room:*"
```

That last command lists the room channels with live subscribers. **If a room
your users are in isn't listed, no node is subscribed to it** and fanout for
that room is dead.

**Step 2 — inspect the actual Y.Doc state.**

The authoritative content is in Postgres. Reconstruct it:

```bash
docker compose exec postgres psql -U collabspace -d collabspace -c "
  SELECT d.id, d.version,
         (SELECT COUNT(*) FROM document_updates u WHERE u.document_id = d.id) AS updates,
         (SELECT MAX(version) FROM document_snapshots s WHERE s.document_id = d.id) AS snapshot_version
  FROM documents d WHERE d.id = '<documentId>';
"
```

To see what the server thinks the document says, use the CRDT benchmark client
as an inspection tool — it connects, syncs, and prints content:

```bash
PEER_COUNTS=2 EDITS=1 WARMUP=0 WS_URL=ws://localhost:4001 \
  npx tsx benchmarks/crdt-sync-latency.ts
```

**Step 3 — compare state vectors.** Two docs with identical state vectors that
render differently would indicate a Yjs bug, which is very unlikely. Different
state vectors means one side is missing updates, which is a delivery problem —
go back to step 1.

### 4.3 Everyone in one document is stuck

Check whether the room exists at all:

```bash
docker compose exec redis redis-cli HGETALL "room:doc:<documentId>:meta"
docker compose exec redis redis-cli SCARD "room:doc:<documentId>:members"
```

**If `memberCount` is at `MAX_ROOM_CAPACITY` (default 100), joins are being
rejected outright** with `ROOM_FULL`. There is no queue and no soft degradation.
Grep for it:

```bash
docker compose logs ws-gateway | grep "Room at capacity"
```

**Known leak:** after an ungraceful node death, `room:<id>:members` may retain
entries for sockets that no longer exist, inflating the count. This is suspected,
not confirmed (see [LIMITATIONS.md §7](LIMITATIONS.md#7-what-i-dont-know-yet)).
If you hit it, clearing the stale set is safe — it's derived state, rebuilt as
clients rejoin:

```bash
docker compose exec redis redis-cli DEL "room:doc:<documentId>:members"
```

---

## 5. Force-reconciling a divergent document

Ordered from least to most destructive. Stop as soon as one works.

### 5.1 A container is unhealthy but responds fine

Not a document problem, but it's the most common false alarm. The compose health
checks use `wget --spider`, which sends HEAD, and the services only handle GET —
so healthy services are reported unhealthy
([LIMITATIONS.md §1.4](LIMITATIONS.md#14-every-service-reports-unhealthy-in-docker-while-working-fine)).

```bash
# Confirm it's the false alarm and not a real outage:
curl -s localhost:4001/health   # works?  → health check bug, ignore
```

### 5.2 Level 1 — drop the Redis cache (safe)

A stale `doc:<id>:state` cache is the most benign cause. Deleting it forces
reconstruction from snapshot + updates on next read.

```bash
docker compose exec redis redis-cli DEL "doc:<documentId>:state"
```

No data loss: it's a cache with a 300s TTL.

### 5.3 Edits are syncing but not persisting

Users see each other fine, but a reload loses recent work. The Kafka leg has
failed. Critically, `persistUpdateToKafka` **logs and continues** on failure — so
edits keep flowing between peers and silently stop being saved, with no alert.

```bash
# Is the topic being written?
docker compose exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic document-updates --max-messages 5 --timeout-ms 10000

# Is the consumer keeping up?
docker compose exec kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group doc-service-group

# Errors on either side
docker compose logs ws-gateway  | grep -i "Failed to publish document update"
docker compose logs doc-service | grep -i "Failed to persist"
```

Growing consumer lag means doc-service is behind; restart it gracefully (§3.2).
Nothing in the topic at all means the gateway's producer isn't wired up — check
whether `setKafkaProducer()` was ever called.

### 5.4 Level 2 — force a client re-sync (safe)

Have every user in the document reload. Each reconnect sends `doc:sync:step1`
with its state vector and pulls whatever it's missing. Because Yjs merges are
commutative and idempotent, this converges on the union of everyone's state and
cannot lose an edit anyone holds.

This resolves most divergence, and it's why "have you tried reloading" is
legitimate advice here rather than an evasion.

### 5.5 Level 3 — rebuild from Postgres (last resort, lossy)

**Only after 5.2 and 5.4 have failed, and only with users off the document.**
This discards anything that exists solely in a client's memory.

```bash
# 1. Get all users out. Verify the room is empty:
docker compose exec redis redis-cli SCARD "room:doc:<documentId>:members"   # want 0

# 2. Clear the cache
docker compose exec redis redis-cli DEL "doc:<documentId>:state"

# 3. Inspect what Postgres holds BEFORE changing anything
docker compose exec postgres psql -U collabspace -d collabspace -c "
  SELECT version, LENGTH(update_data) AS bytes, user_id, created_at
  FROM document_updates WHERE document_id = '<documentId>'
  ORDER BY version DESC LIMIT 20;
"

# 4. Take a backup you can restore from
docker compose exec postgres pg_dump -U collabspace -d collabspace \
  -t document_updates -t document_snapshots \
  --where="document_id='<documentId>'" > /tmp/doc-backup-$(date +%s).sql
```

Next reader reconstructs from snapshot + updates. If a *specific corrupt update*
is the problem, deleting that row and letting reconstruction skip it is possible
— but Yjs updates reference each other, so removing one mid-history can leave
later updates unapplyable. Restore to a snapshot boundary instead:

```sql
-- Roll back to the last snapshot. LOSES everything after it.
DELETE FROM document_updates
WHERE document_id = '<documentId>'
  AND version > (SELECT MAX(version) FROM document_snapshots
                 WHERE document_id = '<documentId>');
```

**Untested procedure.** I have not had to run this against a real corrupt
document. Take the backup.

---

## 6. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `error:parse` flooding gateway logs | A client sending binary frames to a JSON-only server ([LIMITATIONS §1.1](LIMITATIONS.md#11-the-web-client-and-ws-gateway-speak-different-protocols)) | Known defect; no runtime fix |
| Container unhealthy, service responds | `wget --spider` HEAD vs GET-only handler | §5.1 — health check bug |
| `shards:active` empty after Redis restart | Heartbeat not running | Check gateway logs; restart the gateway |
| Users on different nodes diverge | Cross-shard fanout down | §4.2 step 1 |
| `ROOM_FULL` on join | At `MAX_ROOM_CAPACITY`, or a leaked member set | §4.3 |
| Ghost cursors that never clear | Awareness timeout vs gateway heartbeat mismatch | Reload; underlying interaction untraced |
| Edits sync but don't persist | Kafka leg failed silently | §5.3 |
| WS upgrade rejected, `INVALID_TOKEN` | `JWT_SECRET` mismatch between services | Confirm all services share one secret |
| Service starts with a known-public key | `JWT_SECRET` unset, defaulting to the dev value | Set it; the default is in the repo |
| `docker compose up` stalls | A dependency stuck unhealthy from the HEAD bug | §5.1 |

---

## 7. Escalation

There is no on-call rotation, no SLA and no paging. This is a personal project.

If you're reading this because something is broken and you're not me: the
fastest safe action is almost always **§5.4 — get everyone to reload**. It's
non-destructive and resolves most sync problems. Do not go to §5.5 without a
backup.

---

## Related

- [INTERNALS.md](INTERNALS.md) — what the state actually is
- [SHARDING.md](SHARDING.md) — cross-node behaviour and failure modes
- [LIMITATIONS.md](LIMITATIONS.md) — known defects referenced above
- `tests/chaos/` — the tests that verified the recovery behaviour here
