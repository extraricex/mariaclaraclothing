const UPSELL_STORAGE_PREFIX = 'maria-clara-checkout-upsells:';

export function availableUpsellVariants(product = {}) {
  return (Array.isArray(product.variants) ? product.variants : [])
    .filter((variant) => Number(variant.stockQuantity || 0) > 0);
}

function isInternalOrDemoProduct(product = {}) {
  const searchable = [product.id, product.slug, product.name, product.collection]
    .filter(Boolean)
    .join(' ');
  return /(^|[\s_-])(test|demo|sample)([\s_-]|$)/i.test(searchable);
}

export function isUpsellProductAvailable(product = {}) {
  return Boolean(
    product.id &&
    product.slug &&
    product.name &&
    !isInternalOrDemoProduct(product) &&
    product.merchandisingStatus !== 'sold_out' &&
    availableUpsellVariants(product).length > 0
  );
}

function shuffled(values, random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function readStoredSlugs(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || 'null');
    return Array.isArray(parsed?.slugs) ? parsed.slugs.map(String) : [];
  } catch (_error) {
    return [];
  }
}

export function selectStableCheckoutUpsells({
  products = [],
  cartItems = [],
  cartSessionId = '',
  storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  limit = 4,
  random = Math.random
} = {}) {
  const cartProductIds = new Set((cartItems || []).map((item) => String(item.productId || '')));
  const eligible = (products || []).filter((product) =>
    isUpsellProductAvailable(product) && !cartProductIds.has(String(product.id))
  );
  const bySlug = new Map(eligible.map((product) => [String(product.slug), product]));
  const storageKey = `${UPSELL_STORAGE_PREFIX}${cartSessionId || 'anonymous'}`;
  const selected = [];
  const selectedSlugs = new Set();

  for (const slug of readStoredSlugs(storage, storageKey)) {
    const product = bySlug.get(slug);
    if (!product || selectedSlugs.has(slug) || selected.length >= limit) continue;
    selected.push(product);
    selectedSlugs.add(slug);
  }

  const remaining = eligible.filter((product) => !selectedSlugs.has(String(product.slug)));
  for (const product of shuffled(remaining, random)) {
    if (selected.length >= limit) break;
    selected.push(product);
    selectedSlugs.add(String(product.slug));
  }

  storage?.setItem(storageKey, JSON.stringify({ slugs: selected.map((product) => product.slug) }));
  return selected;
}
