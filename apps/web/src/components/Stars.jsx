export default function Stars({ rating, label = true, interactive = false, onChange }) {
  const rounded = Math.round(Number(rating || 0));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role={interactive ? 'group' : (label ? 'img' : undefined)}
      aria-label={label ? `${Number(rating || 0).toFixed(1)} out of 5 stars` : undefined}
    >
      {[1, 2, 3, 4, 5].map((star) => interactive ? (
        <button
          key={star}
          type="button"
          className={`min-h-11 min-w-9 text-2xl leading-none ${star <= rounded ? 'text-accent' : 'text-line'}`}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={star === rounded}
          onClick={() => onChange?.(star)}
        >
          ★
        </button>
      ) : (
        <span key={star} aria-hidden="true" className={star <= rounded ? 'text-accent' : 'text-line'}>★</span>
      ))}
    </span>
  );
}
