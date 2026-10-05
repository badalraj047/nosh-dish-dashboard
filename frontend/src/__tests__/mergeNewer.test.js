import { describe, expect, test } from 'vitest';
import { mergeNewer } from '../hooks/useDishes.js';

const d = (dishId, version, dishName = `Dish ${dishId}`) => ({ dishId, dishName, version, isPublished: true, imageUrl: '' });

describe('mergeNewer', () => {
  test('a stale poll response never rolls a dish back to an older version', () => {
    const current = [d('1', 3, 'Just saved'), d('2', 1)];
    const stale = [d('1', 2, 'Old'), d('2', 1)];
    expect(mergeNewer(current, stale)[0]).toEqual(d('1', 3, 'Just saved'));
  });

  test('newer versions replace older ones and the server list decides membership and order', () => {
    const current = [d('1', 1), d('2', 1), d('gone', 1)];
    const fresh = [d('2', 4, 'Updated'), d('1', 1), d('new', 1)];
    expect(mergeNewer(current, fresh)).toEqual([d('2', 4, 'Updated'), d('1', 1), d('new', 1)]);
  });
});
