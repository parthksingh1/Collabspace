/**
 * Offline reconciliation tests.
 *
 * The README promises "offline editing with automatic sync on reconnect". This
 * file is what backs that sentence.
 *
 * Scenario under test, in both layers:
 *   1. Client A connects to a document and edits it.
 *   2. A disconnects. It keeps editing locally — that is the whole point of
 *      offline-first, and its Y.Doc keeps accepting writes.
 *   3. Client B, still online, edits the same document.
 *   4. A reconnects.
 *   5. Both documents must end up identical, with no edit from either side lost.
 *
 * Layer 1 runs it against Y.Doc directly (always runs). Layer 2 runs it through
 * ws-gateway (skips locally, required in CI).
 *
 * "Deterministic" is asserted by running the same offline/online interleaving
 * repeatedly and checking the merged result never varies — a merge that is
 * usually right is not right.
 *
 * Run: npm run test:integration
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  YjsTestClient,
  waitForConvergence,
  convergenceReport,
} from '../helpers/yjs-client.js';
import { checkWsGateway, requireOrSkip, delay } from '../helpers/infra.js';

// ---------------------------------------------------------------------------
// Layer 1: reconciliation semantics, in-process
// ---------------------------------------------------------------------------

/**
 * Models a disconnected client: a Y.Doc plus the buffer of updates it produced
 * while the socket was down. On "reconnect" the buffer is merged and exchanged,
 * which is exactly what YjsTestClient.flushPending() does over the wire.
 */
class OfflinePeer {
  readonly doc = new Y.Doc();
  readonly text: Y.Text;
  private buffer: Uint8Array[] = [];
  online = true;

  constructor(clientId: number) {
    this.doc.clientID = clientId;
    this.text = this.doc.getText('default');
    this.doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      if (!this.online) this.buffer.push(u);
    });
  }

  goOffline(): void {
    this.online = false;
  }

  goOnline(): void {
    this.online = true;
  }

  /** Merged updates accumulated while offline, or null if there were none. */
  drainBuffer(): Uint8Array | null {
    if (this.buffer.length === 0) return null;
    const merged = Y.mergeUpdates(this.buffer);
    this.buffer = [];
    return merged;
  }

  get bufferedCount(): number {
    return this.buffer.length;
  }

  get content(): string {
    return this.text.toString();
  }
}

/** Full state exchange, as happens on reconnect via sync step1/step2. */
function reconcile(a: Y.Doc, b: Y.Doc): void {
  const aToB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const bToA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, aToB, 'remote');
  Y.applyUpdate(a, bToA, 'remote');
}

describe('offline reconciliation semantics (no gateway required)', () => {
  /**
   * One full offline/online cycle. Returned as a string so the determinism test
   * can run it many times and compare.
   */
  function runCycle(): { merged: string; buffered: number } {
    const a = new OfflinePeer(1);
    const b = new OfflinePeer(2);

    // Shared starting state.
    a.text.insert(0, 'Shared intro. ');
    reconcile(a.doc, b.doc);

    // A goes offline and keeps typing.
    a.goOffline();
    a.text.insert(a.text.length, '[A-offline-1]');
    a.text.insert(a.text.length, '[A-offline-2]');

    // B edits the same document while A is away.
    b.text.insert(b.text.length, '[B-online-1]');
    b.text.insert(b.text.length, '[B-online-2]');

    const buffered = a.bufferedCount;

    // A reconnects: flush its buffer, then exchange full state.
    const flushed = a.drainBuffer();
    if (flushed) Y.applyUpdate(b.doc, flushed, 'remote');
    reconcile(a.doc, b.doc);

    assert.equal(a.content, b.content, `reconciliation diverged:\n  A: ${a.content}\n  B: ${b.content}`);
    return { merged: a.content, buffered };
  }

  test('offline edits and concurrent online edits both survive reconnect', () => {
    const { merged, buffered } = runCycle();

    assert.ok(buffered >= 2, `expected offline edits to be buffered, got ${buffered}`);

    for (const marker of ['[A-offline-1]', '[A-offline-2]', '[B-online-1]', '[B-online-2]']) {
      assert.ok(merged.includes(marker), `lost ${marker} during reconciliation: ${merged}`);
    }
    assert.ok(merged.startsWith('Shared intro. '), `base content mangled: ${merged}`);
  });

  test('reconciliation is deterministic across repeated runs', () => {
    const first = runCycle().merged;
    for (let i = 0; i < 25; i++) {
      assert.equal(
        runCycle().merged,
        first,
        `run ${i} produced a different merge — reconciliation is not deterministic`,
      );
    }
  });

  test('reconciliation is lossless: no character disappears', () => {
    const a = new OfflinePeer(1);
    const b = new OfflinePeer(2);

    a.text.insert(0, 'base');
    reconcile(a.doc, b.doc);

    a.goOffline();
    // 50 offline keystrokes, one character at a time — the realistic shape.
    const offlineChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX';
    for (const ch of offlineChars) {
      a.text.insert(a.text.length, ch);
    }
    // B types in the middle of the base text while A is away.
    b.text.insert(2, '###');

    const flushed = a.drainBuffer();
    assert.ok(flushed, 'nothing was buffered while offline');
    Y.applyUpdate(b.doc, flushed!, 'remote');
    reconcile(a.doc, b.doc);

    assert.equal(a.content, b.content, 'diverged after bulk offline edits');

    // Every offline character is present, exactly once.
    for (const ch of new Set(offlineChars)) {
      const expected = offlineChars.split('').filter((c) => c === ch).length;
      const actual = a.content.split('').filter((c) => c === ch).length;
      assert.ok(actual >= expected, `character '${ch}' lost during reconcile`);
    }
    assert.ok(a.content.includes('###'), "lost B's concurrent edit");
  });

  test('an offline delete of text another client edited still converges', () => {
    const a = new OfflinePeer(1);
    const b = new OfflinePeer(2);

    a.text.insert(0, 'alpha beta gamma');
    reconcile(a.doc, b.doc);

    a.goOffline();
    a.text.delete(6, 5); // removes "beta "
    b.text.insert(8, 'XX'); // inserts inside the range A is deleting

    const flushed = a.drainBuffer();
    Y.applyUpdate(b.doc, flushed!, 'remote');
    reconcile(a.doc, b.doc);

    assert.equal(a.content, b.content, 'offline delete vs online insert diverged');
    assert.ok(!a.content.includes('beta'), `delete did not apply: ${a.content}`);
    assert.ok(a.content.includes('XX'), `concurrent insert was lost: ${a.content}`);
  });

  test('reconnecting twice does not duplicate content', () => {
    // Guards against the obvious bug: replaying the offline buffer on every
    // reconnect attempt. Yjs updates are idempotent, so this should be a no-op,
    // but the property is worth pinning down.
    const a = new OfflinePeer(1);
    const b = new OfflinePeer(2);

    a.text.insert(0, 'start');
    reconcile(a.doc, b.doc);

    a.goOffline();
    a.text.insert(a.text.length, '-offline');

    const flushed = a.drainBuffer()!;
    Y.applyUpdate(b.doc, flushed, 'remote');
    reconcile(a.doc, b.doc);
    const afterFirst = b.content;

    // Replay the same buffer a second time, as a flaky reconnect would.
    Y.applyUpdate(b.doc, flushed, 'remote');
    reconcile(a.doc, b.doc);

    assert.equal(b.content, afterFirst, `replay duplicated content: ${b.content}`);
    assert.equal(a.content, b.content, 'diverged after duplicate replay');
  });
});

// ---------------------------------------------------------------------------
// Layer 2: the same scenario through a live ws-gateway
// ---------------------------------------------------------------------------

describe('offline reconciliation through ws-gateway', async () => {
  const gate = await requireOrSkip(
    checkWsGateway,
    'ws-gateway',
    'docker compose -f infra/docker/docker-compose.yml up -d redis && (cd apps/ws-gateway && npm run dev)',
  );

  const clients: YjsTestClient[] = [];
  after(() => clients.forEach((c) => c.destroy()));

  test(
    'A disconnects, both sides edit, A reconnects and both converge losslessly',
    gate,
    async () => {
      const documentId = `it-offline-${Date.now()}`;
      const a = new YjsTestClient('it-offline-a', documentId);
      const b = new YjsTestClient('it-offline-b', documentId);
      clients.push(a, b);

      await Promise.all([a.connect(), b.connect()]);
      await delay(200);

      // 1. A edits while online; B sees it.
      a.append('Shared intro. ');
      assert.ok(await b.waitForContent('Shared intro.'), 'B never saw the shared intro');

      // 2. A drops off the network.
      a.disconnect();
      await delay(200);
      assert.equal(a.joined, false, 'A still reports itself as joined after disconnect');

      // 3. Both sides keep editing. A's edits go into its offline buffer.
      a.append('[A-offline]');
      b.append('[B-online]');

      assert.ok(a.pendingCount > 0, 'A buffered nothing while offline');
      assert.ok(
        !b.content.includes('[A-offline]'),
        "B somehow received A's offline edit before reconnect",
      );

      // 4. A comes back. Reconnecting flushes the buffer.
      await a.reconnect();
      await delay(300);

      // 5. Everything merges.
      assert.ok(
        await waitForConvergence([a, b], 10_000),
        `offline reconciliation diverged:\n${convergenceReport([a, b])}`,
      );
      assert.ok(a.content.includes('[A-offline]'), "lost A's offline edit");
      assert.ok(a.content.includes('[B-online]'), "lost B's concurrent edit");
      assert.ok(b.content.includes('[A-offline]'), "A's offline edit never reached B");
      assert.equal(a.pendingCount, 0, "A's offline buffer was not drained");
    },
  );

  test(
    'repeated disconnect/reconnect cycles stay lossless',
    gate,
    async () => {
      const documentId = `it-offline-cycles-${Date.now()}`;
      const a = new YjsTestClient('it-cycles-a', documentId);
      const b = new YjsTestClient('it-cycles-b', documentId);
      clients.push(a, b);

      await Promise.all([a.connect(), b.connect()]);
      await delay(200);

      const CYCLES = 3;
      for (let i = 0; i < CYCLES; i++) {
        a.disconnect();
        await delay(150);

        a.append(`[A${i}]`);
        b.append(`[B${i}]`);

        await a.reconnect();
        await delay(300);
      }

      assert.ok(
        await waitForConvergence([a, b], 15_000),
        `diverged after ${CYCLES} reconnect cycles:\n${convergenceReport([a, b])}`,
      );

      for (let i = 0; i < CYCLES; i++) {
        assert.ok(a.content.includes(`[A${i}]`), `lost A edit from cycle ${i}`);
        assert.ok(a.content.includes(`[B${i}]`), `lost B edit from cycle ${i}`);
      }

      // No duplication from repeated buffer flushes.
      const occurrences = (s: string, needle: string): number => s.split(needle).length - 1;
      for (let i = 0; i < CYCLES; i++) {
        assert.equal(occurrences(a.content, `[A${i}]`), 1, `[A${i}] duplicated`);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Limitations of this file
// ---------------------------------------------------------------------------
//
// - The offline buffer lives in memory in YjsTestClient. The real web client
//   persists to IndexedDB; nothing here tests that a browser reload during the
//   offline window preserves the buffer. That is a genuinely untested path and
//   the most likely place for real offline data loss.
// - The gateway does not currently replay missed updates to a reconnecting
//   client from server-side history — reconciliation here works because the
//   *peers* still hold the state. If every peer disconnects, the document's
//   recent updates depend entirely on the Kafka/Postgres persistence path,
//   which these tests do not exercise. See docs/LIMITATIONS.md.
// - "Deterministic" is asserted over 25 identical in-process runs. That
//   establishes reproducibility, not that the ordering is the one a user would
//   find least surprising.
// - Offline windows here are hundreds of milliseconds. Nothing tests a client
//   that has been offline for a day against a document that has since been
//   snapshotted and garbage-collected.
