const DEFAULT_BRAND_NAME = 'Maria Clara Clothing';
const DEFAULT_CATEGORY = 'T-Shirts';
const PRODUCT_TITLE_LIMIT = 70;
const META_DESCRIPTION_LIMIT = 160;
const CHANNEL_TITLE_LIMIT = 150;
const FEED_DESCRIPTION_LIMIT = 5000;

function cleanText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;|&#60;/gi, '<')
    .replace(/&gt;|&#62;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSafeText(value, limit) {
  const text = cleanText(value);
  const maximum = Number(limit);
  if (!Number.isInteger(maximum) || maximum < 1 || text.length <= maximum) return text;

  const candidate = text.slice(0, maximum + 1);
  const boundary = candidate.search(/\s+\S*$/);
  const cut = boundary > Math.floor(maximum * 0.55) ? boundary : maximum;
  return candidate.slice(0, cut).trim().replace(/[\s,;:\-–—/]+$/u, '');
}

function productPath(product) {
  const handle = String(product?.publicHandle || product?.slug || '').trim();
  return `/product/${encodeURIComponent(handle)}`;
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || 'http://localhost:5173'));
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : 'http://localhost:5173';
  } catch (_error) {
    return 'http://localhost:5173';
  }
}

function safeAbsoluteUrl(originValue, value) {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    const url = new URL(input, `${safeOrigin(originValue)}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function seoRecord(product) {
  return product?.seo && typeof product.seo === 'object' ? product.seo : {};
}

function firstValue(value) {
  const candidate = Array.isArray(value) ? value.find((item) => cleanText(item)) : value;
  return cleanText(candidate);
}

function firstMetafield(product, ...keys) {
  const metafields = product?.metafields && typeof product.metafields === 'object'
    ? product.metafields
    : {};
  for (const key of keys) {
    const value = firstValue(metafields[key]);
    if (value) return value;
  }
  return '';
}

function productFacts(product) {
  return {
    color: firstMetafield(product, 'color', 'colour'),
    material: firstMetafield(product, 'material', 'fabric'),
    fit: firstMetafield(product, 'fit'),
    fabricWeight: firstMetafield(product, 'fabricWeight', 'fabric_weight', 'gsm'),
    gender: firstMetafield(product, 'gender'),
    ageGroup: firstMetafield(product, 'ageGroup', 'age_group')
  };
}

function recognizableDesignName(value) {
  const name = cleanText(value) || 'Product';
  return name.split(/\s+[—–|]\s+/u)[0].trim() || name;
}

function readableDesignName(value) {
  const design = recognizableDesignName(value);
  if (/[a-z]/.test(design)) return design;
  const specialTokens = new Map([
    ['MC', 'MC'],
    ['MCC', 'MCC'],
    ['MARIACLARA', 'MariaClara'],
    ['OFFWHITE', 'Off-White']
  ]);
  return design.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token)) return token;
    const upper = token.toUpperCase();
    if (specialTokens.has(upper)) return specialTokens.get(upper);
    if (/^[A-Z]+\d+[A-Z\d]*$/.test(upper)) return upper;
    return token.toLowerCase().replace(/(^|[-'])\p{L}/gu, (match) => match.toUpperCase());
  }).join('');
}

function labelledProductDetails(product) {
  const text = String(product?.productPage?.detailsText || '');
  const details = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = cleanText(line.slice(0, separator)).toLowerCase();
    const value = cleanText(line.slice(separator + 1));
    if (key && value && details[key] === undefined) details[key] = value;
  }
  return details;
}

function namedValue(record, ...keys) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  return '';
}

function fitFromText(value) {
  const text = cleanText(value);
  if (/crop[\s-]*box/i.test(text)) return 'Crop-box fit';
  if (/regular[\s-]*fit/i.test(text)) return 'Regular fit';
  if (/oversized/i.test(text)) return 'Oversized fit';
  return '';
}

function materialFromText(value) {
  const text = cleanText(value);
  if (/\b100\s*%\s*(?:premium\s+)?cotton\b/i.test(text)) return '100% Cotton';
  if (/\bpremium\s+cotton\b/i.test(text)) return 'Premium Cotton';
  return /\bcotton\b/i.test(text) ? 'Cotton' : '';
}

function weightFromText(value) {
  return cleanText(value).match(/\b\d{2,4}\s*GSM\b/i)?.[0]?.toUpperCase().replace(/\s*GSM$/, ' GSM') || '';
}

function colorFromText(value) {
  const text = cleanText(value);
  const colors = [
    [/\boff[\s-]*white\b/i, 'Off-white'],
    [/\bblack\b/i, 'Black'],
    [/\bwhite\b/i, 'White'],
    [/\bgr(?:a|e)y\b/i, 'Gray'],
    [/\borange\b/i, 'Orange'],
    [/\bchoco(?:late)?\b/i, 'Choco']
  ];
  return colors.find(([pattern]) => pattern.test(text))?.[1] || '';
}

function colorSignalsFromText(value) {
  let text = cleanText(value).toLowerCase();
  const signals = new Set();
  if (/\boff[\s-]*white\b/i.test(text)) {
    signals.add('off-white');
    text = text.replace(/\boff[\s-]*white\b/gi, ' ');
  }
  const colors = [
    [/\bblack\b/i, 'black'],
    [/\bwhite\b/i, 'white'],
    [/\bgr(?:a|e)y\b/i, 'gray'],
    [/\borange\b/i, 'orange'],
    [/\b(?:choco(?:late)?|brown)\b/i, 'brown'],
    [/\bred\b/i, 'red'],
    [/\b(?:blue|navy)\b/i, 'blue'],
    [/\bgreen\b/i, 'green'],
    [/\bbeige\b/i, 'beige'],
    [/\bcream\b/i, 'cream'],
    [/\bpink\b/i, 'pink'],
    [/\bpurple\b/i, 'purple'],
    [/\byellow\b/i, 'yellow'],
    [/\bmaroon\b/i, 'maroon']
  ];
  colors.forEach(([pattern, color]) => {
    if (pattern.test(text)) signals.add(color);
  });
  return signals;
}

function productTypeLabel(product) {
  const value = cleanText(product?.productType || product?.category || product?.name);
  if (/t[\s-]*shirt|\btshirt\b|\btee\b/i.test(value)) return 'T-Shirt';
  if (/shirt/i.test(value)) return 'Shirt';
  return '';
}

function comparableFact(value, type) {
  const text = cleanText(value).toLowerCase();
  if (!text) return '';
  if (type === 'material' && /\bcotton\b/.test(text)) return 'cotton';
  if (type === 'fit') return fitFromText(text).toLowerCase();
  if (type === 'fabricWeight') return weightFromText(text).replace(/\s+/g, '').toLowerCase();
  if (type === 'color') return colorFromText(text).toLowerCase();
  return text.replace(/[\s-]+/g, '');
}

function resolvedFact(primary, candidates, type) {
  const authoritative = cleanText(primary);
  const values = [authoritative, ...candidates.map(cleanText)].filter(Boolean);
  const distinct = new Set(values.map((value) => comparableFact(value, type)).filter(Boolean));
  return {
    value: distinct.size === 1 ? (authoritative || values[0]) : '',
    conflict: distinct.size > 1
  };
}

function verifiedColorFact(primary, candidates) {
  const sources = [primary, ...candidates].map(cleanText).filter(Boolean);
  const signalsBySource = sources.map(colorSignalsFromText);
  const combined = new Set(signalsBySource.flatMap((signals) => [...signals]));
  const conflict = signalsBySource.some((signals) => signals.size > 1) || combined.size > 1;
  if (conflict) return { value: '', conflict: true };
  if (combined.size !== 1) return { value: '', conflict: false };
  const signal = [...combined][0];
  const matchingSource = sources.find((source) => colorSignalsFromText(source).has(signal));
  return { value: cleanText(matchingSource), conflict: false };
}

function fallbackDisplayFacts(product, strictFacts) {
  const details = labelledProductDetails(product);
  const name = cleanText(product?.name);
  const description = cleanText(`${product?.description || ''} ${product?.productPage?.intro || ''}`);
  const color = verifiedColorFact(strictFacts.color, [
    namedValue(details, 'color', 'colour'), colorFromText(name), description
  ]);
  const material = resolvedFact(strictFacts.material, [
    namedValue(details, 'material', 'fabric'), materialFromText(name), materialFromText(description)
  ], 'material');
  const fit = resolvedFact(strictFacts.fit, [
    namedValue(details, 'fit'), fitFromText(name), fitFromText(description)
  ], 'fit');
  const fabricWeight = resolvedFact(strictFacts.fabricWeight, [
    namedValue(details, 'fabric weight', 'thickness', 'fabricweight'), weightFromText(name), weightFromText(description)
  ], 'fabricWeight');
  return {
    color: color.value,
    material: material.value,
    fit: fit.value,
    fabricWeight: fabricWeight.value,
    conflicts: {
      color: color.conflict,
      material: material.conflict,
      fit: fit.conflict,
      fabricWeight: fabricWeight.conflict
    },
    productType: productTypeLabel(product)
  };
}

function titleFit(value) {
  if (/crop[\s-]*box/i.test(value)) return 'Crop Box';
  if (/regular/i.test(value)) return 'Regular Fit';
  if (/oversized/i.test(value)) return 'Oversized';
  return cleanText(value);
}

function fallbackProductTitle(product, brandName, displayFacts) {
  const design = readableDesignName(product?.name);
  const qualifiers = [titleFit(displayFacts.fit)];
  if (!/\b(?:tee|t[\s-]*shirt|shirt)\b/i.test(design) && displayFacts.productType) {
    qualifiers.push(displayFacts.productType);
  }
  const qualified = qualifiers.filter(Boolean).join(' ');
  return brandedTitle(qualified ? `${design} — ${qualified}` : design, brandName);
}

function fallbackChannelTitle(product, displayFacts) {
  const design = readableDesignName(product?.name);
  const qualifiers = [
    titleFit(displayFacts.fit),
    displayFacts.fabricWeight,
    displayFacts.material,
    !/\b(?:tee|t[\s-]*shirt|shirt)\b/i.test(design) && displayFacts.productType
  ].map(cleanText).filter(Boolean);
  return wordSafeText(qualifiers.length ? `${design} — ${qualifiers.join(' ')}` : design, CHANNEL_TITLE_LIMIT);
}

function fallbackMetaDescription(product, brandName, displayFacts) {
  const design = readableDesignName(product?.name);
  const descriptors = [
    displayFacts.color && !design.toLowerCase().includes(displayFacts.color.toLowerCase()) ? displayFacts.color : '',
    displayFacts.fit,
    displayFacts.fabricWeight,
    displayFacts.material,
    displayFacts.productType
  ].map(cleanText).filter((value, index, values) => value && values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
  const endings = [
    '. Check current price, sizes, and availability online.',
    '. View current sizes and availability online.'
  ];
  for (let count = descriptors.length; count >= 0; count -= 1) {
    const facts = count ? `: ${descriptors.slice(0, count).join(', ')}` : '';
    for (const ending of endings) {
      const candidate = `Shop ${design} by ${brandName}${facts}${ending}`;
      if (candidate.length <= META_DESCRIPTION_LIMIT) return candidate;
    }
  }
  const ending = '. View current sizes online.';
  const fixedLength = `Shop  by ${brandName}${ending}`.length;
  const safeDesign = wordSafeText(design, Math.max(20, META_DESCRIPTION_LIMIT - fixedLength));
  return `Shop ${safeDesign} by ${brandName}${ending}`;
}

function brandedTitle(productName, brandName, limit = PRODUCT_TITLE_LIMIT) {
  const name = cleanText(productName) || 'Product';
  const brand = cleanText(brandName) || DEFAULT_BRAND_NAME;
  if (name.toLowerCase().includes(brand.toLowerCase())) return wordSafeText(name, limit);
  const suffix = ` | ${brand}`;
  if (suffix.length >= limit) return wordSafeText(name, limit);
  return `${wordSafeText(name, limit - suffix.length)}${suffix}`;
}

function visibilityValue(product) {
  const seo = seoRecord(product);
  return cleanText(
    seo.searchEngineVisibility ?? seo.indexStatus ?? seo.robots ?? product?.searchEngineVisibility
  ).toLowerCase();
}

function productIndexable(product) {
  const seo = seoRecord(product);
  const publicationStatus = cleanText(product?.publicationStatus).toLowerCase();
  if (['draft', 'archived'].includes(publicationStatus)) return false;
  if (seo.indexable === false || seo.index === false || seo.noindex === true) return false;
  return !['noindex', 'hidden', 'exclude', 'excluded'].includes(visibilityValue(product));
}

function canonicalUrl(product, originValue) {
  const origin = safeOrigin(originValue);
  const fallback = `${origin}${productPath(product)}`;
  const seo = seoRecord(product);
  const override = String(seo.canonicalUrlOverride || seo.canonicalUrl || '').trim();
  if (!override) return fallback;
  try {
    const candidate = new URL(override, `${origin}/`);
    if (candidate.origin !== origin || !candidate.pathname.startsWith('/product/')) return fallback;
    candidate.search = '';
    candidate.hash = '';
    if (candidate.pathname.length > 1) candidate.pathname = candidate.pathname.replace(/\/+$/, '');
    return candidate.toString();
  } catch (_error) {
    return fallback;
  }
}

function productImages(product, originValue) {
  const seo = seoRecord(product);
  const customMainAlt = cleanText(seo.imageAltText);
  const records = Array.isArray(product?.images) ? product.images : [];
  return records.map((image, index) => {
    const record = image && typeof image === 'object' ? image : { url: image };
    const url = safeAbsoluteUrl(originValue, record.url);
    if (!url) return null;
    const fallback = index === 0
      ? `${cleanText(product?.name) || 'Product'}, product image`
      : `${cleanText(product?.name) || 'Product'}, product image ${index + 1}`;
    return {
      url,
      altText: (index === 0 && customMainAlt) || cleanText(record.altText) || fallback,
      sortOrder: Number.isInteger(Number(record.sortOrder)) ? Number(record.sortOrder) : index
    };
  }).filter(Boolean).sort((left, right) => left.sortOrder - right.sortOrder);
}

function validOgImage(product, originValue, images) {
  const seo = seoRecord(product);
  return safeAbsoluteUrl(originValue, seo.ogImageUrl || seo.openGraphImage || seo.ogImage) || images[0]?.url || '';
}

function buildProductSeo(product, options = {}) {
  const origin = safeOrigin(options.origin || options.siteUrl);
  const savedVendor = cleanText(product?.vendor);
  const brandName = cleanText(options.brandName || (savedVendor.toLowerCase() === 'maria clara' ? '' : savedVendor) || DEFAULT_BRAND_NAME) || DEFAULT_BRAND_NAME;
  const seo = seoRecord(product);
  const customerTitle = cleanText(product?.name) || 'Product';
  const bodyDescription = cleanText(product?.description || product?.productPage?.intro);
  const strictFacts = productFacts(product);
  const displayFacts = fallbackDisplayFacts(product, strictFacts);
  const facts = {
    color: displayFacts.color,
    material: displayFacts.material,
    fit: displayFacts.fit,
    fabricWeight: displayFacts.fabricWeight,
    gender: strictFacts.gender,
    ageGroup: strictFacts.ageGroup
  };
  const descriptionFallback = fallbackMetaDescription(product, brandName, displayFacts);
  const schemaDescriptionSource = Object.values(displayFacts.conflicts).some(Boolean)
    ? descriptionFallback
    : bodyDescription || seo.description || descriptionFallback;
  const images = productImages(product, origin);
  const channelTitle = fallbackChannelTitle(product, displayFacts);
  const marketplaceTitle = wordSafeText(
    seo.marketplaceTitle || channelTitle,
    CHANNEL_TITLE_LIMIT
  );

  return {
    origin,
    brandName,
    customerTitle,
    title: wordSafeText(seo.title, PRODUCT_TITLE_LIMIT) || fallbackProductTitle(product, brandName, displayFacts),
    description: wordSafeText(seo.description || descriptionFallback, META_DESCRIPTION_LIMIT),
    schemaDescription: wordSafeText(schemaDescriptionSource, FEED_DESCRIPTION_LIMIT),
    marketplaceTitle,
    feedTitle: wordSafeText(seo.feedTitle || seo.productFeedTitle || channelTitle, CHANNEL_TITLE_LIMIT),
    openGraphTitle: wordSafeText(seo.openGraphTitle || seo.ogTitle || seo.title, PRODUCT_TITLE_LIMIT) || fallbackProductTitle(product, brandName, displayFacts),
    openGraphDescription: wordSafeText(seo.openGraphDescription || seo.ogDescription || seo.description || descriptionFallback, META_DESCRIPTION_LIMIT),
    openGraphImage: validOgImage(product, origin, images),
    canonical: canonicalUrl(product, origin),
    path: productPath(product),
    indexable: productIndexable(product),
    images,
    facts,
    conflicts: { ...displayFacts.conflicts }
  };
}

function positivePriceCents(value, fallback = 0) {
  const cents = Number(value);
  return Number.isInteger(cents) && cents > 0 ? cents : fallback;
}

function variantLandingUrl(canonical, size) {
  const value = cleanText(size);
  if (!value) return canonical;
  try {
    const url = new URL(canonical);
    url.searchParams.set('size', value);
    return url.toString();
  } catch (_error) {
    return canonical;
  }
}

function offerForVariant(product, variant, seo) {
  const priceCents = positivePriceCents(variant?.priceCents, positivePriceCents(product?.priceCents));
  return {
    '@type': 'Offer',
    url: variantLandingUrl(seo.canonical, variant?.size),
    priceCurrency: 'PHP',
    price: Number((priceCents / 100).toFixed(2)),
    availability: Number(variant?.stockQuantity || 0) > 0
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: DEFAULT_BRAND_NAME }
  };
}

function validRating(summary) {
  const count = Number(summary?.ratingCount ?? summary?.totalReviews ?? 0);
  const average = Number(summary?.averageRating || 0);
  return Number.isInteger(count) && count > 0 && average >= 1 && average <= 5
    ? { count, average }
    : null;
}

function reviewSchema(review) {
  const rating = Number(review?.rating || 0);
  const author = cleanText(review?.reviewerName);
  const body = cleanText(review?.body);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !author || !body) return null;
  const date = review.createdAt && !Number.isNaN(new Date(review.createdAt).getTime())
    ? new Date(review.createdAt).toISOString().slice(0, 10)
    : '';
  return {
    '@type': 'Review',
    author: { '@type': 'Person', name: author },
    reviewRating: { '@type': 'Rating', ratingValue: rating, bestRating: 5, worstRating: 1 },
    reviewBody: wordSafeText(body, 5000),
    ...(cleanText(review.title) ? { name: wordSafeText(review.title, 150) } : {}),
    ...(date ? { datePublished: date } : {})
  };
}

function publicReviewMarkup(reviewSummary, publicReviews, reviewsPublic) {
  if (!reviewsPublic) return {};
  const rating = validRating(reviewSummary);
  if (!rating) return {};
  const reviews = (Array.isArray(publicReviews) ? publicReviews : []).map(reviewSchema).filter(Boolean);
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Number(rating.average.toFixed(1)),
      reviewCount: rating.count,
      bestRating: 5,
      worstRating: 1
    },
    ...(reviews.length ? { review: reviews } : {})
  };
}

function variantName(productName, size) {
  return size ? `${productName} — Size ${String(size).toUpperCase()}` : productName;
}

function additionalProperties(facts) {
  return [
    facts.fit && { '@type': 'PropertyValue', name: 'Fit', value: facts.fit },
    facts.fabricWeight && { '@type': 'PropertyValue', name: 'Fabric weight', value: facts.fabricWeight }
  ].filter(Boolean);
}

function productStructuredData({
  product,
  origin,
  reviewSummary = {},
  publicReviews = [],
  reviewsPublic = false
} = {}) {
  const seo = buildProductSeo(product, { origin });
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const images = seo.images.map((image) => image.url);
  const brand = { '@type': 'Brand', name: seo.brandName };
  const factProperties = additionalProperties(seo.facts);
  const common = {
    name: seo.customerTitle,
    description: seo.schemaDescription,
    url: seo.canonical,
    ...(images.length ? { image: images } : {}),
    brand,
    category: cleanText(product?.category || product?.productType || DEFAULT_CATEGORY),
    ...(seo.facts.color ? { color: seo.facts.color } : {}),
    ...(seo.facts.material ? { material: seo.facts.material } : {}),
    ...(factProperties.length ? { additionalProperty: factProperties } : {})
  };
  const reviewMarkup = publicReviewMarkup(reviewSummary, publicReviews, reviewsPublic);

  if (variants.length > 1) {
    const groupId = `${seo.canonical}#product-group`;
    return {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      '@id': groupId,
      ...common,
      productGroupID: cleanText(product?.id || product?.slug),
      variesBy: ['https://schema.org/size'],
      hasVariant: variants.map((variant, index) => ({
        '@type': 'Product',
        '@id': `${seo.canonical}#variant-${encodeURIComponent(String(variant.sku || variant.id || index + 1))}`,
        name: variantName(seo.customerTitle, variant.size),
        sku: cleanText(variant.sku || variant.id),
        ...(cleanText(variant.size) ? { size: cleanText(variant.size).toUpperCase() } : {}),
        ...(images.length ? { image: images } : {}),
        ...(seo.facts.color ? { color: seo.facts.color } : {}),
        ...(seo.facts.material ? { material: seo.facts.material } : {}),
        isVariantOf: { '@id': groupId },
        offers: offerForVariant(product, variant, seo)
      })),
      ...reviewMarkup
    };
  }

  const variant = variants[0] || { stockQuantity: 0 };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${seo.canonical}#product`,
    ...common,
    sku: cleanText(variant.sku || variant.id),
    ...(cleanText(variant.size) ? { size: cleanText(variant.size).toUpperCase() } : {}),
    offers: offerForVariant(product, variant, seo),
    ...reviewMarkup
  };
}

module.exports = {
  CHANNEL_TITLE_LIMIT,
  DEFAULT_BRAND_NAME,
  FEED_DESCRIPTION_LIMIT,
  META_DESCRIPTION_LIMIT,
  PRODUCT_TITLE_LIMIT,
  buildProductSeo,
  cleanText,
  firstMetafield,
  productFacts,
  productIndexable,
  productPath,
  productStructuredData,
  safeAbsoluteUrl,
  safeOrigin,
  variantLandingUrl,
  wordSafeText
};
