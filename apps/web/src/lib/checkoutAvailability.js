const CART_AVAILABILITY_ERROR_CODES = new Set([
  'insufficient_stock',
  'product_unavailable',
  'variant_unavailable',
  'cart_invalid'
]);

export function isCartAvailabilityError(error) {
  return CART_AVAILABILITY_ERROR_CODES.has(String(error?.code || '').trim().toLowerCase());
}

export function cartAvailabilityRepair(error, items = []) {
  if (!isCartAvailabilityError(error)) return null;
  const details = error?.details || {};
  const variantId = String(details.variantId || '').trim();
  const productId = String(details.productId || '').trim();
  const availableQuantity = Number(details.availableQuantity);
  const affectedVariantIds = (Array.isArray(items) ? items : [])
    .filter((item) => (variantId && item.variantId === variantId) || (!variantId && productId && item.productId === productId))
    .map((item) => item.variantId);

  if (!affectedVariantIds.length) return null;
  if (error.code === 'insufficient_stock' && Number.isInteger(availableQuantity) && availableQuantity > 0) {
    return { type: 'reduce', variantId: affectedVariantIds[0], quantity: availableQuantity };
  }
  return { type: 'remove', variantIds: affectedVariantIds };
}
