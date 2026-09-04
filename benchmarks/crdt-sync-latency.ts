/**
 * benchmarks/crdt-sync-latency.ts
 *
 * Measures true CRDT convergence latency: the time from one client applying a
 * local edit to the moment every other client's Y.Doc contains that edit.
 *
 * Unlike benchmarks/websocket-load.js, this runs real Y.Doc instances. Each
 * client is an actual Yjs document wired to ws-gateway over a WebSocket, using
 * the gateway's JSON `doc:update` envelope (see
 * apps/ws-gateway/src/handlers/document.handler.ts). Convergence is verified by
 * comparing Y.Text content, not by trusting a message arrival.
 *
 * Run:
 *   npm run bench:crdt
 *   # or: npx tsx benchmarks/crdt-sync-latency.ts
 *
 * Env:
 *   WS_URL       default ws://localhost:4001
 *   JWT_SECRET   must match the gateway's JWT_SECRET
 *   PEER_COUNTS  comma-separated, default "2,4,8,16"
 *   EDITS        edits per configuration, default 100
 *   WARMUP       discarded warm-up edits per configuration, default 10
 *   TIMEOUT_MS   per-edit convergence timeout, default 5000
 *
 * Output: benchmarks/results/crdt-sync.md
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import * as Y from 'yjs';

// -- Config -----------------------------------------------------------------

const WS_URL = process.env.WS_URL ?? 'ws://localhost:4001';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production';
const PEER_COUNTS = (process.env.PEER_COUNTS ?? '2,4,8,16')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n >= 2);
const EDITS = parseInt(process.env.EDITS ?? '100', 10);
const WARMUP = parseInt(process.env.WARMUP ?? '10', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS ?? '5000', 10);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, 'results', 'crdt-sync.md');

// -- JWT (HS256) ------------------------------------------------------------

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signJwt(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub,
      email: `${sub}@collabspace.local`,
      role: 'member',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

// -- Client -----------------------------------------------------------------

/**
 * One Yjs peer. Owns a Y.Doc, ships local updates to the gateway, and applies
 * remote updates it receives. Deliberately thin: this is the same protocol the
 * web client speaks, minus awareness.
 */
class BenchClient {
  readonly doc = new Y.Doc();
  readonly text: Y.Text;
  private ws!: WebSocket;
  private readonly documentId: string;
  private readonly userId: string;
  /** Set while replaying a remote update, so we do not echo it back. */
  private applyingRemote = false;

  constructor(userId: string, documentId: string) {
    this.userId = userId;
    this.documentId = documentId;
    this.text = this.doc.getText('default');

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (this.applyingRemote || origin === 'remote') return;
      this.send({
        type: 'doc:update',
        documentId: this.documentId,
        update: Array.from(update),
      });
    });
  }

  connect(): Promise<void> {
    const url = `${WS_URL}/?token=${encodeURIComponent(signJwt(this.userId))}`;
    this.ws = new WebSocket(url);

    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`connect timeout for ${this.userId}`)), 10_000);

      this.ws.on('message', (raw: Buffer) => {
        let msg: { type?: string; update?: number[] };
        try {
          msg = JSON.parse(raw.toString()) as typeof msg;
        } catch {
          return;
        }

        if (msg.type === 'connection:established') {
          this.send({
            type: 'room:join',
            roomId: `doc:${this.documentId}`,
            roomType: 'document',
          });
          return;
        }

        if (msg.type === 'room:joined') {
          clearTimeout(timer);
          res();
          return;
        }

        if (msg.type === 'room:join_failed') {
          clearTimeout(timer);
          rej(new Error(`room join failed for ${this.userId}`));
          return;
        }

        if (msg.type === 'doc:update' && Array.isArray(msg.update)) {
          this.applyingRemote = true;
          try {
            Y.applyUpdate(this.doc, new Uint8Array(msg.update), 'remote');
          } finally {
            this.applyingRemote = false;
          }
        }
      });

      this.ws.on('error', (err: Error & { code?: string }) => {
        clearTimeout(timer);
        rej(new Error(err.message || err.code || `WebSocket error for ${this.userId}`));
      });

      // A close before `room:joined` means the upgrade was rejected — almost
      // always a JWT_SECRET mismatch. Surface that rather than hanging.
      this.ws.on('close', (code: number) => {
        clearTimeout(timer);
        rej(new Error(`socket closed before joining room (code ${code})`));
      });
    });
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  close(): void {
    this.doc.destroy();
    if (this.ws) this.ws.close();
  }
}

// -- Statistics -------------------------------------------------------------

interface Stats {
  count: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  // Nearest-rank. With EDITS=100 the p99 is a single sample; that is stated in
  // the output rather than smoothed over.
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

function summarize(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? NaN,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? NaN,
    mean: sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1),
  };
}

// -- Convergence measurement ------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Waits until every peer's Y.Text contains `marker`, polling on the microtask
 * boundary. Returns elapsed ms, or null if TIMEOUT_MS elapsed first.
 *
 * Polling rather than event-driven because "converged" is a property of all N
 * docs at once, not of any single update event. The poll interval (1ms via
 * setTimeout) is the measurement floor; sub-millisecond convergence reads as
 * 0-1ms and that is honest for what this can resolve.
 */
async function waitForConvergence(
  peers: BenchClient[],
  marker: string,
  startedAt: number,
): Promise<number | null> {
  const deadline = startedAt + TIMEOUT_MS;

  for (;;) {
    const allHave = peers.every((p) => p.text.toString().includes(marker));
    if (allHave) return performance.now() - startedAt;
    if (performance.now() > deadline) return null;
    await sleep(1);
  }
}

interface RunResult {
  peerCount: number;
  stats: Stats;
  timeouts: number;
  converged: boolean;
  finalLength: number;
}

async function runConfiguration(peerCount: number): Promise<RunResult> {
  const documentId = `bench-crdt-${peerCount}-${Date.now()}`;
  const peers: BenchClient[] = [];

  for (let i = 0; i < peerCount; i++) {
    peers.push(new BenchClient(`bench-crdt-${peerCount}-${i}`, documentId));
  }

  process.stderr.write(`  connecting ${peerCount} peers to ${documentId}...\n`);
  await Promise.all(peers.map((p) => p.connect()));
  // Let the room membership settle before the first measured edit.
  await sleep(250);

  const samples: number[] = [];
  let timeouts = 0;

  for (let i = 0; i < WARMUP + EDITS; i++) {
    const author = peers[i % peerCount]!;
    // A marker unique per edit, so "converged" is unambiguous.
    const marker = `<m${i}>`;

    const startedAt = performance.now();
    author.text.insert(author.text.length, marker);

    const elapsed = await waitForConvergence(peers, marker, startedAt);

    if (elapsed === null) {
      timeouts++;
    } else if (i >= WARMUP) {
      samples.push(elapsed);
    }

    // Small gap so consecutive edits do not queue behind each other in the
    // gateway's per-connection rate limiter (default 50 msg/s).
    await sleep(25);
  }

  const texts = peers.map((p) => p.text.toString());
  const converged = texts.every((t) => t === texts[0]);
  const finalLength = texts[0]?.length ?? 0;

  peers.forEach((p) => p.close());
  await sleep(100);

  return { peerCount, stats: summarize(samples), timeouts, converged, finalLength };
}

// -- Report -----------------------------------------------------------------

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : 'n/a';
}

function buildMarkdown(results: RunResult[]): string {
  const rows = results
    .map(
      (r) =>
        `| ${r.peerCount} | ${r.stats.count} | ${fmt(r.stats.min)} | ${fmt(r.stats.p50)} | ` +
        `${fmt(r.stats.p95)} | ${fmt(r.stats.p99)} | ${fmt(r.stats.max)} | ${fmt(r.stats.mean)} | ` +
        `${r.timeouts} | ${r.converged ? 'yes' : 'NO'} |`,
    )
    .join('\n');

  return `# CRDT Sync Latency

Generated: ${new Date().toISOString()}
Script: \`benchmarks/crdt-sync-latency.ts\`

## What is measured

Time from \`ytext.insert()\` on one peer to the moment **every** peer's \`Y.Text\`
contains that insert. Real \`Y.Doc\` instances, real \`Y.applyUpdate\`, real
WebSocket transport through ws-gateway. Convergence is checked by reading
document content, not by counting messages.

Each configuration runs ${WARMUP} discarded warm-up edits followed by ${EDITS}
measured edits, round-robin across the peers, with a 25ms gap between edits.

## Environment

- Gateway: \`${WS_URL}\`
- Peer counts: ${PEER_COUNTS.join(', ')}
- Measured edits per configuration: ${EDITS} (plus ${WARMUP} warm-up)
- Convergence timeout: ${TIMEOUT_MS}ms
- Hardware: TODO — fill in from benchmarks/RESULTS.md

## Results (milliseconds)

| Peers | Samples | Min | p50 | p95 | p99 | Max | Mean | Timeouts | All docs identical |
|------:|--------:|----:|----:|----:|----:|----:|-----:|---------:|:------------------:|
${rows}

"All docs identical" compares the final \`Y.Text\` string across every peer after
the run. Anything other than \`yes\` is a correctness bug, not a performance
number, and should be investigated before the latency column is quoted.

## How to reproduce

\`\`\`bash
# 1. Start Redis and ws-gateway
docker compose -f infra/docker/docker-compose.yml up -d redis
cd apps/ws-gateway && npm run dev

# 2. In another shell, from the repo root
npm run bench:crdt

# Vary the shape of the run
PEER_COUNTS=2,4,8,16,32 EDITS=500 npm run bench:crdt
\`\`\`

## Limitations / what I don't know yet

- **Single machine.** Every peer and the gateway share one host, so these
  numbers contain no network RTT. On a real deployment, add the client-to-edge
  round trip to every figure here. I have not yet run this across a WAN.
- **Measurement floor is ~1ms.** Convergence is detected by polling with a 1ms
  \`setTimeout\`, and Node's timer resolution makes anything faster than that
  indistinguishable. Sub-millisecond convergence reports as 0-1ms.
- **p99 is one sample** at the default \`EDITS=100\`. Treat it as an anecdote
  unless you raise \`EDITS\`.
- **Sequential edits only.** Each edit converges before the next is issued.
  This does not measure convergence under concurrent conflicting edits, which
  is where CRDT merge cost actually shows up. Concurrent-edit *correctness* is
  covered by \`tests/integration/crdt-convergence.test.ts\`; concurrent-edit
  *latency* is not yet measured anywhere. That is a real gap.
- **Appends only.** Every edit inserts at the end of the text. Inserts in the
  middle of a long document traverse more of the Yjs item list; that cost is
  not captured here.
- **No persistence in the path.** The gateway forwards to Kafka only if a
  producer is wired up; in a local run it is usually not, so these numbers
  exclude the write to Postgres.
`;
}

// -- Main -------------------------------------------------------------------

async function main(): Promise<void> {
  process.stderr.write(`CRDT sync latency benchmark against ${WS_URL}\n`);

  const results: RunResult[] = [];

  for (const peerCount of PEER_COUNTS) {
    process.stderr.write(`\n[${peerCount} peers]\n`);
    try {
      const result = await runConfiguration(peerCount);
      results.push(result);
      process.stderr.write(
        `  p50=${fmt(result.stats.p50)}ms p95=${fmt(result.stats.p95)}ms ` +
          `timeouts=${result.timeouts} converged=${result.converged}\n`,
      );
    } catch (err) {
      process.stderr.write(`  FAILED: ${(err as Error).message}\n`);
      throw err;
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, buildMarkdown(results), 'utf8');
  process.stderr.write(`\nWrote ${OUT_PATH}\n`);

  const anyDivergent = results.some((r) => !r.converged);
  if (anyDivergent) {
    process.stderr.write('\nERROR: at least one configuration did not converge.\n');
    process.exit(1);
  }
}

main().catch((err: Error) => {
  process.stderr.write(`\nBenchmark failed: ${err.message}\n`);
  process.stderr.write('Is ws-gateway running on ' + WS_URL + ' with a matching JWT_SECRET?\n');
  process.exit(1);
});
