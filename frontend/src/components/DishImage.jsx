import { useState } from 'react';
import { isHttpUrl } from '../utils.js';

/** Dish photo with a fallback for missing, non-http(s) or broken image URLs. Remount (key) on src change. */
export default function DishImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  const usable = isHttpUrl(src);

  return (
    <div className="card__media">
      {usable && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="img-fallback" role="img" aria-label={`No image available for ${alt}`}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path fill="currentColor" d="M21 5v6.59l-3-3.01-4 4.01-4-4-4 4-3-3.01V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Zm-3 6.42 3 3.01V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6.58l3 2.99 4-4 4 4 4-3.99Z" />
          </svg>
          <span>Image unavailable</span>
        </div>
      )}
    </div>
  );
}
