import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// ─── Message Types ─────────────────────────────────────────────────

export enum MessageType {
  SYNC_STEP1 = 0,
  SYNC_STEP2 = 1,
  UPDATE = 2,
  AWARENESS = 3,
}

// ─── Sync Protocol ─────────────────────────────────────────────────

/**
 * Encode Sync Step 1: Send our state vector so the remote can compute
 * a diff of what we're missing.
 */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MessageType.SYNC_STEP1);
  const stateVector = Y.encodeStateVector(doc);
  encoding.writeVarUint8Array(encoder, stateVector);
  return encoding.toUint8Array(encoder);
}

/**
 * Encode Sync Step 2: Given a remote state vector, compute and send
 * the diff (the updates the remote is missing).
 */
export function encodeSyncStep2(doc: Y.Doc, remoteStateVector: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MessageType.SYNC_STEP2);
  const diff = Y.encodeStateAsUpdate(doc, remoteStateVector);
  encoding.writeVarUint8Array(encoder, diff);
  return encoding.toUint8Array(encoder);
}

/**
 * Encode a regular document update message.
 */
export function encodeUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MessageType.UPDATE);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/**
 * Encode an awareness update message.
 */
export function encodeAwareness(awarenessUpdate: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MessageType.AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessUpdate);
  return encoding.toUint8Array(encoder);
}

// ─── Reading / Decoding ────────────────────────────────────────────

export interface DecodedMessage {
  type: MessageType;
  data: Uint8Array;
}

/**
 * Decode a message to determine its type and extract its payload.
 */
export function decodeMessage(message: Uint8Array): DecodedMessage {
  const decoder = decoding.createDecoder(message);
  const type = decoding.readVarUint(decoder) as MessageType;
  const data = decoding.readVarUint8Array(decoder);
  return { type, data };
}

/**
 * Read and process Sync Step 1: The remote sent their state vector.
 * We respond with Sync Step 2 (our diff).
 */
export function readSyncStep1(doc: Y.Doc, stateVector: Uint8Array): Uint8Array {
  return encodeSyncStep2(doc, stateVector);
}

/**
 * Read and process Sync Step 2: The remote sent us a diff update.
 * Apply it to our document.
 */
export function readSyncStep2(doc: Y.Doc, update: Uint8Array, origin?: unknown): void {
  Y.applyUpdate(doc, update, origin);
}

/**
 * Read and process a regular update message.
 * Apply it to our document.
 */
export function readUpdate(doc: Y.Doc, update: Uint8Array, origin?: unknown): void {
  Y.applyUpdate(doc, update, origin);
}

// ─── Full Sync Handler ─────────────────────────────────────────────

export interface SyncResult {
  /** Messages to send back to the remote peer. */
  replies: Uint8Array[];
  /** Whether the sync is complete. */
  synced: boolean;
}

/**
 * Handle an incoming sync message and return appropriate replies.
 * Implements the full sync protocol for WebSocket transport.
 */
export function handleSyncMessage(
  doc: Y.Doc,
  message: Uint8Array,
  origin?: unknown,
): SyncResult {
  const { type, data } = decodeMessage(message);

  switch (type) {
    case MessageType.SYNC_STEP1: {
      // Remote sent their state vector. Respond with our diff (step 2)
      // and also send our state vector (step 1) so they can respond
      const step2 = readSyncStep1(doc, data);
      const step1 = encodeSyncStep1(doc);
      return { replies: [step2, step1], synced: false };
    }

    case MessageType.SYNC_STEP2: {
      // Remote sent their diff. Apply it.
      readSyncStep2(doc, data, origin);
      return { replies: [], synced: true };
    }

    case MessageType.UPDATE: {
      // Regular update. Apply it.
      readUpdate(doc, data, origin);
      return { replies: [], synced: true };
    }

    case MessageType.AWARENESS: {
      // Awareness updates are handled separately; pass through.
      return { replies: [], synced: true };
    }

    default: {
      console.warn(`[SyncProtocol] Unknown message type: ${type as number}`);
      return { replies: [], synced: true };
    }
  }
}

/**
 * Initiate a sync by sending Sync Step 1 (our state vector).
 * The remote will respond with their diff.
 */
export function initSync(doc: Y.Doc): Uint8Array {
  return encodeSyncStep1(doc);
}
