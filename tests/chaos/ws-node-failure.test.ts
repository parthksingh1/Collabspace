/**
 * Chaos test: kill a ws-gateway node mid-session.
 *
 * Topology (tests/chaos/docker-compose.chaos.yml):
 *
 *     100 clients, sharded by index
 *       ├── 50 → chaos-ws-1 (SHARD_ID=chaos-shard-1, :4101)
 *       └── 50 → chaos-ws-2 (SHARD_ID=chaos-shard-2, :4102)
 *                       │
 *                    chaos-redis
 *
 * Sequence:
 *   1. Bring both nodes up, connect 100 clients split across them.
 *   2. Everyone edits; assert the room is healthy before we break anything.
 *   3. SIGKILL node 1 — not a graceful stop, a hard kill, because "the process
 *      exited cleanly and drained its connections" is the easy case.
 *   4. Assert: clients that were on node 1 reconnect (to node 2), no committed
 *      edit is lost, and sync resumes for everyone.
 *
 * What this proves and what it does not is spelled out at the bottom. Read that
 * before quoting this test as evidence of anything.
 *
 * Run: npm run test:chaos
 * Requires: a running Docker daemon. Skips without one; fails when REQUIRE_INFRA=1.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  YjsTestClient,
  waitForConvergence,
  convergenceReport,
} from '../helpers/yjs-client.js';
import {
  requireDockerOrSkip,
  startTopology,
  stopTopology,
  killContainer,
  startContainer,
  waitForGateway,
  waitForGatewayDown,
  gatewayHealth,
  GATEWAY_URLS,
  GATEWAY_HEALTH_URLS,
  CHAOS_WS1_PORT,
  CHAOS_WS2_PORT,
} from '../helpers/compose.js';
import { delay, waitFor } from '../helpers/infra.js';

const CLIENT_COUNT = parseInt(process.env.CHAOS_CLIENTS ?? '100', 10);

describe('ws-gateway node failure', { timeout: 900_000 }, async () => {
  const gate = await requireDockerOrSkip();
  let topologyUp = false;

  before(async () => {
    if (gate.skip) return;
    await startTopology();
    topologyUp = true;
  });

  after(async () => {
    if (topologyUp) await stopTopology();
  });

  test(
    'killing one node: its clients reconnect, no data is lost, sync resumes',
    gate,
    async (t) => {
      const documentId = `chaos-node-failure-${Date.now()}`;
      const clients: YjsTestClient[] = [];

      t.after(() => clients.forEach((c) => c.destroy()));

      // -- 1. Connect 100 clients, sharded across both nodes ----------------

      for (let i = 0; i < CLIENT_COUNT; i++) {
        const primary = i % 2 === 0 ? 0 : 1;
        clients.push(
          new YjsTestClient(`chaos-client-${i}`, documentId, {
            // Failover pool, primary node first. See the caveat about load
            // balancers at the bottom of this file.
            urls: [GATEWAY_URLS[primary]!, GATEWAY_URLS[1 - primary]!],
            autoReconnect: true,
            reconnectDelayMs: 250,
          }),
        );
      }

      // Connect in batches; 100 simultaneous handshakes against a cold tsx
      // process is a thundering herd that tests nothing interesting.
      for (let i = 0; i < clients.length; i += 20) {
        await Promise.all(clients.slice(i, i + 20).map((c) => c.connect(20_000)));
      }
      await delay(1000);

      const node1Clients = clients.filter((_, i) => i % 2 === 0);
      const node2Clients = clients.filter((_, i) => i % 2 !== 0);

      const health1 = await gatewayHealth(CHAOS_WS1_PORT);
      const health2 = await gatewayHealth(CHAOS_WS2_PORT);
      assert.ok(health1, 'node 1 health endpoint did not respond');
      assert.ok(health2, 'node 2 health endpoint did not respond');
      assert.ok(
        health1.connections > 0 && health2.connections > 0,
        `clients did not spread across both nodes: node1=${health1.connections} node2=${health2.connections}`,
      );

      // -- 2. Everyone edits; establish a healthy baseline -------------------

      clients.forEach((c, i) => c.append(`<pre-${i}>`));

      assert.ok(
        await waitForConvergence(clients, 30_000),
        `clients did not converge before the kill:\n${convergenceReport(clients.slice(0, 4))}`,
      );

      const contentBeforeKill = clients[0]!.content;
      assert.ok(
        contentBeforeKill.includes('<pre-0>') && contentBeforeKill.includes(`<pre-${CLIENT_COUNT - 1}>`),
        'baseline edits did not all land',
      );

      // -- 3. Hard-kill node 1 ----------------------------------------------

      await killContainer('ws-gateway-1');
      assert.ok(
        await waitForGatewayDown(GATEWAY_HEALTH_URLS[0]!, 30_000),
        'node 1 still answering /health after SIGKILL',
      );

      // -- 4a. Clients on the dead node reconnect ---------------------------

      const reconnected = await waitFor(
        () => node1Clients.every((c) => c.joined),
        120_000,
        250,
      );
      const stragglers = node1Clients.filter((c) => !c.joined).map((c) => c.userId);
      assert.ok(
        reconnected,
        `${stragglers.length}/${node1Clients.length} clients never reconnected: ${stragglers.slice(0, 5).join(', ')}`,
      );

      // They should have landed on the surviving node.
      const survivorHealth = await gatewayHealth(CHAOS_WS2_PORT);
      assert.ok(survivorHealth, 'surviving node stopped answering /health');
      assert.ok(
        survivorHealth.connections >= CLIENT_COUNT * 0.9,
        `surviving node holds only ${survivorHealth.connections} of ${CLIENT_COUNT} clients`,
      );

      // -- 4b. No data loss -------------------------------------------------

      // Every edit committed before the kill must still be present. This is the
      // assertion that matters: a reconnect that silently resets the document
      // would satisfy every liveness check above and still be a catastrophe.
      for (const c of node1Clients.slice(0, 10)) {
        for (let i = 0; i < CLIENT_COUNT; i += 10) {
          assert.ok(
            c.content.includes(`<pre-${i}>`),
            `${c.userId} lost pre-kill edit <pre-${i}> across the reconnect`,
          );
        }
      }

      // -- 4c. Sync resumes -------------------------------------------------

      clients.forEach((c, i) => c.append(`<post-${i}>`));

      assert.ok(
        await waitForConvergence(clients, 60_000),
        `clients did not converge after node failure:\n${convergenceReport(clients.slice(0, 4))}`,
      );

      const finalContent = clients[0]!.content;
      for (let i = 0; i < CLIENT_COUNT; i += 7) {
        assert.ok(finalContent.includes(`<pre-${i}>`), `pre-kill edit ${i} vanished`);
        assert.ok(finalContent.includes(`<post-${i}>`), `post-kill edit ${i} never synced`);
      }
    },
  );

  test(
    'the killed node rejoins the shard ring and takes traffic again',
    gate,
    async (t) => {
      const documentId = `chaos-rejoin-${Date.now()}`;
      const clients: YjsTestClient[] = [];
      t.after(() => clients.forEach((c) => c.destroy()));

      // Node 1 is dead from the previous test. Bring it back.
      await startContainer('ws-gateway-1');
      assert.ok(
        await waitForGateway(GATEWAY_HEALTH_URLS[0]!, 120_000),
        'node 1 did not come back after start',
      );
      // The shard registry refreshes on a 60s interval, but a joining shard
      // publishes to `shards:join` immediately, so peers learn about it fast.
      await delay(2000);

      const health = await gatewayHealth(CHAOS_WS1_PORT);
      assert.ok(health, 'restarted node 1 has no health endpoint');
      assert.equal(health.shard, 'chaos-shard-1', 'restarted node lost its shard id');
      assert.equal(health.connections, 0, 'restarted node started with stale connections');

      // Fresh clients on both nodes still converge.
      for (let i = 0; i < 10; i++) {
        clients.push(
          new YjsTestClient(`chaos-rejoin-${i}`, documentId, {
            urls: [GATEWAY_URLS[i % 2]!, GATEWAY_URLS[(i + 1) % 2]!],
            autoReconnect: true,
          }),
        );
      }
      await Promise.all(clients.map((c) => c.connect(20_000)));
      await delay(500);

      clients.forEach((c, i) => c.append(`<rejoin-${i}>`));

      assert.ok(
        await waitForConvergence(clients, 30_000),
        `clients did not converge after node 1 rejoined:\n${convergenceReport(clients)}`,
      );

      const after1 = await gatewayHealth(CHAOS_WS1_PORT);
      assert.ok(after1 && after1.connections > 0, 'restarted node took no traffic');
    },
  );
});

// ---------------------------------------------------------------------------
// What this test proves, and what it does not
// ---------------------------------------------------------------------------
//
// PROVES:
//   - A SIGKILLed gateway node does not take the document with it. Clients
//     reconnect and every pre-kill edit is still present.
//   - The surviving node accepts the orphaned clients and sync resumes.
//   - A restarted node re-registers its shard and serves traffic again.
//
// DOES NOT PROVE:
//   - **Failover is not tested end to end.** There is no load balancer in this
//     topology. The test client holds a list of gateway URLs and rotates to the
//     next one itself. In production that job belongs to nginx/an ingress, and
//     *that* component is not exercised here at all. A client that only knows
//     one address would not recover, and nothing here would catch it.
//   - **Nothing is proven about server-held state.** Recovery works because the
//     surviving *peers* still hold the Y.Doc. If every client on a document had
//     been on the killed node, recovery would depend on the Kafka/Postgres
//     persistence path, which this topology does not even run. That is the
//     scenario I would most want covered and it is not covered.
//   - **100 clients is a smoke test, not a scale test.** It says the mechanism
//     works. It says nothing about a reconnect storm of thousands.
//   - **Rebalancing is not tested.** Rooms are not migrated when the ring
//     changes; clients simply land wherever they reconnect. See
//     docs/SHARDING.md for what the ring actually does and does not do.
//   - Timing here is loose on purpose (long waits, generous timeouts) because a
//     flaky chaos test gets disabled, and a disabled test proves nothing. The
//     cost is that a slow regression will not trip it.
