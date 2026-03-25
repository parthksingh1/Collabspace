import * as Y from 'yjs';

export type UpdateHandler = (update: Uint8Array, origin: unknown) => void;
export type DestroyHandler = () => void;

export interface DocumentCRDTOptions {
  /** Enable garbage collection of deleted content. Default: true. */
  gc?: boolean;
  /** Unique identifier for the document. */
  documentId: string;
}

/**
 * Wrapper around Y.Doc providing a clean API for collaborative document editing.
 */
export class DocumentCRDT {
  public readonly doc: Y.Doc;
  public readonly documentId: string;

  private readonly updateHandlers: Set<UpdateHandler> = new Set();
  private readonly destroyHandlers: Set<DestroyHandler> = new Set();

  constructor(options: DocumentCRDTOptions) {
    this.documentId = options.documentId;
    this.doc = new Y.Doc({ gc: options.gc ?? true });

    // Forward Y.Doc update events to registered handlers
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      for (const handler of this.updateHandlers) {
        handler(update, origin);
      }
    });

    this.doc.on('destroy', () => {
      for (const handler of this.destroyHandlers) {
        handler();
      }
    });
  }

  /**
   * Apply a binary update to the document.
   */
  applyUpdate(update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(this.doc, update, origin);
  }

  /**
   * Get the full state as a binary update (for sending to new peers).
   */
  getUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Get the state vector (for computing diffs).
   */
  getStateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  /**
   * Get a diff update relative to a remote state vector.
   */
  getDiff(remoteStateVector: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
  }

  /**
   * Get or create a Y.Text shared type (for plain text editing).
   */
  getText(name: string = 'default'): Y.Text {
    return this.doc.getText(name);
  }

  /**
   * Get or create a Y.XmlFragment shared type (for rich text editing).
   */
  getXmlFragment(name: string = 'default'): Y.XmlFragment {
    return this.doc.getXmlFragment(name);
  }

  /**
   * Get or create a Y.Map shared type.
   */
  getMap<T = unknown>(name: string = 'default'): Y.Map<T> {
    return this.doc.getMap<T>(name);
  }

  /**
   * Get or create a Y.Array shared type.
   */
  getArray<T = unknown>(name: string = 'default'): Y.Array<T> {
    return this.doc.getArray<T>(name);
  }

  /**
   * Merge another document's state into this one.
   */
  merge(other: DocumentCRDT): void {
    const update = Y.encodeStateAsUpdate(other.doc);
    Y.applyUpdate(this.doc, update);
  }

  /**
   * Encode the full document state as a single binary snapshot.
   */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Decode and apply a full state snapshot.
   */
  decodeState(state: Uint8Array): void {
    Y.applyUpdate(this.doc, state);
  }

  /**
   * Execute a function within a Y.Doc transaction (batches updates).
   */
  transact(fn: () => void, origin?: unknown): void {
    this.doc.transact(fn, origin);
  }

  /**
   * Register a handler called on every document update.
   */
  onUpdate(handler: UpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => {
      this.updateHandlers.delete(handler);
    };
  }

  /**
   * Register a handler called when the document is destroyed.
   */
  onDestroy(handler: DestroyHandler): () => void {
    this.destroyHandlers.add(handler);
    return () => {
      this.destroyHandlers.delete(handler);
    };
  }

  /**
   * Get the current document version (clock).
   */
  getVersion(): number {
    // The clientID clock represents the local version
    return this.doc.store.getState().get(this.doc.clientID) ?? 0;
  }

  /**
   * Destroy the document and release resources.
   */
  destroy(): void {
    this.updateHandlers.clear();
    this.destroyHandlers.clear();
    this.doc.destroy();
  }
}
