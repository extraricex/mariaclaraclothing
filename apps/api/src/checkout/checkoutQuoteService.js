const { findCatalogProductBySlug } = require('../products/catalogPresenter');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const {
  findDiscountByCode,
  normalizeDiscountCode
} = require('../discounts/discountRepository');
const { quoteCart } = require('../promos/promoEngine');
const { resolveCheckoutAddress } = require('./addressService');
const { CommerceError } = require('./commerceError');
const { sha256Object } = require('./requestHash');

function commerceError(message, code, status = 400, details) {
  return new CommerceError(message, { code, status, details });
}

async function findProductById(productId) {
  const normalized = String(productId || '').trim();
  if (!normalized.startsWith('catalog-')) return null;
  const product = await findCatalogProductBySlug(normalized.slice('catalog-'.length));
  return product?.id === normalized ? product : null;
}

function pricingDiscountDefinition(discount) {
  if (!discount) return {};
  return {
    code: discount.code || '',
    method: discount.method || 'code',
    type: discount.type || '',
    value: Number(discount.value || 0),
    status: discount.status || '',
    startsAt: discount.startsAt || null,
    endsAt: discount.endsAt || null,
    usageLimit: discount.usageLimit ?? null,
    minimumQuantity: discount.minimumQuantity ?? null,
    minimumSubtotalCents: discount.minimumSubtotalCents ?? null,
    rules: Array.isArray(discount.rules) ? discount.rules : []
  };
}

async function quotePromos(input) {
  const quote = await quoteCart(input);
  const discount = quote.discountCode
    ? await findDiscountByCode(quote.discountCode)
    : null;
  return {
    ...quote,
    discountDefinition: pricingDiscountDefinition(discount)
  };
}

const DEFAULT_DEPENDENCIES = {
  findProduct: findProductById,
  getSettings: getStoreSettings,
  quotePromos,
  resolveAddress: resolveCheckoutAddress
};

function normalizeImageUrl(product) {
  const first = Array.isArray(product.images) ? product.images[0] : null;
  if (typeof first === 'string') return first;
  return String(first?.url || product.image || '');
}

function insufficientStockMessage(variant, availableQuantity) {
  const size = String(variant.size || 'Selected size').trim() || 'Selected size';
  const pieces = availableQuantity === 1 ? 'piece' : 'pieces';
  return `${size} only has ${availableQuantity} ${pieces} left. Please update your cart quantity.`;
}

async function normalizeLine(input, deps) {
  const productId = String(input?.productId || '').trim();
  const variantId = String(input?.variantId || '').trim();
  const quantity = Number(input?.quantity);

  if (!productId || !variantId || !Number.isInteger(quantity) || quantity <= 0) {
    throw commerceError('Cart items require valid product, variant, and quantity values.', 'cart_invalid');
  }

  const product = await deps.findProduct(productId);
  if (!product) {
    throw commerceError('A product in this cart is no longer available.', 'product_unavailable', 409, {
      productId
    });
  }

  const variant = (Array.isArray(product.variants) ? product.variants : [])
    .find((candidate) => candidate.id === variantId);
  if (!variant) {
    throw commerceError('A product variant in this cart is no longer available.', 'variant_unavailable', 409, {
      productId,
      variantId
    });
  }

  const availableQuantity = Number(variant.stockQuantity || 0);
  if (availableQuantity < quantity) {
    throw commerceError(insufficientStockMessage(variant, availableQuantity), 'insufficient_stock', 409, {
      productId,
      variantId,
      sku: variant.sku || '',
      size: variant.size || '',
      availableQuantity,
      requestedQuantity: quantity
    });
  }

  const unitPriceCents = Number(variant.priceCents ?? product.priceCents);
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    throw commerceError('A product price is unavailable.', 'product_unavailable', 409, { productId });
  }

  return {
    productId: product.id,
    variantId: variant.id,
    slug: product.slug || '',
    productName: product.name || '',
    sku: variant.sku || '',
    size: variant.size || '',
    imageUrl: normalizeImageUrl(product),
    externalPosVariantId: variant.externalPosVariantId || '',
    availableQuantity,
    quantity,
    unitPriceCents,
    lineTotalCents: unitPriceCents * quantity,
    unitWeightGrams: Number(product.parcelWeightGrams || 250),
    lineWeightGrams: Number(product.parcelWeightGrams || 250) * quantity
  };
}

function aggregateCartItems(items) {
  const byVariant = new Map();
  for (const item of items || []) {
    const productId = String(item?.productId || '').trim();
    const variantId = String(item?.variantId || '').trim();
    const quantity = Number(item?.quantity);
    const key = `${productId}\u0000${variantId}`;
    if (!byVariant.has(key)) {
      byVariant.set(key, { ...item, productId, variantId, quantity });
    } else {
      const existing = byVariant.get(key);
      existing.quantity = Number(existing.quantity || 0) + quantity;
    }
  }
  return [...byVariant.values()];
}

function shippingConfig(settings, address) {
  if (!address) {
    return {
      feeCents: 0,
      label: '',
      region: '',
      status: 'pending_address'
    };
  }

  const region = (settings.shipping?.regions || [])
    .find((candidate) => candidate.id === address.shippingRegion);
  if (!region) {
    throw commerceError('Shipping is unavailable for this address.', 'address_unserviceable', 422, {
      shippingRegion: address.shippingRegion
    });
  }

  return {
    feeCents: Math.max(0, Math.round(Number(region.feeCents || 0))),
    label: region.label || address.shippingRegion,
    region: address.shippingRegion,
    status: address.doorToDoor ? 'ready' : 'review_required'
  };
}

async function buildAuthoritativeQuote(input = {}, dependencyOverrides = {}) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const cartSessionId = String(input.cartSessionId || '').trim();
  if (!cartSessionId) {
    throw commerceError('Cart session id is required.', 'cart_session_required');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw commerceError('Cart is empty.', 'cart_invalid');
  }

  const items = await Promise.all(aggregateCartItems(input.items).map((item) => normalizeLine(item, deps)));
  const address = input.address ? deps.resolveAddress(input.address) : null;
  const settings = await deps.getSettings();
  const shipping = shippingConfig(settings, address);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const parcelWeightGrams = items.reduce((sum, item) => sum + item.lineWeightGrams, 0);
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCode = normalizeDiscountCode(input.discountCode);
  const promo = await deps.quotePromos({
    items,
    discountCode,
    shippingFeeCents: shipping.feeCents
  });
  const discountTotalCents = Math.min(
    subtotalCents,
    Math.max(0, Math.round(Number(promo.discountTotalCents || 0)))
  );
  const settingsFreeShipping = Boolean(
    address &&
    settings.shipping?.freeShippingEnabled &&
    itemCount >= Number(settings.shipping.freeShippingMinimumItems || 0)
  );
  const freeShippingUnlocked = Boolean(
    address && (settingsFreeShipping || promo.freeShippingUnlocked)
  );
  const shippingFeeCents = address
    ? (freeShippingUnlocked ? 0 : shipping.feeCents)
    : null;
  const totalCents = Math.max(
    0,
    subtotalCents - discountTotalCents + (shippingFeeCents || 0)
  );
  const appliedDiscountDefinition = promo.discountDefinition || promo.discountSnapshot || {};

  const requestHash = sha256Object({
    cartSessionId,
    items: items.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity
    })),
    address: address ? {
      houseAddress: address.houseAddress,
      provinceCode: address.provinceCode,
      cityCode: address.cityCode,
      barangayCode: address.barangayCode,
      postalCode: address.postalCode
    } : null,
    discountCode
  });
  const pricingFingerprint = sha256Object({
    items: items.map(({ variantId, unitPriceCents }) => ({ variantId, unitPriceCents })),
    shipping: settings.shipping,
    discountDefinition: appliedDiscountDefinition,
    addressDatasetVersion: address?.datasetVersion || ''
  });

  return {
    cartSessionId,
    requestHash,
    pricingFingerprint,
    items,
    itemCount,
    parcelWeightGrams,
    address,
    shippingRegion: shipping.region,
    shippingRegionLabel: shipping.label,
    shippingFeeCents,
    shippingStatus: shipping.status,
    discountCode: promo.discountCode || '',
    discountSnapshot: promo.discountSnapshot || {},
    subtotalCents,
    discountTotalCents,
    totalCents,
    freeShippingUnlocked,
    finalizable: Boolean(address)
  };
}

module.exports = { buildAuthoritativeQuote };
