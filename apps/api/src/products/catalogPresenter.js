const {
  findCatalogProductBySlug: findCatalogProductRecordBySlug,
  listCatalogProducts: listCatalogProductRecords
} = require('./catalogRepository');

function listCatalogProducts() {
  const products = listCatalogProductRecords();
  if (isPromise(products)) {
    return products.then((records) => records.map(toStorefrontProduct));
  }
  return products.map(toStorefrontProduct);
}

function findCatalogProductBySlug(slug) {
  const product = findCatalogProductRecordBySlug(slug);
  if (isPromise(product)) {
    return product.then((record) => record ? toStorefrontProduct(record) : null);
  }
  return product ? toStorefrontProduct(product) : null;
}

function isPromise(value) {
  return value && typeof value.then === 'function';
}

function toStorefrontProduct(product) {
  return {
    id: `catalog-${product.slug}`,
    slug: product.slug,
    name: product.name,
    description: product.description,
    priceCents: product.price,
    parcelWeightGrams: product.parcelWeightGrams || 250,
    compareAtPriceCents: product.compareAtPrice,
    collection: product.collection,
    collections: product.collections,
    merchandisingStatus: product.status,
    featured: product.featured,
    productPage: product.productPage,
    images: (product.imageRecords || product.images.map((url, index) => ({ url, altText: product.name, sortOrder: index }))).map((image, index) => ({
      id: `catalog-image-${product.slug}-${index}`,
      url: image.url,
      altText: image.altText || product.name,
      sortOrder: Number.isInteger(image.sortOrder) ? image.sortOrder : index
    })),
    variants: product.variants.map((variant, index) => ({
      id: `catalog-${product.slug}-${index}`,
      size: variant.size,
      sku: variant.sku,
      priceCents: variant.priceCents || null,
      stockQuantity: Number.isInteger(variant.stockQuantity) ? variant.stockQuantity : variant.available ? 12 : 0,
      externalPosVariantId: variant.externalPosVariantId || ''
    }))
  };
}

module.exports = { listCatalogProducts, findCatalogProductBySlug };
