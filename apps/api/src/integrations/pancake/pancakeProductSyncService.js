const crypto = require('node:crypto');
const { findEditableProductBySlug } = require('../../products/catalogRepository');
const repositoryDefault = require('./pancakeProductSyncRepository');

const REASON_MESSAGES = {
  pancake_database_unavailable: 'Pancake product sync requires the production database.',
  shop_not_selected: 'Select a Pancake shop before syncing products.',
  warehouse_not_selected: 'Select a Pancake warehouse before syncing stock.',
  pancake_catalog_not_ready: 'Import and verify the Pancake catalog before syncing this product.',
  pancake_price_unit_unconfirmed: 'Pancake price units are not verified yet.',
  pancake_product_mapping_missing: 'Missing Pancake mapping. Verify every product variant SKU before syncing.',
  pancake_product_sync_not_live: 'Pancake must be in live mode before products can be updated.'
};

class PancakeProductSyncError extends Error {
  constructor(code, sync, status = 409) {
    super(REASON_MESSAGES[code] || 'Pancake product sync failed.');
    this.code = code;
    this.sync = sync;
    this.status = status;
  }
}

function providerCode(error) {
  return /^pancake_[a-z_]+$/.test(String(error?.code || '')) ? error.code : 'pancake_product_sync_failed';
}

function pancakePrice(cents, priceUnitStatus) {
  const value = Number(cents);
  if (!Number.isInteger(value) || value < 0) throw new PancakeProductSyncError('pancake_product_price_invalid', null, 400);
  if (priceUnitStatus === 'confirmed_centavos') return value;
  if (value % 100 !== 0) throw new PancakeProductSyncError('pancake_product_price_precision_unsupported', null, 409);
  return value / 100;
}

function buildProductPayload(product, readiness) {
  const mappingBySku = new Map(readiness.mappings.map((mapping) => [mapping.sku.toUpperCase(), mapping]));
  const hidden = String(product.status || 'active').toLowerCase() !== 'active';
  const variations = product.variants.map((variant) => {
    const mapping = mappingBySku.get(String(variant.sku || '').toUpperCase());
    return {
      id: mapping.pancakeVariantId,
      fields: [{ name: 'Size', value: String(variant.size || '') }],
      retail_price: pancakePrice(variant.priceCents || product.priceCents, readiness.priceUnitStatus),
      price_at_counter: pancakePrice(variant.priceCents || product.priceCents, readiness.priceUnitStatus),
      weight: Number(product.parcelWeightGrams || 250),
      custom_id: String(variant.sku || ''),
      is_hidden: hidden
    };
  });
  return {
    product: {
      name: product.name,
      note_product: product.description,
      product_attributes: [{ name: 'Size', values: product.variants.map((variant) => String(variant.size || '')) }],
      weight: Number(product.parcelWeightGrams || 250),
      custom_id: product.slug,
      is_published: !hidden,
      variations
    }
  };
}

function buildQuantityPayload(product, readiness) {
  const mappingBySku = new Map(readiness.mappings.map((mapping) => [mapping.sku.toUpperCase(), mapping]));
  return {
    is_actual_remain_quantity: false,
    variations_warehouses: product.variants.map((variant) => ({
      variation_id: mappingBySku.get(String(variant.sku || '').toUpperCase()).pancakeVariantId,
      remain_quantity: Number(variant.stockQuantity || 0),
      warehouse_id: readiness.warehouseId
    }))
  };
}

async function syncProductToPancake({
  productSlug,
  config,
  client,
  repository = repositoryDefault,
  productRepository = { findEditableProductBySlug },
  now = () => new Date()
}) {
  const slug = String(productSlug || '').trim();
  const product = await productRepository.findEditableProductBySlug(slug);
  if (!product) throw new PancakeProductSyncError('pancake_product_not_found', null, 404);
  const attemptId = crypto.randomUUID();
  const attemptedAt = now().toISOString();

  async function block(code, status = 'blocked') {
    await repository.recordProductSync({
      productSlug: slug, status, attemptId, safeErrorCode: code, lastAttemptAt: attemptedAt,
      summary: { stockMismatch: status === 'failed' ? true : null }
    });
    const [sync] = await repository.listProductSyncStatuses([slug]);
    throw new PancakeProductSyncError(code, sync, code === 'pancake_product_mapping_missing' ? 409 : 503);
  }

  if (config?.mode !== 'live' || !config?.apiKey) await block('pancake_product_sync_not_live');
  const readiness = await repository.loadProductSyncReadiness(slug, config);
  if (!readiness.ready) {
    await block(readiness.reason, readiness.reason === 'pancake_product_mapping_missing' ? 'missing_mapping' : 'blocked');
  }
  await repository.recordProductSync({
    productSlug: slug, status: 'syncing', pancakeProductId: readiness.pancakeProductId,
    attemptId, lastAttemptAt: attemptedAt, summary: { stockMismatch: null }
  });

  try {
    await client.updateProduct(readiness.shopId, readiness.pancakeProductId, buildProductPayload(product, readiness));
    await client.updateVariationQuantities(readiness.shopId, buildQuantityPayload(product, readiness));
    const finishedAt = now().toISOString();
    await repository.recordProductSync({
      productSlug: slug,
      status: 'synced',
      pancakeProductId: readiness.pancakeProductId,
      attemptId,
      lastAttemptAt: attemptedAt,
      lastSyncedAt: finishedAt,
      summary: { stockMismatch: false, variantCount: product.variants.length }
    });
    const [sync] = await repository.listProductSyncStatuses([slug]);
    return sync;
  } catch (error) {
    const code = providerCode(error);
    await repository.recordProductSync({
      productSlug: slug, status: 'failed', pancakeProductId: readiness.pancakeProductId,
      attemptId, safeErrorCode: code, lastAttemptAt: attemptedAt,
      summary: { stockMismatch: true, variantCount: product.variants.length }
    });
    console.error(JSON.stringify({ level: 'error', event: 'pancake_product_sync_failed', productSlug: slug, code }));
    const [sync] = await repository.listProductSyncStatuses([slug]);
    throw new PancakeProductSyncError(code, sync, error?.retryable ? 503 : 502);
  }
}

module.exports = {
  PancakeProductSyncError,
  buildProductPayload,
  buildQuantityPayload,
  pancakePrice,
  syncProductToPancake
};
