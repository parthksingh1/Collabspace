import { createHash } from 'node:crypto';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { getRedis, getRedisSub, getRedisPub } from './utils/redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShardInfo {
  id: string;
  host: string;
  port: number;
  connectionCount: number;
  roomCount: number;
  registeredAt: string;
  lastHeartbeat: string;
}

type CrossShardHandler = (channel: string, message: string) => void;

// ── Consistent Hash Ring ──────────────────────────────────────────────────────

class ConsistentHashRing {
  private ring = new Map<number, string>(); // hash -> shardId
  private sortedHashes: number[] = [];
  private readonly virtualNodes: number;

  constructor(virtualNodes = 150) {
    this.virtualNodes = virtualNodes;
  }

  private hash(key: string): number {
    const digest = createHash('md5').update(key).digest();
    return ((digest[3]! << 24) | (digest[2]! << 16) | (digest[1]! << 8) | digest[0]!) >>> 0;
  }

  addNode(nodeId: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualKey = `${nodeId}:v${i}`;
      const h = this.hash(virtualKey);
      this.ring.set(h, nodeId);
      this.sortedHashes.push(h);
    }
    this.sortedHashes.sort((a, b) => a - b);
  }

  removeNode(nodeId: string): void {
    const toRemove = new Set<number>();
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualKey = `${nodeId}:v${i}`;
      const h = this.hash(virtualKey);
      toRemove.add(h);
      this.ring.delete(h);
    }
    this.sortedHashes = this.sortedHashes.filter((h) => !toRemove.has(h));
  }

  getNode(key: string): string | undefined {
    if (this.sortedHashes.length === 0) return undefined;

    const h = this.hash(key);

    // Binary search for the first hash >= h
    let lo = 0;
    let hi = this.sortedHashes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sortedHashes[mid]! < h) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Wrap around
    const idx = lo >= this.sortedHashes.length ? 0 : lo;
    return this.ring.get(this.sortedHashes[idx]!);
  }

  getNodes(): string[] {
    const unique = new Set(this.ring.values());
    return Array.from(unique);
  }
}

// ── Shard Manager ─────────────────────────────────────────────────────────────

export class ShardManager {
  private static instance: ShardManager | null = null;
  private hashRing = new ConsistentHashRing();
  private handlers = new Map<string, CrossShardHandler[]>();
  private registryRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): ShardManager {
    if (!ShardManager.instance) {
      ShardManager.instance = new ShardManager();
    }
    return ShardManager.instance;
  }

  // ── Initialization ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const redis = getRedis();

    // Register this shard in Redis
    const shardInfo: ShardInfo = {
      id: config.shardId,
      host: process.env.HOST ?? 'localhost',
      port: config.port,
      connectionCount: 0,
      roomCount: 0,
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };

    await redis.hset(`shard:${config.shardId}`, shardInfo as unknown as Record<string, string>);
    await redis.sadd('shards:active', config.shardId);
    await redis.expire(`shard:${config.shardId}`, 120); // TTL 2 minutes

    // Load existing shards and build hash ring
    await this.refreshShardRegistry();

    // Subscribe to shard events
    const sub = getRedisSub();
    await sub.subscribe('shards:join', 'shards:leave');
    sub.on('message', (channel: string, message: string) => {
      this.handleShardEvent(channel, message);
    });

    // Publish our join
    const pub = getRedisPub();
    await pub.publish('shards:join', JSON.stringify(shardInfo));

    // Periodic heartbeat and registry refresh
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch((err) =>
        logger.error('Shard heartbeat failed', { error: (err as Error).message }),
      );
    }, 30_000);

    this.registryRefreshInterval = setInterval(() => {
      this.refreshShardRegistry().catch((err) =>
        logger.error('Shard registry refresh failed', { error: (err as Error).message }),
      );
    }, 60_000);

    logger.info('Shard manager initialized', { shardId: config.shardId });
  }

  // ── Room-to-shard assignment ──────────────────────────────────────────────

  getShardForRoom(roomId: string): string {
    return this.hashRing.getNode(roomId) ?? config.shardId;
  }

  isLocalRoom(roomId: string): boolean {
    return this.getShardForRoom(roomId) === config.shardId;
  }

  // ── Cross-shard messaging ─────────────────────────────────────────────────

  async publishToShard(shardId: string, channel: string, message: string): Promise<void> {
    const pub = getRedisPub();
    const fullChannel = `shard:${shardId}:${channel}`;
    await pub.publish(fullChannel, message);
  }

  async subscribeToShard(shardId: string, channel: string, handler: CrossShardHandler): Promise<void> {
    const fullChannel = `shard:${shardId}:${channel}`;
    const sub = getRedisSub();

    if (!this.handlers.has(fullChannel)) {
      this.handlers.set(fullChannel, []);
      await sub.subscribe(fullChannel);
    }

    this.handlers.get(fullChannel)!.push(handler);

    sub.on('message', (ch: string, msg: string) => {
      if (ch === fullChannel) {
        const chHandlers = this.handlers.get(fullChannel);
        if (chHandlers) {
          for (const h of chHandlers) {
            try {
              h(ch, msg);
            } catch (err) {
              logger.error('Cross-shard handler error', {
                channel: ch,
                error: (err as Error).message,
              });
            }
          }
        }
      }
    });
  }

  async broadcastToAllShards(channel: string, message: string): Promise<void> {
    const pub = getRedisPub();
    const shards = this.hashRing.getNodes();

    const promises = shards.map((shardId) => {
      const fullChannel = `shard:${shardId}:${channel}`;
      return pub.publish(fullChannel, message);
    });

    await Promise.allSettled(promises);
  }

  // ── Registry management ───────────────────────────────────────────────────

  private async refreshShardRegistry(): Promise<void> {
    const redis = getRedis();
    const activeShards = await redis.smembers('shards:active');

    // Rebuild hash ring
    this.hashRing = new ConsistentHashRing();

    const validShards: string[] = [];
    for (const shardId of activeShards) {
      const exists = await redis.exists(`shard:${shardId}`);
      if (exists) {
        this.hashRing.addNode(shardId);
        validShards.push(shardId);
      } else {
        // Stale entry, clean up
        await redis.srem('shards:active', shardId);
      }
    }

    logger.debug('Shard registry refreshed', { shards: validShards });
  }

  private async sendHeartbeat(): Promise<void> {
    const redis = getRedis();
    await redis.hset(`shard:${config.shardId}`, 'lastHeartbeat', new Date().toISOString());
    await redis.expire(`shard:${config.shardId}`, 120);
  }

  private handleShardEvent(channel: string, message: string): void {
    try {
      const data = JSON.parse(message) as ShardInfo;

      if (channel === 'shards:join') {
        logger.info('Shard joined', { shardId: data.id });
        this.hashRing.addNode(data.id);
      } else if (channel === 'shards:leave') {
        logger.info('Shard left', { shardId: data.id });
        this.hashRing.removeNode(data.id);
      }
    } catch (err) {
      logger.error('Failed to handle shard event', {
        channel,
        error: (err as Error).message,
      });
    }
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.registryRefreshInterval) clearInterval(this.registryRefreshInterval);

    const redis = getRedis();
    const pub = getRedisPub();

    await redis.srem('shards:active', config.shardId);
    await redis.del(`shard:${config.shardId}`);
    await pub.publish(
      'shards:leave',
      JSON.stringify({ id: config.shardId }),
    );

    logger.info('Shard manager shut down', { shardId: config.shardId });
  }
}
