import { useCallback, useEffect, useState } from 'react';
import { POLL_INTERVAL_MS, useDishes } from './hooks/useDishes.js';
import DishCard from './components/DishCard.jsx';

function SyncStatus({ sync, unsavedCount }) {
  return (
    <div className="sync">
      {sync.connected ? (
        <span className="pill pill--ok" title={`Checks for saved changes every ${POLL_INTERVAL_MS / 1000} s`}>
          Live{sync.lastSyncedAt && ` · synced ${sync.lastSyncedAt.toLocaleTimeString()}`}
        </span>
      ) : (
        <span className="pill pill--warn" role="status" title="Showing the last loaded data. Your drafts are kept.">
          Can’t reach server · retrying every {POLL_INTERVAL_MS / 1000} s
        </span>
      )}
      {unsavedCount > 0 && (
        <span className="pill pill--unsaved">
          {unsavedCount} unsaved {unsavedCount === 1 ? 'draft' : 'drafts'}
        </span>
      )}
    </div>
  );
}

export default function App() {
  const { dishes, status, loadError, sync, retry, applyServerDish } = useDishes();
  const [dirtyIds, setDirtyIds] = useState(() => new Set());

  const onDirtyChange = useCallback((dishId, dirty) => {
    setDirtyIds((prev) => {
      if (prev.has(dishId) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(dishId); else next.delete(dishId);
      return next;
    });
  }, []);

  // Drafts live only in memory: warn before a refresh/close would throw them away.
  useEffect(() => {
    if (dirtyIds.size === 0) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyIds.size]);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Dish Dashboard</h1>
          <p className="muted">Edits stay local until you press Save.</p>
        </div>
        {status === 'ready' && <SyncStatus sync={sync} unsavedCount={dirtyIds.size} />}
      </header>

      <main>
        {status === 'loading' && (
          <div className="state" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>Loading dishes…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="state state--error" role="alert">
            <h2>Couldn’t load dishes</h2>
            <p>{loadError}</p>
            <p className="muted">Check that the backend is running (see README), then try again.</p>
            <button type="button" className="btn btn--primary" onClick={retry}>Try again</button>
          </div>
        )}

        {status === 'ready' && dishes.length === 0 && (
          <div className="state">
            <h2>No dishes yet</h2>
            <p className="muted">Seed the database with <code>npm run seed</code> in <code>backend/</code>.</p>
          </div>
        )}

        {status === 'ready' && dishes.length > 0 && (
          <div className="grid">
            {dishes.map((dish) => (
              <DishCard key={dish.dishId} dish={dish} onServerDish={applyServerDish} onDirtyChange={onDirtyChange} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
