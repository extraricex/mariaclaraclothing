export function productHandle(product) {
  return String(product?.publicHandle || product?.slug || product?.productId || '')
    .replace(/^catalog-/, '')
    .trim();
}

export function productPath(product) {
  return `/product/${encodeURIComponent(productHandle(product))}`;
}
