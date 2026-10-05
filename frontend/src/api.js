const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const TIMEOUT_MS = 10_000;

/** The request never got an HTTP response (backend down, offline, timed out). */
export class NetworkError extends Error {}

/**
 * Low-level request helper. Resolves with { ok, status, data } for any HTTP response
 * (including 4xx/5xx) and throws NetworkError only when no response arrived.
 * A caller-initiated abort is rethrown unchanged (err.name === 'AbortError').
 */
async function request(path, { signal, ...init } = {}) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_URL + path, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new NetworkError(timeout.aborted ? 'The server took too long to respond.' : 'Could not reach the server.');
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export async function fetchDishes({ signal } = {}) {
  const { ok, status, data } = await request('/dishes', { signal });
  if (!ok || !Array.isArray(data)) throw new Error(data?.error || `Failed to load dishes (HTTP ${status})`);
  return data;
}

/** Sends the full draft plus the version it was based on. Never retried automatically. */
export function saveDish(dishId, { dishName, isPublished, expectedVersion }) {
  return request(`/dishes/${encodeURIComponent(dishId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dishName, isPublished, expectedVersion }),
  });
}
