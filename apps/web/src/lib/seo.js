import { productPath } from './productUrl.js';

export const SEO_BRAND_NAME = 'Maria Clara Clothing';
export const DEFAULT_SEO_TITLE = 'Maria Clara Clothing | Premium Filipino Streetwear';
export const DEFAULT_SEO_DESCRIPTION = 'Shop Maria Clara Clothing premium oversized, regular-fit, and crop-box shirts with current size availability and nationwide online ordering.';
export const INDEX_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
export const NOINDEX_ROBOTS = 'noindex, nofollow';
export const NOINDEX_FOLLOW_ROBOTS = 'noindex, follow';

const PRIVATE_PATH_PREFIXES = [
  '/admin', '/account', '/checkout', '/thank-you', '/cart', '/login', '/register',
  '/forgot-password', '/reset-password'
];

const STATIC_ROUTE_SEO = {
  '/faq': {
    title: `Frequently Asked Questions | ${SEO_BRAND_NAME}`,
    description: `Find answers about ${SEO_BRAND_NAME} sizing, product availability, shipping, payment, and orders.`
  },
  '/shipping-returns': {
    title: `Shipping & Returns | ${SEO_BRAND_NAME}`,
    description: `Review ${SEO_BRAND_NAME} nationwide delivery, shipping fees, order confirmation, returns, and size-exchange information.`
  },
  '/terms': {
    title: `Terms of Service | ${SEO_BRAND_NAME}`,
    description: `Read the ordering, payment, pricing, privacy, sizing, and customer-service terms for ${SEO_BRAND_NAME}.`
  },
  '/contact': {
    title: `Contact | ${SEO_BRAND_NAME}`,
    description: `Contact ${SEO_BRAND_NAME} for product, size, order, payment, or nationwide delivery assistance.`
  },
  '/size-chart': {
    title: `T-Shirt Size Chart & Fit Guide | ${SEO_BRAND_NAME}`,
    description: `Compare garment measurements and choose your ${SEO_BRAND_NAME} oversized, regular-fit, or crop-box T-shirt size.`
  },
  '/guides/240-gsm-shirts': {
    title: `What Is a 240 GSM T-Shirt? | ${SEO_BRAND_NAME}`,
    description: 'Learn what 240 GSM fabric weight means and how it affects the structure, coverage, and feel of a T-shirt.'
  },
  '/guides/t-shirt-fit-guide': {
    title: `Oversized, Regular & Crop-Box T-Shirt Fit Guide | ${SEO_BRAND_NAME}`,
    description: 'Compare oversized, regular-fit, and crop-box T-shirt cuts, then use actual garment measurements to choose a size.'
  },
  '/guides/payment-and-shipping': {
    title: `Payment & Nationwide Shipping Guide | ${SEO_BRAND_NAME}`,
    description: `Review ${SEO_BRAND_NAME} payment options, regional shipping fees, free-shipping rules, and delivery estimates.`
  }
};

export function plainSeoText(value, limit = 500) {
  if (!value) return '';
  if (typeof document !== 'undefined' && /<[^>]+>/.test(String(value))) {
    const container = document.createElement('div');
    container.innerHTML = String(value);
    return String(container.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function storefrontOrigin(origin) {
  const fallback = typeof window !== 'undefined' ? window.location.origin : 'https://mariaclaraclothing.com';
  try {
    const parsed = new URL(String(origin || fallback));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function absoluteSeoUrl(value, origin) {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    const parsed = new URL(input, `${storefrontOrigin(origin)}/`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (_error) {
    return '';
  }
}

export function canonicalSeoUrl(pathname, override, origin) {
  const cleanPath = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const baseOrigin = storefrontOrigin(origin);
  const fallback = absoluteSeoUrl(cleanPath, baseOrigin) || `${baseOrigin}${cleanPath}`;
  const input = String(override || '').trim();
  if (!input) return fallback;
  try {
    const candidate = new URL(input, `${baseOrigin}/`);
    if (candidate.origin !== baseOrigin) return fallback;
    if (cleanPath.startsWith('/product/') && !candidate.pathname.startsWith('/product/')) return fallback;
    if (cleanPath.startsWith('/collections/') && !candidate.pathname.startsWith('/collections/')) return fallback;
    candidate.search = '';
    candidate.hash = '';
    if (candidate.pathname.length > 1) candidate.pathname = candidate.pathname.replace(/\/+$/, '');
    return candidate.toString();
  } catch (_error) {
    return fallback;
  }
}

export function wordSafeSeoText(value, limit) {
  const text = plainSeoText(value, 5000);
  const maximum = Number(limit);
  if (!Number.isInteger(maximum) || maximum < 1 || text.length <= maximum) return text;
  const candidate = text.slice(0, maximum + 1);
  const boundary = candidate.search(/\s+\S*$/);
  const cut = boundary > Math.floor(maximum * 0.55) ? boundary : maximum;
  return candidate.slice(0, cut).trim().replace(/[\s,;:\-–—/]+$/u, '');
}

function firstMetafieldValue(product, ...keys) {
  for (const key of keys) {
    const value = product?.metafields?.[key];
    const candidate = Array.isArray(value) ? value.find((item) => plainSeoText(item)) : value;
    const text = plainSeoText(candidate);
    if (text) return text;
  }
  return '';
}

function labelledProductDetails(product) {
  const details = {};
  for (const line of String(product?.productPage?.detailsText || '').split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = plainSeoText(line.slice(0, separator)).toLowerCase();
    const value = plainSeoText(line.slice(separator + 1));
    if (key && value && details[key] === undefined) details[key] = value;
  }
  return details;
}

function namedDetailValue(record, ...keys) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  return '';
}

function productDisplayFacts(product) {
  const name = plainSeoText(product?.name);
  const details = labelledProductDetails(product);
  const description = plainSeoText(`${product?.description || ''} ${product?.productPage?.intro || ''}`, 5000);
  const strictColor = firstMetafieldValue(product, 'color', 'colour');
  const strictMaterial = firstMetafieldValue(product, 'material', 'fabric');
  const strictFit = firstMetafieldValue(product, 'fit');
  const strictFabricWeight = firstMetafieldValue(product, 'fabricWeight', 'fabric_weight', 'gsm');
  const productTypeValue = plainSeoText(product?.productType || product?.category || name);
  const productType = /t[\s-]*shirt|\btshirt\b|\btee\b/i.test(productTypeValue)
    ? 'T-Shirt'
    : /shirt/i.test(productTypeValue) ? 'Shirt' : '';
  const color = verifiedColorFact(strictColor, [
    namedDetailValue(details, 'color', 'colour'), colorFromText(name), description
  ]);
  const material = resolvedFact(strictMaterial, [
    namedDetailValue(details, 'material', 'fabric'), materialFromText(name), materialFromText(description)
  ], 'material');
  const fit = resolvedFact(strictFit, [
    namedDetailValue(details, 'fit'), fitFromText(name), fitFromText(description)
  ], 'fit');
  const fabricWeight = resolvedFact(strictFabricWeight, [
    namedDetailValue(details, 'fabric weight', 'thickness', 'fabricweight'), weightFromText(name), weightFromText(description)
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
    productType
  };
}

function fitFromText(value) {
  const text = plainSeoText(value);
  if (/crop[\s-]*box/i.test(text)) return 'Crop-box fit';
  if (/regular[\s-]*fit/i.test(text)) return 'Regular fit';
  if (/oversized/i.test(text)) return 'Oversized fit';
  return '';
}

function materialFromText(value) {
  const text = plainSeoText(value);
  if (/\b100\s*%\s*(?:premium\s+)?cotton\b/i.test(text)) return '100% Cotton';
  if (/\bpremium\s+cotton\b/i.test(text)) return 'Premium Cotton';
  return /\bcotton\b/i.test(text) ? 'Cotton' : '';
}

function weightFromText(value) {
  return plainSeoText(value).match(/\b\d{2,4}\s*GSM\b/i)?.[0]?.toUpperCase().replace(/\s*GSM$/, ' GSM') || '';
}

function colorFromText(value) {
  const text = plainSeoText(value);
  const colors = [
    [/\boff[\s-]*white\b/i, 'Off-white'],
    [/\bblack\b/i, 'Black'],
    [/\bwhite\b/i, 'White'],
    [/\bgr(?:a|e)y\b/i, 'Gray'],
    [/\bred\b/i, 'Red'],
    [/\bblue\b/i, 'Blue'],
    [/\bgreen\b/i, 'Green'],
    [/\b(?:beige|tan)\b/i, 'Beige'],
    [/\bbrown\b/i, 'Brown'],
    [/\bcream\b/i, 'Cream'],
    [/\bpink\b/i, 'Pink'],
    [/\bpurple\b/i, 'Purple'],
    [/\borange\b/i, 'Orange'],
    [/\bchoco(?:late)?\b/i, 'Choco']
  ];
  return colors.find(([pattern]) => pattern.test(text))?.[1] || '';
}

function colorSignalsFromText(value) {
  let text = plainSeoText(value).toLowerCase();
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
    [/\b(?:beige|tan)\b/i, 'beige'],
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

function comparableFact(value, type) {
  const text = plainSeoText(value).toLowerCase();
  if (!text) return '';
  if (type === 'material' && /\bcotton\b/.test(text)) return 'cotton';
  if (type === 'fit') return fitFromText(text).toLowerCase() || text.replace(/[\s-]+/g, '');
  if (type === 'fabricWeight') return weightFromText(text).replace(/\s+/g, '').toLowerCase() || text.replace(/[\s-]+/g, '');
  if (type === 'color') return colorFromText(text).toLowerCase() || text.replace(/[\s-]+/g, '');
  return text.replace(/[\s-]+/g, '');
}

function resolvedFact(primary, candidates, type) {
  const authoritative = plainSeoText(primary);
  const values = [authoritative, ...candidates.map((value) => plainSeoText(value))].filter(Boolean);
  const distinct = new Set(values.map((value) => comparableFact(value, type)).filter(Boolean));
  return {
    value: distinct.size === 1 ? (authoritative || values[0]) : '',
    conflict: distinct.size > 1
  };
}

function verifiedColorFact(primary, candidates) {
  const sources = [primary, ...candidates].map((value) => plainSeoText(value)).filter(Boolean);
  const signalsBySource = sources.map(colorSignalsFromText);
  const combined = new Set(signalsBySource.flatMap((signals) => [...signals]));
  const conflict = signalsBySource.some((signals) => signals.size > 1) || combined.size > 1;
  if (conflict) return { value: '', conflict: true };
  if (combined.size !== 1) return { value: '', conflict: false };
  const signal = [...combined][0];
  const matchingSource = sources.find((source) => colorSignalsFromText(source).has(signal));
  return { value: plainSeoText(matchingSource), conflict: false };
}

function titleFit(value) {
  if (/crop[\s-]*box/i.test(value)) return 'Crop Box';
  if (/regular/i.test(value)) return 'Regular Fit';
  if (/oversized/i.test(value)) return 'Oversized';
  return plainSeoText(value);
}

function recognizableDesignName(value) {
  const name = plainSeoText(value) || 'Product';
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

function brandedProductTitle(value) {
  const name = plainSeoText(value) || 'Product';
  if (name.toLowerCase().includes(SEO_BRAND_NAME.toLowerCase())) return wordSafeSeoText(name, 70);
  const suffix = ` | ${SEO_BRAND_NAME}`;
  return `${wordSafeSeoText(name, 70 - suffix.length)}${suffix}`;
}

export function productSeoFallbackText(product) {
  const design = readableDesignName(product?.name);
  const facts = productDisplayFacts(product);
  const qualifiers = [titleFit(facts.fit)];
  if (!/\b(?:tee|t[\s-]*shirt|shirt)\b/i.test(design) && facts.productType) qualifiers.push(facts.productType);
  const qualified = qualifiers.filter(Boolean).join(' ');
  const descriptors = [
    facts.color && !design.toLowerCase().includes(facts.color.toLowerCase()) ? facts.color : '',
    facts.fit,
    facts.fabricWeight,
    facts.material,
    facts.productType
  ].map((value) => plainSeoText(value)).filter((value, index, values) => value && values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
  const endings = [
    '. Check current price, sizes, and availability online.',
    '. View current sizes and availability online.'
  ];
  let description = '';
  for (let count = descriptors.length; count >= 0 && !description; count -= 1) {
    const details = count ? `: ${descriptors.slice(0, count).join(', ')}` : '';
    description = endings.map((ending) => `Shop ${design} by ${SEO_BRAND_NAME}${details}${ending}`)
      .find((candidate) => candidate.length <= 160) || '';
  }
  if (!description) {
    const ending = '. View current sizes online.';
    const fixedLength = `Shop  by ${SEO_BRAND_NAME}${ending}`.length;
    description = `Shop ${wordSafeSeoText(design, Math.max(20, 160 - fixedLength))} by ${SEO_BRAND_NAME}${ending}`;
  }
  return {
    title: brandedProductTitle(qualified ? `${design} — ${qualified}` : design),
    description
  };
}

function schemaType(schema) {
  return String(schema?.['@type'] || 'WebPage').replace(/[^A-Za-z0-9_-]/g, '') || 'WebPage';
}

function upsertMeta(documentRef, attribute, key, content) {
  const tags = [...documentRef.head.querySelectorAll(`meta[${attribute}="${key}"]`)];
  const tag = tags.shift() || documentRef.createElement('meta');
  if (!tag.parentNode) {
    tag.setAttribute(attribute, key);
    documentRef.head.appendChild(tag);
  }
  tag.setAttribute('content', String(content || ''));
  tag.dataset.mccClientSeo = 'true';
  tags.forEach((duplicate) => duplicate.remove());
  return tag;
}

function removeMeta(documentRef, attribute, key) {
  documentRef.head.querySelectorAll(`meta[${attribute}="${key}"]`).forEach((tag) => tag.remove());
}

function upsertCanonical(documentRef, href) {
  const links = [...documentRef.head.querySelectorAll('link[rel="canonical"]')];
  const link = links.shift() || documentRef.createElement('link');
  if (!link.parentNode) {
    link.setAttribute('rel', 'canonical');
    documentRef.head.appendChild(link);
  }
  link.setAttribute('href', href);
  link.dataset.mccClientSeo = 'true';
  links.forEach((duplicate) => duplicate.remove());
}

/**
 * Replaces the complete page-level SEO state. Server-injected SSI tags are used
 * for the first response; this function takes ownership after a client route
 * transition or once dynamic page data has loaded.
 */
export function applySeoDescriptor(input = {}, documentRef = typeof document !== 'undefined' ? document : null) {
  if (!documentRef) return;
  const origin = storefrontOrigin(input.origin);
  const title = plainSeoText(input.title || DEFAULT_SEO_TITLE, 240) || DEFAULT_SEO_TITLE;
  const description = plainSeoText(input.description || DEFAULT_SEO_DESCRIPTION, 500) || DEFAULT_SEO_DESCRIPTION;
  const canonical = canonicalSeoUrl(input.pathname || '/', input.canonical, origin);
  const image = absoluteSeoUrl(input.image, origin);
  const type = ['product', 'article', 'website'].includes(input.type) ? input.type : 'website';
  const robots = input.robots || (input.noindex ? NOINDEX_ROBOTS : INDEX_ROBOTS);
  const ogTitle = plainSeoText(input.ogTitle || title, 240) || title;
  const ogDescription = plainSeoText(input.ogDescription || description, 500) || description;
  const imageAlt = plainSeoText(input.imageAlt || ogTitle, 300);

  documentRef.title = title;
  upsertMeta(documentRef, 'name', 'description', description);
  upsertMeta(documentRef, 'name', 'robots', robots);
  upsertCanonical(documentRef, canonical);
  upsertMeta(documentRef, 'property', 'og:site_name', SEO_BRAND_NAME);
  upsertMeta(documentRef, 'property', 'og:type', type);
  upsertMeta(documentRef, 'property', 'og:title', ogTitle);
  upsertMeta(documentRef, 'property', 'og:description', ogDescription);
  upsertMeta(documentRef, 'property', 'og:url', canonical);
  upsertMeta(documentRef, 'name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  upsertMeta(documentRef, 'name', 'twitter:title', ogTitle);
  upsertMeta(documentRef, 'name', 'twitter:description', ogDescription);

  if (image) {
    upsertMeta(documentRef, 'property', 'og:image', image);
    upsertMeta(documentRef, 'property', 'og:image:alt', imageAlt);
    upsertMeta(documentRef, 'name', 'twitter:image', image);
    upsertMeta(documentRef, 'name', 'twitter:image:alt', imageAlt);
  } else {
    removeMeta(documentRef, 'property', 'og:image');
    removeMeta(documentRef, 'property', 'og:image:alt');
    removeMeta(documentRef, 'name', 'twitter:image');
    removeMeta(documentRef, 'name', 'twitter:image:alt');
  }

  if (input.product?.price !== undefined && Number(input.product.price) > 0) {
    upsertMeta(documentRef, 'property', 'product:price:amount', Number(input.product.price).toFixed(2));
    upsertMeta(documentRef, 'property', 'product:price:currency', input.product.priceCurrency || 'PHP');
    if (input.product.availability) {
      upsertMeta(documentRef, 'property', 'product:availability', input.product.availability);
    } else {
      removeMeta(documentRef, 'property', 'product:availability');
    }
  } else {
    removeMeta(documentRef, 'property', 'product:price:amount');
    removeMeta(documentRef, 'property', 'product:price:currency');
    removeMeta(documentRef, 'property', 'product:availability');
  }

  documentRef.head.querySelectorAll('script[type="application/ld+json"][data-mcc-schema]')
    .forEach((script) => script.remove());
  const schemas = (Array.isArray(input.structuredData) ? input.structuredData : [input.structuredData]).filter(Boolean);
  schemas.forEach((schema) => {
    const script = documentRef.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.mccSchema = schemaType(schema);
    script.dataset.mccClientSeo = 'true';
    script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
    documentRef.head.appendChild(script);
  });
}

export function breadcrumbStructuredData(items, origin) {
  const base = storefrontOrigin(origin);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absoluteSeoUrl(item.path, base) } : {})
    }))
  };
}

function reviewAggregate(product, includeReviews = true) {
  if (!includeReviews) return {};
  const count = Number(product?.reviewSummary?.totalReviews || 0);
  const rating = Number(product?.reviewSummary?.averageRating || 0);
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(rating) || rating <= 0) return {};
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Number(rating.toFixed(1)),
      reviewCount: Math.trunc(count),
      bestRating: 5,
      worstRating: 1
    }
  };
}

function productOffer(product, variant, canonical, origin) {
  const variantPriceCents = Number(variant?.priceCents);
  const productPriceCents = Number(product?.priceCents || 0);
  const priceCents = Number.isFinite(variantPriceCents) && variantPriceCents > 0 ? variantPriceCents : productPriceCents;
  const inStock = Number(variant?.stockQuantity || 0) > 0;
  const landingUrl = variantLandingUrl(canonical, variant?.size);
  return {
    '@type': 'Offer',
    url: landingUrl,
    priceCurrency: 'PHP',
    price: Number((priceCents / 100).toFixed(2)),
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', '@id': `${storefrontOrigin(origin)}/#store`, name: SEO_BRAND_NAME }
  };
}

function variantLandingUrl(canonical, size) {
  const value = plainSeoText(size);
  if (!value) return canonical;
  try {
    const url = new URL(canonical);
    url.searchParams.set('size', value);
    return url.toString();
  } catch (_error) {
    return canonical;
  }
}

export function productStructuredData(product, options = {}) {
  const origin = storefrontOrigin(options.origin);
  const canonical = canonicalSeoUrl(productPath(product), product?.seo?.canonicalUrl, origin);
  const fallbackDescription = productSeoFallbackText(product).description;
  const facts = productDisplayFacts(product);
  const description = Object.values(facts.conflicts).some(Boolean)
    ? fallbackDescription
    : plainSeoText(product?.description || product?.productPage?.intro || product?.seo?.description || fallbackDescription, 5000);
  const images = (product?.images || []).map((image) => absoluteSeoUrl(image?.url, origin)).filter(Boolean);
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const includeReviews = options.includeReviews !== undefined
    ? Boolean(options.includeReviews)
    : product?.reviewSettings?.reviewsEnabled !== false && product?.reviewSettings?.showRatingSummary !== false;
  const factProperties = [
    facts.fit && { '@type': 'PropertyValue', name: 'Fit', value: facts.fit },
    facts.fabricWeight && { '@type': 'PropertyValue', name: 'Fabric weight', value: facts.fabricWeight }
  ].filter(Boolean);
  const category = String(product?.category || product?.productType || 'T-Shirts').trim();
  const common = {
    name: product?.name,
    description,
    url: canonical,
    image: images,
    brand: { '@type': 'Brand', name: SEO_BRAND_NAME },
    category,
    ...(facts.color ? { color: facts.color } : {}),
    ...(facts.material ? { material: facts.material } : {}),
    ...(factProperties.length ? { additionalProperty: factProperties } : {})
  };

  if (variants.length > 1) {
    const groupId = String(product?.id || product?.slug || product?.publicHandle || '').trim();
    const groupSchemaId = `${canonical}#product-group`;
    return {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      '@id': groupSchemaId,
      ...common,
      productGroupID: groupId,
      variesBy: ['https://schema.org/size'],
      hasVariant: variants.map((variant) => ({
        '@type': 'Product',
        '@id': `${canonical}#variant-${encodeURIComponent(String(variant.id || variant.sku || variant.size || 'item'))}`,
        name: [product?.name, variant?.size ? `Size ${String(variant.size).toUpperCase()}` : ''].filter(Boolean).join(' — '),
        sku: variant?.sku || undefined,
        size: variant?.size ? String(variant.size).toUpperCase() : undefined,
        image: images,
        url: variantLandingUrl(canonical, variant?.size),
        ...(facts.color ? { color: facts.color } : {}),
        ...(facts.material ? { material: facts.material } : {}),
        isVariantOf: { '@id': groupSchemaId },
        offers: productOffer(product, variant, canonical, origin)
      })),
      ...reviewAggregate(product, includeReviews)
    };
  }

  const variant = variants[0] || null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    ...common,
    url: canonical,
    sku: variant?.sku || undefined,
    ...(variant?.size ? { size: variant.size } : {}),
    offers: productOffer(product, variant || { stockQuantity: 0 }, canonical, origin),
    ...reviewAggregate(product, includeReviews)
  };
}

export function productSeoDescriptor(product, options = {}) {
  const origin = storefrontOrigin(options.origin);
  const seo = product?.seo || {};
  const canonical = canonicalSeoUrl(productPath(product), seo.canonicalUrl, origin);
  const fallback = productSeoFallbackText(product);
  const description = wordSafeSeoText(seo.description || fallback.description, 160) || fallback.description;
  const image = seo.ogImageUrl || product?.images?.[0]?.url || '';
  const imageAlt = seo.imageAltText || product?.images?.[0]?.altText || product?.name || '';
  const inStock = (product?.variants || []).some((variant) => Number(variant?.stockQuantity || 0) > 0);
  const parentCollection = options.collection;
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Shop', path: '/shop' },
    ...(parentCollection?.slug ? [{ name: parentCollection.name, path: `/collections/${encodeURIComponent(parentCollection.slug)}` }] : []),
    { name: product?.name || 'Product' }
  ];
  return {
    pathname: productPath(product),
    title: wordSafeSeoText(seo.title, 70) || fallback.title,
    description,
    canonical,
    image,
    imageAlt,
    type: 'product',
    noindex: seo.indexable === false || ['draft', 'archived'].includes(String(product?.publicationStatus || product?.status || '').toLowerCase()),
    ogTitle: wordSafeSeoText(seo.ogTitle || seo.title, 70) || fallback.title,
    ogDescription: wordSafeSeoText(seo.ogDescription || seo.description || fallback.description, 160),
    product: {
      price: Number(product?.priceCents || 0) / 100,
      priceCurrency: 'PHP',
      availability: inStock ? 'in stock' : 'out of stock'
    },
    structuredData: [
      productStructuredData(product, { origin, includeReviews: options.includeReviews }),
      breadcrumbStructuredData(breadcrumbs, origin)
    ]
  };
}

export function collectionSeoDescriptor(collection, products = [], options = {}) {
  const origin = storefrontOrigin(options.origin);
  const path = `/collections/${encodeURIComponent(collection?.slug || '')}`;
  const canonical = canonicalSeoUrl(path, collection?.canonicalUrl, origin);
  const description = wordSafeSeoText(collection?.metaDescription || collection?.introText || collection?.description, 160)
    || `Shop ${collection?.name || 'this collection'} from ${SEO_BRAND_NAME}.`;
  const indexable = collection?.indexable !== false && products.length > 0;
  return {
    pathname: path,
    title: wordSafeSeoText(collection?.seoTitle, 70) || wordSafeSeoText(`${collection?.name || 'Collection'} | ${SEO_BRAND_NAME}`, 70),
    description,
    canonical,
    image: collection?.ogImageUrl || collection?.imageUrl || '',
    imageAlt: `${collection?.name || 'Maria Clara Clothing'} collection`,
    noindex: !indexable,
    structuredData: [
      breadcrumbStructuredData([
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: collection?.name || 'Collection' }
      ], origin),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: collection?.name,
        description,
        url: canonical,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: products.length,
          itemListElement: products.map((product, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: product.name,
            url: absoluteSeoUrl(productPath(product), origin)
          }))
        }
      }
    ]
  };
}

function readableSlug(pathname, prefix, fallback) {
  const value = pathname.slice(prefix.length);
  try {
    return decodeURIComponent(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || fallback;
  } catch (_error) {
    return fallback;
  }
}

export function routeSeoDescriptor(pathname = '/', search = '', origin) {
  const path = pathname !== '/' ? String(pathname || '/').replace(/\/+$/, '') : '/';
  const base = { pathname: path, canonical: path, origin };
  if (PRIVATE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return {
      ...base,
      title: `Secure page | ${SEO_BRAND_NAME}`,
      description: `Secure customer or administration page for ${SEO_BRAND_NAME}.`,
      noindex: true
    };
  }
  if (path === '/') return { ...base, title: DEFAULT_SEO_TITLE, description: DEFAULT_SEO_DESCRIPTION };
  if (path === '/shop') {
    return {
      ...base,
      title: `Shop Premium T-Shirts | ${SEO_BRAND_NAME}`,
      description: `Shop ${SEO_BRAND_NAME} oversized, regular-fit, and crop-box shirts with current size availability and nationwide delivery.`,
      robots: search ? NOINDEX_FOLLOW_ROBOTS : INDEX_ROBOTS
    };
  }
  if (path.startsWith('/product/')) {
    return {
      ...base,
      title: `${readableSlug(path, '/product/', 'Product')} | ${SEO_BRAND_NAME}`,
      description: `View product details, sizes, availability, and delivery information from ${SEO_BRAND_NAME}.`,
      type: 'product'
    };
  }
  if (path.startsWith('/collections/')) {
    const name = readableSlug(path, '/collections/', 'Collection');
    return { ...base, title: `${name} | ${SEO_BRAND_NAME}`, description: `Shop the ${name} collection from ${SEO_BRAND_NAME}.` };
  }
  if (STATIC_ROUTE_SEO[path]) return { ...base, ...STATIC_ROUTE_SEO[path] };
  return {
    ...base,
    title: `Page not found | ${SEO_BRAND_NAME}`,
    description: 'The requested page is unavailable.',
    noindex: true
  };
}
