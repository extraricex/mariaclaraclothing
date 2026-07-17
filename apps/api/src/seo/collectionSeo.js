const { DEFAULT_BRAND_NAME, safeAbsoluteUrl, safeOrigin, wordSafeText } = require('./productSeo');

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function collectionPath(collection) {
  return `/collections/${encodeURIComponent(String(collection?.slug || '').trim())}`;
}

function collectionMembers(products, collection) {
  const accepted = new Set([collection?.name, ...(collection?.aliases || [])].map(normalized).filter(Boolean));
  return (products || []).filter((product) => (
    (product.collections || []).some((name) => accepted.has(normalized(name)))
  ));
}

function collectionCanonical(collection, originValue) {
  const origin = safeOrigin(originValue);
  const fallback = `${origin}${collectionPath(collection)}`;
  const override = String(collection?.canonicalUrl || '').trim();
  if (!override) return fallback;
  try {
    const candidate = new URL(override, `${origin}/`);
    if (candidate.origin !== origin || !candidate.pathname.startsWith('/collections/')) return fallback;
    candidate.search = '';
    candidate.hash = '';
    candidate.pathname = candidate.pathname.replace(/\/+$/, '');
    return candidate.toString();
  } catch (_error) {
    return fallback;
  }
}

function buildCollectionSeo(collection, products, options = {}) {
  const origin = safeOrigin(options.origin || options.siteUrl);
  const members = collectionMembers(products, collection);
  const name = wordSafeText(collection?.name || 'Collection', 80);
  const descriptionSource = collection?.metaDescription || collection?.introText || collection?.description ||
    `Shop ${name} products from ${DEFAULT_BRAND_NAME}.`;
  const image = safeAbsoluteUrl(origin, collection?.ogImageUrl || collection?.imageUrl);
  const visible = collection?.visible !== false && Boolean(collection?.slug);
  return {
    origin,
    name,
    title: wordSafeText(collection?.seoTitle, 70) || wordSafeText(`${name} | ${DEFAULT_BRAND_NAME}`, 70),
    description: wordSafeText(descriptionSource, 160),
    introText: wordSafeText(collection?.introText || collection?.description || descriptionSource, 1000),
    supportingText: wordSafeText(collection?.supportingText, 5000),
    image,
    path: collectionPath(collection),
    canonical: collectionCanonical(collection, origin),
    members,
    visible,
    indexable: visible && collection?.indexable !== false && members.length > 0
  };
}

module.exports = { buildCollectionSeo, collectionMembers, collectionPath };
