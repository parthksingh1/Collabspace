# @collabspace/crdt

CRDT (Conflict-free Replicated Data Type) engine built on Yjs for real-time collaboration.

## Usage

```typescript
import {
  DocumentCRDT,       // Y.Doc wrapper with merge, encode/decode
  AwarenessManager,   // Cursor/selection/presence tracking
  CRDTPersistence,    // Debounced persistence with compaction
  MessageType,        // Sync protocol message types
  encodeSyncStep1, encodeSyncStep2, encodeUpdate,
  handleSyncMessage, initSync,
} from '@collabspace/crdt';

// Create a collaborative document
const doc = new DocumentCRDT();
const text = doc.getText('content');
text.insert(0, 'Hello, world!');

// Sync between peers
const update = doc.getUpdate();
otherDoc.applyUpdate(update);
```

## Components

| Module | Description |
|--------|-------------|
| `DocumentCRDT` | Wraps Y.Doc with getText, getXmlFragment, merge, encodeState/decodeState |
| `AwarenessManager` | Tracks user cursors, selections, typing indicators with color assignment |
| `CRDTPersistence` | Debounced writes, automatic compaction (merge N updates into snapshot) |
| `sync-protocol` | Full sync protocol: SyncStep1 → SyncStep2 → incremental updates |
