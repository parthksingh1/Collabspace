import * as Y from 'yjs';
import {
  Awareness as YAwareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';

// ─── Types ─────────────────────────────────────────────────────────

export interface CursorPosition {
  /** Anchor position (start of selection). */
  anchor: number;
  /** Head position (end of selection / cursor). */
  head: number;
}

export interface UserInfo {
  userId: string;
  name: string;
  avatar: string | null;
  color: string;
}

export interface AwarenessState {
  user: UserInfo;
  cursor: CursorPosition | null;
  selection: { anchor: number; head: number } | null;
  isTyping: boolean;
  lastActive: number;
}

export type AwarenessChangeHandler = (changes: {
  added: number[];
  updated: number[];
  removed: number[];
}) => void;

// ─── Predefined cursor colors ──────────────────────────────────────

const CURSOR_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#14B8A6', // teal
  '#6366F1', // indigo
];

/**
 * Manages awareness (cursor positions, selections, presence) for CRDT documents.
 */
export class AwarenessManager {
  public readonly awareness: YAwareness;
  private readonly changeHandlers: Set<AwarenessChangeHandler> = new Set();
  private colorIndex: number = 0;

  constructor(doc: Y.Doc) {
    this.awareness = new YAwareness(doc);

    this.awareness.on(
      'change',
      (changes: { added: number[]; updated: number[]; removed: number[] }) => {
        for (const handler of this.changeHandlers) {
          handler(changes);
        }
      },
    );
  }

  /**
   * Get a deterministic color for a user based on assignment order.
   */
  private getNextColor(): string {
    const color = CURSOR_COLORS[this.colorIndex % CURSOR_COLORS.length]!;
    this.colorIndex++;
    return color;
  }

  /**
   * Set the local awareness state (cursor, user info, etc.).
   */
  setLocalState(state: Partial<AwarenessState>): void {
    const currentState = (this.awareness.getLocalState() as AwarenessState | null) ?? {};
    this.awareness.setLocalStateField('user', state.user ?? (currentState as AwarenessState).user);

    if (state.cursor !== undefined) {
      this.awareness.setLocalStateField('cursor', state.cursor);
    }
    if (state.selection !== undefined) {
      this.awareness.setLocalStateField('selection', state.selection);
    }
    if (state.isTyping !== undefined) {
      this.awareness.setLocalStateField('isTyping', state.isTyping);
    }

    this.awareness.setLocalStateField('lastActive', Date.now());
  }

  /**
   * Initialize local user presence.
   */
  setUser(userInfo: Omit<UserInfo, 'color'>): void {
    const color = this.getNextColor();
    this.setLocalState({
      user: { ...userInfo, color },
      cursor: null,
      selection: null,
      isTyping: false,
    });
  }

  /**
   * Update the local cursor position.
   */
  setCursor(cursor: CursorPosition | null): void {
    this.setLocalState({ cursor });
  }

  /**
   * Update the local typing indicator.
   */
  setTyping(isTyping: boolean): void {
    this.setLocalState({ isTyping });
  }

  /**
   * Get all awareness states indexed by client ID.
   */
  getStates(): Map<number, AwarenessState> {
    return this.awareness.getStates() as Map<number, AwarenessState>;
  }

  /**
   * Get the local client's awareness state.
   */
  getLocalState(): AwarenessState | null {
    return (this.awareness.getLocalState() as AwarenessState) ?? null;
  }

  /**
   * Get the local client ID.
   */
  getLocalClientId(): number {
    return this.awareness.clientID;
  }

  /**
   * Remove awareness states for given client IDs.
   */
  removeStates(clientIds: number[]): void {
    removeAwarenessStates(this.awareness, clientIds, 'removed');
  }

  /**
   * Encode the full awareness state as a binary update.
   */
  encodeUpdate(clientIds?: number[]): Uint8Array {
    const ids = clientIds ?? Array.from(this.awareness.getStates().keys());
    return encodeAwarenessUpdate(this.awareness, ids);
  }

  /**
   * Apply a binary awareness update received from a remote peer.
   */
  applyUpdate(update: Uint8Array, origin?: unknown): void {
    applyAwarenessUpdate(this.awareness, update, origin);
  }

  /**
   * Register a handler for awareness changes.
   */
  onChange(handler: AwarenessChangeHandler): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  /**
   * Get a list of all currently connected users.
   */
  getConnectedUsers(): AwarenessState[] {
    const states = this.getStates();
    const users: AwarenessState[] = [];
    states.forEach((state) => {
      if (state.user) {
        users.push(state);
      }
    });
    return users;
  }

  /**
   * Destroy the awareness instance and clean up.
   */
  destroy(): void {
    this.changeHandlers.clear();
    this.awareness.destroy();
  }
}
