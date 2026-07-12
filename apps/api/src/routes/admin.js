const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const {
  appendOrderStatusEvent,
  appendOrderTrackingNotification,
  findOrderByNumber,
  listOrders,
  updateOrder
} = require('../orders/orderRepository');
const { validateJntOrders, writeJntExportBuffer } = require('../jnt/jntExport');
const { previewJntParcel } = require('../jnt/jntParcelService');
const { enqueueDeliveredOrderNotifications } = require('../notifications/orderNotificationService');
const { listForOrder: listOrderNotifications } = require('../notifications/orderNotificationOutboxRepository');
const { aggregateCustomers, findCustomerOrders } = require('../customers/customerAggregator');
const { cartSessionSummary, deleteCartSession, listCartSessions } = require('../cartSessions/cartSessionRepository');
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
  updateBlackLogo,
  updateFooterLogo,
  updateLogo,
  updateMenuLogo,
  updateHomepageBanners
} = require('../siteContent/siteContentRepository');
const {
  addStorefrontCollection,
  getAdminCredentials,
  getStoreSettings,
  rotateAdminToken,
  setAdminPassword,
  updateCollectionCountdown,
  updateStorefrontCollection,
  updateSettingsSection,
  verifyAdminPassword
} = require('../settings/storeSettingsRepository');
const {
  deleteEditableProduct,
  findEditableProductBySlug,
  listEditableProducts,
  replaceEditableProducts,
  restockVariantStock,
  saveEditableProduct
} = require('../products/catalogRepository');
const {
  appendInventoryMovements,
  queryInventoryMovements
} = require('../inventory/inventoryMovementRepository');
const {
  MAX_PRODUCT_IMAGE_BYTES,
  normalizeProductUploads,
  productImageFileAllowed
} = require('../images/productImageNormalizer');
const {
  createAuthSession,
  findAuthSession,
  revokeActorSessions,
  revokeAuthSession,
  verifySessionCsrf
} = require('../auth/sessionRepository');
const {
  clearSessionCookies,
  csrfTokenFromRequest,
  isProduction,
  sessionTokenFromRequest,
  setSessionCookies
} = require('../auth/sessionHttp');
const { createAdminPancakeRouter } = require('./adminPancake');
const { hasDatabaseUrl, transaction } = require('../db/postgres');
const pancakeOrderSyncRepository = require('../integrations/pancake/pancakeOrderSyncRepository');
const pancakeOrderExportRepository = require('../integrations/pancake/pancakeOrderExportRepository');
const {
  deleteIssueReport,
  findIssueReportById,
  issueReportCounts,
  listIssueReports,
  updateIssueReport
} = require('../issueReports/issueReportRepository');

const router = express.Router();

const VALID_ORDER_STATUSES = new Set(['received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled']);
const VALID_FULFILLMENT_STATUSES = new Set(['unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled']);
const VALID_PAYMENT_STATUSES = new Set(['cod_pending', 'paid', 'cancelled', 'refunded']);
const VALID_COD_CONFIRMATION_STATUSES = new Set(['pending', 'confirmed', 'unreachable', 'cancelled']);
const VALID_DELIVERY_STATUSES = new Set(['pending', 'ready', 'out_for_delivery', 'delivered', 'returned', 'cancelled']);
const VALID_PRODUCT_STATUSES = new Set(['active', 'draft', 'archived']);
const ORDER_STATUS_EVENT_FIELDS = ['status', 'fulfillmentStatus', 'paymentStatus', 'codConfirmationStatus', 'deliveryStatus'];
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

async function replaceAdminSessions(res, legacyToken) {
  await revokeActorSessions('admin', 'admin');
  const auth = await createAuthSession({ actorType: 'admin', actorId: 'admin', ttlMs: ADMIN_SESSION_TTL_MS });
  setSessionCookies(res, 'admin', auth, ADMIN_SESSION_TTL_MS);
  return {
    csrfToken: auth.csrfToken,
    ...(!isProduction() ? { token: legacyToken } : {})
  };
}
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
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: 8
  },
  fileFilter: (_req, file, callback) => {
    if (!productImageFileAllowed(file)) {
      const error = new Error('Use a JPG, PNG, WebP, GIF, AVIF, or TIFF product image');
      error.status = 400;
      return callback(error);
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
    const configuredDevelopmentPassword = !isProduction() && process.env.ADMIN_PASSWORD
      ? String(process.env.ADMIN_PASSWORD)
      : '';
    const valid = credentials?.passwordHash
      ? Boolean(password) && (verifyAdminPassword(password, credentials) || password === configuredDevelopmentPassword)
      : Boolean(password) && password === adminPassword();

    if (!valid) {
      return res.status(401).json({ error: 'Admin password is invalid' });
    }

    const auth = await createAuthSession({ actorType: 'admin', actorId: 'admin', ttlMs: ADMIN_SESSION_TTL_MS });
    setSessionCookies(res, 'admin', auth, ADMIN_SESSION_TTL_MS);
    return res.json({
      csrfToken: auth.csrfToken,
      ...(!isProduction() ? { token: credentials?.token || adminToken() } : {})
    });
  } catch (error) {
    return next(error);
  }
});

router.use(requireAdmin);
router.use(requireAdminCsrf);

router.use('/integrations/pancake', createAdminPancakeRouter());

router.get('/session', (req, res) => res.json({ authenticated: true }));

router.post('/logout', async (req, res, next) => {
  try {
    if (req.authSessionToken) await revokeAuthSession(req.authSessionToken);
    clearSessionCookies(res, 'admin');
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/collections', async (_req, res, next) => {
  try {
    const settings = await getStoreSettings();
    return res.json({
      collections: settings.storefrontCollections,
      collectionDefinitions: settings.collectionDefinitions
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/collections', async (req, res, next) => {
  try {
    const settings = await addStorefrontCollection(req.body || {});
    return res.status(201).json({
      collections: settings.storefrontCollections,
      collectionDefinitions: settings.collectionDefinitions
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/collections/:identifier', async (req, res, next) => {
  try {
    const settings = await updateStorefrontCollection(req.params.identifier, req.body || {});
    return res.json({
      collections: settings.storefrontCollections,
      collectionDefinitions: settings.collectionDefinitions
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/collections/:identifier/image', bannerUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error('Choose a collection image to upload.');
      error.status = 400;
      throw error;
    }
    await normalizeProductUploads([req.file]);
    const settings = await updateStorefrontCollection(req.params.identifier, {
      imageUrl: bannerUploadUrl(req.file.filename)
    });
    const collection = settings.collectionDefinitions.find((item) => item.slug === String(req.params.identifier).toLowerCase());
    return res.status(201).json({ collection, collectionDefinitions: settings.collectionDefinitions });
  } catch (error) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') return next(unlinkError);
      }
    }
    return next(error);
  }
});

router.get('/issue-reports', async (req, res, next) => {
  try {
    const reports = await listIssueReports({
      status: req.query.status,
      issueType: req.query.issueType,
      search: req.query.search
    });
    const counts = await issueReportCounts();
    return res.json({ reports, counts });
  } catch (error) {
    return next(error);
  }
});

router.get('/issue-reports/counts', async (_req, res, next) => {
  try {
    return res.json({ counts: await issueReportCounts() });
  } catch (error) {
    return next(error);
  }
});

router.get('/issue-reports/:id/screenshot', async (req, res, next) => {
  try {
    const report = await findIssueReportById(req.params.id);
    if (!report?.screenshotUrl) return res.status(404).json({ error: 'Issue screenshot not found.' });
    return res.sendFile(path.basename(report.screenshotUrl), {
      root: issueUploadDir(),
      dotfiles: 'deny'
    }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/issue-reports/:id', async (req, res, next) => {
  try {
    const report = await updateIssueReport(req.params.id, {
      status: req.body?.status,
      adminNote: req.body?.adminNote
    });
    if (!report) return res.status(404).json({ error: 'Issue report not found.' });
    return res.json({ report });
  } catch (error) {
    return next(error);
  }
});

router.delete('/issue-reports/:id', async (req, res, next) => {
  try {
    const deleted = await deleteIssueReport(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Issue report not found.' });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/inventory-movements', async (req, res, next) => {
  try {
    const filters = inventoryMovementFilters(req.query, true);
    return res.json(await queryInventoryMovements(filters));
  } catch (error) {
    return next(error);
  }
});

router.post('/inventory-movements/export', async (req, res, next) => {
  try {
    const filters = inventoryMovementFilters(req.body, false);
    const result = await queryInventoryMovements(filters, { paginate: false });
    const filenameDate = new Date().toISOString().slice(0, 10);

    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="inventory-movements-${filenameDate}.csv"`);
    return res.send(inventoryMovementsCsv(result.movements));
  } catch (error) {
    return next(error);
  }
});

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

router.post('/site-content/black-logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A black logo image is required' });
    }

    const siteContent = await updateBlackLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing black logo'
    });

    return res.status(201).json({ siteContent, blackLogo: siteContent.blackLogo });
  } catch (error) {
    return next(error);
  }
});

router.post('/site-content/menu-logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A menu logo image is required' });
    }

    const siteContent = await updateMenuLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing menu logo'
    });

    return res.status(201).json({ siteContent, menuLogo: siteContent.menuLogo });
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
    return res.json(await replaceAdminSessions(res, record.token));
  } catch (error) {
    return next(error);
  }
});

router.post('/settings/security/rotate-token', async (req, res, next) => {
  try {
    const record = await rotateAdminToken();
    return res.json(await replaceAdminSessions(res, record.token));
  } catch (error) {
    return next(error);
  }
});

router.put('/settings/collection-countdowns/:collectionName', async (req, res, next) => {
  try {
    const collectionName = String(req.params.collectionName || '').trim();
    const settings = await updateCollectionCountdown(collectionName, req.body || {});
    return res.json({ countdown: settings.collectionCountdowns[collectionName] });
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
        recommendedCollections: ['New Arrivals', 'Maria Clara', 'Oversized Shirt', 'Sale'],
        recommendedVariantSizes: ['s', 'm', 'l', 'xl', 'xxl', 'xxxl'],
        imageGuidance: 'Use square or 4:5 product photos with clear alt text.'
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/:slug/images', upload.array('images', 8), async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    const slug = String(req.params.slug || '').trim();
    const product = await findEditableProductBySlug(slug);

    if (!product) {
      removeUploadedProductFiles(files);
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!files.length) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }

    await normalizeProductUploads(files);
    const existingImages = Array.isArray(product.images) ? product.images : [];
    const uploadedImages = uploadedProductImages(files, product.name)
      .map((image, index) => ({ ...image, sortOrder: existingImages.length + index }));
    const updatedProduct = await saveEditableProduct({
      ...product,
      images: [...existingImages, ...uploadedImages]
    }, slug);

    return res.status(201).json({ product: updatedProduct, images: uploadedImages });
  } catch (error) {
    try {
      removeUploadedProductFiles(files);
    } catch (cleanupError) {
      cleanupError.cause = error;
      return next(cleanupError);
    }
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
    const collectionSettings = collection ? await getStoreSettings() : null;
    const collectionDefinition = collectionSettings?.collectionDefinitions.find((item) => item.name.toLowerCase() === collection || item.slug === collection);
    const acceptedCollectionNames = new Set([
      collectionDefinition?.name || collection,
      ...(collectionDefinition?.aliases || [])
    ].map((name) => String(name || '').trim().toLowerCase()));
    const products = sortProductRecords(allProducts
      .filter((product) => !status || productStatus(product) === status)
      .filter((product) => !collection || product.collections.some((item) => acceptedCollectionNames.has(item.toLowerCase())))
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

router.post('/products', upload.array('images', 8), async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  let product;
  try {
    const incoming = multipartProductBody(req);
    if (req.is('multipart/form-data') && !files.length) {
      const error = new Error('Add at least one product photo before saving');
      error.status = 400;
      throw error;
    }
    await normalizeProductUploads(files);
    const images = files.length ? uploadedProductImages(files, incoming.name) : incoming.images;
    product = await saveEditableProduct(withSyncedStorefrontProductPage(normalizeProductRequest({
      ...incoming,
      images
    })));
  } catch (error) {
    try {
      removeUploadedProductFiles(files);
    } catch (cleanupError) {
      cleanupError.cause = error;
      return next(cleanupError);
    }
    return next(error);
  }
  return res.status(201).json({ product, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
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
    await appendInventoryMovements(stockCorrectionMovements(existingProduct, product));
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

router.delete('/cart-sessions/:sessionId', async (req, res, next) => {
  try {
    const deleted = await deleteCartSession(req.params.sessionId);
    console.info(JSON.stringify({
      level: 'info', event: 'admin_cart_session_deleted', sessionId: deleted.sessionId, status: deleted.status
    }));
    return res.json({ deleted });
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
    await Promise.all(orders.map(async (order) => {
      const updatedOrder = await updateOrder(order.orderNumber, {
        exportedToJnt: true,
        jntExportedAt: exportedAt,
        status: 'shipped',
        fulfillmentStatus: 'shipped',
        deliveryStatus: order.deliveryStatus === 'delivered' || order.deliveryStatus === 'cancelled'
          ? order.deliveryStatus
          : 'out_for_delivery'
      });
      await appendStatusEventIfChanged(order, updatedOrder, 'jnt_export', 'J&T export marked this order as shipped.');
    }));

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

    return res.json({
      order: {
        ...order,
        notifications: await listOrderNotifications(order.orderNumber),
        pancakeSyncDetail: await pancakeOrderSyncRepository.getOrderSyncDetail(order.orderNumber)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/:orderNumber/jnt/preview', async (req, res, next) => {
  try {
    const order = await findOrderByNumber(String(req.params.orderNumber || '').trim());
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json({ preview: previewJntParcel(order) });
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/:orderNumber/tracking-notification', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const order = await findOrderByNumber(orderNumber);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!canRecordTrackingNotification(order)) {
      return res.status(400).json({ error: 'Tracking notifications require a shipped or J&T-exported order' });
    }

    const notification = await appendOrderTrackingNotification(order.orderNumber, {
      channel: normalizeTrackingNotificationChannel(req.body?.channel),
      status: 'recorded',
      source: 'admin',
      recipient: order.customer?.phone || order.customer?.email || '',
      trackingNumber: order.trackingNumber || '',
      message: trackingNotificationMessage(order)
    });
    const updatedOrder = await findOrderByNumber(order.orderNumber);

    return res.json({ order: updatedOrder, notification });
  } catch (error) {
    return next(error);
  }
});

router.patch('/orders/:orderNumber', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    if (req.body?.items !== undefined) {
      return res.status(409).json({ error: 'Order items cannot be changed after checkout. Create a replacement order instead.' });
    }
    const updateWithinTransaction = async (client) => {
      const repositoryOptions = client
        ? { client, forUpdate: true, includeRelated: false }
        : {};
      const existingOrder = await findOrderByNumber(orderNumber, repositoryOptions);
      if (!existingOrder) return null;
      if (existingOrder.status === 'cancelled' && req.body?.status && req.body.status !== 'cancelled') {
        const error = new Error('Cancelled orders cannot be reopened. Create a replacement order instead.');
        error.status = 409;
        throw error;
      }

      const changes = normalizeOrderUpdate(req.body || {}, existingOrder);
      const order = await updateOrder(orderNumber, changes, {
        ...(client ? { client } : {}),
        existingOrder
      });
      await restoreCancelledOrderStock(existingOrder, order, client ? { client } : {});
      await appendStatusEventIfChanged(existingOrder, order, 'admin', '', client ? { client } : {});
      return { existingOrder, order };
    };
    const result = hasDatabaseUrl()
      ? await transaction(updateWithinTransaction)
      : await updateWithinTransaction();

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const { existingOrder, order } = result;
    if (existingOrder.status !== 'cancelled' && order.status === 'cancelled') {
      await pancakeOrderExportRepository.markOrderExportSkipped(order.orderNumber);
    }
    await enqueuePancakeOrderUpdateIfLinked(existingOrder, order);
    await enqueueDeliveredOrderNotifications(existingOrder, order);
    const refreshedOrder = await findOrderByNumber(orderNumber);
    return res.json({
      order: {
        ...refreshedOrder,
        notifications: await listOrderNotifications(orderNumber),
        pancakeSyncDetail: await pancakeOrderSyncRepository.getOrderSyncDetail(orderNumber)
      }
    });
  } catch (error) {
    return next(error);
  }
});

async function restoreCancelledOrderStock(previousOrder, nextOrder, options = {}) {
  if (!previousOrder || !nextOrder) return;
  if (previousOrder.status === 'cancelled' || nextOrder.status !== 'cancelled') return;

  const restockItems = (Array.isArray(nextOrder.items) ? nextOrder.items : [])
    .map((item) => ({
      slug: String(item.slug || item.productId || '').replace(/^catalog-/, ''),
      sku: item.sku || '',
      size: item.size || '',
      quantity: Math.abs(Number(item.quantity || 0)),
      productName: item.productName || ''
    }))
    .filter((item) => item.sku && item.quantity > 0);

  if (!restockItems.length) return;

  await restockVariantStock(restockItems, options);
  await appendInventoryMovements(restockItems.map((item) => ({
    orderNumber: nextOrder.orderNumber,
    source: 'admin',
    reason: 'order_cancelled',
    productSlug: item.slug,
    productName: item.productName,
    sku: item.sku,
    size: item.size,
    quantityChange: item.quantity
  })), options);
}

function issueUploadDir() {
  return process.env.ISSUE_UPLOAD_DIR || path.join(__dirname, '..', '..', 'private-uploads', 'issues');
}

function stockCorrectionMovements(previousProduct, nextProduct) {
  const previousBySku = new Map((previousProduct?.variants || []).map((variant) => [variant.sku, variant]));
  return (nextProduct?.variants || [])
    .map((variant) => {
      const previousVariant = previousBySku.get(variant.sku);
      if (!previousVariant) return null;
      const quantityChange = Number(variant.stockQuantity || 0) - Number(previousVariant.stockQuantity || 0);
      if (quantityChange === 0) return null;
      return {
        orderNumber: '',
        source: 'admin',
        reason: 'admin_stock_correction',
        productSlug: nextProduct.slug,
        productName: nextProduct.name,
        sku: variant.sku,
        size: variant.size,
        quantityChange
      };
    })
    .filter(Boolean);
}

function inventoryMovementFilters(input, includePagination) {
  const source = input && typeof input === 'object' ? input : {};
  const names = ['q', 'reason', 'range', 'dateFrom', 'dateTo', 'sort'];
  if (includePagination) names.push('page', 'pageSize');
  return Object.fromEntries(names
    .filter((name) => source[name] !== undefined)
    .map((name) => [name, source[name]]));
}

function inventoryMovementsCsv(movements) {
  const header = [
    'Date',
    'Product',
    'Product Slug',
    'SKU',
    'Size',
    'Reason',
    'Source',
    'Order Number',
    'Quantity Change'
  ];
  const rows = (movements || []).map((movement) => [
    movement.createdAt,
    movement.productName,
    movement.productSlug,
    movement.sku,
    movement.size,
    movement.reason,
    movement.source,
    movement.orderNumber,
    movement.quantityChange
  ].map((value, index) => csvValue(value, index !== 8)).join(','));

  return [header.join(','), ...rows].join('\n');
}

function csvValue(value, protectFormula) {
  let text = value === null || value === undefined ? '' : String(value);
  if (protectFormula && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function requireAdmin(req, res, next) {
  try {
    const cookieToken = sessionTokenFromRequest(req, 'admin');
    if (cookieToken) {
      const session = await findAuthSession(cookieToken);
      if (session?.actorType === 'admin') {
        req.authSession = session;
        req.authSessionToken = cookieToken;
        return next();
      }
    }

    if (isProduction()) {
      return res.status(401).json({ error: 'Admin authentication is required' });
    }
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

function requireAdminCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.authSession) return next();
  if (!verifySessionCsrf(req.authSession, csrfTokenFromRequest(req))) {
    return res.status(403).json({ error: 'CSRF token is invalid' });
  }
  return next();
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

function multipartProductBody(req) {
  if (!req.is('multipart/form-data')) return req.body || {};
  try {
    return JSON.parse(String(req.body?.product || '{}'));
  } catch {
    const error = new Error('Product data is invalid JSON');
    error.status = 400;
    throw error;
  }
}

function uploadedProductImages(files, productName) {
  return (Array.isArray(files) ? files : []).map((file, index) => ({
    url: productUploadUrl(file.filename),
    altText: String(productName || 'Product image').trim(),
    sortOrder: index
  }));
}

function removeUploadedProductFiles(files) {
  (Array.isArray(files) ? files : []).forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });
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
    parcelWeightGrams: normalizeParcelWeightGrams(body.parcelWeightGrams, 'Product parcel weight is invalid'),
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
  const detailsText = String(productPage.detailsText || '').trim();
  const shippingText = String(productPage.shippingText || '').trim();
  const sizeChartRows = Array.isArray(productPage.sizeChart) ? productPage.sizeChart : [];
  const sizeChartItems = sizeChartRows.map(formatSizeChartSectionItem).filter(Boolean);
  const fallbackSections = [
    {
      title: 'Product details',
      items: ['Comfortable fit', 'Easy to style', 'Ready for everyday wear']
    }
  ];
  const sourceSections = Array.isArray(productPage.sections) ? productPage.sections : [];
  const syncedSections = [
    detailsText && { title: 'Product details', body: detailsText },
    sizeChartItems.length && { title: 'Size Chart', items: sizeChartItems },
    shippingText && { title: 'Shipping', body: shippingText }
  ].filter(Boolean);
  const syncedTitles = new Set(syncedSections.map((section) => section.title.toLowerCase()));
  const remainingSections = sourceSections.filter((section) => !syncedTitles.has(String(section?.title || '').trim().toLowerCase()));
  const sections = syncedSections.length || remainingSections.length
    ? [...syncedSections, ...remainingSections]
    : fallbackSections;

  return {
    ...product,
    productPage: {
      ...productPage,
      heading: name || String(productPage.heading || 'Product details').trim(),
      intro: description || String(productPage.intro || 'Premium Maria Clara Clothing piece with everyday comfort and clean styling.').trim(),
      sections
    }
  };
}

function formatSizeChartSectionItem(row) {
  const size = String(row?.size || '').trim();
  const width = String(row?.width || '').trim();
  const length = String(row?.length || '').trim();
  const sleeveLength = String(row?.sleeveLength || '').trim();
  const shoulderDropLength = String(row?.shoulderDropLength || '').trim();
  if (!size || !width || !length || !sleeveLength || !shoulderDropLength) return '';
  return `${size}: Width ${width}, Length ${length}, Sleeve length ${sleeveLength}, Shoulder drop length ${shoulderDropLength}`;
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
    parcelWeightGrams: product.parcelWeightGrams || 250,
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
  if (body.parcelWeightOverrideGrams !== undefined) {
    changes.parcelWeightOverrideGrams = body.parcelWeightOverrideGrams === null || body.parcelWeightOverrideGrams === ''
      ? null
      : normalizeParcelWeightGrams(body.parcelWeightOverrideGrams, 'Parcel weight override is invalid', 1000000);
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

function normalizeParcelWeightGrams(value, message, maximum = 100000) {
  const number = Number(value === undefined || value === null || value === '' ? 250 : value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return number;
}

async function appendStatusEventIfChanged(previousOrder, nextOrder, source, note = '', options = {}) {
  if (!previousOrder || !nextOrder) return null;
  const changes = {};

  ORDER_STATUS_EVENT_FIELDS.forEach((field) => {
    const from = previousOrder[field] || '';
    const to = nextOrder[field] || '';
    if (from !== to) {
      changes[field] = { from, to };
    }
  });

  if (!Object.keys(changes).length) return null;
  return appendOrderStatusEvent(nextOrder.orderNumber || previousOrder.orderNumber, {
    source,
    changes,
    note
  }, options);
}

function changedPancakeFields(previousOrder, nextOrder) {
  const fields = [];
  for (const field of [
    'status',
    'fulfillmentStatus',
    'deliveryStatus',
    'trackingNumber',
    'notes'
  ]) {
    if (String(previousOrder?.[field] ?? '') !== String(nextOrder?.[field] ?? '')) fields.push(field);
  }
  if (JSON.stringify(previousOrder?.customer || {}) !== JSON.stringify(nextOrder?.customer || {})) fields.push('customer');
  if (JSON.stringify(previousOrder?.address || {}) !== JSON.stringify(nextOrder?.address || {})) fields.push('address');
  return fields;
}

async function enqueuePancakeOrderUpdateIfLinked(previousOrder, nextOrder, { syncRepository = pancakeOrderSyncRepository } = {}) {
  const changedFields = changedPancakeFields(previousOrder, nextOrder);
  if (!changedFields.length || !nextOrder?.orderNumber) return null;
  const detail = await syncRepository.getOrderSyncDetail(nextOrder.orderNumber);
  if (!detail?.pancakeOrderId) return null;
  const sortedFields = changedFields.sort();
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ changedFields: sortedFields, updatedAt: nextOrder.updatedAt || '' }))
    .digest('hex');
  return syncRepository.enqueueSyncEvent({
    direction: 'outbound',
    entityType: 'order',
    entityId: nextOrder.orderNumber,
    orderNumber: nextOrder.orderNumber,
    pancakeOrderId: detail.pancakeOrderId,
    eventKey: `${nextOrder.orderNumber}:${sortedFields.join(',')}:${nextOrder.updatedAt || Date.now()}`,
    payloadHash,
    payload: { changedFields: sortedFields }
  });
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
    discountCode: order.discountCode || '',
    discountTotalCents: order.discountTotalCents,
    discountSnapshot: order.discountSnapshot || {},
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

function canRecordTrackingNotification(order) {
  return Boolean(order?.exportedToJnt)
    || order?.status === 'shipped'
    || order?.fulfillmentStatus === 'shipped'
    || order?.deliveryStatus === 'out_for_delivery';
}

function normalizeTrackingNotificationChannel(channel) {
  const normalized = String(channel || 'sms').trim().toLowerCase();
  return ['sms', 'email', 'manual'].includes(normalized) ? normalized : 'sms';
}

function trackingNotificationMessage(order) {
  const parts = [
    `Your Maria Clara Clothing order ${order.orderNumber} has been shipped`,
    order.deliveryMethod ? `via ${order.deliveryMethod}` : '',
    order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : '',
    'Please keep your phone reachable for delivery updates.'
  ].filter(Boolean);
  return parts.join('. ');
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

module.exports = { adminRouter: router, normalizeOrderUpdate, enqueuePancakeOrderUpdateIfLinked };
