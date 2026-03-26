export { DocumentCRDT } from './document-crdt.js';
export type { DocumentCRDTOptions, UpdateHandler, DestroyHandler } from './document-crdt.js';

export { AwarenessManager } from './awareness.js';
export type {
  CursorPosition,
  UserInfo,
  AwarenessState,
  AwarenessChangeHandler,
} from './awareness.js';

export { CRDTPersistence } from './persistence.js';
export type { StorageAdapter, CRDTPersistenceOptions } from './persistence.js';

export {
  MessageType,
  encodeSyncStep1,
  encodeSyncStep2,
  encodeUpdate,
  encodeAwareness,
  decodeMessage,
  readSyncStep1,
  readSyncStep2,
  readUpdate,
  handleSyncMessage,
  initSync,
} from './sync-protocol.js';
export type { DecodedMessage, SyncResult } from './sync-protocol.js';
