import { useEffect, useState } from 'react';
import { NetworkError, saveDish } from '../api.js';

const savedValues = ({ dishName, isPublished, version }) => ({ dishName, isPublished, version });
const editableValues = ({ dishName, isPublished }) => ({ dishName, isPublished });
const newest = (a, b) => (b && b.version > a.version ? b : a);

/**
 * Local draft state for one dish.
 *
 *  base     the saved values this card last loaded (base.version is sent as expectedVersion)
 *  draft    the user's local edits; exists only in memory until Save succeeds
 *  isDirty  draft differs from base -> "Unsaved changes"
 *  conflict the server's current dish after a 409; the draft is kept untouched
 *
 * `server` is the latest saved copy known to the app (from polling or from save responses).
 */
export function useDishDraft(server, onServerDish) {
  const [base, setBase] = useState(() => savedValues(server));
  const [draft, setDraft] = useState(() => editableValues(server));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null); // { kind: 'validation' | 'network' | 'server', message, details? }
  const [conflict, setConflict] = useState(null);
  const [savedVersion, setSavedVersion] = useState(null);

  const nameChanged = draft.dishName !== base.dishName;
  const publishedChanged = draft.isPublished !== base.isPublished;
  const isDirty = nameChanged || publishedChanged;
  const newerAvailable = server.version > base.version;

  function loadSaved(dish) {
    setBase(savedValues(dish));
    setDraft(editableValues(dish));
    setConflict(null);
    setError(null);
  }

  // No draft: follow the latest saved data automatically (picks up external updates).
  // Draft present: never replace it in the background; the card shows a notice instead.
  useEffect(() => {
    if (newerAvailable && !isDirty && !saving && !conflict) loadSaved(server);
  }, [newerAvailable, isDirty, saving, conflict, server]);

  // "Saved" confirmation is shown briefly after a successful save.
  useEffect(() => {
    if (savedVersion === null) return undefined;
    const timer = setTimeout(() => setSavedVersion(null), 4000);
    return () => clearTimeout(timer);
  }, [savedVersion]);

  const setName = (dishName) => setDraft((d) => ({ ...d, dishName }));
  const setPublished = (isPublished) => setDraft((d) => ({ ...d, isPublished }));

  /** Drop the draft and go back to the last loaded saved values. */
  function discard() {
    setDraft(editableValues(base));
    setError(null);
    setConflict(null);
  }

  /** Replace base and draft with the newest saved data. The UI asks for confirmation first if a draft would be lost. */
  function reloadLatest() {
    loadSaved(newest(server, conflict));
  }

  async function save() {
    if (saving || !isDirty || conflict) return;
    setSaving(true);
    setError(null);
    try {
      const { ok, status, data } = await saveDish(server.dishId, { ...draft, expectedVersion: base.version });
      if (ok) {
        loadSaved(data);
        setSavedVersion(data.version);
        onServerDish(data);
      } else if (status === 409 && data?.current) {
        setConflict(data.current); // draft stays exactly as the user left it
        onServerDish(data.current);
      } else if (status === 400) {
        const details = data?.details?.map((d) => d.message) ?? [];
        setError({ kind: 'validation', message: details.length ? 'The server rejected this change:' : data?.error || 'Invalid request.', details });
      } else if (status === 404) {
        setError({ kind: 'server', message: 'This dish no longer exists on the server.' });
      } else {
        setError({ kind: 'server', message: `${data?.error || 'Server error'} (HTTP ${status}). Your draft is kept; try again.` });
      }
    } catch (err) {
      const reason = err instanceof NetworkError ? err.message : 'Save failed unexpectedly.';
      setError({ kind: 'network', message: `${reason} Your draft is kept; retry when the backend is reachable.` });
    } finally {
      setSaving(false);
    }
  }

  return {
    base, draft, isDirty, nameChanged, publishedChanged, newerAvailable,
    saving, error, conflict, justSaved: !isDirty && savedVersion === base.version,
    setName, setPublished, save, discard, reloadLatest,
  };
}
