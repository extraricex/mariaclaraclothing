const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { findOrderByNumber, listOrders, updateOrder } = require('../orders/orderRepository');
const { validateJntOrders, writeJntExportBuffer } = require('../jnt/jntExport');
const { aggregateCustomers, findCustomerOrders } = require('../customers/customerAggregator');
const { cartSessionSummary, listCartSessions } = require('../cartSessions/cartSessionRepository');
const {
  deleteDiscount,
  findDiscountByCode,
  listDiscounts,
  normalizeDiscountCode,
  saveDiscount
} = require('../discounts/discountRepository');
const {
  appendHomepageBanners,
  getSiteContent,
  updateFooterLogo,
  updateLogo,
  updateHomepageBanners
} = require('../siteContent/siteContentRepository');
const {
  getAdminCredentials,
  getStoreSettings,
  rotateAdminToken,
  setAdminPassword,
  updateSettingsSection,
  verifyAdminPassword
} = require('../settings/storeSettingsRepository');
const {
  deleteEditableProduct,
  findEditableProductBySlug,
  listEditableProducts,
  replaceEditableProducts,
  saveEditableProduct
} = require('../products/catalogRepository');

const router = express.Router();

const VALID_ORDER_STATUSES = new Set(['received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled']);
const VALID_FULFILLMENT_STATUSES = new Set(['unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled']);
const VALID_PAYMENT_STATUSES = new Set(['cod_pending', 'paid', 'cancelled', 'refunded']);
const VALID_COD_CONFIRMATION_STATUSES = new Set(['pending', 'confirmed', 'unreachable', 'cancelled']);
const VALID_DELIVERY_STATUSES = new Set(['pending', 'ready', 'out_for_delivery', 'delivered', 'returned', 'cancelled']);
const VALID_PRODUCT_STATUSES = new Set(['active', 'draft', 'archived']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const uploadDir = productUploadDir();
      fs.mkdirSync(uploadDir, { recursive: true });
      callback(null, uploadDir);
    },
    filename: (req, file, callback) => {
      const slug = String(req.params.slug || 'product').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      callback(null, `${slug}-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8
  },
  fileFilter: (_req, file, callback) => {
    if (!/^image\//.test(file.mimetype || '')) {
      return callback(new Error('Only image uploads are allowed'));
    }
    return callback(null, true);
  }
});
const bannerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const uploadDir = bannerUploadDir();
      fs.mkdirSync(uploadDir, { recursive: true });
      callback(null, uploadDir);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      callback(null, `homepage-banner-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
    }
  }),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 6
  },
  fileFilter: (_req, file, callback) => {
    if (!/^image\//.test(file.mimetype || '')) {
      return callback(new Error('Only image uploads are allowed'));
    }
    return callback(null, true);
  }
});
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const uploadDir = logoUploadDir();
      fs.mkdirSync(uploadDir, { recursive: true });
      callback(null, uploadDir);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      callback(null, `site-logo-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    if (!/^image\//.test(file.mimetype || '')) {
      return callback(new Error('Only image uploads are allowed'));
    }
    return callback(null, true);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    const credentials = await getAdminCredentials();
    const valid = credentials?.passwordHash
      ? Boolean(password) && verifyAdminPassword(password, credentials)
      : Boolean(password) && password === adminPassword();

    if (!valid) {
      return res.status(401).json({ error: 'Admin password is invalid' });
    }

    return res.json({ token: credentials?.token || adminToken() });
  } catch (error) {
    return next(error);
  }
});

router.use(requireAdmin);

router.get('/session', (req, res) => res.json({ authenticated: true }));

router.get('/products/export', async (req, res, next) => {
  try {
    res.setHeader('content-disposition', 'attachment; filename="maria-clara-products.json"');
    return res.json({ products: await listEditableProducts() });
  } catch (error) {
    return next(error);
  }
});

router.get('/site-content', async (_req, res, next) => {
  try {
    return res.json({ siteContent: await getSiteContent() });
  } catch (error) {
    return next(error);
  }
});

router.put('/site-content/homepage-banners', async (req, res, next) => {
  try {
    const siteContent = await updateHomepageBanners(req.body?.banners);
    return res.json({ siteContent, banners: siteContent.homepageBanners });
  } catch (error) {
    return next(error);
  }
});

router.post('/site-content/homepage-banners/images', bannerUpload.array('images', 6), async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: 'At least one banner image is required' });
    }

    const { homepageBanners: currentBanners } = await getSiteContent();
    const uploadedBanners = files.map((file, index) => ({
      url: bannerUploadUrl(file.filename),
      altText: 'Homepage banner',
      sortOrder: currentBanners.length + index
    }));
    const siteContent = await appendHomepageBanners(uploadedBanners);

    return res.status(201).json({ siteContent, banners: siteContent.homepageBanners, uploadedBanners });
  } catch (error) {
    return next(error);
  }
});

router.post('/site-content/logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A logo image is required' });
    }

    const siteContent = await updateLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing logo'
    });

    return res.status(201).json({ siteContent, logo: siteContent.logo });
  } catch (error) {
    return next(error);
  }
});

router.post('/site-content/footer-logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A footer logo image is required' });
    }

    const siteContent = await updateFooterLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing footer logo'
    });

    return res.status(201).json({ siteContent, footerLogo: siteContent.footerLogo });
  } catch (error) {
    return next(error);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    return res.json({ settings: await getStoreSettings() });
  } catch (error) {
    return next(error);
  }
});

router.post('/settings/security/password', async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const credentials = await getAdminCredentials();
    const currentValid = credentials?.passwordHash
      ? Boolean(currentPassword) && verifyAdminPassword(currentPassword, credentials)
      : Boolean(currentPassword) && currentPassword === adminPassword();

    if (!currentValid) {
      return res.status(401).json({ error: 'Current password is invalid' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const record = await setAdminPassword(newPassword);
    return res.json({ token: record.token });
  } catch (error) {
    return next(error);
  }
});

router.post('/settings/security/rotate-token', async (req, res, next) => {
  try {
    const record = await rotateAdminToken();
    return res.json({ token: record.token });
  } catch (error) {
    return next(error);
  }
});

router.put('/settings/:section', async (req, res, next) => {
  try {
    const settings = await updateSettingsSection(req.params.section, req.body || {});
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/import', async (req, res, next) => {
  try {
    const incomingProducts = Array.isArray(req.body?.products) ? req.body.products : null;

    if (!incomingProducts) {
      return res.status(400).json({ error: 'Products import must include a products array' });
    }

    const products = await replaceEditableProducts(incomingProducts);
    return res.json({ products, summary: productSummary(products, await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.get('/products/settings', async (req, res, next) => {
  try {
    return res.json({
      settings: {
        statuses: ['active', 'draft', 'archived'],
        defaultStatus: 'active',
        lowStockThreshold: await activeLowStockThreshold(),
        recommendedCollections: ['New Arrivals', 'Best Sellers', 'Maria Clara', 'Oversized Shirt', 'Sale'],
        recommendedVariantSizes: ['s', 'm', 'l', 'xl', 'xxl', 'xxxl'],
        imageGuidance: 'Use square or 4:5 product photos with clear alt text.'
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/:slug/images', upload.array('images', 8), async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const product = await findEditableProductBySlug(slug);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }

    const existingImages = Array.isArray(product.images) ? product.images : [];
    const uploadedImages = files.map((file, index) => ({
      url: productUploadUrl(file.filename),
      altText: product.name,
      sortOrder: existingImages.length + index
    }));
    const updatedProduct = await saveEditableProduct({
      ...product,
      images: [...existingImages, ...uploadedImages]
    }, slug);

    return res.status(201).json({ product: updatedProduct, images: uploadedImages });
  } catch (error) {
    return next(error);
  }
});

router.put('/products/:slug/images', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const product = await findEditableProductBySlug(slug);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const images = normalizeProductImages(req.body?.images);
    if (!images.length) {
      return res.status(400).json({ error: 'Product must include at least one image' });
    }

    const updatedProduct = await saveEditableProduct({
      ...product,
      images
    }, slug);

    return res.json({ product: updatedProduct, images: updatedProduct.images });
  } catch (error) {
    return next(error);
  }
});

router.delete('/products/:slug/images/:index', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const imageIndex = Number(req.params.index);
    const product = await findEditableProductBySlug(slug);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= product.images.length) {
      return res.status(404).json({ error: 'Product image not found' });
    }
    if (product.images.length <= 1) {
      return res.status(400).json({ error: 'Product must include at least one image' });
    }

    const images = product.images
      .filter((_image, index) => index !== imageIndex)
      .map((image, index) => ({ ...image, sortOrder: index }));
    const updatedProduct = await saveEditableProduct({
      ...product,
      images
    }, slug);

    return res.json({ product: updatedProduct, deleted: true, images: updatedProduct.images });
  } catch (error) {
    return next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const collection = String(req.query.collection || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim().toLowerCase();
    const vendor = String(req.query.vendor || '').trim().toLowerCase();
    const query = String(req.query.q || '').trim().toLowerCase();
    const stock = String(req.query.stock || '').trim();
    const sort = String(req.query.sort || 'name_asc').trim();
    const allProducts = await listEditableProducts();
    const lowStockThreshold = await activeLowStockThreshold();
    const products = sortProductRecords(allProducts
      .filter((product) => !status || productStatus(product) === status)
      .filter((product) => !collection || product.collections.some((item) => item.toLowerCase() === collection))
      .filter((product) => !category || String(product.category || '').trim().toLowerCase() === category)
      .filter((product) => !vendor || String(product.vendor || '').trim().toLowerCase() === vendor)
      .filter((product) => !query || productSearchText(product).includes(query))
      .filter((product) => !stock || productStockFilter(product, lowStockThreshold) === stock)
      .map((product) => productSummaryRecord(product, lowStockThreshold)), sort);

    return res.json({
      products,
      summary: productSummary(allProducts, lowStockThreshold)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await findEditableProductBySlug(String(req.params.slug || '').trim());

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ product });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/:slug/duplicate', async (req, res, next) => {
  try {
    const originalSlug = String(req.params.slug || '').trim();
    const originalProduct = await findEditableProductBySlug(originalSlug);

    if (!originalProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const copyName = String(req.body?.name || `${originalProduct.name} Copy`).trim();
    const copySlug = String(req.body?.slug || `${originalProduct.slug}-copy`).trim();
    const product = await saveEditableProduct(withSyncedStorefrontProductPage(normalizeProductRequest({
      ...originalProduct,
      name: copyName,
      slug: copySlug,
      status: req.body?.status || 'draft'
    })));

    return res.status(201).json({ product, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const product = await saveEditableProduct(withSyncedStorefrontProductPage(normalizeProductRequest(req.body || {})));
    return res.status(201).json({ product, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.put('/products/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const existingProduct = await findEditableProductBySlug(slug);

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = await saveEditableProduct(withSyncedStorefrontProductPage({
      ...existingProduct,
      ...normalizeProductRequest(req.body || {}),
      productPage: req.body?.productPage || existingProduct.productPage
    }), slug);
    return res.json({ product, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/products/:slug', async (req, res, next) => {
  try {
    const product = await deleteEditableProduct(String(req.params.slug || '').trim());

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ product, deleted: true, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const query = String(req.query.q || '').trim().toLowerCase();
    const dateFilter = orderDateFilter(req.query);
    const orders = (await listOrders())
      .filter((order) => !status || order.status === status)
      .filter((order) => !query || orderSearchText(order).includes(query))
      .filter((order) => matchesOrderDateFilter(order, dateFilter))
      .map(orderSummary);

    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
});

router.get('/cart-sessions', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const sessions = await listCartSessions(status);
    return res.json({ sessions: sessions.map(cartSessionSummary) });
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/export/jnt', async (req, res, next) => {
  try {
    const requestedOrderNumbers = Array.isArray(req.body?.orderNumbers)
      ? req.body.orderNumbers.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const allOrders = await listOrders();
    const orders = requestedOrderNumbers.length
      ? allOrders.filter((order) => requestedOrderNumbers.includes(order.orderNumber))
      : allOrders.filter((order) => !['shipped', 'delivered', 'cancelled'].includes(order.fulfillmentStatus) && !order.exportedToJnt);

    if (!orders.length) {
      return res.status(400).json({ error: 'No orders are available for J&T export' });
    }

    const validationErrors = validateJntOrders(orders);
    if (validationErrors.length) {
      return res.status(400).json({
        error: 'Some orders are missing J&T export fields',
        orders: validationErrors
      });
    }

    const exportedAt = new Date().toISOString();
    const buffer = writeJntExportBuffer(orders);
    await Promise.all(orders.map((order) => updateOrder(order.orderNumber, {
      exportedToJnt: true,
      jntExportedAt: exportedAt
    })));

    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="JNT_Orders_${exportedAt.slice(0, 10)}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/orders/:orderNumber', async (req, res, next) => {
  try {
    const order = await findOrderByNumber(String(req.params.orderNumber || '').trim());

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

router.patch('/orders/:orderNumber', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const existingOrder = await findOrderByNumber(orderNumber);

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const changes = normalizeOrderUpdate(req.body || {}, existingOrder);
    const order = await updateOrder(orderNumber, changes);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

async function requireAdmin(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const credentials = await getAdminCredentials();
    const activeToken = credentials?.token || adminToken();

    if (!token || !safeEqual(token, activeToken)) {
      return res.status(401).json({ error: 'Admin authentication is required' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

// Constant-time string compare for the admin bearer token. Guards length first
// (timingSafeEqual throws on length mismatch) so a wrong-length token cannot leak
// timing and never crashes the request.
function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function productUploadDir() {
  return process.env.PRODUCT_UPLOAD_DIR || path.join(__dirname, '..', '..', 'public', 'uploads', 'products');
}

function productUploadUrl(filename) {
  return `/uploads/products/${filename}`;
}

function bannerUploadDir() {
  return process.env.BANNER_UPLOAD_DIR || path.join(__dirname, '..', '..', 'public', 'uploads', 'banners');
}

function bannerUploadUrl(filename) {
  return `/uploads/banners/${filename}`;
}

function logoUploadDir() {
  return process.env.LOGO_UPLOAD_DIR || path.join(__dirname, '..', '..', 'public', 'uploads', 'logos');
}

function logoUploadUrl(filename) {
  return `/uploads/logos/${filename}`;
}

function normalizeProductRequest(body) {
  const status = String(body.status || 'active').trim().toLowerCase();

  if (!VALID_PRODUCT_STATUSES.has(status)) {
    const error = new Error('Product status is invalid');
    error.status = 400;
    throw error;
  }

  return {
    ...body,
    slug: String(body.slug || '').trim(),
    name: String(body.name || '').trim(),
    description: String(body.description || ''),
    collections: normalizeTags(body.collections || body.collection || 'Uncategorized'),
    category: String(body.category || normalizeTags(body.collections || body.collection || 'T-Shirts')[0] || 'T-Shirts').trim(),
    productType: String(body.productType || body.type || 'Tshirt').trim(),
    vendor: String(body.vendor || 'Maria Clara').trim(),
    tags: normalizeTags(body.tags || []),
    seo: normalizeSeo(body.seo),
    metafields: normalizeMetafields(body.metafields),
    themeTemplate: String(body.themeTemplate || 'Default product').trim(),
    status,
    priceCents: normalizePositiveInteger(body.priceCents, 'Product price is invalid'),
    compareAtPriceCents: body.compareAtPriceCents === '' || body.compareAtPriceCents === null || body.compareAtPriceCents === undefined
      ? null
      : normalizePositiveInteger(body.compareAtPriceCents, 'Compare-at price is invalid'),
    images: normalizeProductImages(body.images),
    variants: normalizeProductVariants(body.variants)
  };
}

function withSyncedStorefrontProductPage(product) {
  const productPage = product.productPage && typeof product.productPage === 'object' ? product.productPage : {};
  const description = String(product.description || '');
  const name = String(product.name || '').trim();
  const fallbackSections = [
    {
      title: 'Product details',
      items: ['Comfortable fit', 'Easy to style', 'Ready for everyday wear']
    }
  ];

  return {
    ...product,
    productPage: {
      ...productPage,
      heading: name || String(productPage.heading || 'Product details').trim(),
      intro: description || String(productPage.intro || 'Premium Maria Clara Clothing piece with everyday comfort and clean styling.').trim(),
      sections: Array.isArray(productPage.sections) && productPage.sections.length
        ? productPage.sections
        : fallbackSections
    }
  };
}

function normalizeInteger(value, message) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return number;
}

function normalizePositiveInteger(value, message) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return number;
}

function normalizeProductImages(images) {
  const records = Array.isArray(images) ? images : [];
  return records
    .map((image, index) => ({
      url: String(image.url || image || '').trim(),
      altText: String(image.altText || 'Product image').trim(),
      sortOrder: Number.isInteger(Number(image.sortOrder)) ? Number(image.sortOrder) : index
    }))
    .filter((image) => image.url);
}

function normalizeProductVariants(variants) {
  const records = Array.isArray(variants) ? variants : [];
  return records.map((variant) => ({
    size: String(variant.size || '').trim(),
    sku: String(variant.sku || '').trim(),
    priceCents: variant.priceCents === '' || variant.priceCents === null || variant.priceCents === undefined
      ? null
      : normalizePositiveInteger(variant.priceCents, 'Variant price is invalid'),
    stockQuantity: normalizeInteger(variant.stockQuantity || 0, 'Inventory quantity is invalid'),
    externalPosVariantId: String(variant.externalPosVariantId || '').trim()
  })).filter((variant) => variant.size);
}

function normalizeSeo(seo) {
  const record = seo && typeof seo === 'object' ? seo : {};
  return {
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    handle: String(record.handle || '').trim()
  };
}

function normalizeMetafields(metafields) {
  const record = metafields && typeof metafields === 'object' ? metafields : {};
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    normalizeTags(value)
  ]));
}

async function activeLowStockThreshold() {
  const settings = await getStoreSettings();
  return settings.inventory.lowStockThreshold;
}

function productSummary(products, lowStockThreshold) {
  return {
    total: products.length,
    active: products.filter((product) => productStatus(product) === 'active').length,
    draft: products.filter((product) => productStatus(product) === 'draft').length,
    archived: products.filter((product) => productStatus(product) === 'archived').length,
    lowStock: products.filter((product) => productInventory(product) > 0 && productInventory(product) <= lowStockThreshold).length,
    soldOut: products.filter((product) => productInventory(product) === 0).length
  };
}

function productSummaryRecord(product, lowStockThreshold) {
  const category = product.category || product.collections?.[0] || 'Uncategorized';
  return {
    id: product.id || product.slug,
    slug: product.slug,
    name: product.name,
    description: product.description,
    collections: product.collections,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    status: productStatus(product),
    merchandisingStatus: product.merchandisingStatus,
    featured: Boolean(product.featured),
    image: product.images?.[0]?.url || '',
    imageCount: Array.isArray(product.images) ? product.images.length : 0,
    variantCount: Array.isArray(product.variants) ? product.variants.length : 0,
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant, index) => ({
        id: variant.id || `${product.slug}-${index}`,
        size: variant.size,
        sku: variant.sku,
        priceCents: variant.priceCents || product.priceCents,
        stockQuantity: Number(variant.stockQuantity || 0)
      }))
      : [],
    inventoryQuantity: productInventory(product),
    stockStatus: productStockFilter(product, lowStockThreshold),
    category,
    channels: 'Online Store',
    productType: product.productType || inferProductType(product, category),
    vendor: product.vendor || 'Maria Clara Clothing'
  };
}

function sortProductRecords(products, sort) {
  return products.slice().sort((a, b) => {
    if (sort === 'name_desc') return b.name.localeCompare(a.name);
    if (sort === 'inventory_asc') return Number(a.inventoryQuantity || 0) - Number(b.inventoryQuantity || 0);
    if (sort === 'inventory_desc') return Number(b.inventoryQuantity || 0) - Number(a.inventoryQuantity || 0);
    return a.name.localeCompare(b.name);
  });
}

function inferProductType(product, category) {
  const text = `${product.name || ''} ${category || ''}`.toLowerCase();
  if (text.includes('crop')) return 'Crop box shirt';
  if (text.includes('regular')) return 'Regular fit shirt';
  if (text.includes('oversized')) return 'Oversized shirt';
  return 'Apparel';
}

function productStatus(product) {
  return String(product.status || 'active').trim().toLowerCase();
}

function productInventory(product) {
  return Array.isArray(product.variants)
    ? product.variants.reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0)
    : 0;
}

function productStockFilter(product, lowStockThreshold) {
  const inventory = productInventory(product);
  if (inventory === 0) return 'sold_out';
  if (inventory <= lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

function productSearchText(product) {
  return [
    product.slug,
    product.name,
    product.description,
    product.category,
    product.productType,
    product.vendor,
    productStatus(product),
    ...(product.collections || []),
    ...(product.variants || []).map((variant) => variant.sku)
  ].filter(Boolean).join(' ').toLowerCase();
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || 'admin';
}

function adminToken() {
  return process.env.ADMIN_TOKEN || 'local-admin-token';
}

function normalizeOrderUpdate(body, existingOrder = {}) {
  const changes = {};

  if (body.customer !== undefined) {
    changes.customer = normalizeOrderCustomerUpdate(body.customer);
  }
  if (body.address !== undefined) {
    changes.address = normalizeOrderAddressUpdate(body.address);
  }
  if (body.status !== undefined) {
    changes.status = validateEnum(body.status, VALID_ORDER_STATUSES, 'Order status is invalid');
  }
  if (body.fulfillmentStatus !== undefined) {
    changes.fulfillmentStatus = validateEnum(body.fulfillmentStatus, VALID_FULFILLMENT_STATUSES, 'Fulfillment status is invalid');
  }
  if (body.paymentStatus !== undefined) {
    changes.paymentStatus = validateEnum(body.paymentStatus, VALID_PAYMENT_STATUSES, 'Payment status is invalid');
  }
  if (body.codConfirmationStatus !== undefined) {
    changes.codConfirmationStatus = validateEnum(body.codConfirmationStatus, VALID_COD_CONFIRMATION_STATUSES, 'COD confirmation status is invalid');
  }
  if (body.deliveryStatus !== undefined) {
    changes.deliveryStatus = validateEnum(body.deliveryStatus, VALID_DELIVERY_STATUSES, 'Delivery status is invalid');
  }
  if (body.deliveryMethod !== undefined) {
    changes.deliveryMethod = String(body.deliveryMethod || '').trim() || 'Standard shipping';
  }
  if (body.trackingNumber !== undefined) {
    changes.trackingNumber = String(body.trackingNumber || '').trim();
  }
  if (body.tags !== undefined) {
    changes.tags = normalizeTags(body.tags);
  }
  if (body.notes !== undefined) {
    changes.notes = String(body.notes || '').trim();
  }
  if (body.items !== undefined) {
    const items = normalizeOrderItemsUpdate(body.items);
    const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const discountTotalCents = Math.min(
      Math.max(0, Number(existingOrder.discountTotalCents || 0)),
      subtotalCents
    );
    const shippingFeeCents = Math.max(0, Number(existingOrder.shippingFeeCents || 0));
    const totalCents = subtotalCents - discountTotalCents + shippingFeeCents;

    changes.items = items;
    changes.subtotalCents = subtotalCents;
    changes.discountTotalCents = discountTotalCents;
    changes.totalCents = totalCents;
    changes.cartSnapshot = items.map((item) => ({ ...item }));
    changes.adminEditableTotals = {
      ...(existingOrder.adminEditableTotals || {}),
      subtotalCents,
      discountTotalCents,
      shippingFeeCents,
      shippingRegion: existingOrder.shippingRegion || '',
      shippingRegionLabel: existingOrder.shippingRegionLabel || '',
      freeShippingUnlocked: Boolean(existingOrder.freeShippingUnlocked),
      totalCents
    };
  }

  return changes;
}

function normalizeOrderCustomerUpdate(customer) {
  const fullName = String(customer?.fullName || '').trim();
  const phone = String(customer?.phone || '').trim();

  if (!fullName || !phone) {
    const error = new Error('Customer name and contact number are required');
    error.status = 400;
    throw error;
  }

  return {
    fullName,
    phone,
    email: customer?.email ? String(customer.email).trim() : ''
  };
}

function normalizeOrderAddressUpdate(address) {
  const houseAddress = String(address?.houseAddress || '').trim();
  const barangay = String(address?.barangay || '').trim();
  const city = String(address?.city || '').trim();
  const province = String(address?.province || '').trim();

  if (!houseAddress || !barangay || !city || !province) {
    const error = new Error('Detailed address, province, city, and barangay are required');
    error.status = 400;
    throw error;
  }

  const addressLine = String(address?.addressLine || '').trim() || [
    houseAddress,
    barangay,
    city,
    province,
    'Philippines'
  ].join(', ');

  return {
    addressLine,
    houseAddress,
    barangay,
    city,
    province,
    country: String(address?.country || 'Philippines').trim(),
    postalCode: address?.postalCode ? String(address.postalCode).trim() : ''
  };
}

function normalizeOrderItemsUpdate(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('At least one ordered item is required');
    error.status = 400;
    throw error;
  }

  return items.map((item) => {
    const productName = String(item?.productName || '').trim();
    const size = String(item?.size || '').trim();
    const quantity = Number(item?.quantity);
    const unitPriceCents = Number(item?.unitPriceCents);

    if (!productName || !size || !Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      const error = new Error('Ordered item name, size, quantity, and unit price are required');
      error.status = 400;
      throw error;
    }

    return {
      productId: String(item?.productId || '').trim(),
      variantId: String(item?.variantId || '').trim(),
      sku: String(item?.sku || '').trim(),
      slug: String(item?.slug || '').trim(),
      productName,
      size,
      imageUrl: String(item?.imageUrl || '').trim(),
      unitPriceCents,
      quantity
    };
  });
}

function normalizeTags(value) {
  const tags = Array.isArray(value) ? value : String(value || '').split(',');
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function validateEnum(value, validValues, message) {
  const normalized = String(value || '').trim();
  if (!validValues.has(normalized)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function orderSummary(order) {
  const jntExport = jntExportSummary(order);
  return {
    orderNumber: order.orderNumber,
    customerName: order.customer?.fullName || '',
    phone: order.customer?.phone || '',
    channel: order.channel || 'Online Store',
    totalCents: order.totalCents,
    shippingFeeCents: order.shippingFeeCents,
    shippingRegionLabel: order.shippingRegionLabel,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    codConfirmationStatus: order.codConfirmationStatus || 'pending',
    itemCount: Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0,
    deliveryStatus: order.deliveryStatus || 'pending',
    deliveryMethod: order.deliveryMethod || 'Standard shipping',
    exportedToJnt: jntExport.exportedToJnt,
    jntExportedAt: jntExport.jntExportedAt,
    jntExportStatus: jntExport.status,
    jntMissingFields: jntExport.missingFields,
    tags: Array.isArray(order.tags) ? order.tags : [],
    placedAt: order.placedAt
  };
}

function jntExportSummary(order) {
  const missingFields = validateJntOrders([order])[0]?.missing || [];
  const exportedToJnt = Boolean(order.exportedToJnt);
  return {
    exportedToJnt,
    jntExportedAt: order.jntExportedAt || '',
    status: exportedToJnt ? 'exported' : missingFields.length ? 'missing_fields' : 'ready',
    missingFields
  };
}

function orderSearchText(order) {
  return [
    order.orderNumber,
    order.customer?.fullName,
    order.customer?.phone,
    order.address?.addressLine
  ].filter(Boolean).join(' ').toLowerCase();
}

function orderDateFilter(query) {
  const range = String(query.dateRange || '').trim();
  if (!range) return null;

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);

  if (range === 'today') {
    return { from: todayStart, to: todayEnd };
  }

  if (range === 'yesterday') {
    const yesterday = new Date(todayStart);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return { from: startOfUtcDay(yesterday), to: endOfUtcDay(yesterday) };
  }

  if (range === 'last_7_days') {
    const from = new Date(todayStart);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from, to: todayEnd };
  }

  if (range === 'last_30_days') {
    const from = new Date(todayStart);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from, to: todayEnd };
  }

  if (range === 'custom') {
    const from = query.dateFrom ? startOfUtcDay(new Date(String(query.dateFrom))) : null;
    const to = query.dateTo ? endOfUtcDay(new Date(String(query.dateTo))) : null;
    return { from: validDateOrNull(from), to: validDateOrNull(to) };
  }

  return null;
}

function matchesOrderDateFilter(order, filter) {
  if (!filter || (!filter.from && !filter.to)) return true;
  const placedAt = new Date(order.placedAt || 0);
  if (Number.isNaN(placedAt.getTime())) return false;
  if (filter.from && placedAt < filter.from) return false;
  if (filter.to && placedAt > filter.to) return false;
  return true;
}

function startOfUtcDay(date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function endOfUtcDay(date) {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

function validDateOrNull(date) {
  return date && !Number.isNaN(date.getTime()) ? date : null;
}


router.get('/customers', async (req, res, next) => {
  try {
    const orders = await listOrders();
    const q = String(req.query.q || '').trim().toLowerCase();
    let customers = aggregateCustomers(orders);

    if (q) {
      customers = customers.filter((customer) =>
        customer.fullName.toLowerCase().includes(q) ||
        customer.phone.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q));
    }

    return res.json({ customers });
  } catch (error) {
    return next(error);
  }
});

router.get('/customers/:phone', async (req, res, next) => {
  try {
    const orders = await listOrders();
    const customerOrders = findCustomerOrders(orders, req.params.phone);

    if (!customerOrders.length) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = aggregateCustomers(customerOrders)[0];
    return res.json({ customer, orders: customerOrders.map(orderSummary) });
  } catch (error) {
    return next(error);
  }
});

router.get('/discounts', async (_req, res, next) => {
  try {
    const discounts = await listDiscounts();
    return res.json({ discounts });
  } catch (error) {
    return next(error);
  }
});

router.post('/discounts', async (req, res, next) => {
  try {
    const code = normalizeDiscountCode(req.body?.code);
    const existing = await findDiscountByCode(code);

    if (existing) {
      const error = new Error('Discount code already exists');
      error.status = 400;
      throw error;
    }

    const discount = await saveDiscount({ ...req.body, code, usageCount: 0 });
    return res.status(201).json({ discount });
  } catch (error) {
    return next(error);
  }
});

router.patch('/discounts/:code', async (req, res, next) => {
  try {
    const existing = await findDiscountByCode(req.params.code);

    if (!existing) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    const discount = await saveDiscount({
      ...existing,
      ...req.body,
      code: existing.code,
      usageCount: existing.usageCount,
      createdAt: existing.createdAt
    });
    return res.json({ discount });
  } catch (error) {
    return next(error);
  }
});

router.delete('/discounts/:code', async (req, res, next) => {
  try {
    const discount = await deleteDiscount(req.params.code);

    if (!discount) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    return res.json({ discount });
  } catch (error) {
    return next(error);
  }
});

module.exports = { adminRouter: router };
