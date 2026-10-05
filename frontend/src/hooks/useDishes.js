import { useCallback, useEffect, useState } from 'react';
import { fetchDishes } from '../api.js';

export const POLL_INTERVAL_MS = 5000;

/**
 * Merge a fresh list into the current one, keeping whichever copy of each dish has the higher
 * version. A slow poll that started before a save can then never roll a dish back.
 */
export function mergeNewer(current, incoming) {
  const known = new Map(current.map((d) => [d.dishId, d]));
  return incoming.map((d) => {
    const prev = known.get(d.dishId);
    return prev && prev.version > d.version ? prev : d;
  });
}

/**
 * Owns the list of *saved* dishes as last seen from the server: initial load, error state,
 * and background polling (optional bonus). Drafts are not stored here; see useDishDraft.
 */
export function useDishes() {
  const [dishes, setDishes] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');
  const [sync, setSync] = useState({ connected: true, lastSyncedAt: null });

  const load = useCallback(async (signal) => {
    setStatus('loading');
    try {
      const list = await fetchDishes({ signal });
      setDishes(list);
      setSync({ connected: true, lastSyncedAt: new Date() });
      setStatus('ready');
    } catch (err) {
      if (signal?.aborted) return;
      setLoadError(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Polling: one request at a time, next one scheduled POLL_INTERVAL_MS after the previous
  // finishes. On failure we keep the last data, flag the connection and keep retrying.
  // Coming back online or returning to the tab triggers an immediate poll.
  useEffect(() => {
    if (status !== 'ready') return undefined;
    let stopped = false;
    let timer = null;
    let controller = null;

    async function poll() {
      clearTimeout(timer);
      controller?.abort();
      const mine = (controller = new AbortController());
      try {
        const fresh = await fetchDishes({ signal: mine.signal });
        if (stopped || mine !== controller) return;
        setDishes((prev) => mergeNewer(prev, fresh));
        setSync({ connected: true, lastSyncedAt: new Date() });
      } catch {
        if (stopped || mine !== controller) return;
        setSync((s) => ({ ...s, connected: false }));
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    const pollNow = () => { if (!stopped) poll(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') pollNow(); };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    window.addEventListener('online', pollNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('online', pollNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [status]);

  /** Saved data returned by PATCH (200 or 409) is the freshest we have; apply it immediately. */
  const applyServerDish = useCallback((dish) => {
    setDishes((prev) => prev.map((d) => (d.dishId === dish.dishId && dish.version >= d.version ? dish : d)));
  }, []);

  const retry = useCallback(() => load(), [load]);

  return { dishes, status, loadError, sync, retry, applyServerDish };
}
