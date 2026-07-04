export const MAX_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_IMAGE_BYTES = 40 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.avif,.tif,.tiff';

const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff']);
const PRODUCT_IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|gif|avif|tiff?)$/i;

function isSupportedProductImage(file) {
  return PRODUCT_IMAGE_TYPES.has(String(file.type || '').toLowerCase())
    || PRODUCT_IMAGE_EXTENSIONS.test(String(file.name || ''));
}

export function validateQueuedProductFiles(currentFiles, incomingFiles) {
  const next = [...currentFiles, ...incomingFiles];
  if (next.length > MAX_PRODUCT_IMAGES) throw new Error('Choose no more than eight product photos.');
  if (next.some((file) => !isSupportedProductImage(file))) {
    throw new Error('Use JPG, PNG, WebP, GIF, AVIF, or TIFF product photos.');
  }
  if (next.some((file) => Number(file.size) > MAX_PRODUCT_IMAGE_BYTES)) {
    throw new Error('Each product photo must be 40 MB or smaller.');
  }
  return next;
}

export function buildNewProductBody(product, files) {
  const body = new FormData();
  body.append('product', JSON.stringify(product));
  files.forEach((file) => body.append('images', file));
  return body;
}

export function reorderQueuedProductImages(items, fromIndex, toIndex) {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= items.length
    || toIndex >= items.length
  ) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveQueuedProductImage(items, index, destination) {
  const targets = {
    first: 0,
    left: index - 1,
    right: index + 1,
    last: items.length - 1
  };
  return reorderQueuedProductImages(items, index, targets[destination]);
}

export function validateNewProduct({ product, priceCents, files }) {
  const errors = {};
  if (!String(product.name || '').trim()) errors.details = 'Enter a product title.';
  if (!Number.isInteger(priceCents) || priceCents <= 0) errors.pricing = 'Enter a price greater than zero.';
  if (!Array.isArray(product.collections) || !product.collections.length) {
    errors.collections = 'Select at least one storefront collection.';
  }
  if (!files.length) errors.media = 'Add at least one product photo.';
  const stock = (product.variants || []).reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
  if (product.status === 'active' && stock <= 0) {
    errors.inventory = 'Enter inventory before publishing an active product.';
  }
  return errors;
}
