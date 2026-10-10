// apps/web/src/usePoll.ts (owner: Dev D)
// 2 s polling, paused while the tab is hidden (PLAN 13.6 step 6): SSE does not
// survive the demo's optional quick tunnel, so polling is the transport.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Polled<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

export function usePoll<T>(load: () => Promise<T> | T, intervalMs = 2000): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const run = async () => {
      try {
        const result = await loadRef.current();
        if (!stopped) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!stopped) setLoading(false);
      }
    };

    const schedule = () => {
      if (stopped) return;
      if (document.hidden) return; // paused; visibilitychange restarts below
      timer = window.setTimeout(() => {
        void run().then(schedule);
      }, intervalMs);
    };

    const onVisibility = () => {
      if (!document.hidden && !stopped) {
        if (timer !== undefined) window.clearTimeout(timer);
        void run().then(schedule);
      }
    };

    void run().then(schedule);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}
