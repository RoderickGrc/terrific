import { useEffect, useRef, useState, useCallback } from 'react';
import { QAEvent } from '../../types';

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4568';

export function useWebSocket(sessionId: string | null, workspaceHash?: string | null, onEvent?: (event: QAEvent) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<QAEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!sessionId) {
      return;
    }

    try {
      // Build URL with workspace hash if provided
      const urlParams = new URLSearchParams({ sessionId });
      if (workspaceHash) {
        urlParams.append('workspace', workspaceHash);
      }
      const wsUrl = `${WS_BASE_URL}?${urlParams.toString()}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        console.log('WebSocket connected', { sessionId, workspaceHash });
      };

      ws.onmessage = (message) => {
        try {
          const event: QAEvent = JSON.parse(message.data);
          // Check for duplicates before adding
          setEvents((prev) => {
            const exists = prev.some(e => e.id === event.id);
            if (exists) {
              return prev;
            }
            return [...prev, event];
          });
          if (onEvent) {
            onEvent(event);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        console.log('WebSocket disconnected');

        // Attempt to reconnect with exponential backoff
        if (sessionId && reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [sessionId, workspaceHash, onEvent]);

  useEffect(() => {
    if (!sessionId) return;

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, workspaceHash]); // Include workspaceHash in dependencies

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    }
  }, []);

  return {
    isConnected,
    events,
    sendMessage,
  };
}

