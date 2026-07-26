import Stars from './Stars.jsx';

export default function ProductCardContent({ product }) {
  const content = product.productPage?.cardContent;
  if (!content || typeof content !== 'object') return null;

  const text = String(content.text || '').trim();
  const source = String(content.source || '').trim();
  const rating = Number(content.rating);
  const showRating = content.showRating === true
    && Number.isInteger(rating)
    && rating >= 1
    && rating <= 5
    && content.showSource === true
    && source;
  const showText = content.showText === true && text;
  const showSource = content.showSource === true && source && !showRating;

  if (!showRating && !showText && !showSource) return null;

  return (
    <div className="mt-1 max-w-full text-center">
      {showRating && (
        <div
          className="flex max-w-full flex-wrap items-center justify-center gap-x-1.5 text-[11px] leading-4 text-ink-soft sm:text-xs"
          role="img"
          aria-label={`Rated ${rating.toFixed(1)} out of 5. Source: ${source}.`}
        >
          <Stars rating={rating} label={false} size={15} />
          <span className="font-semibold tabular-nums text-ink">{rating.toFixed(1)}</span>
          <span aria-hidden="true">·</span>
          <span className="max-w-full truncate">{source}</span>
        </div>
      )}
      {showText && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-soft sm:text-xs">{text}</p>
      )}
      {showSource && (
        <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-clay">
          {source}
        </p>
      )}
    </div>
  );
}
