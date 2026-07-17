const { listCatalogProducts, findCatalogProductBySlug } = require('../products/catalogPresenter');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const { getSiteContent } = require('../siteContent/siteContentRepository');
const { reviewSummariesByProduct } = require('../reviews/reviewRepository');

const BRAND_NAME = 'Maria Clara Clothing';
const PRIVATE_PATH_PREFIXES = [
  '/admin', '/account', '/checkout', '/thank-you', '/cart', '/login', '/register',
  '/forgot-password', '/reset-password'
];

const STATIC_PAGES = {
  '/faq': {
    title: `Frequently Asked Questions | ${BRAND_NAME}`,
    description: `Answers about ${BRAND_NAME} sizing, shipping, Cash on Delivery, online payment, and product availability.`,
    eyebrow: 'Help',
    heading: 'Frequently Asked Questions'
  },
  '/shipping-returns': {
    title: `Shipping & Returns | ${BRAND_NAME}`,
    description: `Review ${BRAND_NAME} delivery coverage, shipping fees, order confirmation, returns, and exchange information.`,
    eyebrow: 'Help',
    heading: 'Shipping & Returns'
  },
  '/terms': {
    title: `Terms of Service | ${BRAND_NAME}`,
    description: `Read the ordering, payment, pricing, sizing, privacy, and contact terms for ${BRAND_NAME}.`,
    eyebrow: 'Policies',
    heading: 'Terms of Service'
  },
  '/contact': {
    title: `Contact | ${BRAND_NAME}`,
    description: `Contact ${BRAND_NAME} for product, sizing, order, payment, or delivery assistance.`,
    eyebrow: 'Support',
    heading: `Contact ${BRAND_NAME}`
  },
  '/size-chart': {
    title: `T-Shirt Size Chart & Fit Guide | ${BRAND_NAME}`,
    description: `Compare garment measurements and choose your ${BRAND_NAME} oversized, regular-fit, or crop-box T-shirt size.`,
    eyebrow: 'Sizing',
    heading: 'Size Chart & Fit Guide'
  },
  '/guides/240-gsm-shirts': {
    title: `What Is a 240 GSM T-Shirt? | ${BRAND_NAME}`,
    description: 'Learn what 240 GSM fabric weight means and how it affects the structure, coverage, and feel of a T-shirt.',
    eyebrow: 'Fabric guide',
    heading: 'What Is a 240 GSM T-Shirt?',
    paragraphs: [
      'GSM means grams per square metre and describes fabric weight. A 240 GSM shirt uses more fabric weight than a lightweight everyday tee, giving it a more structured feel and greater coverage.',
      'Fabric weight does not describe fit. Check each product page for the actual cut, available sizes, garment measurements, and current stock before ordering.'
    ]
  },
  '/guides/t-shirt-fit-guide': {
    title: `Oversized, Regular & Crop-Box T-Shirt Fit Guide | ${BRAND_NAME}`,
    description: 'Compare oversized, regular-fit, and crop-box T-shirt cuts, then use the product measurements to choose a size.',
    eyebrow: 'Fit guide',
    heading: 'Choose the Right T-Shirt Fit',
    paragraphs: [
      'Oversized shirts are intentionally roomier through the body and sleeves. Regular-fit shirts follow a more familiar T-shirt shape. Crop-box cuts combine a wider body with a shorter length.',
      'Fit names are a starting point, not a body-size guarantee. Compare the garment measurements shown on the exact product page with a shirt you already own and like.'
    ]
  },
  '/guides/payment-and-shipping': {
    title: `Payment & Nationwide Shipping Guide | ${BRAND_NAME}`,
    description: `Understand ${BRAND_NAME} Cash on Delivery, PayMongo checkout, regional shipping fees, and delivery estimates.`,
    eyebrow: 'Order guide',
    heading: 'Payment & Nationwide Shipping'
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function plainText(value, limit = 320) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function normalizePathname(value) {
  try {
    const pathname = new URL(String(value || '/'), 'https://storefront.invalid').pathname;
    const decoded = decodeURIComponent(pathname);
    return decoded !== '/' ? decoded.replace(/\/+$/, '') : '/';
  } catch (_error) {
    return '/';
  }
}

function storefrontOrigin(value) {
  try {
    const url = new URL(String(value || 'http://localhost:5173'));
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : 'http://localhost:5173';
  } catch (_error) {
    return 'http://localhost:5173';
  }
}

function absoluteUrl(origin, value) {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    const url = new URL(input, `${origin}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function responsiveBrandSrcSet(value) {
  try {
    const url = new URL(String(value || ''));
    const variants = {
      '/brand/hero1v2-2400.webp': [
        ['/brand/hero1v2-1200.webp', 1200],
        ['/brand/hero1v2-2400.webp', 2400]
      ],
      '/brand/hero2-2200.webp': [
        ['/brand/hero2-1200.webp', 1200],
        ['/brand/hero2-2200.webp', 2200]
      ]
    }[url.pathname];
    if (!variants) return '';
    return variants.map(([pathname, width]) => `${url.origin}${pathname} ${width}w`).join(', ');
  } catch (_error) {
    return '';
  }
}

function responsiveShopifySrcSet(value, widths = [480, 960, 1600]) {
  try {
    const source = new URL(String(value || ''));
    if (source.hostname !== 'cdn.shopify.com') return '';
    return widths.map((width) => {
      const candidate = new URL(source);
      candidate.searchParams.set('width', String(width));
      return `${candidate.toString()} ${width}w`;
    }).join(', ');
  } catch (_error) {
    return '';
  }
}

function productPath(product) {
  return `/product/${encodeURIComponent(String(product?.publicHandle || product?.slug || '').trim())}`;
}

function collectionPath(collection) {
  return `/collections/${encodeURIComponent(String(collection?.slug || '').trim())}`;
}

function isPrivatePath(pathname) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function validNonce(value) {
  const nonce = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,160}$/.test(nonce) ? nonce : '';
}

function jsonLdScript(data, nonce = '') {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  const schemaType = String(data?.['@type'] || '').replace(/[^A-Za-z0-9_-]/g, '');
  return `<script type="application/ld+json"${schemaType ? ` data-mcc-schema="${schemaType}"` : ''}${nonce ? ` nonce="${escapeHtml(nonce)}"` : ''}>${payload}</script>`;
}

function visibleCollections(settings) {
  return (settings?.collectionDefinitions || []).filter((collection) => (
    collection?.visible !== false && collection?.slug && (collection.showOnShop !== false || collection.showOnHomepage !== false)
  ));
}

function productInCollection(product, collection) {
  const names = new Set((product?.collections || []).map((value) => String(value || '').trim().toLowerCase()));
  return names.has(String(collection?.name || '').trim().toLowerCase());
}

function breadcrumbSchema(origin, entries) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      ...(entry.path ? { item: `${origin}${entry.path}` } : {})
    }))
  };
}

function homeSchemas({ origin, settings, content }) {
  const general = settings?.general || {};
  const logo = absoluteUrl(origin, content?.logo?.url);
  const sameAs = Object.values(general.socialLinks || {}).map((url) => absoluteUrl(origin, url)).filter(Boolean);
  const onlineStore = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': `${origin}/#store`,
    name: general.storeName || BRAND_NAME,
    url: `${origin}/`,
    ...(logo ? { logo } : {}),
    ...(general.contactEmail ? { email: general.contactEmail } : {}),
    ...(general.contactNumber ? { telephone: general.contactNumber } : {}),
    ...(general.storeAddress ? { address: { '@type': 'PostalAddress', streetAddress: general.storeAddress, addressCountry: 'PH' } } : {}),
    ...(sameAs.length ? { sameAs } : {})
  };
  return [
    onlineStore,
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: general.storeName || BRAND_NAME,
      url: `${origin}/`,
      publisher: { '@id': `${origin}/#store` }
    }
  ];
}

function productSchema({ origin, product, summary }) {
  const url = `${origin}${productPath(product)}`;
  const images = (product.images || []).map((image) => absoluteUrl(origin, image.url)).filter(Boolean);
  const description = plainText(product.seo?.description || product.description || product.productPage?.intro);
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const offer = {
    '@type': 'Offer',
    url,
    priceCurrency: 'PHP',
    price: (Number(product.priceCents || 0) / 100).toFixed(2),
    availability: variants.some((variant) => Number(variant.stockQuantity || 0) > 0)
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition'
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    description,
    image: images,
    sku: variants[0]?.sku || undefined,
    brand: { '@type': 'Brand', name: BRAND_NAME },
    category: product.category || product.productType || 'T-Shirts',
    offers: offer,
    ...(Number(summary?.totalReviews || 0) > 0 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: Number(summary.averageRating).toFixed(1),
        reviewCount: Number(summary.totalReviews)
      }
    } : {})
  };
}

function shippingGuideParagraphs(settings) {
  const regions = (settings?.shipping?.regions || []).map((region) => {
    const fee = Number(region.feeCents || 0) / 100;
    return `${region.label}: ₱${fee.toLocaleString('en-PH', { minimumFractionDigits: fee % 1 ? 2 : 0 })}${region.deliveryEstimate ? `, estimated ${region.deliveryEstimate}` : ''}.`;
  });
  const methods = (settings?.payments?.methods || []).filter((method) => method.enabled).map((method) => method.label);
  const freeShipping = settings?.shipping?.freeShippingEnabled
    ? `Shipping is free when an order contains at least ${Number(settings.shipping.freeShippingMinimumItems || 2)} items.`
    : '';
  return [
    methods.length ? `Checkout currently offers ${methods.join(' and ')}. Online-payment orders are confirmed only after the payment provider verifies payment.` : '',
    ...regions,
    freeShipping,
    'Delivery estimates begin after an order has been reviewed and prepared. The final shipping fee is calculated from the validated delivery region at checkout.'
  ].filter(Boolean);
}

async function pageDescriptor(pathValue, options = {}) {
  const pathname = normalizePathname(pathValue);
  const origin = storefrontOrigin(options.siteUrl || process.env.FRONTEND_URL);
  const [settings, content] = await Promise.all([getStoreSettings(), getSiteContent()]);
  const siteSeo = settings?.website?.seo || {};
  const defaultImage = absoluteUrl(origin, siteSeo.imageUrl || content?.homepageBanners?.[0]?.url);
  const base = {
    pathname,
    origin,
    title: siteSeo.title || `${BRAND_NAME} — Premium Philippine Streetwear`,
    description: plainText(siteSeo.description || 'Premium Philippine streetwear with nationwide delivery.'),
    canonical: `${origin}${pathname === '/' ? '/' : pathname}`,
    image: defaultImage,
    type: 'website',
    noindex: isPrivatePath(pathname),
    schemas: [],
    body: { eyebrow: '', heading: BRAND_NAME, paragraphs: [], links: [] }
  };

  if (base.noindex) {
    return {
      ...base,
      title: `Secure page | ${BRAND_NAME}`,
      description: `Secure customer or administration page for ${BRAND_NAME}.`,
      body: { eyebrow: 'Secure page', heading: 'Loading…', paragraphs: [], links: [] }
    };
  }

  if (pathname === '/') {
    const collections = visibleCollections(settings);
    const heroImage = absoluteUrl(origin, content?.homepageBanners?.[0]?.url) || defaultImage;
    return {
      ...base,
      schemas: homeSchemas({ origin, settings, content }),
      body: {
        eyebrow: settings.website?.hero?.eyebrow || 'Philippine streetwear',
        heading: `${settings.website?.hero?.title || 'Maria Clara'} ${settings.website?.hero?.highlight || 'Clothing'}`.trim(),
        paragraphs: [settings.website?.hero?.subtitle || base.description],
        image: heroImage,
        imageAlt: content?.homepageBanners?.[0]?.altText || BRAND_NAME,
        links: collections.map((collection) => ({ label: collection.name, path: collectionPath(collection) }))
      }
    };
  }

  if (pathname === '/shop') {
    const products = await Promise.resolve(listCatalogProducts());
    return {
      ...base,
      title: `Shop Premium T-Shirts | ${BRAND_NAME}`,
      description: `Shop ${BRAND_NAME} oversized, regular-fit, and crop-box 240 GSM cotton shirts with real size availability and nationwide delivery.`,
      canonical: `${origin}/shop`,
      schemas: [breadcrumbSchema(origin, [{ name: 'Home', path: '/' }, { name: 'Shop' }])],
      body: {
        eyebrow: 'Shop',
        heading: 'All Products',
        paragraphs: ['Browse the current Maria Clara Clothing collection. Product pages show live size availability, measurements, and checkout pricing.'],
        links: products.map((product) => ({ label: product.name, path: productPath(product) }))
      }
    };
  }

  if (pathname.startsWith('/product/')) {
    const handle = pathname.slice('/product/'.length);
    const [product, summaries] = await Promise.all([
      Promise.resolve(findCatalogProductBySlug(handle)),
      reviewSummariesByProduct()
    ]);
    if (!product) return { ...base, noindex: true, notFound: true, title: `Product not found | ${BRAND_NAME}`, body: { eyebrow: 'Product', heading: 'Product not found', paragraphs: [], links: [{ label: 'Shop current products', path: '/shop' }] } };
    const summary = summaries[product.slug] || { averageRating: 0, totalReviews: 0 };
    const canonicalPath = productPath(product);
    const collections = visibleCollections(settings);
    const collection = collections.find((candidate) => productInCollection(product, candidate));
    const description = plainText(product.seo?.description || product.description || product.productPage?.intro);
    const image = absoluteUrl(origin, product.images?.[0]?.url) || defaultImage;
    const breadcrumbs = [{ name: 'Home', path: '/' }];
    if (collection) breadcrumbs.push({ name: collection.name, path: collectionPath(collection) });
    breadcrumbs.push({ name: product.name });
    return {
      ...base,
      product,
      title: plainText(product.seo?.title || `${product.name} | ${BRAND_NAME}`, 120),
      description,
      canonical: `${origin}${canonicalPath}`,
      image,
      type: 'product',
      schemas: [productSchema({ origin, product, summary }), breadcrumbSchema(origin, breadcrumbs)],
      body: {
        eyebrow: collection?.name || product.category || 'Product',
        heading: product.name,
        paragraphs: [description],
        priceCents: product.priceCents,
        image,
        imageAlt: product.images?.[0]?.altText || product.name,
        sizes: (product.variants || []).filter((variant) => Number(variant.stockQuantity || 0) > 0).map((variant) => variant.size),
        links: collection ? [{ label: `Shop ${collection.name}`, path: collectionPath(collection) }] : [{ label: 'Shop all products', path: '/shop' }]
      }
    };
  }

  if (pathname.startsWith('/collections/')) {
    const slug = pathname.slice('/collections/'.length).toLowerCase();
    const collection = visibleCollections(settings).find((candidate) => String(candidate.slug).toLowerCase() === slug);
    if (!collection) return { ...base, noindex: true, notFound: true, title: `Collection not found | ${BRAND_NAME}`, body: { eyebrow: 'Collection', heading: 'Collection unavailable', paragraphs: [], links: [{ label: 'Shop current products', path: '/shop' }] } };
    const products = (await Promise.resolve(listCatalogProducts())).filter((product) => productInCollection(product, collection));
    const canonicalPath = collectionPath(collection);
    const description = plainText(collection.description || `Shop ${collection.name} from ${BRAND_NAME}.`);
    const image = absoluteUrl(origin, collection.imageUrl) || defaultImage;
    return {
      ...base,
      title: `${collection.name} | ${BRAND_NAME}`,
      description,
      canonical: `${origin}${canonicalPath}`,
      image,
      schemas: [
        breadcrumbSchema(origin, [{ name: 'Home', path: '/' }, { name: collection.name }]),
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: collection.name,
          description,
          url: `${origin}${canonicalPath}`,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: products.map((product, index) => ({
              '@type': 'ListItem', position: index + 1, name: product.name, url: `${origin}${productPath(product)}`
            }))
          }
        }
      ],
      body: {
        eyebrow: 'Collection',
        heading: collection.name,
        paragraphs: [description],
        image,
        imageAlt: `${collection.name} collection`,
        links: products.map((product) => ({ label: product.name, path: productPath(product) }))
      }
    };
  }

  const staticPage = STATIC_PAGES[pathname];
  if (staticPage) {
    const guideParagraphs = pathname === '/guides/payment-and-shipping'
      ? shippingGuideParagraphs(settings)
      : (staticPage.paragraphs || []);
    const schemaType = pathname.startsWith('/guides/') ? 'Article' : 'WebPage';
    return {
      ...base,
      ...staticPage,
      canonical: `${origin}${pathname}`,
      schemas: [
        breadcrumbSchema(origin, [{ name: 'Home', path: '/' }, ...(pathname.startsWith('/guides/') ? [{ name: 'Guides', path: '/size-chart' }] : []), { name: staticPage.heading }]),
        {
          '@context': 'https://schema.org',
          '@type': schemaType,
          headline: staticPage.heading,
          name: staticPage.heading,
          description: staticPage.description,
          url: `${origin}${pathname}`,
          publisher: { '@type': 'Organization', name: BRAND_NAME }
        }
      ],
      body: { eyebrow: staticPage.eyebrow, heading: staticPage.heading, paragraphs: guideParagraphs, links: [] }
    };
  }

  return {
    ...base,
    noindex: true,
    notFound: true,
    title: `Page not found | ${BRAND_NAME}`,
    description: 'The requested page is unavailable.',
    body: { eyebrow: '404', heading: 'Page not found', paragraphs: ['The requested page is unavailable.'], links: [{ label: 'Return to the shop', path: '/shop' }] }
  };
}

function renderSeoHead(descriptor, options = {}) {
  const nonce = validNonce(options.nonce);
  const robots = descriptor.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
  const tags = [
    `<title>${escapeHtml(descriptor.title)}</title>`,
    `<meta name="description" content="${escapeHtml(descriptor.description)}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${escapeHtml(descriptor.canonical)}">`,
    `<meta property="og:site_name" content="${BRAND_NAME}">`,
    `<meta property="og:type" content="${escapeHtml(descriptor.type || 'website')}">`,
    `<meta property="og:title" content="${escapeHtml(descriptor.title)}">`,
    `<meta property="og:description" content="${escapeHtml(descriptor.description)}">`,
    `<meta property="og:url" content="${escapeHtml(descriptor.canonical)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(descriptor.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(descriptor.description)}">`
  ];
  if (descriptor.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(descriptor.image)}">`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(descriptor.image)}">`);
  }
  if (descriptor.product) {
    tags.push(`<meta property="product:price:amount" content="${(Number(descriptor.product.priceCents || 0) / 100).toFixed(2)}">`);
    tags.push('<meta property="product:price:currency" content="PHP">');
  }
  const priorityImage = descriptor.body?.image || '';
  if (priorityImage) {
    const prioritySrcSet = responsiveBrandSrcSet(priorityImage) || responsiveShopifySrcSet(priorityImage);
    tags.push(`<link rel="preload" as="image" href="${escapeHtml(priorityImage)}" fetchpriority="high"${prioritySrcSet ? ` imagesrcset="${escapeHtml(prioritySrcSet)}" imagesizes="${descriptor.pathname === '/' ? '100vw' : '(min-width: 1024px) 55vw, 100vw'}"` : ''}>`);
  }
  for (const schema of descriptor.schemas || []) tags.push(jsonLdScript(schema, nonce));
  return `${tags.join('\n')}\n`;
}

function renderSeoBody(descriptor) {
  const body = descriptor.body || {};
  const isHome = descriptor.pathname === '/';
  const price = Number.isInteger(Number(body.priceCents)) && Number(body.priceCents) > 0
    ? `<p>₱${(Number(body.priceCents) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>`
    : '';
  const imageSrcSet = responsiveBrandSrcSet(body.image) || responsiveShopifySrcSet(body.image);
  const image = body.image
    ? `<img class="seo-fallback-image" src="${escapeHtml(body.image)}"${imageSrcSet ? ` srcset="${escapeHtml(imageSrcSet)}" sizes="${isHome ? '100vw' : '(min-width: 1024px) 55vw, 100vw'}"` : ''} alt="${escapeHtml(body.imageAlt || body.heading || BRAND_NAME)}"${isHome || descriptor.type === 'product' ? ' fetchpriority="high"' : ''}>`
    : '';
  const sizes = body.sizes?.length ? `<p>Available sizes: ${body.sizes.map(escapeHtml).join(', ')}</p>` : '';
  const paragraphs = (body.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const links = body.links?.length
    ? `<ul>${body.links.map((link) => `<li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a></li>`).join('')}</ul>`
    : '';
  return `<div data-seo-fallback-view data-home="${isHome ? 'true' : 'false'}" aria-busy="true"><div class="seo-fallback-ticker">Maria Clara Clothing · Nationwide delivery</div><header class="seo-fallback-header"><a href="/">Maria Clara Clothing</a></header><main class="seo-fallback-main"><p>${escapeHtml(body.eyebrow || '')}</p><h1>${escapeHtml(body.heading || BRAND_NAME)}</h1>${image}${price}${sizes}${paragraphs}${links}</main></div>`;
}

module.exports = {
  STATIC_PAGES,
  absoluteUrl,
  escapeHtml,
  normalizePathname,
  pageDescriptor,
  plainText,
  productPath,
  responsiveBrandSrcSet,
  responsiveShopifySrcSet,
  renderSeoBody,
  renderSeoHead,
  storefrontOrigin
};
