import {
  SEO_BRAND_NAME,
  canonicalSeoUrl,
  plainSeoText,
  productSeoFallbackText,
  storefrontOrigin,
  wordSafeSeoText
} from './seo.js';
import { productPath } from './productUrl.js';

function listValue(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function productMetafield(product, key) {
  const value = product?.metafields?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join(', ') : String(value || '').trim();
}

export function productSeoFallbacks(product = {}) {
  const seo = product.seo || {};
  const generated = productSeoFallbackText(product);
  const title = wordSafeSeoText(seo.title, 70) || generated.title;
  const description = wordSafeSeoText(seo.description || generated.description, 160) || generated.description;
  const pathname = product.publicHandle || product.slug ? productPath(product) : '/product/product-slug';
  const canonical = canonicalSeoUrl(pathname, seo.canonicalUrl);
  const imageAltText = String(seo.imageAltText || product.images?.[0]?.altText || '').trim();
  return { title, description, pathname, canonical, imageAltText };
}

function canonicalOverrideWarning(value, pathname) {
  const input = String(value || '').trim();
  if (!input) return '';
  const origin = storefrontOrigin();
  try {
    const candidate = new URL(input, `${origin}/`);
    if (candidate.origin !== origin) return 'Canonical override must stay on the Maria Clara storefront origin.';
    if (pathname.startsWith('/product/') && !candidate.pathname.startsWith('/product/')) return 'Product canonical override must use a /product/ path.';
    if (pathname.startsWith('/collections/') && !candidate.pathname.startsWith('/collections/')) return 'Collection canonical override must use a /collections/ path.';
    return '';
  } catch (_error) {
    return 'Canonical override must be a valid site-relative path or same-origin HTTPS URL.';
  }
}

export function productSeoAnalysis(product = {}) {
  const seo = product.seo || {};
  const fallbacks = productSeoFallbacks(product);
  const customTitle = String(seo.title || '').trim();
  const customDescription = String(seo.description || '').trim();
  const descriptionText = plainSeoText(product.description || product.productPage?.intro, 1000);
  const images = Array.isArray(product.images) ? product.images : [];
  const allImagesHaveAlt = images.length > 0 && images.every((image, index) => String(image?.altText || (index === 0 ? seo.imageAltText : '') || '').trim());
  const sizeRows = Array.isArray(product.productPage?.sizeChart) ? product.productPage.sizeChart : [];
  const checks = [
    ['Product title', Boolean(String(product.name || '').trim())],
    ['SEO title', Boolean(customTitle)],
    ['Meta description', Boolean(customDescription)],
    ['Unique product description', descriptionText.length >= 80],
    ['URL slug', Boolean(String(product.publicHandle || '').trim())],
    ['Canonical URL', Boolean(fallbacks.canonical)],
    ['Main product image', images.length > 0],
    ['Image alt text', allImagesHaveAlt],
    ['Product details', Boolean(String(product.productPage?.detailsText || '').trim() || descriptionText)],
    ['Fit details', Boolean(productMetafield(product, 'fit'))],
    ['Fabric information', Boolean(productMetafield(product, 'material') || productMetafield(product, 'fabricWeight'))],
    ['Size guide', sizeRows.length > 0],
    ['Collection link', Array.isArray(product.collections) && product.collections.length > 0],
    ['SKU and variants', Array.isArray(product.variants) && product.variants.some((variant) => String(variant?.sku || '').trim())],
    ['Price', Number(product.priceCents || 0) > 0],
    ['Availability', Array.isArray(product.variants) && product.variants.length > 0]
  ];
  const complete = checks.filter(([, value]) => value).length;
  const score = Math.round((complete / checks.length) * 100);
  const warnings = [];
  if (!customTitle) warnings.push('Add a custom SEO title; the product-name fallback will be used until then.');
  if (customTitle.length > 70) warnings.push('SEO title may truncate in search results; keep the most distinctive words near the beginning.');
  if (!customDescription) warnings.push('Add a unique meta description; a product-description fallback will be used until then.');
  if (customDescription.length > 160) warnings.push('Meta description may truncate on some devices. This is a preview warning, not a hard Google limit.');
  if (descriptionText.length < 80) warnings.push('Product description is thin; add verified design, fit, fabric, sizing, care, and shipping details.');
  if (!String(product.publicHandle || '').trim()) warnings.push('A URL slug is required before the product can have a stable canonical URL.');
  if (!String(seo.mainKeyword || '').trim()) warnings.push('Add one primary search phrase to keep this product distinct from collection pages.');
  if (!allImagesHaveAlt) warnings.push('Add descriptive, angle-specific alt text to every meaningful product image.');
  if (seo.indexable === false) warnings.push('This product is excluded from search indexing.');
  if (String(seo.feedTitle || '').length > 150) warnings.push('Product feed title exceeds the Merchant Center maximum of 150 characters.');
  const canonicalWarning = canonicalOverrideWarning(seo.canonicalUrl, fallbacks.pathname);
  if (canonicalWarning) warnings.push(canonicalWarning);
  return { checks, score, warnings, fallbacks };
}

export function collectionSeoFallbacks(collection = {}) {
  const path = `/collections/${collection.slug || 'collection-slug'}`;
  return {
    title: wordSafeSeoText(collection.seoTitle, 70) || wordSafeSeoText(`${collection.name || 'Collection'} | ${SEO_BRAND_NAME}`, 70),
    description: wordSafeSeoText(collection.metaDescription || collection.introText || collection.description, 160)
      || `Shop ${collection.name || 'this collection'} from ${SEO_BRAND_NAME}.`,
    pathname: path,
    canonical: canonicalSeoUrl(path, collection.canonicalUrl)
  };
}

export function collectionSeoAnalysis(collection = {}, productCount = 0) {
  const fallbacks = collectionSeoFallbacks(collection);
  const seoTitle = String(collection.seoTitle || '').trim();
  const metaDescription = String(collection.metaDescription || '').trim();
  const introText = String(collection.introText || collection.description || '').trim();
  const secondaryKeywords = listValue(collection.secondaryKeywords);
  const checks = [
    ['Collection name', Boolean(String(collection.name || '').trim())],
    ['SEO title', Boolean(seoTitle)],
    ['Meta description', Boolean(metaDescription)],
    ['URL slug', Boolean(String(collection.slug || '').trim())],
    ['Introduction', Boolean(introText)],
    ['Main keyword', Boolean(String(collection.mainKeyword || '').trim())],
    ['Products', Number(productCount) > 0],
    ['Index control', typeof collection.indexable === 'boolean'],
    ['Open Graph image', Boolean(String(collection.ogImageUrl || collection.imageUrl || '').trim())]
  ];
  const score = Math.round((checks.filter(([, value]) => value).length / checks.length) * 100);
  const warnings = [];
  if (!seoTitle) warnings.push('Add a custom SEO title; a collection-name fallback will be used.');
  if (seoTitle.length > 70) warnings.push('SEO title may truncate in search results; this is a soft preview warning.');
  if (!metaDescription) warnings.push('Add a unique meta description for this collection.');
  if (metaDescription.length > 160) warnings.push('Meta description may truncate on some devices; Google has no fixed character limit.');
  if (!introText) warnings.push('Add a concise, useful introduction above the product grid.');
  if (!String(collection.mainKeyword || '').trim()) warnings.push('Assign one primary commercial search phrase to avoid cannibalization.');
  if (secondaryKeywords.length > 20) warnings.push('Use no more than 20 closely related secondary phrases.');
  if (Number(productCount) === 0 && collection.indexable !== false) warnings.push('Empty collections should remain noindex until products are assigned.');
  if (collection.indexable === false) warnings.push('This collection is excluded from search indexing.');
  const canonicalWarning = canonicalOverrideWarning(collection.canonicalUrl, fallbacks.pathname);
  if (canonicalWarning) warnings.push(canonicalWarning);
  return { checks, score, warnings, fallbacks };
}
