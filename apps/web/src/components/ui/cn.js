export function cn(...values) {
  return values.flatMap((value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') {
      return Object.entries(value).filter(([, active]) => active).map(([key]) => key);
    }
    return String(value);
  }).join(' ').replace(/\s+/g, ' ').trim();
}
