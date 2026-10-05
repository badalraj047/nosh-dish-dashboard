import { useCallback, useEffect, useRef, useState } from 'react';
import { useDishes } from './hooks/useDishes.js';
import DishCard from './components/DishCard.jsx';
import SyncStatus from './components/SyncStatus.jsx';
import Toolbar, { FILTERS } from './components/Toolbar.jsx';

function matchesFilter(dish, filter, dirtyIds) {
  switch (filter) {
    case 'published': return dish.isPublished;
    case 'unpublished': return !dish.isPublished;
    case 'unsaved': return dirtyIds.has(dish.dishId);
    default: return true;
  }
}

function matchesQuery(dish, query) {
  const q = query.trim().toLowerCase();
  return !q || dish.dishName.toLowerCase().includes(q) || dish.dishId.toLowerCase().includes(q);
}

function LoadingGrid() {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading dishes">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card card--skeleton" aria-hidden="true">
          <div className="card__media skeleton" />
          <div className="card__body">
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--input" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { dishes, status, loadError, sync, retry, applyServerDish } = useDishes();
  const [dirtyIds, setDirtyIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const searchRef = useRef(null);

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

  // Once the last draft is saved or discarded, the "Unsaved" view would be empty: go back to all
  // dishes so the user sees the card they just saved (with its "Saved" badge).
  useEffect(() => {
    if (filter === 'unsaved' && dirtyIds.size === 0) setFilter('all');
  }, [filter, dirtyIds.size]);

  // "/" focuses the search box (unless the user is already typing somewhere).
  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = {
    all: dishes.length,
    published: dishes.filter((d) => d.isPublished).length,
    unpublished: dishes.filter((d) => !d.isPublished).length,
    unsaved: dirtyIds.size,
  };
  const isVisible = (d) => matchesFilter(d, filter, dirtyIds) && matchesQuery(d, query);
  const visibleCount = dishes.filter(isVisible).length;
  const filterLabel = FILTERS.find((f) => f.id === filter)?.label.toLowerCase();
  const clearFilters = () => { setQuery(''); setFilter('all'); };

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Dish Dashboard</h1>
          <p className="muted">
            Changes stay as drafts until you press <strong>Save</strong>
            <span className="desktop-only"> · <kbd>Ctrl</kbd>+<kbd>S</kbd> saves the card you’re editing</span>
          </p>
        </div>
        {status === 'ready' && (
          <div className="topbar__status">
            <SyncStatus sync={sync} />
            {counts.unsaved > 0 && (
              <button type="button" className="pill pill--unsaved" onClick={() => setFilter('unsaved')}
                      title="Show only dishes with unsaved changes">
                {counts.unsaved} unsaved {counts.unsaved === 1 ? 'draft' : 'drafts'}
              </button>
            )}
          </div>
        )}
      </header>

      <main>
        {status === 'loading' && <LoadingGrid />}

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
          <>
            <Toolbar query={query} onQueryChange={setQuery} filter={filter} onFilterChange={setFilter}
                     counts={counts} searchRef={searchRef} />

            {visibleCount === 0 && (
              <div className="state">
                <h2>No matching dishes</h2>
                <p className="muted">
                  {query.trim() ? `Nothing matches “${query.trim()}”` : 'No dishes'}
                  {filter !== 'all' && ` in “${filterLabel}”`}.
                </p>
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>Clear search and filters</button>
              </div>
            )}

            {/* Every card stays mounted; non-matching ones are only hidden, so their drafts survive filtering. */}
            <div className="grid">
              {dishes.map((dish) => (
                <DishCard key={dish.dishId} dish={dish} hidden={!isVisible(dish)}
                          onServerDish={applyServerDish} onDirtyChange={onDirtyChange} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
