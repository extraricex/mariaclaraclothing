const BRAND_IMAGE_VARIANTS = new Map([
  ['/brand/hero1v2-2400.webp', [
    { width: 1200, url: '/brand/hero1v2-1200.webp' },
    { width: 2400, url: '/brand/hero1v2-2400.webp' }
  ]],
  ['/brand/hero2-2200.webp', [
    { width: 1200, url: '/brand/hero2-1200.webp' },
    { width: 2200, url: '/brand/hero2-2200.webp' }
  ]]
]);

function imagePath(value) {
  try {
    return new URL(String(value || ''), window.location.origin).pathname;
  } catch (_error) {
    return '';
  }
}

function shopifyVariantUrl(value, width) {
  try {
    const url = new URL(String(value || ''));
    if (url.hostname !== 'cdn.shopify.com') return '';
    url.searchParams.set('width', String(width));
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function localProductVariantUrl(value, width) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/uploads/products/') || !/-optimized\.webp$/i.test(url.pathname)) return '';
    url.pathname = url.pathname.replace(/-optimized\.webp$/i, `-${width}.webp`);
    url.search = '';
    return `${url.pathname}${url.hash}`;
  } catch (_error) {
    return '';
  }
}

export function responsiveImageAttributes(value, {
  sizes = '100vw',
  shopifyWidths = [360, 720, 1200]
} = {}) {
  const url = String(value || '').trim();
  if (!url) return {};

  const brandVariants = BRAND_IMAGE_VARIANTS.get(imagePath(url));
  if (brandVariants) {
    return {
      srcSet: brandVariants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
      sizes
    };
  }

  const shopifyVariants = shopifyWidths
    .map((width) => ({ width, url: shopifyVariantUrl(url, width) }))
    .filter((variant) => variant.url);
  if (shopifyVariants.length) {
    return {
      srcSet: shopifyVariants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
      sizes
    };
  }

  if (Math.max(...shopifyWidths) <= 1000) {
    const localVariants = [320, 800]
      .map((width) => ({ width, url: localProductVariantUrl(url, width) }))
      .filter((variant) => variant.url);
    if (localVariants.length) {
      return {
        srcSet: localVariants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
        sizes
      };
    }
  }

  return {};
}

export function preloadResponsiveImage(image, value, options) {
  if (!image) return;
  const attributes = responsiveImageAttributes(value, options);
  if (attributes.srcSet) image.srcset = attributes.srcSet;
  if (attributes.sizes) image.sizes = attributes.sizes;
  image.src = value;
}
