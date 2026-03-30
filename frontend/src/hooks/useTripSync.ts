import { useState, useEffect, useRef, useCallback } from "react";

interface SyncEvent {
  type: string;
  userCode?: string;
  displayName?: string;
  description?: string;
  timestamp?: number;
}

interface UseTripSyncResult {
  pendingChanges: number;
  latestAction: string | null;
  connected: boolean;
  dismiss: () => void;
}

export default function useTripSync(
  tripId: string | undefined,
  userCode: string | undefined,
): UseTripSyncResult {
  const [pendingChanges, setPendingChanges] = useState(0);
  const [latestAction, setLatestAction] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setPendingChanges(0);
    setLatestAction(null);
    // Trigger data refresh
    window.dispatchEvent(new CustomEvent("wander:data-changed"));
  }, []);

  useEffect(() => {
    if (!tripId || !userCode) return;

    const clientId = Math.random().toString(36).slice(2);

    function connect() {
      // Don't connect if offline
      if (!navigator.onLine) {
        setConnected(false);
        return;
      }

      const token = localStorage.getItem("wander:token") || localStorage.getItem("wander_token");
      const url = `/api/sse/trip/${tripId}?clientId=${clientId}&userCode=${userCode}&token=${token}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        retryCountRef.current = 0; // Reset backoff on successful connection
      };

      es.onmessage = (event) => {
        try {
          const data: SyncEvent = JSON.parse(event.data);
          if (data.type === "connected") {
            setConnected(true);
            return;
          }
          if (data.type === "change" && data.userCode !== userCode) {
            setPendingChanges((n) => n + 1);
            setLatestAction(`${data.displayName} ${data.description?.toLowerCase().slice(0, 60) || "made a change"}`);
          }
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
        retryCountRef.current++;

        retryTimerRef.current = setTimeout(() => {
          if (navigator.onLine) {
            connect();
          }
        }, delay);
      };
    }

    connect();

    // Reconnect when coming back online
    function handleOnline() {
      if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
        retryCountRef.current = 0;
        connect();
      }
    }

    function handleOffline() {
      setConnected(false);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [tripId, userCode]);

  return { pendingChanges, latestAction, connected, dismiss };
}
