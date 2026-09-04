import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics for doc-service.
 *
 * Scope note: this service sees CRDT updates *after* they have been through
 * Kafka, so its counters describe the persistence path, not the live
 * collaboration path. `collabspace_crdt_updates_total` here and the metric of
 * the same name in ws-gateway therefore measure different things at different
 * points and will not match — the gateway counts every relayed update, this
 * counts what survived to be persisted. The gap between them is the interesting
 * number: a persistent divergence means updates are being dropped between the
 * gateway and Postgres.
 *
 * Every metric below is incremented from a real code path. The wiring point is
 * named in each comment; if you cannot find the call site, the metric should
 * not be here.
 */

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'collabspace_doc_' });

// ── CRDT / persistence ────────────────────────────────────────────────────────

/**
 * doc_type is always "document" in this service today — code, whiteboard and
 * project persistence live in their own services. The label exists so the
 * dashboard query is identical across services.
 *
 * Incremented in CrdtPersistenceService.queueUpdate().
 */
export const crdtUpdatesTotal = new Counter({
  name: 'collabspace_crdt_updates_total',
  help: 'CRDT updates received for persistence, by document surface',
  labelNames: ['doc_type'] as const,
  registers: [registry],
});

/** Incremented in persistBatch() after a successful COMMIT. */
export const persistBatchesTotal = new Counter({
  name: 'collabspace_doc_persist_batches_total',
  help: 'Debounced persistence batches written to Postgres, by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

/**
 * Wall-clock time for the whole persist transaction: merge, version bump,
 * insert, optional compaction, commit. Observed in persistBatch().
 */
export const persistDurationMs = new Histogram({
  name: 'collabspace_doc_persist_duration_ms',
  help: 'Time to persist one debounced batch to Postgres, in ms',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

/** Number of updates merged into a single batch. Observed in persistBatch(). */
export const persistBatchSize = new Histogram({
  name: 'collabspace_doc_persist_batch_size',
  help: 'Updates merged into one persistence batch',
  buckets: [1, 2, 5, 10, 25, 50, 100, 250],
  registers: [registry],
});

/**
 * Documents with un-persisted edits sitting in the debounce buffer.
 *
 * This is the durability-risk gauge: everything counted here is in memory only
 * and would be lost if the process died right now. Set in queueUpdate() and
 * persistBatch(). See docs/LIMITATIONS.md §1.5.
 */
export const pendingBatches = new Gauge({
  name: 'collabspace_doc_pending_batches',
  help: 'Documents holding un-persisted edits in the debounce buffer',
  registers: [registry],
});

/** Incremented in compactToSnapshot(). */
export const snapshotsTotal = new Counter({
  name: 'collabspace_doc_snapshots_total',
  help: 'Snapshot compactions performed',
  registers: [registry],
});

// ── Document load path ────────────────────────────────────────────────────────

/** source: "cache" (Redis) or "database" (snapshot + updates replay). */
export const documentLoadsTotal = new Counter({
  name: 'collabspace_doc_loads_total',
  help: 'Document reconstructions, by source',
  labelNames: ['source'] as const,
  registers: [registry],
});
