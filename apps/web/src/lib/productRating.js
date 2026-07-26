export function clampRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
}

export function getStarFill(rating, starIndex) {
  const percentage = Math.max(0, Math.min(100, (clampRating(rating) - Number(starIndex || 0)) * 100));
  return Number(percentage.toFixed(6));
}

export function formatReviewCount(count) {
  const normalized = Math.max(0, Math.trunc(Number(count || 0)));
  return `${normalized.toLocaleString('en-PH')} ${normalized === 1 ? 'review' : 'reviews'}`;
}
