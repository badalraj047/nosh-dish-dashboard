import { useEffect, useId, useState } from 'react';
import { useDishDraft } from '../hooks/useDishDraft.js';
import { isHttpUrl, MAX_NAME_LENGTH, statusLabel } from '../utils.js';
import DishImage from './DishImage.jsx';

/** Warnings shown before saving. They mirror the backend rules but never block the request. */
function draftWarnings(draft, imageUrl) {
  if (!draft.isPublished) return [];
  const warnings = [];
  if (draft.dishName.trim() === '') warnings.push('A published dish needs a name.');
  if (!isHttpUrl(imageUrl)) warnings.push('This dish’s image URL is not a valid http(s) link, so it can’t be published.');
  return warnings;
}

/**
 * Inline "discard my draft?" step for reload actions. Replaces window.confirm so nothing
 * blocks the page and the warning sits next to the draft it affects.
 */
function ReloadAction({ label, isDirty, disabled, onReload, variant }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className={`btn ${variant}`} disabled={disabled}
              onClick={() => (isDirty ? setConfirming(true) : onReload())}>
        {label}
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label="Confirm discarding your draft">
      <span>Discard your unsaved changes and load the latest version?</span>
      <div className="confirm__actions">
        <button type="button" className="btn btn--danger" disabled={disabled}
                onClick={() => { setConfirming(false); onReload(); }}>
          Yes, discard and reload
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>Keep my draft</button>
      </div>
    </div>
  );
}

export default function DishCard({ dish, hidden = false, onServerDish, onDirtyChange }) {
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
  const warnings = isDirty && !error ? draftWarnings(draft, dish.imageUrl) : [];
  const nameLength = draft.dishName.length;

  // Ctrl+S / Cmd+S saves the card that has focus.
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };

  const stateClass = isDirty ? ' card--dirty' : justSaved ? ' card--saved' : '';

  // Hidden cards stay mounted (just not displayed) so filtering never throws away a draft.
  return (
    <article className={`card${stateClass}`} hidden={hidden} aria-labelledby={`${uid}-title`}>
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
            {justSaved && <span className="badge badge--saved" role="status">✓ Saved as v{base.version}</span>}
          </div>
        </header>

        <form className="card__form" onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={onKeyDown}>
          <div className="field">
            <div className="field__row">
              <label htmlFor={`${uid}-name`}>Name</label>
              {nameLength > MAX_NAME_LENGTH - 20 && (
                <span className="counter" aria-live="polite">{nameLength}/{MAX_NAME_LENGTH}</span>
              )}
            </div>
            <input
              id={`${uid}-name`}
              type="text"
              value={draft.dishName}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Dish name"
              className={nameChanged ? 'is-changed' : undefined}
              autoComplete="off"
            />
            {nameChanged && <small className="hint">Saved value: “{base.dishName || '(empty)'}”</small>}
          </div>

          <div className="field">
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={draft.isPublished}
                onChange={(e) => setPublished(e.target.checked)}
                disabled={saving}
              />
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
              <span className="switch__label">Published</span>
            </label>
            {publishedChanged && <small className="hint">Saved value: {statusLabel(base.isPublished).toLowerCase()}</small>}
          </div>

          {warnings.length > 0 && (
            <div className="notice notice--hint">
              {warnings.map((w) => <p key={w}>⚠ {w}</p>)}
              <p className="muted">The server will reject this save until it’s fixed.</p>
            </div>
          )}

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
              <ReloadAction label="Reload latest (discards your draft)" variant="btn--warn"
                            isDirty={isDirty} disabled={saving} onReload={reloadLatest} />
            </div>
          )}

          {!conflict && isDirty && newerAvailable && (
            <div className="notice notice--info" role="status">
              <p>
                Newer saved data is available (v{dish.version}: “{dish.dishName || '(empty)'}”,{' '}
                {statusLabel(dish.isPublished).toLowerCase()}). Your draft is based on v{base.version}, so saving it
                will be rejected as a conflict.
              </p>
              <ReloadAction label="Load latest (discards your draft)" variant="btn--secondary"
                            isDirty={isDirty} disabled={saving} onReload={reloadLatest} />
            </div>
          )}

          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={!isDirty || saving || Boolean(conflict)}
                    title="Save (Ctrl+S)" aria-keyshortcuts="Control+S">
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
