import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { alertsApi } from '../services/api';
import { Alert } from '@shared/types';

interface AlertsState {
  alerts: Alert[];
  loading: boolean;
  unread: number;
  acknowledge: (id: string) => Promise<void>;
  resolve: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AlertsContext = createContext<AlertsState | null>(null);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await alertsApi.list(false);
      setAlerts(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAlerts();

    // Single shared WebSocket connection for real-time alerts
    const apiUrl = import.meta.env.VITE_API_URL ?? '';
    const wsUrl = (apiUrl || window.location.origin).replace(/^http/, 'ws');
    try {
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as { type: string; data?: Alert };
          if (payload.type === 'alert' && payload.data) {
            setAlerts((prev) => [payload.data!, ...prev.slice(0, 99)]);
          }
        } catch { /* ignore */ }
      };
      wsRef.current = ws;
    } catch { /* WebSocket unavailable */ }

    return () => { wsRef.current?.close(); };
  }, [fetchAlerts]);

  const acknowledge = async (id: string) => {
    await alertsApi.acknowledge(id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));
  };

  const resolve = async (id: string) => {
    await alertsApi.resolve(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const unread = alerts.filter((a) => !a.acknowledged).length;

  return (
    <AlertsContext.Provider value={{ alerts, loading, unread, acknowledge, resolve, refresh: fetchAlerts }}>
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts(): AlertsState {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider');
  return ctx;
}
