import { POLL_INTERVAL_MS } from '../hooks/useDishes.js';

const seconds = POLL_INTERVAL_MS / 1000;

export default function SyncStatus({ sync }) {
  if (!sync.connected) {
    return (
      <span className="pill pill--warn" role="status" title="Showing the last loaded data. Your drafts are kept.">
        <span className="dot dot--warn" aria-hidden="true" /> Can’t reach server · retrying every {seconds} s
      </span>
    );
  }
  return (
    <span className="pill pill--ok" title={`Checks for saved changes every ${seconds} s`}>
      <span className="dot dot--ok" aria-hidden="true" /> Live
      {sync.lastSyncedAt && ` · synced ${sync.lastSyncedAt.toLocaleTimeString()}`}
    </span>
  );
}
