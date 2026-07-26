import { clampRating, getStarFill } from '../lib/productRating.js';

const STAR_PATH = 'M12 2.35l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.15l-5.8 3.06 1.11-6.46-4.7-4.58 6.49-.94L12 2.35z';

function StarIcon({ fill = 0, size = 14 }) {
  const normalizedFill = Math.max(0, Math.min(100, Number(fill) || 0));
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="absolute inset-0"
        fill="var(--rating-star-empty)"
        stroke="var(--rating-star-border)"
        strokeWidth="1.15"
      >
        <path d={STAR_PATH} />
      </svg>
      {normalizedFill > 0 && (
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${normalizedFill}%` }}
        >
          <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className="max-w-none"
            fill="var(--rating-star-filled)"
            stroke="var(--rating-star-filled-border)"
            strokeWidth="1.15"
          >
            <path d={STAR_PATH} />
          </svg>
        </span>
      )}
    </span>
  );
}

export default function Stars({ rating, label = true, ariaLabel = '', interactive = false, onChange, size = 14 }) {
  const normalizedRating = clampRating(rating);
  const rounded = Math.round(normalizedRating);
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      role={interactive ? 'group' : (label ? 'img' : undefined)}
      aria-label={label ? (ariaLabel || `Rated ${normalizedRating.toFixed(1)} out of 5`) : undefined}
    >
      {[1, 2, 3, 4, 5].map((star) => interactive ? (
        <button
          key={star}
          type="button"
          className="inline-flex min-h-11 min-w-9 items-center justify-center"
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={star === rounded}
          onClick={() => onChange?.(star)}
        >
          <StarIcon fill={star <= rounded ? 100 : 0} size={24} />
        </button>
      ) : (
        <StarIcon key={star} fill={getStarFill(normalizedRating, star - 1)} size={size} />
      ))}
    </span>
  );
}
