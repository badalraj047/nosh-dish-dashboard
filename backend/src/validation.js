// Pure validation helpers: no I/O, so they are easy to test and reuse (API + seed script).

export const MAX_NAME_LENGTH = 120;
const DISH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PATCH_FIELDS = ['dishName', 'isPublished', 'expectedVersion'];

const issue = (field, message) => ({ field, message });

export function isValidDishId(dishId) {
  return typeof dishId === 'string' && DISH_ID_RE.test(dishId);
}

/** True only for absolute http:// or https:// URLs with a host. No network check is made. */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Shape/type checks for a PATCH body. All three fields are required: the client always
 * sends the full draft plus the version it was loaded from (no partial updates, no toggles).
 * Returns { value, errors }; value has a trimmed dishName when there are no errors.
 */
export function parseDishPatch(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [issue('body', 'Request body must be a JSON object (Content-Type: application/json)')] };
  }
  const errors = [];
  const unknown = Object.keys(body).filter((k) => !PATCH_FIELDS.includes(k));
  if (unknown.length) {
    errors.push(issue(unknown.join(','), `Unknown field(s): ${unknown.join(', ')}. Allowed: ${PATCH_FIELDS.join(', ')}`));
  }

  const { dishName, isPublished, expectedVersion } = body;
  if (typeof dishName !== 'string') errors.push(issue('dishName', 'dishName is required and must be a string'));
  else if (dishName.trim().length > MAX_NAME_LENGTH) errors.push(issue('dishName', `dishName must be at most ${MAX_NAME_LENGTH} characters`));
  if (typeof isPublished !== 'boolean') errors.push(issue('isPublished', 'isPublished is required and must be a boolean'));
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    errors.push(issue('expectedVersion', 'expectedVersion is required and must be a positive integer'));
  }

  if (errors.length) return { errors };
  return { value: { dishName: dishName.trim(), isPublished, expectedVersion }, errors: [] };
}

/** Business rule: a published dish needs a non-empty (trimmed) name and an http(s) image URL. */
export function checkPublishRules({ dishName, isPublished, imageUrl }) {
  if (!isPublished) return [];
  const errors = [];
  if (dishName.trim() === '') errors.push(issue('dishName', 'A published dish must have a non-empty name'));
  if (!isHttpUrl(imageUrl)) errors.push(issue('imageUrl', 'A published dish must have a valid http/https imageUrl'));
  return errors;
}
