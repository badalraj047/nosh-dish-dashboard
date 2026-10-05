import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

vi.mock('../api.js', () => {
  class NetworkError extends Error {}
  return { NetworkError, saveDish: vi.fn(), fetchDishes: vi.fn() };
});

import { NetworkError, saveDish } from '../api.js';
import { useDishDraft } from '../hooks/useDishDraft.js';

const dish = (overrides = {}) => ({
  dishId: '1', dishName: 'Jeera Rice', imageUrl: 'https://example.com/a.jpg', isPublished: true, version: 1, ...overrides,
});

function setup(server = dish()) {
  const onServerDish = vi.fn();
  const hook = renderHook(({ server: s }) => useDishDraft(s, onServerDish), { initialProps: { server } });
  return { ...hook, onServerDish };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('useDishDraft', () => {
  test('edits stay local until Save; Discard restores the loaded values', () => {
    const { result } = setup();
    act(() => result.current.setName('Jeera Rice Bowl'));
    act(() => result.current.setPublished(false));

    expect(result.current.isDirty).toBe(true);
    expect(result.current.nameChanged).toBe(true);
    expect(result.current.publishedChanged).toBe(true);
    expect(saveDish).not.toHaveBeenCalled();

    act(() => result.current.discard());
    expect(result.current.draft).toEqual({ dishName: 'Jeera Rice', isPublished: true });
    expect(result.current.isDirty).toBe(false);
  });

  test('Save sends the draft with the originally loaded version and applies the saved result', async () => {
    const saved = dish({ dishName: 'Jeera Rice Bowl', version: 2 });
    saveDish.mockResolvedValue({ ok: true, status: 200, data: saved });
    const { result, onServerDish } = setup();

    act(() => result.current.setName('Jeera Rice Bowl'));
    await act(() => result.current.save());

    expect(saveDish).toHaveBeenCalledWith('1', { dishName: 'Jeera Rice Bowl', isPublished: true, expectedVersion: 1 });
    expect(result.current.base).toEqual({ dishName: 'Jeera Rice Bowl', isPublished: true, version: 2 });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.justSaved).toBe(true);
    expect(onServerDish).toHaveBeenCalledWith(saved);
  });

  test('marks the request in progress so the UI can disable Save', async () => {
    let resolve;
    saveDish.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = setup();
    act(() => result.current.setName('X'));

    let pending;
    act(() => { pending = result.current.save(); });
    expect(result.current.saving).toBe(true);

    await act(async () => { resolve({ ok: true, status: 200, data: dish({ dishName: 'X', version: 2 }) }); await pending; });
    expect(result.current.saving).toBe(false);
  });

  test('409 keeps the draft untouched, never retries, and reload loads the newer version', async () => {
    const current = dish({ dishName: 'Saved elsewhere', version: 2 });
    saveDish.mockResolvedValue({ ok: false, status: 409, data: { code: 'VERSION_CONFLICT', current } });
    const { result, onServerDish } = setup();

    act(() => result.current.setName('My draft'));
    await act(() => result.current.save());

    expect(result.current.conflict).toEqual(current);
    expect(result.current.draft.dishName).toBe('My draft');
    expect(result.current.base.version).toBe(1);
    expect(onServerDish).toHaveBeenCalledWith(current);

    await act(() => result.current.save()); // blocked while the conflict is unresolved
    expect(saveDish).toHaveBeenCalledTimes(1);

    act(() => result.current.reloadLatest());
    expect(result.current.conflict).toBeNull();
    expect(result.current.draft.dishName).toBe('Saved elsewhere');
    expect(result.current.base.version).toBe(2);
  });

  test('400 shows the server messages and keeps the draft for correction', async () => {
    saveDish.mockResolvedValue({
      ok: false, status: 400,
      data: { code: 'VALIDATION_FAILED', details: [{ field: 'dishName', message: 'A published dish must have a non-empty name' }] },
    });
    const { result } = setup();

    act(() => result.current.setName('   '));
    await act(() => result.current.save());

    expect(result.current.error).toMatchObject({ kind: 'validation', details: ['A published dish must have a non-empty name'] });
    expect(result.current.draft.dishName).toBe('   ');
    expect(result.current.isDirty).toBe(true);
  });

  test('network failure keeps the draft and a retry can succeed', async () => {
    saveDish
      .mockRejectedValueOnce(new NetworkError('Could not reach the server.'))
      .mockResolvedValueOnce({ ok: true, status: 200, data: dish({ dishName: 'Retry me', version: 2 }) });
    const { result } = setup();

    act(() => result.current.setName('Retry me'));
    await act(() => result.current.save());
    expect(result.current.error.kind).toBe('network');
    expect(result.current.draft.dishName).toBe('Retry me');

    await act(() => result.current.save());
    expect(result.current.error).toBeNull();
    expect(result.current.base.version).toBe(2);
  });

  test('newer saved data replaces a clean card but never a draft', () => {
    const { result, rerender } = setup();

    rerender({ server: dish({ dishName: 'External edit', version: 2 }) });
    expect(result.current.draft.dishName).toBe('External edit');
    expect(result.current.base.version).toBe(2);

    act(() => result.current.setName('Local draft'));
    rerender({ server: dish({ dishName: 'Another external edit', version: 3 }) });
    expect(result.current.draft.dishName).toBe('Local draft');
    expect(result.current.base.version).toBe(2);
    expect(result.current.newerAvailable).toBe(true);
  });
});
