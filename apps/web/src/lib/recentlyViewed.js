const STORAGE_KEY = 'maria-clara-recently-viewed-v1';
const MAX_RECORDS = 8;

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_error) { return null; }
}

function cleanRecord(value) {
  const productId = String(value?.productId || '').trim().slice(0, 120);
  const slug = String(value?.slug || '').trim().slice(0, 160);
  const viewedAt = Number(value?.viewedAt || 0);
  if (!productId || !slug || !Number.isFinite(viewedAt) || viewedAt <= 0) return null;
  return { productId, slug, viewedAt };
}

export function readRecentlyViewed(store = storage()) {
  try {
    const records = JSON.parse(store?.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(records)) return [];
    return records.map(cleanRecord).filter(Boolean).slice(0, MAX_RECORDS);
  } catch (_error) {
    return [];
  }
}

export function rememberRecentlyViewed(product, store = storage(), now = Date.now()) {
  const next = cleanRecord({
    productId: product?.id,
    slug: product?.publicHandle || product?.slug,
    viewedAt: now
  });
  if (!next || !store) return false;
  const records = readRecentlyViewed(store)
    .filter((record) => record.productId !== next.productId && record.slug !== next.slug);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify([next, ...records].slice(0, MAX_RECORDS)));
    return true;
  } catch (_error) {
    return false;
  }
}

export function recentlyViewedProducts(products, options = {}) {
  const excludedId = String(options.excludeProductId || '').trim();
  const byId = new Map((Array.isArray(products) ? products : []).map((product) => [String(product.id || ''), product]));
  const bySlug = new Map((Array.isArray(products) ? products : []).flatMap((product) => [
    [String(product.publicHandle || ''), product], [String(product.slug || ''), product]
  ]));
  const seen = new Set();
  const matches = [];
  for (const record of readRecentlyViewed(options.storage)) {
    const product = byId.get(record.productId) || bySlug.get(record.slug);
    const id = String(product?.id || '');
    if (!product || !id || id === excludedId || seen.has(id)) continue;
    seen.add(id);
    matches.push(product);
    if (matches.length >= Math.max(1, Math.min(8, Number(options.limit || 4)))) break;
  }
  return matches;
}

export const RECENTLY_VIEWED_STORAGE_KEY = STORAGE_KEY;
