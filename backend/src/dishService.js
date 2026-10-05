import { checkPublishRules, isValidDishId, parseDishPatch } from './validation.js';

/**
 * Business logic, independent of HTTP. updateDish returns a tagged result instead of throwing,
 * so the route layer only maps result types to status codes.
 *
 *   { type: 'ok', dish }            saved; dish.version was incremented
 *   { type: 'invalid', errors }     bad id / body / publish rules -> nothing written
 *   { type: 'not_found' }           unknown dishId -> nothing written
 *   { type: 'conflict', current }   expectedVersion is stale -> nothing written
 */
export function createDishService(repo) {
  return {
    listDishes: () => repo.list(),

    updateDish(dishId, body) {
      if (!isValidDishId(dishId)) {
        return { type: 'invalid', errors: [{ field: 'dishId', message: 'dishId must be 1-64 characters of A-Z, a-z, 0-9, _ or -' }] };
      }
      const { value: patch, errors } = parseDishPatch(body);
      if (errors.length) return { type: 'invalid', errors };

      // Everything below runs in one write transaction: the dish we validate against is the
      // dish we update, and no other writer can slip in between the check and the write.
      return repo.transaction(() => {
        const stored = repo.findById(dishId);
        if (!stored) return { type: 'not_found' };

        // A stale draft is reported as a conflict before rule checks: the client must first
        // see the newer saved data rather than fix a draft that can never be saved as-is.
        if (stored.version !== patch.expectedVersion) return { type: 'conflict', current: stored };

        const ruleErrors = checkPublishRules({ ...patch, imageUrl: stored.imageUrl });
        if (ruleErrors.length) return { type: 'invalid', errors: ruleErrors };

        // The UPDATE re-checks the version itself (compare-and-swap), so it stays safe even
        // without the surrounding transaction.
        const updated = repo.updateIfVersionMatches(dishId, patch.expectedVersion, patch);
        if (!updated) return { type: 'conflict', current: repo.findById(dishId) };

        return { type: 'ok', dish: repo.findById(dishId) };
      });
    },
  };
}
