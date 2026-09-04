/**
 * A headless Yjs client speaking ws-gateway's document protocol.
 *
 * This is the same wire protocol the browser client uses
 * (apps/ws-gateway/src/handlers/document.handler.ts): JSON envelopes carrying
 * `update` as a plain number array. It is not the y-websocket binary protocol —
 * matching the gateway matters more than matching upstream Yjs conventions.
 *
 * Deliberately supports disconnect/reconnect and offline buffering, because
 * that is what the offline-reconciliation and chaos tests need to exercise.
 */

import WebSocket from 'ws';
import * as Y from 'yjs';
import { signToken } from './jwt.js';
import { WS_URL, waitFor } from './infra.js';

export interface ClientOptions {
  url?: string;
  /**
   * Failover pool. When a reconnect is attempted the client rotates to the next
   * URL in this list. Stands in for the load balancer a real deployment puts in
   * front of the gateway pool — see the note in tests/chaos/ws-node-failure.test.ts
   * about what that substitution does and does not prove.
   */
  urls?: string[];
  /** Auto-reconnect with backoff after an unexpected close. Default false. */
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
}

export class YjsTestClient {
  readonly doc = new Y.Doc();
  readonly text: Y.Text;
  readonly userId: string;
  readonly documentId: string;

  private ws: WebSocket | null = null;
  private readonly urls: string[];
  private urlIndex = 0;
  private readonly autoReconnect: boolean;
  private readonly reconnectDelayMs: number;

  /** Set while applying a remote update, so it is not echoed back. */
  private applyingRemote = false;
  /** Updates produced while disconnected, replayed on reconnect. */
  private pendingUpdates: Uint8Array[] = [];

  joined = false;
  closedIntentionally = false;
  reconnectCount = 0;
  peerUpdatesApplied = 0;

  constructor(userId: string, documentId: string, opts: ClientOptions = {}) {
    this.userId = userId;
    this.documentId = documentId;
    this.urls = opts.urls && opts.urls.length > 0 ? opts.urls : [opts.url ?? WS_URL];
    this.autoReconnect = opts.autoReconnect ?? false;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 200;
    this.text = this.doc.getText('default');

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (this.applyingRemote || origin === 'remote') return;

      if (this.joined && this.ws?.readyState === WebSocket.OPEN) {
        this.sendUpdate(update);
      } else {
        // Offline. Hold it; the CRDT itself has already applied it locally, so
        // the local document stays usable. This is the buffer that
        // offline-reconciliation.test.ts drains.
        this.pendingUpdates.push(update);
      }
    });
  }

  // -- Connection ----------------------------------------------------------

  /** The gateway URL this client is currently pointed at. */
  get currentUrl(): string {
    return this.urls[this.urlIndex % this.urls.length]!;
  }

  /** Rotates to the next gateway in the failover pool. */
  private rotateUrl(): void {
    this.urlIndex = (this.urlIndex + 1) % this.urls.length;
  }

  async connect(timeoutMs = 10_000): Promise<void> {
    this.closedIntentionally = false;
    const token = signToken(this.userId);
    const ws = new WebSocket(`${this.currentUrl}/?token=${encodeURIComponent(token)}`);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.userId}: connect timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );

      const settleError = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      ws.on('message', (raw: Buffer) => {
        let msg: {
          type?: string;
          update?: number[];
          stateVector?: number[];
          fromUserId?: string;
        };
        try {
          msg = JSON.parse(raw.toString()) as typeof msg;
        } catch {
          return;
        }

        if (msg.type === 'connection:established') {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomId: `doc:${this.documentId}`,
              roomType: 'document',
            }),
          );
          return;
        }

        if (msg.type === 'room:joined') {
          this.joined = true;
          clearTimeout(timer);
          this.flushPending();
          // Ask peers for anything we missed. Without this a reconnecting
          // client pushes its own offline edits but never learns what changed
          // while it was away, and the two sides stay permanently divergent.
          this.sendSyncStep1();
          resolve();
          return;
        }

        // A peer announced its state vector. Reply with whatever it is missing
        // from our copy. The gateway broadcasts step1 to the whole room, so
        // every member answers and the asker receives N near-identical diffs.
        // Applying an update you already hold is a no-op, so that is wasteful
        // rather than wrong — but see targetUserId below for why the replies
        // must at least be addressed.
        if (msg.type === 'doc:sync:step1' && Array.isArray(msg.stateVector)) {
          const diff = Y.encodeStateAsUpdate(this.doc, new Uint8Array(msg.stateVector));
          if (diff.length > 0) {
            this.send({
              type: 'doc:sync:step2',
              documentId: this.documentId,
              update: Array.from(diff),
              // Address the reply, so the gateway delivers it to the asker
              // instead of the whole room. Without this a reconnect storm is
              // O(N^2) and the rate limiter stalls it.
              targetUserId: msg.fromUserId,
            });
          }
          return;
        }

        if (msg.type === 'doc:sync:step2' && Array.isArray(msg.update)) {
          this.applyRemote(new Uint8Array(msg.update));
          return;
        }

        if (msg.type === 'room:join_failed') {
          settleError(new Error(`${this.userId}: room join failed`));
          return;
        }

        if (msg.type === 'doc:update' && Array.isArray(msg.update)) {
          this.applyRemote(new Uint8Array(msg.update));
        }
      });

      ws.on('error', (err: Error & { code?: string }) => {
        if (!this.joined) {
          settleError(new Error(err.message || err.code || 'websocket error'));
        }
      });

      ws.on('close', () => {
        const wasJoined = this.joined;
        this.joined = false;
        if (!wasJoined) {
          settleError(new Error(`${this.userId}: socket closed before joining`));
          return;
        }
        if (this.autoReconnect && !this.closedIntentionally) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    setTimeout(() => {
      if (this.closedIntentionally) return;
      this.connect()
        .then(() => {
          this.reconnectCount++;
        })
        .catch(() => {
          // Gateway still down. Try the next node in the pool and keep going;
          // the test's own timeout is the real deadline, so no attempt cap here.
          this.rotateUrl();
          this.scheduleReconnect();
        });
    }, this.reconnectDelayMs);
  }

  // -- Updates -------------------------------------------------------------

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /** Announces our state vector so peers can send back what we are missing. */
  private sendSyncStep1(): void {
    this.send({
      type: 'doc:sync:step1',
      documentId: this.documentId,
      stateVector: Array.from(Y.encodeStateVector(this.doc)),
    });
  }

  private sendUpdate(update: Uint8Array): void {
    this.send({
      type: 'doc:update',
      documentId: this.documentId,
      update: Array.from(update),
    });
  }

  private applyRemote(update: Uint8Array): void {
    this.applyingRemote = true;
    try {
      Y.applyUpdate(this.doc, update, 'remote');
      this.peerUpdatesApplied++;
    } finally {
      this.applyingRemote = false;
    }
  }

  /**
   * Replays everything produced while offline. Sends the merged state as one
   * update rather than N: Yjs updates are idempotent and commutative, so a
   * single merge is equivalent and far cheaper on reconnect storms.
   */
  private flushPending(): void {
    if (this.pendingUpdates.length === 0) return;
    const merged = Y.mergeUpdates(this.pendingUpdates);
    this.pendingUpdates = [];
    this.sendUpdate(merged);
  }

  /** Local edit. Goes through the Y.Doc, so the update handler ships it. */
  insert(index: number, content: string): void {
    this.text.insert(index, content);
  }

  append(content: string): void {
    this.text.insert(this.text.length, content);
  }

  delete(index: number, length: number): void {
    this.text.delete(index, length);
  }

  get content(): string {
    return this.text.toString();
  }

  get pendingCount(): number {
    return this.pendingUpdates.length;
  }

  /** State vector — used to assert two docs are structurally identical. */
  get stateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  // -- Lifecycle -----------------------------------------------------------

  /** Simulates a network drop. Does not reconnect unless autoReconnect is on. */
  disconnect(): void {
    this.closedIntentionally = true;
    this.joined = false;
    this.ws?.close();
  }

  /** Drops the socket without the intentional flag, so autoReconnect kicks in. */
  dropConnection(): void {
    this.joined = false;
    this.ws?.terminate();
  }

  async reconnect(): Promise<void> {
    this.closedIntentionally = false;
    await this.connect();
  }

  destroy(): void {
    this.closedIntentionally = true;
    this.ws?.close();
    this.doc.destroy();
  }

  waitForJoined(timeoutMs = 10_000): Promise<boolean> {
    return waitFor(() => this.joined, timeoutMs);
  }

  waitForContent(substring: string, timeoutMs = 5000): Promise<boolean> {
    return waitFor(() => this.content.includes(substring), timeoutMs);
  }
}

/**
 * Waits until every client's Y.Text is byte-identical. Compares content rather
 * than counting messages: "all peers received something" is not convergence.
 */
export async function waitForConvergence(
  clients: YjsTestClient[],
  timeoutMs = 10_000,
): Promise<boolean> {
  return waitFor(() => {
    const first = clients[0]?.content;
    return clients.every((c) => c.content === first);
  }, timeoutMs);
}

/** Convergence assertion helper that returns the differing contents on failure. */
export function convergenceReport(clients: YjsTestClient[]): string {
  return clients
    .map((c) => `  ${c.userId}: ${JSON.stringify(c.content)} (len ${c.content.length})`)
    .join('\n');
}
