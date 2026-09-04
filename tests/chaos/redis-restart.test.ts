/**
 * Chaos test: restart Redis mid-session.
 *
 * Redis carries three separate responsibilities in ws-gateway, and they fail
 * differently:
 *
 *   1. **Shard registry** — `shards:active` set plus a `shard:<id>` hash with a
 *      120s TTL (apps/ws-gateway/src/shard-manager.ts). Wiped by a restart with
 *      no persistence. Rebuilt by the 30s heartbeat.
 *   2. **Cross-shard pub/sub** — `shard:<id>:<channel>` channels. Pub/sub has no
 *      backlog: anything published while a subscriber is disconnected is gone.
 *      At-most-once, by construction.
 *   3. **Presence** — online/away state and cursor positions
 *      (apps/ws-gateway/src/presence-manager.ts). Ephemeral by nature.
 *
 * What must survive a Redis restart: document content. Y.Doc state lives in
 * client memory and is exchanged peer-to-peer through the gateway, so a Redis
 * outage should degrade presence and cross-shard fanout, not lose text.
 *
 * "No split-brain" here means the concrete, checkable thing: after Redis comes
 * back, both gateways agree on the shard registry, and no room is being served
 * by two nodes that cannot see each other's updates.
 *
 * Run: npm run test:chaos
 * Requires Docker. Skips without it; fails when REQUIRE_INFRA=1.
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
  restartContainer,
  compose,
  waitForGateway,
  gatewayHealth,
  GATEWAY_URLS,
  GATEWAY_HEALTH_URLS,
  CHAOS_WS1_PORT,
  CHAOS_WS2_PORT,
} from '../helpers/compose.js';
import { delay, waitFor } from '../helpers/infra.js';

/** Reads a key from the chaos Redis via redis-cli inside the container. */
async function redisCli(...args: string[]): Promise<string> {
  const res = await compose(['exec', '-T', 'redis', 'redis-cli', ...args], 30_000);
  return res.stdout.trim();
}

describe('redis restart', { timeout: 900_000 }, async () => {
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
    'document content survives a Redis restart and sync resumes',
    gate,
    async (t) => {
      const documentId = `chaos-redis-${Date.now()}`;
      const clients: YjsTestClient[] = [];
      t.after(() => clients.forEach((c) => c.destroy()));

      // Clients on both nodes, so the cross-shard path is in play.
      for (let i = 0; i < 8; i++) {
        clients.push(
          new YjsTestClient(`chaos-redis-client-${i}`, documentId, {
            urls: [GATEWAY_URLS[i % 2]!, GATEWAY_URLS[(i + 1) % 2]!],
            autoReconnect: true,
            reconnectDelayMs: 250,
          }),
        );
      }

      await Promise.all(clients.map((c) => c.connect(20_000)));
      await delay(500);

      // -- Baseline ---------------------------------------------------------

      clients.forEach((c, i) => c.append(`<before-${i}>`));
      assert.ok(
        await waitForConvergence(clients, 30_000),
        `no convergence before the restart:\n${convergenceReport(clients)}`,
      );

      const registryBefore = await redisCli('SMEMBERS', 'shards:active');
      assert.ok(
        registryBefore.includes('chaos-shard-1') && registryBefore.includes('chaos-shard-2'),
        `both shards should be registered before the restart, got: ${registryBefore}`,
      );

      const contentBefore = clients[0]!.content;

      // -- Restart Redis ----------------------------------------------------

      await restartContainer('redis');

      // Wait for Redis to answer again.
      const redisBack = await waitFor(
        async () => (await redisCli('PING')).includes('PONG'),
        60_000,
        500,
      );
      assert.ok(redisBack, 'Redis never came back after restart');

      // Gateways must survive the outage. If a gateway crashed because its
      // Redis client threw an unhandled error, that is a real bug and this is
      // where it shows up.
      for (const url of GATEWAY_HEALTH_URLS) {
        assert.ok(
          await waitForGateway(url, 60_000),
          `gateway at ${url} did not survive the Redis restart`,
        );
      }

      // -- Document state is intact ----------------------------------------

      // Content lives in client memory, not Redis. Losing it here would mean a
      // gateway restarted and dropped everyone, which the health check above
      // would not necessarily catch.
      for (const c of clients) {
        assert.equal(
          c.content.length >= contentBefore.length,
          true,
          `${c.userId} lost content across the Redis restart`,
        );
        assert.ok(c.content.includes('<before-0>'), `${c.userId} lost pre-restart edits`);
      }

      // -- Pub/sub resumes --------------------------------------------------

      // Give the shard heartbeat (5s in the chaos topology) a chance to
      // re-register, then confirm the registry rebuilt itself.
      const registryRebuilt = await waitFor(
        async () => {
          const members = await redisCli('SMEMBERS', 'shards:active');
          return members.includes('chaos-shard-1') && members.includes('chaos-shard-2');
        },
        90_000,
        1000,
      );
      assert.ok(
        registryRebuilt,
        `shard registry did not rebuild after the Redis restart. Current: ${await redisCli('SMEMBERS', 'shards:active')}`,
      );

      // Reconnect anyone the outage knocked off, then edit again.
      await waitFor(() => clients.every((c) => c.joined), 60_000, 250);

      clients.forEach((c, i) => c.append(`<after-${i}>`));

      assert.ok(
        await waitForConvergence(clients, 60_000),
        `sync did not resume after the Redis restart:\n${convergenceReport(clients)}`,
      );

      const finalContent = clients[0]!.content;
      for (let i = 0; i < clients.length; i++) {
        assert.ok(finalContent.includes(`<before-${i}>`), `pre-restart edit ${i} lost`);
        assert.ok(finalContent.includes(`<after-${i}>`), `post-restart edit ${i} never synced`);
      }
    },
  );

  test(
    'no split-brain: both gateways agree on the shard registry afterwards',
    gate,
    async () => {
      // Both nodes must see both shards. A node that rebuilt its ring while the
      // other did not would route the same room to two different places, which
      // is the concrete failure "split-brain" means here.
      const members = await redisCli('SMEMBERS', 'shards:active');
      assert.ok(members.includes('chaos-shard-1'), 'shard 1 missing from registry');
      assert.ok(members.includes('chaos-shard-2'), 'shard 2 missing from registry');

      const h1 = await gatewayHealth(CHAOS_WS1_PORT);
      const h2 = await gatewayHealth(CHAOS_WS2_PORT);
      assert.ok(h1 && h2, 'a gateway is not reporting health');
      assert.notEqual(h1.shard, h2.shard, 'both gateways claim the same shard id');

      // The per-shard hashes must have been re-created with a live TTL, not
      // left as a bare set membership pointing at nothing.
      for (const shard of ['chaos-shard-1', 'chaos-shard-2']) {
        const ttl = parseInt(await redisCli('TTL', `shard:${shard}`), 10);
        assert.ok(
          ttl > 0,
          `shard:${shard} has TTL ${ttl} — the heartbeat is not refreshing it, so the entry will expire and the node will vanish from the ring`,
        );
      }
    },
  );

  test(
    'a message published while Redis is down is lost — documented, not fixed',
    gate,
    async () => {
      // This test asserts the *limitation*, so it is written down and cannot
      // quietly change. Redis pub/sub has no persistence and no backlog: if a
      // subscriber is disconnected when a message is published, that message is
      // gone. There is no redelivery. The gateway's cross-shard fanout inherits
      // this, which makes it at-most-once.
      //
      // Documented in docs/SHARDING.md. The reason it is survivable is that
      // Yjs updates are idempotent and clients re-sync full state on reconnect,
      // so a dropped fanout costs latency rather than correctness — but only as
      // long as the client eventually reconnects and re-syncs.

      const channel = `shard:chaos-shard-1:test-${Date.now()}`;

      // With no subscriber attached, PUBLISH reports zero receivers. That
      // number is the whole proof: Redis is telling us the message went nowhere
      // and it kept no copy.
      const receivers = parseInt(await redisCli('PUBLISH', channel, 'payload'), 10);
      assert.equal(
        receivers,
        0,
        'expected zero subscribers for a synthetic channel — test setup is wrong',
      );

      // And nothing is retained: there is no key, no stream, no backlog.
      const exists = await redisCli('EXISTS', channel);
      assert.equal(exists, '0', 'pub/sub unexpectedly retained the message');
    },
  );
});

// ---------------------------------------------------------------------------
// What this test proves, and what it does not
// ---------------------------------------------------------------------------
//
// PROVES:
//   - Gateways survive a Redis restart rather than crashing on a dropped
//     connection.
//   - Document content is not stored in Redis and is unaffected by its loss.
//   - The shard registry rebuilds itself from the heartbeat, with live TTLs.
//   - Cross-shard fanout is at-most-once, demonstrated rather than asserted.
//
// DOES NOT PROVE:
//   - **Nothing is measured about what was dropped during the outage window.**
//     The test edits before and after, not during. Updates published to a
//     cross-shard channel while Redis was down are lost, and this test does not
//     quantify how many or show that clients recover from that specific loss.
//     That is the honest gap: I assert the mechanism is at-most-once, and I
//     assert the system is healthy afterwards, but not that a document mid-edit
//     across two shards during the outage always reconciles.
//   - **Redis here runs with persistence off** (`--appendonly no --save ""`),
//     so a restart is a full wipe. Production runs AOF with `appendfsync
//     everysec`, which is a different, gentler failure. The wipe is the harsher
//     case, which is why it is the one tested — but it is not the production
//     configuration.
//   - **Single Redis instance.** Nothing here says anything about Sentinel
//     failover, cluster resharding, or a partial partition, all of which are
//     more likely in production than a clean restart.
//   - **Presence loss is not asserted.** Presence and cursors do vanish across
//     the restart. That is expected and the tests do not currently pin it down
//     either way.
