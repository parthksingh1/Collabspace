# benchmarks/

Reproducible performance measurements for CollabSpace. Three scripts, one
results file, no marketing numbers.

| File | What it measures | Run with |
|---|---|---|
| `websocket-load.js` | ws-gateway under 0 → 5000 concurrent WebSocket connections | `npm run bench:ws` |
| `crdt-sync-latency.ts` | True Y.Doc convergence time across 2/4/8/16 real peers | `npm run bench:crdt` |
| `api-throughput.js` | REST latency and RPS at 100/500/1000 concurrent users | `npm run bench:api` |
| [`RESULTS.md`](RESULTS.md) | Recorded numbers, methodology, and README-claim audit | — |

`lib/` holds two helpers: an HS256 JWT signer (k6 cannot import `jsonwebtoken`)
and a set of real Y.js update payloads captured offline (k6's Goja runtime
cannot import `yjs`).

## Prerequisites

- **k6** for the two `.js` scripts — <https://grafana.com/docs/k6/latest/set-up/install-k6/>
- **Node 20+** for the `.ts` script (runs under `tsx`, already a dev dependency)
- Redis and the services under test running locally. See
  [RESULTS.md § Methodology](RESULTS.md#methodology).

`JWT_SECRET` must match the value the services are running with, or every
connection will be rejected at the upgrade handshake with `401 INVALID_TOKEN`.

## What these benchmarks do not do

Read this before quoting anything from here.

- **Everything runs over loopback.** No network RTT is included in any number.
- **The load generator shares a machine with the system under test.** Above a
  few thousand VUs you are measuring contention, not capacity.
- **`websocket-load.js` replays pre-captured CRDT bytes**; it does not run a
  CRDT. It measures gateway fanout. Convergence correctness is tested in
  `tests/integration/`, not here.
- **`websocket-load.js`'s sync latency is a proxy**, not a round trip. The
  reason is documented at the bottom of that file, and repeated in RESULTS.md,
  because it is the single easiest number here to misquote.
- **Nothing measures concurrent conflicting edits.** That is the interesting
  CRDT case and it is a real gap.
- **Nothing measures the AI service, Kafka lag, or Postgres under load.**

If a number is not in `RESULTS.md`, it has not been measured.
