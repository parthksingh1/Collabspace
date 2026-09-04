# Benchmark Results

**Status: harness written, numbers not yet collected.**

Every "Measured" cell below reads `not yet run`. That is deliberate. I would
rather this file say nothing than say something I have not measured. When I run
the benchmarks, I fill the cells in from the JSON the scripts emit — I do not
type numbers in by hand.

Last run: _never_
Last updated: 2026-09-04

---

## Hardware

The development machine, recorded 2026-09-04. Re-record this if you run the
benchmarks anywhere else — numbers are meaningless without it.

| Field | Value |
|---|---|
| CPU | Intel Core i5-10300H @ 2.50GHz, 4C/8T |
| RAM | 7.8 GB |
| Disk | SSD |
| OS | Windows 11 Home Insider Preview, build 10.0.26340 |
| Node.js | v24.15.0 |
| Docker | 28.1.1 (build 4eba377) |
| k6 | Not installed — this is why the load-test rows below are unmeasured |
| Network | Loopback only — all benchmarks run against `localhost` |

**This is a 4-core laptop with 8 GB of RAM.** That matters more than the rest of
the table: the load generator and the system under test would be competing for
four physical cores, so a 5000-VU WebSocket run on this machine would measure
contention rather than gateway capacity. Any figure produced here would be a
lower bound on what the code can do and an upper bound on nothing. The harness is
built to run somewhere better.

**The single most important caveat on this page:** every number here is from one
laptop, over loopback, with the load generator and the system under test
competing for the same cores. It is a *lower bound on latency* and an
*upper bound on nothing*. It tells you the code is not pathologically slow. It
does not tell you what a real deployment does.

---

## Methodology

### Prerequisites

```bash
# k6 (load generator)
winget install k6              # Windows
brew install k6                # macOS
# https://grafana.com/docs/k6/latest/set-up/install-k6/

node --version                 # must be >= 20
```

### Reproducing

```bash
git clone <repo> && cd collabspace
cp .env.example .env
npm install

# Bring up the dependencies the benchmarks actually touch.
docker compose -f infra/docker/docker-compose.yml up -d redis postgres

# Start the services under test.
npm run dev            # or start ws-gateway / api-gateway / doc-service individually
```

Then, one at a time, from a shell that is **not** doing anything else:

```bash
npm run bench:ws       # -> benchmarks/results/websocket-load.json
npm run bench:crdt     # -> benchmarks/results/crdt-sync.md
npm run bench:api      # -> benchmarks/results/api-throughput.json
```

### Rules I hold myself to

1. **One benchmark at a time.** Running two concurrently means both are
   measuring contention with each other.
2. **Discard the first run** after a service start. The JIT has not warmed up and
   connection pools are cold.
3. **Record failures.** If a k6 threshold trips, the failing number goes in this
   file. Thresholds do not get loosened to make a run go green.
4. **Never hand-type a number.** Everything in the tables below is copied from
   the JSON/markdown the scripts write.
5. **State the load generator's own limits.** If k6's CPU is pegged, the run is
   measuring k6. Check `top` during the run; note it here if so.

---

## Results

### 1. WebSocket load (`benchmarks/websocket-load.js`)

Ramp 0 → 5000 VUs over 2 minutes, each in one of 250 document rooms, one Y.js
update every 500ms.

| Metric | Measured | Source field in `results/websocket-load.json` |
|---|---|---|
| Peak concurrent connections held | not yet run | `config.targetVus` reached without errors |
| Connection success rate | not yet run | `connections.successRate` |
| Connect time p50 / p95 / p99 (ms) | not yet run | `connections.connectTimeMs` |
| Room join time p95 (ms) | not yet run | `connections.joinTimeMs.p95` |
| Sync latency p50 / p95 / p99 (ms) | not yet run | `syncLatencyMs` |
| Messages sent/sec at peak | not yet run | `throughput.sentPerSec` |
| Messages received/sec at peak | not yet run | `throughput.receivedPerSec` |

> **`syncLatencyMs` is a proxy, not a round trip.** The gateway does not echo a
> client's own update back to it, and k6 gives no way to correlate a send with
> the peer message it caused. The metric is "time from my last send until the
> next peer update arrived", bounded above by the 500ms send interval. It tracks
> fanout delay under load. It is not the number to quote for "CRDT sync
> latency" — use the next section for that.

### 2. CRDT convergence latency (`benchmarks/crdt-sync-latency.ts`)

Real `Y.Doc` peers over ws-gateway. Time from `insert()` on one peer to every
peer's `Y.Text` containing the edit.

| Peers | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Timeouts | All docs identical |
|------:|---------:|---------:|---------:|---------:|---------:|:------------------:|
| 2  | not yet run | — | — | — | — | — |
| 4  | not yet run | — | — | — | — | — |
| 8  | not yet run | — | — | — | — | — |
| 16 | not yet run | — | — | — | — | — |

Full output, including the environment block, lands in
[`results/crdt-sync.md`](results/crdt-sync.md).

The "All docs identical" column is the one that matters. A fast benchmark with a
`NO` in that column is a correctness bug wearing a performance number as a
disguise.

### 3. REST API throughput (`benchmarks/api-throughput.js`)

| Concurrency | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Error rate |
|------------:|----:|---------:|---------:|---------:|-----------:|
| 100  | not yet run | — | — | — | — |
| 500  | not yet run | — | — | — | — |
| 1000 | not yet run | — | — | — | — |

Per-endpoint breakdown (fill from `results/api-throughput.json` → `endpoints`):

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|
| `POST /api/auth/login` | not yet run | — | — |
| `POST /api/documents` | not yet run | — | — |
| `GET /api/documents` | not yet run | — | — |
| `PUT /api/documents/:id` | not yet run | — | — |

To get a clean per-level table, run three times — `LEVELS=100`, `LEVELS=500`,
`LEVELS=1000` — and copy each JSON out before the next overwrites it. A single
combined run aggregates all three levels into one set of percentiles, which is
not what the table above wants.

---

## README claims vs. measurements

This is the section that exists to keep me honest. Every quantitative claim in
the README is listed here with its current evidence status.

| README claim | Where it appears | Evidence status | Notes |
|---|---|---|---|
| 50,000+ concurrent users | Scale Targets, "Why CollabSpace" table | **Unverified — design target** | Nothing here has been run above the harness's 5000-VU ceiling, and that ceiling is the load generator's, not the gateway's. 50K is arithmetic from the sharding design (see [SHARDING.md](../docs/SHARDING.md)), not a measurement. |
| Real-time latency &lt;30ms | Scale Targets, "Why CollabSpace" table | **Unverified** | The closest real measurement is CRDT convergence (section 2), which is a different quantity — it includes fanout to *all* peers, not one hop. Loopback numbers would also flatter this claim badly. |
| API response time p95 &lt;200ms | Scale Targets | **Harness exists, not yet run** | Encoded as a k6 threshold in `api-throughput.js`, so a run either passes it or fails visibly. |
| Document sync &lt;50ms | Scale Targets | **Harness exists, not yet run** | Section 2 measures this directly. |
| 99.95% availability | Scale Targets | **Unverifiable here** | Availability is a property of a deployment observed over months. There is no production deployment. This is an aspiration and should be read as one. |
| Multi-region, 3+ regions | Scale Targets | **Not implemented** | The Terraform provisions a single regional GKE cluster. See [LIMITATIONS.md](../docs/LIMITATIONS.md). |
| 356+ production-ready files | Monorepo Structure | **True as a file count, editorial as a claim** | `git ls-files \| wc -l` will confirm the count. "Production-ready" is a judgement, not a measurement, and I would not defend it for every file. |
| Code execution sandbox: 256MB / 10s / no network | Key Features | **Configured, not benchmarked** | The limits are set in the Docker run args. I have not run an escape or resource-exhaustion test against them. Treat as unaudited. |

**Gaps I am flagging rather than papering over:**

- The two headline numbers (50K users, &lt;30ms) are the two with the weakest
  evidence. They are design targets derived from architecture, and the README
  now says so.
- There is no measurement of concurrent *conflicting* edits, which is the
  interesting CRDT case. Correctness there is tested
  (`tests/integration/crdt-convergence.test.ts`); latency there is not measured.
- Nothing here measures the AI service, Kafka lag, or Postgres under load.
- Everything is loopback. Zero of these numbers include real network RTT.

---

## Limitations / what I don't know yet

- **I do not know where the gateway's actual connection ceiling is.** A single
  k6 process on a laptop will run out of event loop before ws-gateway runs out
  of capacity. Finding the real ceiling needs distributed load generation
  (`k6 --execution-segment` across several machines) and I have not done it.
- **I do not know how the consistent-hash ring behaves under churn at scale.**
  `tests/chaos/ws-node-failure.test.ts` kills one node with 100 clients
  attached. That is a smoke test, not a rebalancing study.
- **I do not know the Postgres snapshot cost under write pressure.** The
  persistence path is debounced and I have not measured what happens when the
  debounce window is saturated.
- **I do not know how much of the measured latency is Node's timer resolution.**
  The convergence benchmark polls at 1ms; anything faster is invisible to it.
- **These numbers will not generalise to cloud hardware.** Shared-tenancy vCPUs
  behave nothing like a laptop under sustained load.
