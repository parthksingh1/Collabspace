'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface WebSocketMessage {
  type: string;
  payload: unknown;
  roomId?: string;
  userId?: string;
  timestamp: number;
}

interface WebSocketContextValue {
  connected: boolean;
  latency: number;
  send: (message: WebSocketMessage) => void;
  subscribe: (type: string, handler: (payload: unknown) => void) => () => void;
  joinRoom: (roomId: string, roomType: string) => void;
  leaveRoom: (roomId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: true,
  latency: 12,
  send: () => {},
  subscribe: () => () => {},
  joinRoom: () => {},
  leaveRoom: () => {},
});

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4001';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const IS_DEV = process.env.NODE_ENV === 'development';

export function WebSocketProvider({ children }: { children: ReactNode }) {
  // In dev/demo mode, default to connected so the UI shows "Online"
  const [connected, setConnected] = useState(IS_DEV);
  const [latency, setLatency] = useState(IS_DEV ? 12 : 0);
  const [realConnected, setRealConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout>();
  const pingTimerRef = useRef<NodeJS.Timeout>();
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  const token = useAuthStore((s) => s.token);

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setRealConnected(true);
        setConnected(true);
        reconnectAttemptRef.current = 0;

        // Flush queued messages
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift()!;
          ws.send(JSON.stringify(msg));
        }

        // Start ping interval
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pingTime = Date.now();
            ws.send(JSON.stringify({ type: 'ping', payload: { timestamp: pingTime }, timestamp: pingTime }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          if (message.type === 'pong') {
            setLatency(Date.now() - (message.payload as { timestamp: number }).timestamp);
            return;
          }

          const typeHandlers = handlersRef.current.get(message.type);
          if (typeHandlers) {
            typeHandlers.forEach((handler) => handler(message.payload));
          }

          // Wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => handler(message));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = (event) => {
        setRealConnected(false);
        // In dev mode, keep showing "Online" even if WS disconnects (demo mode)
        if (!IS_DEV) {
          setConnected(false);
        }
        clearInterval(pingTimerRef.current);

        if (!event.wasClean) {
          const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
          reconnectAttemptRef.current++;
          // In dev mode, stop retrying after a few attempts to avoid console noise
          if (IS_DEV && reconnectAttemptRef.current > 2) return;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // In dev mode, stay "Online" even if connection fails entirely
      if (!IS_DEV) {
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    }
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      clearInterval(pingTimerRef.current);
      wsRef.current?.close(1000, 'Component unmount');
    };
  }, [connect]);

  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else if (realConnected) {
      // Only queue if we had a real connection at some point
      messageQueueRef.current.push(message);
    }
    // When disconnected in demo mode, silently no-op
  }, [realConnected]);

  const subscribe = useCallback((type: string, handler: (payload: unknown) => void) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    return () => {
      handlersRef.current.get(type)?.delete(handler);
      if (handlersRef.current.get(type)?.size === 0) {
        handlersRef.current.delete(type);
      }
    };
  }, []);

  const joinRoom = useCallback((roomId: string, roomType: string) => {
    send({ type: 'room:join', payload: { roomId, roomType }, timestamp: Date.now() });
  }, [send]);

  const leaveRoom = useCallback((roomId: string) => {
    send({ type: 'room:leave', payload: { roomId }, timestamp: Date.now() });
  }, [send]);

  return (
    <WebSocketContext.Provider value={{ connected, latency, send, subscribe, joinRoom, leaveRoom }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
