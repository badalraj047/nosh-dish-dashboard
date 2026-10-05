import { useEffect, useId } from 'react';
import { useDishDraft } from '../hooks/useDishDraft.js';
import DishImage from './DishImage.jsx';

const statusLabel = (published) => (published ? 'Published' : 'Unpublished');

export default function DishCard({ dish, onServerDish, onDirtyChange }) {
  const {
    base, draft, isDirty, nameChanged, publishedChanged, newerAvailable,
    saving, error, conflict, justSaved,
    setName, setPublished, save, discard, reloadLatest,
  } = useDishDraft(dish, onServerDish);
  const uid = useId();

  useEffect(() => {
    onDirtyChange(dish.dishId, isDirty);
    return () => onDirtyChange(dish.dishId, false);
  }, [dish.dishId, isDirty, onDirtyChange]);

  const canRetry = error && error.kind !== 'validation';

  return (
    <article className={`card${isDirty ? ' card--dirty' : ''}`} aria-labelledby={`${uid}-title`}>
      <DishImage key={dish.imageUrl} src={dish.imageUrl} alt={base.dishName || `Dish ${dish.dishId}`} />

      <div className="card__body">
        <header className="card__head">
          <h2 id={`${uid}-title`} className="card__title">
            {base.dishName || <span className="muted">(no name)</span>}
          </h2>
          <div className="meta">
            <span>ID <code>{dish.dishId}</code></span>
            <span>Version <strong>v{base.version}</strong></span>
          </div>
          <div className="badges">
            <span className={`badge ${base.isPublished ? 'badge--published' : 'badge--unpublished'}`}>
              {statusLabel(base.isPublished)}
            </span>
            {isDirty && <span className="badge badge--unsaved">Unsaved changes</span>}
            {justSaved && <span className="badge badge--saved" role="status">Saved as v{base.version}</span>}
          </div>
        </header>

        <form className="card__form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="field">
            <label htmlFor={`${uid}-name`}>Name</label>
            <input
              id={`${uid}-name`}
              type="text"
              value={draft.dishName}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className={nameChanged ? 'is-changed' : undefined}
              autoComplete="off"
            />
            {nameChanged && <small className="hint">Saved value: “{base.dishName || '(empty)'}”</small>}
          </div>

          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => setPublished(e.target.checked)}
                disabled={saving}
              />
              <span>Published</span>
            </label>
            {publishedChanged && <small className="hint">Saved value: {statusLabel(base.isPublished).toLowerCase()}</small>}
          </div>

          {error && (
            <div className="notice notice--error" role="alert">
              <p>{error.message}</p>
              {error.details?.length > 0 && (
                <ul>{error.details.map((d) => <li key={d}>{d}</li>)}</ul>
              )}
            </div>
          )}

          {conflict && (
            <div className="notice notice--conflict" role="alert">
              <p><strong>Not saved: this dish was changed by another update.</strong></p>
              <p>
                Your draft was based on v{base.version}, but v{conflict.version} is now saved
                (“{conflict.dishName || '(empty)'}”, {statusLabel(conflict.isPublished).toLowerCase()}).
                Your draft is still in the form above; nothing was overwritten.
              </p>
              <button type="button" className="btn btn--warn" onClick={reloadLatest} disabled={saving}>
                Reload latest (discards your draft)
              </button>
            </div>
          )}

          {!conflict && isDirty && newerAvailable && (
            <div className="notice notice--info" role="status">
              <p>
                Newer saved data is available (v{dish.version}: “{dish.dishName || '(empty)'}”,{' '}
                {statusLabel(dish.isPublished).toLowerCase()}). Your draft is based on v{base.version}, so saving it
                will be rejected as a conflict.
              </p>
              <button type="button" className="btn btn--secondary" onClick={reloadLatest} disabled={saving}>
                Load latest (discards your draft)
              </button>
            </div>
          )}

          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={!isDirty || saving || Boolean(conflict)}>
              {saving ? 'Saving…' : canRetry ? 'Retry save' : 'Save'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={discard} disabled={saving || (!isDirty && !conflict)}>
              Discard
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}
