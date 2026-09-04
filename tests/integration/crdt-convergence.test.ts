/**
 * CRDT convergence tests.
 *
 * Two layers, on purpose:
 *
 *   Layer 1 — "CRDT semantics" tests run two Y.Doc instances in-process and
 *   exchange updates by hand. No gateway, no Redis, no network. These always
 *   run, everywhere, including on a fresh clone with nothing started. They
 *   prove the merge semantics the whole product rests on.
 *
 *   Layer 2 — "through ws-gateway" tests run the same scenarios over a real
 *   WebSocket connection to a running gateway. These skip locally when the
 *   gateway is down, and fail when REQUIRE_INFRA=1 (CI).
 *
 * Layer 1 is the one that catches a broken assumption about Yjs. Layer 2 is the
 * one that catches a broken assumption about our transport. Both are needed;
 * neither substitutes for the other.
 *
 * Run: npm run test:integration
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  YjsTestClient,
  waitForConvergence,
  convergenceReport,
} from '../helpers/yjs-client.js';
import { checkWsGateway, requireOrSkip, delay } from '../helpers/infra.js';

// ---------------------------------------------------------------------------
// Layer 1: CRDT semantics, no infrastructure
// ---------------------------------------------------------------------------

/** Bidirectional sync between two docs, the way a perfect network would. */
function syncDocs(a: Y.Doc, b: Y.Doc): void {
  const aToB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const bToA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, aToB);
  Y.applyUpdate(a, bToA);
}

describe('CRDT semantics (in-process, no gateway required)', () => {
  test('two docs editing concurrently converge to identical state', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText('default');
    const textB = docB.getText('default');

    // Shared starting point.
    textA.insert(0, 'Hello world');
    syncDocs(docA, docB);
    assert.equal(textB.toString(), 'Hello world');

    // Now edit both, in isolation from each other.
    textA.insert(5, ', beautiful');
    textB.insert(11, '! Goodbye');

    // Before sync they disagree — that is the whole point of the test.
    assert.notEqual(textA.toString(), textB.toString());

    syncDocs(docA, docB);

    assert.equal(
      textA.toString(),
      textB.toString(),
      `docs did not converge:\n  A: ${textA}\n  B: ${textB}`,
    );
    // Both edits survived. A CRDT that converges by discarding one side would
    // pass the equality check above, so assert content too.
    assert.ok(textA.toString().includes('beautiful'), 'lost doc A edit');
    assert.ok(textA.toString().includes('Goodbye'), 'lost doc B edit');
  });

  test('conflicting inserts at the same position converge deterministically', () => {
    // The interesting case: both clients insert at index 5, with no causal
    // relationship. Yjs breaks the tie by client ID, so the result is
    // deterministic but arbitrary — both characters survive, in a fixed order.
    const runOnce = (): string => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      // Pin client IDs so the tie-break is reproducible across runs.
      docA.clientID = 1;
      docB.clientID = 2;

      const textA = docA.getText('default');
      const textB = docB.getText('default');

      textA.insert(0, 'ABCDEFGH');
      syncDocs(docA, docB);

      textA.insert(4, 'X');
      textB.insert(4, 'Y');

      syncDocs(docA, docB);

      assert.equal(textA.toString(), textB.toString(), 'same-position conflict diverged');
      return textA.toString();
    };

    const first = runOnce();

    // Both insertions are preserved; neither is silently dropped.
    assert.ok(first.includes('X'), 'lost the X insert');
    assert.ok(first.includes('Y'), 'lost the Y insert');
    assert.equal(first.length, 10, `expected 8 original + 2 inserts, got ${first}`);

    // Determinism: identical inputs must give an identical result every time.
    for (let i = 0; i < 5; i++) {
      assert.equal(runOnce(), first, 'same-position conflict is not deterministic');
    }

    // With clientID 1 < 2, Yjs places the lower client ID's item first at an
    // equal position, so A's "X" lands before B's "Y". Asserting the exact
    // string documents the behaviour we rely on; if a Yjs upgrade changes the
    // tie-break, this test says so loudly instead of the change surfacing as a
    // mysterious cursor jump in production.
    assert.equal(first, 'ABCDXYEFGH', `unexpected conflict ordering: ${first}`);
  });

  test('insert vs delete race over the same range keeps the insert', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.clientID = 1;
    docB.clientID = 2;

    const textA = docA.getText('default');
    const textB = docB.getText('default');

    textA.insert(0, 'The quick brown fox');
    syncDocs(docA, docB);

    // A deletes "quick " (indices 4..10). B inserts inside that same range.
    textA.delete(4, 6);
    textB.insert(7, 'ZZ');

    syncDocs(docA, docB);

    assert.equal(
      textA.toString(),
      textB.toString(),
      `insert/delete race diverged:\n  A: ${textA}\n  B: ${textB}`,
    );

    // Yjs deletes the characters that were deleted and keeps the concurrently
    // inserted ones — a delete tombstones existing items, it does not claim a
    // range. So "ZZ" survives even though it landed inside the deleted span.
    const result = textA.toString();
    assert.ok(result.includes('ZZ'), `concurrent insert was swallowed by delete: ${result}`);
    assert.ok(!result.includes('quick'), `delete did not apply: ${result}`);
    assert.equal(result, 'The ZZbrown fox', `unexpected merge result: ${result}`);
  });

  test('delete vs delete of overlapping ranges is idempotent', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText('default');
    const textB = docB.getText('default');

    textA.insert(0, '0123456789');
    syncDocs(docA, docB);

    textA.delete(2, 4); // removes 2345
    textB.delete(4, 4); // removes 4567 — overlaps on 45

    syncDocs(docA, docB);

    assert.equal(textA.toString(), textB.toString(), 'overlapping deletes diverged');
    // Union of both deletions, each character removed once.
    assert.equal(textA.toString(), '0189', `unexpected result: ${textA}`);
  });

  test('update application is commutative and idempotent', () => {
    // The property the whole reconnect story depends on: it does not matter
    // what order updates arrive in, or how many times.
    const source = new Y.Doc();
    const text = source.getText('default');
    const updates: Uint8Array[] = [];
    source.on('update', (u: Uint8Array) => updates.push(u));

    text.insert(0, 'alpha ');
    text.insert(6, 'beta ');
    text.insert(11, 'gamma');
    text.delete(0, 6);

    assert.ok(updates.length >= 4, 'expected one update per operation');

    const inOrder = new Y.Doc();
    updates.forEach((u) => Y.applyUpdate(inOrder, u));

    const reversed = new Y.Doc();
    [...updates].reverse().forEach((u) => Y.applyUpdate(reversed, u));

    const doubled = new Y.Doc();
    updates.forEach((u) => Y.applyUpdate(doubled, u));
    updates.forEach((u) => Y.applyUpdate(doubled, u)); // every update twice

    const expected = text.toString();
    assert.equal(inOrder.getText('default').toString(), expected, 'in-order replay differs');
    assert.equal(reversed.getText('default').toString(), expected, 'not commutative');
    assert.equal(doubled.getText('default').toString(), expected, 'not idempotent');
  });

  test('three-way concurrent edits converge', () => {
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    docs.forEach((d, i) => {
      d.clientID = i + 1;
    });
    const texts = docs.map((d) => d.getText('default'));

    texts[0]!.insert(0, 'base');
    // Broadcast the base to everyone.
    const base = Y.encodeStateAsUpdate(docs[0]!);
    Y.applyUpdate(docs[1]!, base);
    Y.applyUpdate(docs[2]!, base);

    texts[0]!.insert(4, '-one');
    texts[1]!.insert(0, 'two-');
    texts[2]!.insert(2, 'THREE');

    // Full mesh exchange, twice, so every doc sees every other doc's state.
    for (let round = 0; round < 2; round++) {
      for (const from of docs) {
        for (const to of docs) {
          if (from === to) continue;
          Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));
        }
      }
    }

    const results = texts.map((t) => t.toString());
    assert.equal(new Set(results).size, 1, `three-way divergence: ${JSON.stringify(results)}`);
    assert.ok(results[0]!.includes('one'), 'lost edit from doc 0');
    assert.ok(results[0]!.includes('two'), 'lost edit from doc 1');
    assert.ok(results[0]!.includes('THREE'), 'lost edit from doc 2');
  });
});

// ---------------------------------------------------------------------------
// Layer 2: the same scenarios through a live ws-gateway
// ---------------------------------------------------------------------------

describe('CRDT convergence through ws-gateway', async () => {
  const gate = await requireOrSkip(
    checkWsGateway,
    'ws-gateway',
    'docker compose -f infra/docker/docker-compose.yml up -d redis && (cd apps/ws-gateway && npm run dev)',
  );

  const clients: YjsTestClient[] = [];

  after(() => {
    clients.forEach((c) => c.destroy());
  });

  test(
    'two clients editing concurrently converge over the wire',
    gate,
    async () => {
      const documentId = `it-convergence-${Date.now()}`;
      const a = new YjsTestClient('it-user-a', documentId);
      const b = new YjsTestClient('it-user-b', documentId);
      clients.push(a, b);

      await Promise.all([a.connect(), b.connect()]);
      await delay(200); // let room membership settle

      a.append('Hello from A. ');
      assert.ok(await b.waitForContent('Hello from A.'), 'B never saw A edit');

      // Now both edit without waiting for each other.
      a.append('[A2]');
      b.append('[B2]');

      assert.ok(
        await waitForConvergence([a, b]),
        `clients did not converge:\n${convergenceReport([a, b])}`,
      );
      assert.ok(a.content.includes('[A2]') && a.content.includes('[B2]'), 'an edit was lost');
    },
  );

  test(
    'same-position conflict over the wire produces identical documents',
    gate,
    async () => {
      const documentId = `it-conflict-${Date.now()}`;
      const a = new YjsTestClient('it-conflict-a', documentId);
      const b = new YjsTestClient('it-conflict-b', documentId);
      clients.push(a, b);

      await Promise.all([a.connect(), b.connect()]);
      await delay(200);

      a.insert(0, 'ABCDEFGH');
      assert.ok(await b.waitForContent('ABCDEFGH'), 'B never received the base text');

      // Both insert at index 4, as close to simultaneously as the runtime allows.
      a.insert(4, 'X');
      b.insert(4, 'Y');

      assert.ok(
        await waitForConvergence([a, b]),
        `same-position conflict diverged:\n${convergenceReport([a, b])}`,
      );
      assert.ok(a.content.includes('X') && a.content.includes('Y'), 'an insert was dropped');
      assert.equal(a.content.length, 10, `unexpected length: ${a.content}`);
    },
  );

  test(
    'insert vs delete race over the wire converges without data loss',
    gate,
    async () => {
      const documentId = `it-race-${Date.now()}`;
      const a = new YjsTestClient('it-race-a', documentId);
      const b = new YjsTestClient('it-race-b', documentId);
      clients.push(a, b);

      await Promise.all([a.connect(), b.connect()]);
      await delay(200);

      a.insert(0, 'The quick brown fox');
      assert.ok(await b.waitForContent('The quick brown fox'), 'B never received base text');

      a.delete(4, 6); // "quick "
      b.insert(7, 'ZZ');

      assert.ok(
        await waitForConvergence([a, b]),
        `insert/delete race diverged:\n${convergenceReport([a, b])}`,
      );
      assert.ok(a.content.includes('ZZ'), `concurrent insert lost: ${a.content}`);
      assert.ok(!a.content.includes('quick'), `delete did not apply: ${a.content}`);
    },
  );

  test('four clients in one room all converge', gate, async () => {
    const documentId = `it-four-${Date.now()}`;
    const group = ['w', 'x', 'y', 'z'].map(
      (n) => new YjsTestClient(`it-four-${n}`, documentId),
    );
    clients.push(...group);

    await Promise.all(group.map((c) => c.connect()));
    await delay(300);

    // Every client writes at the same time.
    group.forEach((c, i) => c.append(`<${i}>`));

    assert.ok(
      await waitForConvergence(group, 15_000),
      `four-way divergence:\n${convergenceReport(group)}`,
    );

    for (let i = 0; i < group.length; i++) {
      assert.ok(group[0]!.content.includes(`<${i}>`), `lost edit from client ${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Limitations of this file
// ---------------------------------------------------------------------------
//
// - "Concurrent" here means "issued without waiting for a round trip", not
//   "issued at the same instant on two machines". Layer 1 gets genuine
//   concurrency because the docs are isolated until syncDocs() is called;
//   layer 2's concurrency window is however long a loopback hop takes, which is
//   short. Real-world concurrency windows are much wider.
// - Nothing here tests convergence across ws-gateway shards. That needs two
//   gateway nodes and lives in tests/chaos/ws-node-failure.test.ts.
// - Nothing here tests convergence after a Postgres snapshot/restore cycle.
//   The persistence path is not exercised by these tests at all.
// - The exact conflict-ordering assertions ('ABCDYXEFGH', 'The ZZbrown fox')
//   encode current Yjs behaviour. They are intentional canaries, not
//   specifications: if a Yjs upgrade changes tie-breaking, these fail and that
//   is the point.
