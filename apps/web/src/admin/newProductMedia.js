export const MAX_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateQueuedProductFiles(currentFiles, incomingFiles) {
  const next = [...currentFiles, ...incomingFiles];
  if (next.length > MAX_PRODUCT_IMAGES) throw new Error('Choose no more than eight product photos.');
  if (next.some((file) => !String(file.type || '').startsWith('image/'))) {
    throw new Error('Only image files can be used as product photos.');
  }
  if (next.some((file) => Number(file.size) > MAX_PRODUCT_IMAGE_BYTES)) {
    throw new Error('Each product photo must be 5 MB or smaller.');
  }
  return next;
}

export function buildNewProductBody(product, files) {
  const body = new FormData();
  body.append('product', JSON.stringify(product));
  files.forEach((file) => body.append('images', file));
  return body;
}
