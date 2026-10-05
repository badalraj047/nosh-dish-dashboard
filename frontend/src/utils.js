// Mirrors the backend limit and URL rule so the UI can warn early. The backend stays the authority.
export const MAX_NAME_LENGTH = 120;

export function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  try {
    return new URL(value).hostname !== '';
  } catch {
    return false;
  }
}

export const statusLabel = (published) => (published ? 'Published' : 'Unpublished');
