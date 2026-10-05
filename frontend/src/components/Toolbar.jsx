export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'unpublished', label: 'Unpublished' },
  { id: 'unsaved', label: 'Unsaved' },
];

/** Search box + status filter chips. Filtering only hides cards; it never discards drafts. */
export default function Toolbar({ query, onQueryChange, filter, onFilterChange, counts, searchRef }) {
  return (
    <div className="toolbar">
      <div className="search">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.41-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z" />
        </svg>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onQueryChange(''); }}
          placeholder="Search by name or ID"
          aria-label="Search dishes by name or ID"
        />
        <kbd className="search__key" aria-hidden="true">/</kbd>
      </div>

      <div className="chips" role="group" aria-label="Filter dishes by status">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`chip${filter === id ? ' chip--active' : ''}${id === 'unsaved' && counts.unsaved > 0 ? ' chip--attention' : ''}`}
            aria-pressed={filter === id}
            disabled={id === 'unsaved' && counts.unsaved === 0}
            onClick={() => onFilterChange(id)}
          >
            {label} <span className="chip__count">{counts[id]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
