const BRAND_NAME = 'Maria Clara Clothing';
const { buildProductSeo } = require('./productSeo');

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value) {
  return plainText(value).toLocaleLowerCase('en');
}

function words(value) {
  return plainText(value).split(/\s+/).filter(Boolean);
}

function productHandle(product) {
  return String(product?.publicHandle || product?.seo?.handle || product?.slug || '').trim();
}

function fallbackSeoTitle(product) {
  return `${plainText(product?.name)} | ${BRAND_NAME}`;
}

function fallbackMetaDescription(product) {
  const description = plainText(product?.description || product?.productPage?.intro);
  if (description) return description;
  return `Shop ${plainText(product?.name)} from ${BRAND_NAME}. View current sizes, price, and availability.`;
}

function duplicateValues(records, selector) {
  const counts = new Map();
  records.forEach((record) => {
    const value = normalized(selector(record));
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value));
}

function knownProductNames(products) {
  return products.map((product) => ({
    slug: product.slug,
    phrase: normalized(String(product.name || '').split(/\s+[—–-]\s+/)[0])
  })).filter((record) => record.phrase.length >= 6);
}

function imageIssues(product, productNames) {
  const images = Array.isArray(product.images) ? product.images : [];
  const alts = images.map((image) => plainText(image?.altText));
  const ownName = productNames.find((record) => record.slug === product.slug)?.phrase || normalized(product.name);
  const wrongProduct = alts.some((alt) => {
    const text = normalized(alt);
    return productNames.some((record) => record.slug !== product.slug && text.includes(record.phrase) && !ownName.includes(record.phrase));
  });
  const meaningful = alts.filter((alt) => alt && !/^product image$/i.test(alt));
  return {
    missing: images.length === 0 || meaningful.length !== images.length,
    repeated: meaningful.length > 1 && new Set(meaningful.map(normalized)).size === 1,
    wrongProduct,
    summary: meaningful.join(' | ')
  };
}

function productChecks(product, imageStatus, validCollections) {
  const seo = product.seo || {};
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const productPage = product.productPage || {};
  const metafields = product.metafields || {};
  const hasFit = ['fit', 'cut'].some((key) => (metafields[key] || []).length) || /\b(oversized|regular[ -]?fit|crop[ -]?box)\b/i.test(`${product.name} ${product.description}`);
  const hasFabric = ['material', 'fabric', 'fabric_weight', 'gsm'].some((key) => (metafields[key] || []).length) || /\b(cotton|gsm)\b/i.test(`${product.name} ${product.description}`);
  const hasSizeGuide = Array.isArray(productPage.sizeChart) && productPage.sizeChart.length > 0;
  const hasInternalCollection = (product.collections || []).some((name) => validCollections.has(normalized(name)));
  const structuredDataReady = Boolean(
    plainText(product.name) && fallbackMetaDescription(product) &&
    (product.images || []).some((image) => image?.url) &&
    Number(product.priceCents) > 0 && variants.length &&
    variants.every((variant) => String(variant.sku || '').trim() && Number.isFinite(Number(variant.stockQuantity)))
  );
  return {
    title: Boolean(plainText(product.name)),
    seoTitle: Boolean(plainText(seo.title)),
    metaDescription: Boolean(plainText(seo.description)),
    description: words(product.description).length >= 20,
    slug: Boolean(productHandle(product)),
    canonical: Boolean(productHandle(product)),
    mainImage: Boolean(product.images?.[0]?.url),
    altText: !imageStatus.missing && !imageStatus.wrongProduct,
    productDetails: Boolean(plainText(productPage.detailsText) || (productPage.sections || []).length),
    fitDetails: hasFit,
    fabricInformation: hasFabric,
    sizeGuide: hasSizeGuide,
    internalLinks: hasInternalCollection,
    structuredData: structuredDataReady,
    price: Number(product.priceCents) > 0,
    availability: variants.length > 0 && variants.every((variant) => Number.isFinite(Number(variant.stockQuantity)))
  };
}

function productScore(checks) {
  const values = Object.values(checks);
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function statusForScore(score) {
  if (score >= 90) return 'complete';
  if (score >= 70) return 'needs-review';
  return 'needs-seo';
}

function buildSeoAudit({ products = [], collections = [], siteUrl = '' } = {}) {
  const activeProducts = products.filter((product) => String(product.status || 'active').toLowerCase() === 'active');
  const resolvedSeo = new Map(activeProducts.map((product) => [
    product.slug,
    buildProductSeo(product, { siteUrl })
  ]));
  const titleDuplicates = duplicateValues(activeProducts, (product) => resolvedSeo.get(product.slug)?.title);
  const descriptionDuplicates = duplicateValues(activeProducts, (product) => resolvedSeo.get(product.slug)?.description);
  const slugDuplicates = duplicateValues(activeProducts, productHandle);
  const productNames = knownProductNames(activeProducts);
  const collectionNames = new Set(collections.flatMap((collection) => [collection.name, ...(collection.aliases || [])]).map(normalized));

  const rows = activeProducts.map((product) => {
    const seo = product.seo || {};
    const effectiveSeo = resolvedSeo.get(product.slug) || buildProductSeo(product, { siteUrl });
    const title = effectiveSeo.title || fallbackSeoTitle(product);
    const description = effectiveSeo.description || fallbackMetaDescription(product);
    const handle = productHandle(product);
    const images = imageIssues(product, productNames);
    const checks = productChecks(product, images, collectionNames);
    const score = productScore(checks);
    const warnings = [];
    if (!plainText(seo.title)) warnings.push('Missing custom SEO title');
    if (!plainText(seo.description)) warnings.push('Missing custom meta description');
    if (!plainText(seo.mainKeyword)) warnings.push('Missing main keyword');
    if (title.length > 65) warnings.push('SEO title may truncate in common search layouts');
    if (description.length > 170) warnings.push('Meta description may truncate in common search layouts');
    if (normalized(title) && titleDuplicates.has(normalized(title))) warnings.push('Duplicate SEO title');
    if (normalized(description) && descriptionDuplicates.has(normalized(description))) warnings.push('Duplicate meta description');
    if (images.missing) warnings.push('Missing or generic image alt text');
    if (images.repeated) warnings.push('Repeated gallery alt text needs angle review');
    if (images.wrongProduct) warnings.push('Image alt text appears to name another product');
    if (words(product.description).length < 20) warnings.push('Thin product description');
    if (seo.indexable === false) warnings.push('Excluded from search indexing');
    if (!checks.internalLinks) warnings.push('No valid collection assignment');
    if (!checks.structuredData) warnings.push('Structured-data required fields incomplete');
    return {
      id: product.id || product.slug,
      slug: product.slug,
      handle,
      sku: (product.variants || []).map((variant) => variant.sku).filter(Boolean).join(', '),
      name: product.name,
      currentUrl: effectiveSeo.path || `/product/${handle}`,
      seoTitle: title,
      customSeoTitle: plainText(seo.title),
      metaDescription: description,
      customMetaDescription: plainText(seo.description),
      mainKeyword: plainText(seo.mainKeyword),
      secondaryKeywords: Array.isArray(seo.secondaryKeywords) ? seo.secondaryKeywords : [],
      imageAltText: images.summary,
      indexStatus: effectiveSeo.indexable ? 'index' : 'noindex',
      completeness: score,
      status: statusForScore(score),
      structuredDataStatus: checks.structuredData ? 'ready' : 'needs-data',
      updatedAt: product.updatedAt || product.createdAt || '',
      warnings,
      checks
    };
  });

  const collectionRows = collections.map((collection) => {
    const accepted = new Set([collection.name, ...(collection.aliases || [])].map(normalized));
    const members = activeProducts.filter((product) => (product.collections || []).some((name) => accepted.has(normalized(name))));
    const indexable = collection.visible !== false && collection.indexable !== false && members.length > 0;
    const warnings = [];
    if (!plainText(collection.seoTitle)) warnings.push('Missing custom SEO title');
    if (!plainText(collection.metaDescription)) warnings.push('Missing custom meta description');
    if (!plainText(collection.introText || collection.description)) warnings.push('Missing collection introduction');
    if (!members.length) warnings.push('Empty collection is automatically excluded from indexing');
    return {
      name: collection.name,
      slug: collection.slug,
      productCount: members.length,
      indexStatus: indexable ? 'index' : 'noindex',
      seoTitle: collection.seoTitle || `${collection.name} | ${BRAND_NAME}`,
      metaDescription: collection.metaDescription || collection.description || '',
      warnings
    };
  });

  const summary = {
    totalActiveProducts: rows.length,
    missingSeoTitles: rows.filter((row) => !row.customSeoTitle).length,
    missingMetaDescriptions: rows.filter((row) => !row.customMetaDescription).length,
    missingAltText: rows.filter((row) => !row.checks.altText).length,
    duplicateTitles: rows.filter((row) => titleDuplicates.has(normalized(row.seoTitle))).length,
    duplicateDescriptions: rows.filter((row) => descriptionDuplicates.has(normalized(row.metaDescription))).length,
    duplicateSlugs: rows.filter((row) => slugDuplicates.has(normalized(row.handle))).length,
    thinDescriptions: rows.filter((row) => !row.checks.description).length,
    noindexProducts: rows.filter((row) => row.indexStatus === 'noindex').length,
    structuredDataIssues: rows.filter((row) => row.structuredDataStatus !== 'ready').length,
    collectionsMissingMetadata: collectionRows.filter((row) => row.warnings.some((warning) => /metadata|SEO title|meta description/i.test(warning))).length,
    emptyCollections: collectionRows.filter((row) => row.productCount === 0).length,
    brokenInternalLinks: rows.filter((row) => !row.checks.internalLinks).length
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    counts: summary,
    products: rows,
    collections: collectionRows,
    technical: {
      siteUrl,
      sitemap: '/sitemap.xml',
      robots: '/robots.txt',
      merchantFeed: '/merchant-feed.xml',
      scoreLabel: 'SEO Content Completeness',
      scoreDisclaimer: 'This internal checklist is not a Google ranking score.'
    }
  };
}

function csvCell(value) {
  const raw = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function seoAuditCsv(audit) {
  const headings = [
    'Product ID', 'SKU', 'Product name', 'Current URL', 'SEO title', 'Meta description',
    'Main keyword', 'Secondary keywords', 'Image alt text', 'Index status',
    'SEO completeness', 'Structured-data status', 'Last updated'
  ];
  const rows = audit.products.map((product) => [
    product.id, product.sku, product.name, product.currentUrl, product.seoTitle,
    product.metaDescription, product.mainKeyword, product.secondaryKeywords,
    product.imageAltText, product.indexStatus, `${product.completeness}%`,
    product.structuredDataStatus, product.updatedAt
  ]);
  return `\uFEFF${[headings, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

module.exports = { buildSeoAudit, seoAuditCsv };
