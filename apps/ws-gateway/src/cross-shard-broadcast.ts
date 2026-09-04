import { config } from './config.js';
import { logger } from './utils/logger.js';
import { getRedisPub, getRedisRoomSub } from './utils/redis.js';
import { ConnectionManager } from './connection-manager.js';
import { crossShardPublished, crossShardReceived, crossShardDropped } from './metrics.js';

/**
 * Cross-shard room fanout.
 *
 * The problem this solves: `ConnectionManager.broadcastToRoom()` only reaches
 * sockets held by *this* process. With more than one ws-gateway node, two users
 * in the same document who happen to land on different nodes never see each
 * other's updates. There is no error — the room simply splits in two and each
 * half converges on its own version of the document. That is the worst possible
 * failure mode for a collaboration product: silent, and only visible once
 * someone compares screens.
 *
 * ── Design ──────────────────────────────────────────────────────────────────
 *
 * One Redis pub/sub channel per active room: `room:<roomId>:fanout`.
 *
 * A node subscribes to a room's channel while it holds at least one local
 * member of that room, and unsubscribes when the last one leaves. When a node
 * broadcasts to a room it (a) delivers to its own sockets as before and
 * (b) publishes an envelope to the room channel. Peers receiving the envelope
 * deliver it to their local sockets.
 *
 * Why per-room channels rather than per-shard channels (which the existing
 * `ShardManager.broadcastToAllShards` would have given for free): a per-shard
 * channel means every node receives every room's traffic and discards most of
 * it. At the scale the README talks about that is the dominant cost — N nodes
 * each processing the full global message rate. Per-room channels mean a node
 * only receives traffic for rooms it actually hosts. Redis handles large
 * channel counts far better than it handles pointless fanout.
 *
 * ── Loop prevention ─────────────────────────────────────────────────────────
 *
 * Every envelope carries `originShard`. A node ignores envelopes it published
 * itself. Without this, a node would receive its own broadcast, deliver it
 * locally a second time, and (if it re-published) loop forever. The origin
 * check is the only thing standing between this design and an infinite loop,
 * so it is deliberately the first thing the handler does.
 *
 * `excludeSocketId` is intentionally *not* honoured on the receiving side: the
 * excluded socket lives on the origin node by definition, so a remote node has
 * nothing to exclude.
 *
 * ── Delivery guarantees ─────────────────────────────────────────────────────
 *
 * At-most-once. Redis pub/sub keeps no backlog: anything published while a
 * subscriber is disconnected is gone, with no redelivery. This is survivable
 * only because Yjs updates are idempotent and clients re-sync full state on
 * reconnect — a dropped envelope costs latency, not correctness, *provided the
 * client eventually reconnects*. It is not survivable for anything requiring
 * exactly-once semantics, and nothing here should be used for that.
 * See docs/SHARDING.md.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface FanoutEnvelope {
  /** Shard that originated the broadcast. Used to drop our own echo. */
  originShard: string;
  /** The already-serialised client message. Passed through untouched. */
  payload: string;
  /** Wall-clock send time, for the receive-side latency histogram. */
  sentAt: number;
}

function channelFor(roomId: string): string {
  return `room:${roomId}:fanout`;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class CrossShardBroadcast {
  private static instance: CrossShardBroadcast | null = null;

  /** roomId -> number of local members. Subscription is tied to this count. */
  private readonly localRoomRefs = new Map<string, number>();
  /** Rooms this node currently has a live Redis subscription for. */
  private readonly subscribed = new Set<string>();
  private started = false;

  private constructor() {}

  static getInstance(): CrossShardBroadcast {
    if (!CrossShardBroadcast.instance) {
      CrossShardBroadcast.instance = new CrossShardBroadcast();
    }
    return CrossShardBroadcast.instance;
  }

  /** Attaches the single message listener. Safe to call more than once. */
  start(): void {
    if (this.started) return;
    this.started = true;

    const sub = getRedisRoomSub();
    sub.on('message', (channel: string, raw: string) => {
      this.handleFanout(channel, raw);
    });

    // ioredis replays subscriptions automatically after a reconnect, but only
    // for channels it still believes it is subscribed to. A Redis restart
    // (see tests/chaos/redis-restart.test.ts) can leave us out of sync, so
    // re-assert every room we still hold members for.
    sub.on('ready', () => {
      this.resubscribeAll().catch((err) => {
        logger.error('Failed to re-subscribe room fanout channels after reconnect', {
          error: (err as Error).message,
        });
      });
    });

    logger.info('Cross-shard room fanout started', { shard: config.shardId });
  }

  // ── Subscription lifecycle ────────────────────────────────────────────────

  /**
   * Called when a socket joins a room on this node. Subscribes on the first
   * local member; later joins just bump the refcount.
   */
  async addLocalMember(roomId: string): Promise<void> {
    const next = (this.localRoomRefs.get(roomId) ?? 0) + 1;
    this.localRoomRefs.set(roomId, next);

    if (next > 1 || this.subscribed.has(roomId)) return;

    try {
      await getRedisRoomSub().subscribe(channelFor(roomId));
      this.subscribed.add(roomId);
      logger.debug('Subscribed to room fanout', { roomId, shard: config.shardId });
    } catch (err) {
      // Losing the subscription means this node stops seeing remote updates for
      // the room — a silent split. Log loudly; do not swallow.
      logger.error('Failed to subscribe to room fanout channel', {
        roomId,
        error: (err as Error).message,
      });
    }
  }

  /** Called when a socket leaves. Unsubscribes once no local members remain. */
  async removeLocalMember(roomId: string): Promise<void> {
    const current = this.localRoomRefs.get(roomId) ?? 0;
    const next = current - 1;

    if (next > 0) {
      this.localRoomRefs.set(roomId, next);
      return;
    }

    this.localRoomRefs.delete(roomId);
    if (!this.subscribed.has(roomId)) return;

    try {
      await getRedisRoomSub().unsubscribe(channelFor(roomId));
      this.subscribed.delete(roomId);
      logger.debug('Unsubscribed from room fanout', { roomId, shard: config.shardId });
    } catch (err) {
      logger.error('Failed to unsubscribe from room fanout channel', {
        roomId,
        error: (err as Error).message,
      });
    }
  }

  private async resubscribeAll(): Promise<void> {
    const rooms = Array.from(this.localRoomRefs.keys());
    if (rooms.length === 0) return;

    this.subscribed.clear();
    const sub = getRedisRoomSub();
    for (const roomId of rooms) {
      try {
        await sub.subscribe(channelFor(roomId));
        this.subscribed.add(roomId);
      } catch (err) {
        logger.error('Re-subscribe failed for room', {
          roomId,
          error: (err as Error).message,
        });
      }
    }
    logger.info('Re-subscribed room fanout channels', {
      count: this.subscribed.size,
      shard: config.shardId,
    });
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  /**
   * Publishes a room message to peer nodes. Fire-and-forget: the local delivery
   * has already happened by the time this is called, and blocking a keystroke
   * on a Redis round trip would be a poor trade.
   */
  publish(roomId: string, payload: string): void {
    const envelope: FanoutEnvelope = {
      originShard: config.shardId,
      payload,
      sentAt: Date.now(),
    };

    getRedisPub()
      .publish(channelFor(roomId), JSON.stringify(envelope))
      .then(() => {
        crossShardPublished.labels(config.shardId).inc();
      })
      .catch((err: Error) => {
        // A failed publish is a silent split for the duration of the outage.
        // Counted so it is visible on the dashboard rather than only in logs.
        crossShardDropped.labels('publish_failed').inc();
        logger.error('Cross-shard fanout publish failed', {
          roomId,
          error: err.message,
        });
      });
  }

  // ── Receive ───────────────────────────────────────────────────────────────

  private handleFanout(channel: string, raw: string): void {
    // `room:<roomId>:fanout` — roomIds contain ':' (e.g. "doc:abc"), so take
    // everything between the first and last segment rather than splitting.
    if (!channel.startsWith('room:') || !channel.endsWith(':fanout')) return;
    const roomId = channel.slice('room:'.length, -':fanout'.length);
    if (!roomId) return;

    let envelope: FanoutEnvelope;
    try {
      envelope = JSON.parse(raw) as FanoutEnvelope;
    } catch {
      crossShardDropped.labels('parse_error').inc();
      logger.warn('Malformed cross-shard envelope', { channel });
      return;
    }

    // Loop prevention. Must come before any delivery.
    if (envelope.originShard === config.shardId) return;

    if (typeof envelope.payload !== 'string') {
      crossShardDropped.labels('invalid_payload').inc();
      return;
    }

    crossShardReceived.labels(envelope.originShard).inc();

    ConnectionManager.getInstance().broadcastToRoom(roomId, envelope.payload);
  }

  // ── Introspection (used by /health and the chaos tests) ───────────────────

  getSubscribedRoomCount(): number {
    return this.subscribed.size;
  }

  getLocalRoomCount(): number {
    return this.localRoomRefs.size;
  }

  async shutdown(): Promise<void> {
    const rooms = Array.from(this.subscribed);
    if (rooms.length === 0) return;
    try {
      await getRedisRoomSub().unsubscribe(...rooms.map(channelFor));
    } catch {
      // Shutting down anyway; the connection close unsubscribes us regardless.
    }
    this.subscribed.clear();
    this.localRoomRefs.clear();
  }
}
