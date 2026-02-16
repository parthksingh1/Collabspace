'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useAuthStore } from '@/stores/auth-store';
import { generateColor } from '@/lib/utils';

const WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:4002';

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000];

/**
 * Message types for the Y.js WebSocket protocol.
 * 0 = sync step 1, 1 = sync step 2, 2 = update, 3 = awareness
 */
const MSG_SYNC = 0;
const MSG_AWARENESS = 3;

interface CollaborationState {
  ydoc: Y.Doc;
  provider: WebSocketProvider | null;
  awareness: Awareness;
  connected: boolean;
  synced: boolean;
}

/**
 * Minimal WebSocket provider for Yjs that handles
 * CRDT sync, awareness, reconnection, and cleanup.
 */
class WebSocketProvider {
  public ws: WebSocket | null = null;
  public synced = false;
  public connected = false;
  public awareness: Awareness;
  public destroyed = false;

  private ydoc: Y.Doc;
  private roomId: string;
  private token: string;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatusChange: (status: { connected: boolean; synced: boolean }) => void;
  private updateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessUpdateHandler: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;

  constructor(
    roomId: string,
    ydoc: Y.Doc,
    awareness: Awareness,
    token: string,
    onStatusChange: (status: { connected: boolean; synced: boolean }) => void
  ) {
    this.roomId = roomId;
    this.ydoc = ydoc;
    this.awareness = awareness;
    this.token = token;
    this.onStatusChange = onStatusChange;

    // Listen for local doc updates and send to server
    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === this) return; // Skip updates that came from the server
      this.sendMessage(MSG_SYNC, update);
    };
    this.ydoc.on('update', this.updateHandler);

    // Listen for awareness changes and broadcast
    this.awarenessUpdateHandler = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === 'remote') return;
      const changedClients = [...added, ...updated, ...removed];
      const encodedAwareness = this.encodeAwarenessUpdate(changedClients);
      if (encodedAwareness) {
        this.sendMessage(MSG_AWARENESS, encodedAwareness);
      }
    };
    this.awareness.on('update', this.awarenessUpdateHandler);

    this.connect();
  }

  private encodeAwarenessUpdate(clientIds: number[]): Uint8Array | null {
    const states = this.awareness.getStates();
    const updates: Array<{ clientId: number; state: unknown }> = [];
    for (const clientId of clientIds) {
      const state = states.get(clientId);
      updates.push({ clientId, state: state || null });
    }
    if (updates.length === 0) return null;
    // Encode as JSON for simplicity (production would use y-protocols encoding)
    const json = JSON.stringify(updates);
    return new TextEncoder().encode(json);
  }

  connect() {
    if (this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const url = `${WS_URL}/collab/${this.roomId}?token=${encodeURIComponent(this.token)}`;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.onStatusChange({ connected: true, synced: this.synced });

        // Request initial sync
        this.sendMessage(MSG_SYNC, new Uint8Array(Y.encodeStateVector(this.ydoc)));

        // Send initial awareness
        const awarenessUpdate = this.encodeAwarenessUpdate([this.ydoc.clientID]);
        if (awarenessUpdate) {
          this.sendMessage(MSG_AWARENESS, awarenessUpdate);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          this.handleBinaryMessage(new Uint8Array(data));
        } else if (typeof data === 'string') {
          this.handleStringMessage(data);
        }
      };

      ws.onclose = () => {
        this.connected = false;
        this.synced = false;
        this.onStatusChange({ connected: false, synced: false });

        if (!this.destroyed) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private handleBinaryMessage(data: Uint8Array) {
    if (data.length < 1) return;
    const msgType = data[0];
    const payload = data.slice(1);

    switch (msgType) {
      case MSG_SYNC: {
        // Apply remote update
        Y.applyUpdate(this.ydoc, payload, this);
        if (!this.synced) {
          this.synced = true;
          this.onStatusChange({ connected: true, synced: true });
        }
        break;
      }
      case MSG_AWARENESS: {
        // Apply remote awareness
        try {
          const json = new TextDecoder().decode(payload);
          const updates: Array<{ clientId: number; state: unknown }> = JSON.parse(json);
          for (const { clientId, state } of updates) {
            if (clientId !== this.ydoc.clientID) {
              this.awareness.setLocalStateField('remote', true);
              // Use internal states map for remote awareness
              const currentStates = this.awareness.getStates();
              if (state === null) {
                currentStates.delete(clientId);
              } else {
                currentStates.set(clientId, state as Record<string, unknown>);
              }
              this.awareness.emit('change', [
                { added: state ? [clientId] : [], updated: [], removed: state ? [] : [clientId] },
                'remote',
              ]);
            }
          }
        } catch {
          // Ignore malformed awareness messages
        }
        break;
      }
    }
  }

  private handleStringMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'sync' && msg.update) {
        const update = Uint8Array.from(Object.values(msg.update as Record<string, number>));
        Y.applyUpdate(this.ydoc, update, this);
        if (!this.synced) {
          this.synced = true;
          this.onStatusChange({ connected: true, synced: true });
        }
      } else if (msg.type === 'awareness' && msg.states) {
        for (const [clientIdStr, state] of Object.entries(msg.states)) {
          const clientId = Number(clientIdStr);
          if (clientId !== this.ydoc.clientID) {
            const currentStates = this.awareness.getStates();
            if (state === null) {
              currentStates.delete(clientId);
            } else {
              currentStates.set(clientId, state as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      // Ignore malformed string messages
    }
  }

  private sendMessage(type: number, payload: Uint8Array) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const message = new Uint8Array(1 + payload.length);
    message[0] = type;
    message.set(payload, 1);
    this.ws.send(message);
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay =
      RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Provider disconnect');
      this.ws = null;
    }
    this.connected = false;
    this.synced = false;
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
    this.ydoc.off('update', this.updateHandler);
    this.awareness.off('update', this.awarenessUpdateHandler);
    this.awareness.destroy();
  }
}

export function useCollaboration(documentId: string) {
  const [state, setState] = useState<CollaborationState>(() => {
    const ydoc = new Y.Doc();
    return {
      ydoc,
      provider: null,
      awareness: new Awareness(ydoc),
      connected: false,
      synced: false,
    };
  });

  const providerRef = useRef<WebSocketProvider | null>(null);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const handleStatusChange = useCallback(
    (status: { connected: boolean; synced: boolean }) => {
      setState((prev) => ({
        ...prev,
        connected: status.connected,
        synced: status.synced,
      }));
    },
    []
  );

  useEffect(() => {
    if (!documentId || !token || !user) return;

    // Create a fresh Y.Doc and Awareness for each document connection
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);

    // Set local awareness state with user info
    awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: generateColor(user.id),
    });

    const provider = new WebSocketProvider(
      documentId,
      ydoc,
      awareness,
      token,
      handleStatusChange
    );
    providerRef.current = provider;

    setState({
      ydoc,
      provider,
      awareness,
      connected: false,
      synced: false,
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
    };
  }, [documentId, token, user, handleStatusChange]);

  return {
    ydoc: state.ydoc,
    provider: state.provider,
    awareness: state.awareness,
    connected: state.connected,
    synced: state.synced,
  };
}
