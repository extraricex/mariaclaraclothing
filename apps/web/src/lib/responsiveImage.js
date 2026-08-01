const BRAND_IMAGE_VARIANTS = new Map([
  ['/brand/hero1v2-2400.webp', [
    { width: 1200, url: '/brand/hero1v2-1200.webp' },
    { width: 2400, url: '/brand/hero1v2-2400.webp' }
  ]],
  ['/brand/hero2-2200.webp', [
    { width: 1200, url: '/brand/hero2-1200.webp' },
    { width: 2200, url: '/brand/hero2-2200.webp' }
  ]],
  ['/brand/logo.png', [
    { width: 256, url: '/brand/logo-256.webp' },
    { width: 512, url: '/brand/logo-512.webp' }
  ]],
  ['/brand/logomccwhite.png', [
    { width: 256, url: '/brand/logomccwhite-256.webp' },
    { width: 512, url: '/brand/logomccwhite-512.webp' }
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

function localUploadVariantUrl(value, width) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    const supportedUpload = ['/uploads/products/', '/uploads/logos/', '/uploads/banners/']
      .some((prefix) => url.pathname.startsWith(prefix));
    if (url.origin !== window.location.origin || !supportedUpload || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return '';
    url.pathname = url.pathname.replace(/-optimized(?=\.[^.]+$)/i, '').replace(/\.[^.]+$/i, `-${width}.webp`);
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

  const maximumRequestedWidth = Math.max(...shopifyWidths);
  const localWidths = [320, 800, 1600];
  const firstLargerWidth = localWidths.find((width) => width > maximumRequestedWidth);
  const selectedLocalWidths = localWidths.filter((width) => width <= maximumRequestedWidth || width === firstLargerWidth);
  const localVariants = selectedLocalWidths
    .map((width) => ({ width, url: localUploadVariantUrl(url, width) }))
    .filter((variant) => variant.url);
  if (localVariants.length) {
    return {
      srcSet: localVariants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
      sizes
    };
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
