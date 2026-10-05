import { checkPublishRules, isValidDishId } from './validation.js';

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  const dishId = typeof raw.dishId === 'number' ? String(raw.dishId) : raw.dishId;
  if (!isValidDishId(dishId)) return { error: `invalid dishId ${JSON.stringify(raw.dishId)}` };
  if (typeof raw.dishName !== 'string') return { error: `dish ${dishId}: dishName must be a string` };
  if (typeof raw.imageUrl !== 'string') return { error: `dish ${dishId}: imageUrl must be a string` };
  if (typeof raw.isPublished !== 'boolean') return { error: `dish ${dishId}: isPublished must be a boolean` };

  const dish = { dishId, dishName: raw.dishName.trim(), imageUrl: raw.imageUrl, isPublished: raw.isPublished };
  const ruleErrors = checkPublishRules(dish);
  if (ruleErrors.length) return { error: `dish ${dishId}: ${ruleErrors.map((e) => e.message).join('; ')}` };
  return { dish };
}

/**
 * Idempotent seed: inserts dishes whose dishId is not in the database yet (version = 1) and
 * leaves existing rows untouched, so rerunning never duplicates dishes or resets saved edits.
 */
export function seedDishes(repo, records) {
  if (!Array.isArray(records)) throw new Error('Seed data must be a JSON array of dishes');
  return repo.transaction(() => {
    const summary = { inserted: 0, unchanged: 0, skipped: [] };
    for (const raw of records) {
      const { dish, error } = normalizeRecord(raw);
      if (error) summary.skipped.push(error);
      else if (repo.insertIfMissing(dish)) summary.inserted += 1;
      else summary.unchanged += 1;
    }
    return summary;
  });
}
