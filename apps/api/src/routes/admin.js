const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');
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
const { resendAdminNewOrderEmail } = require('../notifications/adminOrderEmailNotificationService');
const { aggregateCustomers, findCustomerOrders } = require('../customers/customerAggregator');
const { normalizeCustomerName } = require('../customers/customerName');
const { cartSessionSummary, deleteCartSession, listCartSessions } = require('../cartSessions/cartSessionRepository');
const { sendCartRecoveryEmail } = require('../cartSessions/cartRecoveryService');
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
  normalizeCollectionBannerLink,
  updateBlackLogo,
  updateCollectionBanner,
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
  archiveEditableProduct,
  findEditableProductBySlug,
  listEditableProducts,
  restoreEditableProduct,
  restockVariantStock,
  saveEditableProduct,
  saveEditableProductsBatch
} = require('../products/catalogRepository');
const {
  failedProductRowsCsv,
  planProductCsvImport,
  productsToCsv
} = require('../products/productCsv');
const {
  appendInventoryMovements,
  queryInventoryMovements
} = require('../inventory/inventoryMovementRepository');
const {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_DERIVATIVE_WIDTHS,
  normalizeProductUploads,
  productImageDerivativePath,
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
const { env } = require('../config/env');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const pancakeProductSyncRepository = require('../integrations/pancake/pancakeProductSyncRepository');
const pancakeInventoryOutboxRepository = require('../integrations/pancake/pancakeInventoryOutboxRepository');
const { processInventorySyncJobs } = require('../integrations/pancake/pancakeInventoryOutboxService');
const { hasDatabaseUrl, transaction } = require('../db/postgres');
const { applyOversizedProductTemplate, isOversizedProduct } = require('../products/oversizedProductTemplate');
const pancakeOrderSyncRepository = require('../integrations/pancake/pancakeOrderSyncRepository');
const pancakeOrderExportRepository = require('../integrations/pancake/pancakeOrderExportRepository');
const { processOutboundOrderEvents } = require('../integrations/pancake/pancakeOrderSyncService');
const { createPayMongoClient } = require('../payments/paymongoClient');
const { releaseExpiredReservations } = require('../payments/paymongoPaymentService');
const {
  listOrderRefunds,
  listPaymentAlerts,
  listPaymentOperations
} = require('../payments/paymongoRefundRepository');
const { paymentMethodRefundPolicy, requestRefund, retryRefund } = require('../payments/paymongoRefundService');
const {
  deleteIssueReport,
  findIssueReportById,
  issueReportCounts,
  listIssueReports,
  updateIssueReport
} = require('../issueReports/issueReportRepository');
const { createAdminReviewsRouter } = require('./adminReviews');
const { CommerceError } = require('../checkout/commerceError');
const {
  deliveryInformationIssues,
  hasCompleteDeliveryInformation,
  normalizeCheckoutCustomer,
  normalizeDeliveryAddress
} = require('../checkout/deliveryDetails');
const {
  contentReadinessSummary,
  storefrontAnalyticsSummary
} = require('../analytics/storefrontAnalyticsService');

const router = express.Router();

const VALID_ORDER_STATUSES = new Set([
  'received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'failed', 'unreachable'
]);
const VALID_FULFILLMENT_STATUSES = new Set(['unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled']);
const VALID_PAYMENT_STATUSES = new Set(['cod_pending', 'pending_payment', 'paid', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded']);
const VALID_COD_CONFIRMATION_STATUSES = new Set(['pending', 'confirmed', 'unreachable', 'cancelled']);
const VALID_DELIVERY_STATUSES = new Set(['pending', 'ready', 'out_for_delivery', 'delivered', 'returned', 'cancelled']);
const VALID_PRODUCT_STATUSES = new Set(['active', 'draft', 'archived']);
const ORDER_STATUS_EVENT_FIELDS = ['status', 'fulfillmentStatus', 'paymentStatus', 'codConfirmationStatus', 'deliveryStatus', 'cancellationReason', 'isTestOrder'];
const VALID_CANCELLATION_REASONS = new Set([
  'customer_requested', 'unreachable_customer', 'duplicate_order', 'payment_failed',
  'out_of_stock', 'invalid_address', 'fraud_risk', 'other'
]);
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
const productCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 2 * 1024 * 1024 }
});
const bannerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const uploadDir = bannerUploadDir();
      fs.mkdirSync(uploadDir, { recursive: true });
      callback(null, uploadDir);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const prefix = req.originalUrl?.includes('/collection-banner/') ? 'collection-banner' : 'homepage-banner';
      callback(null, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
    }
  }),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: 6
  },
  fileFilter: (_req, file, callback) => {
    if (!/^image\//.test(file.mimetype || '')) {
      const error = new Error('Only image uploads are allowed');
      error.status = 400;
      return callback(error);
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
router.use('/reviews', createAdminReviewsRouter());

router.get('/session', (req, res) => res.json({ authenticated: true }));

router.get('/analytics', async (req, res, next) => {
  try {
    return res.json({ analytics: await storefrontAnalyticsSummary({ days: req.query.days }) });
  } catch (error) {
    return next(error);
  }
});

router.get('/content-readiness', async (_req, res, next) => {
  try {
    return res.json({ readiness: await contentReadinessSummary() });
  } catch (error) {
    return next(error);
  }
});

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
    if (req.file?.path) removeUploadedProductFiles([req.file]);
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
    return sendProductsCsv(res, await selectProductsForExport(req.query));
  } catch (error) {
    return next(error);
  }
});

router.post('/products/export', async (req, res, next) => {
  try {
    return sendProductsCsv(res, await selectProductsForExport(req.body || {}));
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

    await normalizeProductUploads(files);

    const { homepageBanners: currentBanners } = await getSiteContent();
    const uploadedBanners = files.map((file, index) => ({
      url: bannerUploadUrl(file.filename),
      altText: 'Homepage banner',
      sortOrder: currentBanners.length + index
    }));
    const siteContent = await appendHomepageBanners(uploadedBanners);

    return res.status(201).json({ siteContent, banners: siteContent.homepageBanners, uploadedBanners });
  } catch (error) {
    removeUploadedProductFiles(Array.isArray(req.files) ? req.files : []);
    return next(error);
  }
});

router.put('/site-content/collection-banner', async (req, res, next) => {
  try {
    const banner = req.body?.banner || {};
    assertCollectionBannerRequest(banner);
    const previous = (await getSiteContent()).collectionBanner;
    const siteContent = await updateCollectionBanner(banner);
    removeReplacedCollectionBannerImage(previous?.desktopImage?.url, siteContent.collectionBanner.desktopImage.url);
    removeReplacedCollectionBannerImage(previous?.mobileImage?.url, siteContent.collectionBanner.mobileImage.url);
    return res.json({ siteContent, collectionBanner: siteContent.collectionBanner });
  } catch (error) {
    return next(error);
  }
});

router.post('/site-content/collection-banner/images/:slot', bannerUpload.single('image'), async (req, res, next) => {
  try {
    const slot = String(req.params.slot || '').trim().toLowerCase();
    if (!['desktop', 'mobile'].includes(slot)) {
      const error = new Error('Collection banner image slot is invalid');
      error.status = 400;
      throw error;
    }
    if (!req.file) {
      const error = new Error('A collection banner image is required');
      error.status = 400;
      throw error;
    }
    await normalizeProductUploads([req.file]);
    const metadata = await sharp(req.file.path).metadata();
    const image = {
      url: bannerUploadUrl(req.file.filename),
      width: Number(metadata.width || 0),
      height: Number(metadata.height || 0)
    };
    return res.status(201).json({ slot, image });
  } catch (error) {
    removeUploadedProductFiles(req.file ? [req.file] : []);
    return next(error);
  }
});

router.post('/site-content/logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A logo image is required' });
    }

    await normalizeProductUploads([req.file]);

    const siteContent = await updateLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing logo'
    });

    return res.status(201).json({ siteContent, logo: siteContent.logo });
  } catch (error) {
    removeUploadedProductFiles(req.file ? [req.file] : []);
    return next(error);
  }
});

router.post('/site-content/black-logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A black logo image is required' });
    }

    await normalizeProductUploads([req.file]);

    const siteContent = await updateBlackLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing black logo'
    });

    return res.status(201).json({ siteContent, blackLogo: siteContent.blackLogo });
  } catch (error) {
    removeUploadedProductFiles(req.file ? [req.file] : []);
    return next(error);
  }
});

router.post('/site-content/menu-logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A menu logo image is required' });
    }

    await normalizeProductUploads([req.file]);

    const siteContent = await updateMenuLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing menu logo'
    });

    return res.status(201).json({ siteContent, menuLogo: siteContent.menuLogo });
  } catch (error) {
    removeUploadedProductFiles(req.file ? [req.file] : []);
    return next(error);
  }
});

router.post('/site-content/footer-logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A footer logo image is required' });
    }

    await normalizeProductUploads([req.file]);

    const siteContent = await updateFooterLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing footer logo'
    });

    return res.status(201).json({ siteContent, footerLogo: siteContent.footerLogo });
  } catch (error) {
    removeUploadedProductFiles(req.file ? [req.file] : []);
    return next(error);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    const settings = await getStoreSettings();
    if (env.meta.enabled) settings.marketing.metaPixel.pixelId = env.meta.pixelId;
    return res.json({
      settings,
      paymentProviders: {
        paymongo: {
          configured: env.paymongo.configured,
          enabled: env.paymongo.enabled,
          mode: env.paymongo.livemode ? 'live' : 'test',
          publicKey: env.paymongo.publicKey || ''
        }
      },
      metaProvider: {
        conversionsApiEnabled: env.meta.enabled,
        pixelIdLocked: env.meta.enabled,
        pixelId: env.meta.enabled ? env.meta.pixelId : ''
      }
    });
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
    if (req.params.section === 'marketing' && env.meta.enabled) {
      const requestedPixelId = String(req.body?.metaPixel?.pixelId || '').trim();
      if (requestedPixelId !== env.meta.pixelId) {
        const error = new Error('Meta Pixel ID must match the server Conversions API dataset.');
        error.status = 400;
        throw error;
      }
    }
    const settings = await updateSettingsSection(req.params.section, req.body || {});
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/import/preview', productCsvUpload.single('file'), async (req, res, next) => {
  try {
    assertProductCsvUpload(req.file);
    const plan = planProductCsvImport(req.file.buffer, {
      mode: req.body?.mode,
      currentProducts: await listEditableProducts()
    });
    return res.json({
      preview: plan.preview,
      errorReportCsv: failedProductRowsCsv(plan.preview.rows)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/import', productCsvUpload.single('file'), async (req, res, next) => {
  try {
    assertProductCsvUpload(req.file);
    const currentProducts = await listEditableProducts();
    const plan = planProductCsvImport(req.file.buffer, {
      mode: req.body?.mode,
      currentProducts
    });
    if (!plan.products.length) {
      return res.status(422).json({
        error: 'No valid products are available to import.',
        preview: plan.preview,
        errorReportCsv: failedProductRowsCsv(plan.preview.rows)
      });
    }
    const products = await saveEditableProductsBatch(plan.products);
    const allProducts = await listEditableProducts();
    return res.json({
      products,
      preview: plan.preview,
      errorReportCsv: failedProductRowsCsv(plan.preview.rows),
      summary: productSummary(allProducts, await activeLowStockThreshold())
    });
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
    const allProducts = await listEditableProducts();
    const lowStockThreshold = await activeLowStockThreshold();
    const filtered = await filterProductRecords(allProducts, req.query, lowStockThreshold);
    const requestedPage = normalizePageNumber(req.query.page, 1);
    const pageSize = normalizePageSize(req.query.pageSize, 25, 100);
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const offset = (page - 1) * pageSize;
    const products = filtered.slice(offset, offset + pageSize).map((product) => productSummaryRecord(product, lowStockThreshold));

    return res.json({
      products,
      summary: productSummary(allProducts, lowStockThreshold),
      pagination: paginationRecord(filtered.length, page, pageSize)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/products/templates/oversized/preview', async (_req, res, next) => {
  try {
    const products = (await listEditableProducts()).filter(isOversizedProduct);
    return res.json({
      count: products.length,
      products: products.map((product) => ({ name: product.name, slug: product.slug, status: productStatus(product) }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/templates/oversized/apply', async (req, res, next) => {
  try {
    const requested = Array.isArray(req.body?.slugs)
      ? new Set(req.body.slugs.map((slug) => String(slug || '').trim()).filter(Boolean))
      : null;
    const products = (await listEditableProducts())
      .filter(isOversizedProduct)
      .filter((product) => !requested || requested.has(product.slug));
    for (const product of products) {
      await saveEditableProduct(applyOversizedProductTemplate(product), product.slug);
    }
    return res.json({
      count: products.length,
      products: products.map((product) => ({ name: product.name, slug: product.slug }))
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

    const allProducts = await listEditableProducts();
    const copyName = String(req.body?.name || `${originalProduct.name} Copy`).trim();
    const copySlug = uniqueProductIdentifier(
      String(req.body?.slug || `${originalProduct.slug}-copy`).trim(),
      new Set(allProducts.map((product) => product.slug))
    );
    const publicHandle = uniqueProductIdentifier(
      String(req.body?.publicHandle || copyName).trim(),
      new Set(allProducts.flatMap((product) => [product.publicHandle, product.slug, ...(product.urlAliases || [])]).map((value) => normalizeRouteText(value)))
    );
    const duplicateSkuSuffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const duplicateVariants = (originalProduct.variants || []).map((variant, index) => ({
      ...variant,
      id: undefined,
      sku: `${String(variant.sku || `VARIANT-${index + 1}`).trim()}-COPY-${duplicateSkuSuffix}`,
      stockQuantity: 0,
      externalPosVariantId: ''
    }));
    const product = await saveEditableProduct(withSyncedStorefrontProductPage(normalizeProductRequest({
      ...originalProduct,
      id: undefined,
      name: copyName,
      slug: copySlug,
      publicHandle,
      urlAliases: [],
      variants: duplicateVariants,
      status: 'draft',
      featured: false
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
      slug,
      productPage: req.body?.productPage || existingProduct.productPage
    }), slug);
    await appendInventoryMovements(stockCorrectionMovements(existingProduct, product));
    let pancakeSync = null;
    if (productVariantStockChanged(existingProduct, product)) {
      await pancakeInventoryOutboxRepository.enqueueInventorySync([product.slug], 'admin', {
        maxAttempts: env.pancake.syncMaxAttempts
      });
      const outbound = await processInventorySyncJobs({
        productSlugs: [product.slug], config: env.pancake, client: createPancakeClient(env.pancake),
        repository: pancakeInventoryOutboxRepository, productSyncRepository: pancakeProductSyncRepository
      });
      const result = outbound.results[0];
      pancakeSync = result?.sync || {
        status: result?.status === 'failed' ? 'failed' : 'pending',
        lastErrorCode: result?.code || '', pendingRetry: result?.status === 'failed'
      };
    }
    return res.json({ product, pancakeSync, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/products/:slug', async (req, res, next) => {
  try {
    const product = await archiveEditableProduct(String(req.params.slug || '').trim());

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({
      product,
      archived: true,
      warning: 'This local archive does not delete the connected product in Pancake POS.',
      summary: productSummary(await listEditableProducts(), await activeLowStockThreshold())
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/:slug/restore', async (req, res, next) => {
  try {
    const product = await restoreEditableProduct(String(req.params.slug || '').trim());
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json({
      product,
      restored: true,
      message: 'Product restored as a draft. Review it before publishing.',
      summary: productSummary(await listEditableProducts(), await activeLowStockThreshold())
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/products/:slug/status', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const existing = await findEditableProductBySlug(slug);
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const status = validateEnum(req.body?.status, VALID_PRODUCT_STATUSES, 'Product status is invalid');
    const product = await saveEditableProduct({
      ...existing,
      status,
      ...(status !== 'active' ? { featured: false } : {})
    }, slug);
    return res.json({ product, summary: productSummary(await listEditableProducts(), await activeLowStockThreshold()) });
  } catch (error) {
    return next(error);
  }
});

router.post('/products/bulk', async (req, res, next) => {
  try {
    const slugs = [...new Set((Array.isArray(req.body?.slugs) ? req.body.slugs : [])
      .map((slug) => String(slug || '').trim()).filter(Boolean))];
    if (!slugs.length || slugs.length > 100) {
      return res.status(400).json({ error: 'Select between 1 and 100 products.' });
    }
    const action = String(req.body?.action || '').trim();
    const statusByAction = { publish: 'active', unpublish: 'draft', archive: 'archived', restore: 'draft' };
    const collection = String(req.body?.collection || '').trim();
    if (!statusByAction[action] && !['add_collection', 'remove_collection'].includes(action)) {
      return res.status(400).json({ error: 'Bulk product action is invalid.' });
    }
    if (['add_collection', 'remove_collection'].includes(action) && !collection) {
      return res.status(400).json({ error: 'A collection is required for this action.' });
    }
    const catalog = await listEditableProducts();
    const bySlug = new Map(catalog.map((product) => [product.slug, product]));
    const missing = slugs.filter((slug) => !bySlug.has(slug));
    if (missing.length) return res.status(404).json({ error: `Product not found: ${missing[0]}` });
    const changed = slugs.map((slug) => {
      const product = bySlug.get(slug);
      if (statusByAction[action]) {
        return { ...product, status: statusByAction[action], ...(statusByAction[action] !== 'active' ? { featured: false } : {}) };
      }
      const collections = new Set(product.collections || []);
      if (action === 'add_collection') collections.add(collection);
      else collections.delete(collection);
      return { ...product, collections: [...collections].length ? [...collections] : ['Uncategorized'] };
    });
    const products = await saveEditableProductsBatch(changed);
    return res.json({
      products,
      action,
      count: products.length,
      summary: productSummary(await listEditableProducts(), await activeLowStockThreshold())
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const filtered = filterAndSortOrders(await listOrders(), req.query);
    const pageSize = normalizePageSize(req.query.pageSize, 25, 100);
    const requestedPage = normalizePageNumber(req.query.page, 1);
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const orders = filtered.slice((page - 1) * pageSize, page * pageSize).map(orderSummary);
    return res.json({ orders, summary: orderListSummary(filtered), pagination: paginationRecord(filtered.length, page, pageSize) });
  } catch (error) {
    return next(error);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const search = String(req.query.q || '').trim();
    const operations = await listPaymentOperations({ status, search, limit: 500 });
    const alerts = await listPaymentAlerts({ reservationMinutes: env.paymongo.reservationMinutes });
    return res.json({
      provider: {
        configured: env.paymongo.configured,
        mode: env.paymongo.livemode ? 'live' : 'test',
        refundsEnabled: Boolean(env.paymongo.configured && env.paymongo.livemode)
      },
      summary: paymentOperationsSummary(operations),
      operations,
      alerts
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/payments/export', async (req, res, next) => {
  try {
    const operations = await listPaymentOperations({
      status: String(req.query.status || '').trim(),
      search: String(req.query.q || '').trim(),
      limit: 5000
    });
    const exportedAt = new Date().toISOString();
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="PayMongo_Payments_${exportedAt.slice(0, 10)}.csv"`);
    return res.send(paymentOperationsCsv(operations));
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

router.post('/cart-sessions/:sessionId/recovery-email', async (req, res, next) => {
  try {
    const result = await sendCartRecoveryEmail(req.params.sessionId, {
      config: env.notifications.adminOrderEmail
    });
    console.info(JSON.stringify({
      level: 'info', event: 'admin_cart_recovery_email_sent', sessionId: req.params.sessionId,
      sentAt: result.sentAt
    }));
    return res.json({ notification: { status: result.status, sentAt: result.sentAt } });
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
      await enqueuePancakeOrderUpdateIfLinked(order, updatedOrder);
    }));
    if (env.pancake.mode === 'live' && env.pancake.apiKeyConfigured) {
      try {
        await processOutboundOrderEvents({
          config: env.pancake,
          client: createPancakeClient(env.pancake),
          syncRepository: pancakeOrderSyncRepository
        });
      } catch (error) {
        console.error('J&T Pancake status update remains queued for retry:', error?.message || error);
      }
    }

    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="JNT_Orders_${exportedAt.slice(0, 10)}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/export', async (req, res, next) => {
  try {
    const filtered = filterAndSortOrders(await listOrders(), req.body || {});
    const selectedInput = Array.isArray(req.body?.orderNumbers) ? req.body.orderNumbers : [];
    const selected = new Set(selectedInput.map((value) => String(value || '').trim()).filter(Boolean));
    const orders = selected.size ? filtered.filter((order) => selected.has(order.orderNumber)) : filtered;
    if (!orders.length) return res.status(400).json({ error: 'No orders match the export selection.' });
    const syncDetails = new Map();
    for (const order of orders) {
      syncDetails.set(order.orderNumber, await pancakeOrderSyncRepository.getOrderSyncDetail(order.orderNumber));
    }
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="maria-clara-orders-${date}.csv"`);
    return res.send(`\uFEFF${ordersCsv(orders, syncDetails)}`);
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
        pancakeSyncDetail: await pancakeOrderSyncRepository.getOrderSyncDetail(order.orderNumber),
        refunds: await listOrderRefunds(order.orderNumber),
        refundProvider: paymongoRefundProvider(order)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/:orderNumber/admin-email/resend', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const result = await resendAdminNewOrderEmail(orderNumber, {
      config: env.notifications.adminOrderEmail,
      logger: console
    });
    const order = result.order;
    return res.json({
      order: {
        ...order,
        notifications: await listOrderNotifications(orderNumber),
        pancakeSyncDetail: await pancakeOrderSyncRepository.getOrderSyncDetail(orderNumber),
        refunds: await listOrderRefunds(orderNumber),
        refundProvider: paymongoRefundProvider(order)
      },
      notification: result.notification
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/:orderNumber/refunds', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const result = await requestRefund({
      orderNumber,
      amountCents: Number(req.body?.amountCents),
      reason: req.body?.reason,
      notes: req.body?.notes,
      requestKey: req.get('Idempotency-Key') || ''
    }, { config: env.paymongo, client: createPayMongoClient(env.paymongo) });
    if (result.status === 'succeeded' && env.pancake.mode === 'live' && env.pancake.apiKeyConfigured) {
      try {
        await processOutboundOrderEvents({
          config: env.pancake,
          client: createPancakeClient(env.pancake),
          syncRepository: pancakeOrderSyncRepository
        });
      } catch (error) {
        console.error('Refund Pancake update remains queued for retry:', error?.message || error);
      }
    }
    return res.status(result.status === 'duplicate' ? 200 : 201).json({
      ...result,
      order: await findOrderByNumber(orderNumber),
      refunds: await listOrderRefunds(orderNumber)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/:orderNumber/refunds/:refundId/retry', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const refund = await listOrderRefunds(orderNumber);
    if (!refund.some((item) => item.id === req.params.refundId)) {
      return res.status(404).json({ error: 'Refund record not found.' });
    }
    const result = await retryRefund(req.params.refundId, {
      config: env.paymongo,
      client: createPayMongoClient(env.paymongo)
    });
    return res.json({
      ...result,
      order: await findOrderByNumber(orderNumber),
      refunds: await listOrderRefunds(orderNumber)
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

    return res.json({
      order: {
        ...updatedOrder,
        refunds: await listOrderRefunds(orderNumber),
        refundProvider: paymongoRefundProvider(updatedOrder)
      },
      notification
    });
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
      if ((req.body?.customer !== undefined || req.body?.address !== undefined)
        && (JSON.stringify(existingOrder.customer || {}) !== JSON.stringify(order.customer || {})
          || JSON.stringify(existingOrder.address || {}) !== JSON.stringify(order.address || {}))) {
        await appendOrderStatusEvent(order.orderNumber, {
          source: 'admin',
          changes: {
            deliveryInformation: {
              from: hasCompleteDeliveryInformation(existingOrder) ? 'complete' : 'incomplete',
              to: hasCompleteDeliveryInformation(order) ? 'complete' : 'incomplete'
            }
          },
          note: 'Customer and delivery information updated by admin.'
        }, client ? { client } : {});
      }
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
      if (order.paymentMethod === 'paymongo' && order.paymentStatus === 'cancelled' && env.paymongo.configured) {
        await releaseExpiredReservations({
          client: createPayMongoClient(env.paymongo),
          orderNumbers: [order.orderNumber],
          limit: 1
        });
      }
    }
    const pancakeEvent = await enqueuePancakeOrderUpdateIfLinked(existingOrder, order);
    if (pancakeEvent?.status === 'pending' && env.pancake.mode === 'live' && env.pancake.apiKeyConfigured) {
      try {
        await processOutboundOrderEvents({
          config: env.pancake,
          client: createPancakeClient(env.pancake),
          syncRepository: pancakeOrderSyncRepository
        });
      } catch (error) {
        console.error('Immediate Pancake order update failed and remains queued:', error?.message || error);
      }
    }
    await enqueueDeliveredOrderNotifications(existingOrder, order);
    const refreshedOrder = await findOrderByNumber(orderNumber);
    return res.json({
      order: {
        ...refreshedOrder,
        notifications: await listOrderNotifications(orderNumber),
        pancakeSyncDetail: await pancakeOrderSyncRepository.getOrderSyncDetail(orderNumber),
        refunds: await listOrderRefunds(orderNumber),
        refundProvider: paymongoRefundProvider(refreshedOrder)
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
  await pancakeInventoryOutboxRepository.enqueueInventorySync(
    [...new Set(restockItems.map((item) => item.slug).filter(Boolean))],
    'admin',
    { ...options, maxAttempts: env.pancake.syncMaxAttempts }
  );
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

function paymentOperationsSummary(operations) {
  return (operations || []).reduce((summary, operation) => {
    summary.totalCount += 1;
    summary.totalAmountCents += Number(operation.totalCents || 0);
    if (['paid', 'partially_refunded', 'refunded'].includes(operation.paymentStatus)) {
      summary.paidCount += 1;
      summary.paidAmountCents += Number(operation.paidAmountCents ?? operation.totalCents ?? 0);
    }
    if (operation.paymentStatus === 'pending_payment') summary.pendingCount += 1;
    if (['failed', 'expired'].includes(operation.paymentStatus)) summary.failedCount += 1;
    summary.refundedAmountCents += Number(operation.refundedAmountCents || 0);
    return summary;
  }, {
    totalCount: 0,
    paidCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalAmountCents: 0,
    paidAmountCents: 0,
    refundedAmountCents: 0
  });
}

function paymongoRefundProvider(order = {}) {
  const policy = paymentMethodRefundPolicy(order.paymentMetadata?.paymentMethodType);
  return {
    configured: env.paymongo.configured,
    mode: env.paymongo.livemode ? 'live' : 'test',
    enabled: Boolean(env.paymongo.configured && env.paymongo.livemode),
    paymentMethodType: policy.paymentMethodType,
    supported: policy.supported,
    unavailableReason: policy.message
  };
}

function paymentOperationsCsv(operations) {
  const header = [
    'Order Number', 'Placed At', 'Payment Method', 'Payment Status', 'Total PHP',
    'Paid PHP', 'Paid At', 'Checkout Session ID', 'Payment ID', 'Refunded PHP',
    'Latest Refund Status', 'Pancake Order ID', 'Pancake Sync Status'
  ];
  const rows = (operations || []).map((operation) => [
    operation.orderNumber,
    operation.placedAt,
    operation.paymentMethod,
    operation.paymentStatus,
    (Number(operation.totalCents || 0) / 100).toFixed(2),
    (Number(operation.paidAmountCents || 0) / 100).toFixed(2),
    operation.paidAt,
    operation.checkoutSessionId,
    operation.paymentId,
    (Number(operation.refundedAmountCents || 0) / 100).toFixed(2),
    operation.latestRefundStatus,
    operation.pancakeOrderId,
    operation.pancakeSyncStatus
  ].map((value) => csvValue(value, true)).join(','));
  return [header.join(','), ...rows].join('\n');
}

function csvValue(value, protectFormula) {
  let text = value === null || value === undefined ? '' : String(value);
  if (protectFormula && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
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
    const paths = [
      file.path,
      ...PRODUCT_IMAGE_DERIVATIVE_WIDTHS.map((width) => productImageDerivativePath(file.path, width))
    ];
    for (const filePath of new Set(paths.filter(Boolean))) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  });
}

function bannerUploadDir() {
  return process.env.BANNER_UPLOAD_DIR || path.join(__dirname, '..', '..', 'public', 'uploads', 'banners');
}

function bannerUploadUrl(filename) {
  return `/uploads/banners/${filename}`;
}

function assertCollectionBannerRequest(banner) {
  const record = banner && typeof banner === 'object' ? banner : {};
  for (const field of ['link', 'buttonLink']) {
    const value = String(record[field] || '').trim();
    if (value && normalizeCollectionBannerLink(value) !== value) {
      const error = new Error(`${field === 'link' ? 'Banner' : 'Button'} link must be an internal path or an HTTP/HTTPS URL`);
      error.status = 400;
      throw error;
    }
  }
  const limits = {
    altText: 300,
    label: 120,
    title: 180,
    subtitle: 600,
    buttonText: 80,
    link: 2048,
    buttonLink: 2048
  };
  for (const [field, limit] of Object.entries(limits)) {
    if (String(record[field] || '').length > limit) {
      const error = new Error(`Collection banner ${field} is too long`);
      error.status = 400;
      throw error;
    }
  }
}

function removeReplacedCollectionBannerImage(previousUrl, nextUrl) {
  const previous = String(previousUrl || '').trim();
  if (!previous || previous === String(nextUrl || '').trim()) return;
  const prefix = '/uploads/banners/collection-banner-';
  if (!previous.startsWith(prefix)) return;
  try {
    fs.unlinkSync(path.join(bannerUploadDir(), path.basename(previous)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
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
    publicHandle: String(body.publicHandle || body.seo?.handle || body.name || body.slug || '').trim(),
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
    variants: normalizeProductVariants(body.variants),
    reviewSettings: {
      reviewsEnabled: body.reviewSettings?.reviewsEnabled === undefined ? true : Boolean(body.reviewSettings.reviewsEnabled),
      showRatingSummary: body.reviewSettings?.showRatingSummary === undefined ? true : Boolean(body.reviewSettings.showRatingSummary)
    }
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

function assertProductCsvUpload(file) {
  if (!file?.buffer?.length) throw httpError(400, 'Choose a CSV file to import.');
  if (path.extname(file.originalname || '').toLowerCase() !== '.csv') {
    throw httpError(400, 'Product import supports CSV files only. XLSX import is disabled for safety.');
  }
  if (file.buffer.includes(0)) throw httpError(400, 'The CSV file contains invalid binary data.');
}

async function selectProductsForExport(input) {
  const allProducts = await listEditableProducts();
  const filtered = await filterProductRecords(allProducts, input || {}, await activeLowStockThreshold());
  const selectedInput = Array.isArray(input?.selectedSlugs)
    ? input.selectedSlugs
    : String(input?.selectedSlugs || '').split(',');
  const selected = new Set(selectedInput.map((slug) => String(slug || '').trim()).filter(Boolean));
  return selected.size ? filtered.filter((product) => selected.has(product.slug)) : filtered;
}

async function sendProductsCsv(res, products) {
  const syncStatuses = [];
  for (let index = 0; index < products.length; index += 100) {
    syncStatuses.push(...await pancakeProductSyncRepository.listProductSyncStatuses(
      products.slice(index, index + 100).map((product) => product.slug)
    ));
  }
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="maria-clara-products-${date}.csv"`);
  return res.send(`\uFEFF${productsToCsv(products, syncStatuses)}`);
}

async function filterProductRecords(allProducts, input, lowStockThreshold) {
  const status = String(input?.status || '').trim();
  const collection = String(input?.collection || '').trim().toLowerCase();
  const category = String(input?.category || '').trim().toLowerCase();
  const vendor = String(input?.vendor || '').trim().toLowerCase();
  const search = String(input?.q || '').trim().toLowerCase();
  const stock = String(input?.stock || '').trim();
  const sort = String(input?.sort || 'name_asc').trim();
  const collectionSettings = collection ? await getStoreSettings() : null;
  const collectionDefinition = collectionSettings?.collectionDefinitions.find((item) => item.name.toLowerCase() === collection || item.slug === collection);
  const acceptedCollectionNames = new Set([
    collectionDefinition?.name || collection,
    ...(collectionDefinition?.aliases || [])
  ].map((name) => String(name || '').trim().toLowerCase()));
  const filtered = allProducts
    .filter((product) => !status || productStatus(product) === status)
    .filter((product) => !collection || product.collections.some((item) => acceptedCollectionNames.has(item.toLowerCase())))
    .filter((product) => !category || String(product.category || '').trim().toLowerCase() === category)
    .filter((product) => !vendor || String(product.vendor || '').trim().toLowerCase() === vendor)
    .filter((product) => !search || productSearchText(product).includes(search))
    .filter((product) => !stock || productStockFilter(product, lowStockThreshold) === stock);
  return filtered.slice().sort((a, b) => {
    if (sort === 'name_desc') return b.name.localeCompare(a.name);
    if (sort === 'inventory_asc') return productInventory(a) - productInventory(b);
    if (sort === 'inventory_desc') return productInventory(b) - productInventory(a);
    return a.name.localeCompare(b.name);
  });
}

function uniqueProductIdentifier(base, used) {
  const root = normalizeRouteText(base) || 'product-copy';
  let candidate = root;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${root}-${suffix++}`;
  return candidate;
}

function normalizeRouteText(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizePageNumber(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizePageSize(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function paginationRecord(total, requestedPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  return { page, pageSize, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
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

function productVariantStockChanged(previousProduct, nextProduct) {
  const previous = new Map((previousProduct?.variants || []).map((variant) => [String(variant.sku || '').trim().toUpperCase(), Number(variant.stockQuantity || 0)]));
  const next = new Map((nextProduct?.variants || []).map((variant) => [String(variant.sku || '').trim().toUpperCase(), Number(variant.stockQuantity || 0)]));
  if (previous.size !== next.size) return true;
  return [...next].some(([sku, quantity]) => previous.get(sku) !== quantity);
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
    Object.assign(changes, derivedOrderStatuses(changes.status, existingOrder));
  }
  if (body.cancellationReason !== undefined) {
    changes.cancellationReason = validateEnum(body.cancellationReason, VALID_CANCELLATION_REASONS, 'Select a valid cancellation reason.');
  }
  if (body.isTestOrder !== undefined) {
    changes.isTestOrder = Boolean(body.isTestOrder);
  }
  if (body.fulfillmentStatus !== undefined) {
    changes.fulfillmentStatus = validateEnum(body.fulfillmentStatus, VALID_FULFILLMENT_STATUSES, 'Fulfillment status is invalid');
  }
  if (body.paymentStatus !== undefined) {
    if (existingOrder.paymentMethod === 'paymongo' && String(body.paymentStatus) !== String(existingOrder.paymentStatus)) {
      const error = new Error('PayMongo payment status can only be changed by a verified PayMongo webhook.');
      error.status = 403;
      throw error;
    }
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
    // This field is admin-only. Storefront delivery notes are no longer
    // collected and this value is never sent to Pancake POS.
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

  if (changes.status === 'cancelled' && existingOrder.paymentMethod === 'paymongo') {
    changes.inventoryReservationStatus = 'released';
    if (['pending_payment', 'cod_pending'].includes(String(existingOrder.paymentStatus || ''))) {
      changes.paymentStatus = 'cancelled';
    }
  }

  const candidate = { ...existingOrder, ...changes };
  if (candidate.status === 'cancelled' && !String(candidate.cancellationReason || '').trim()) {
    const error = new Error('Select a cancellation reason before cancelling this order.');
    error.status = 400;
    error.code = 'CANCELLATION_REASON_REQUIRED';
    throw error;
  }
  const requestedProcessing = (
    (body.status !== undefined && ['confirmed', 'packed', 'shipped', 'delivered'].includes(candidate.status))
    || (body.fulfillmentStatus !== undefined && ['packed', 'shipped', 'delivered'].includes(candidate.fulfillmentStatus))
    || (body.deliveryStatus !== undefined && ['ready', 'out_for_delivery', 'delivered'].includes(candidate.deliveryStatus))
    || (body.codConfirmationStatus !== undefined && candidate.codConfirmationStatus === 'confirmed')
  );
  const missingDeliveryFields = deliveryInformationIssues(candidate);
  if (requestedProcessing && Object.keys(missingDeliveryFields).length) {
    throw new CommerceError('Complete the customer’s delivery information before processing this order.', {
      code: 'INCOMPLETE_DELIVERY_ADDRESS',
      status: 409,
      details: { fields: missingDeliveryFields }
    });
  }
  if (body.customer !== undefined || body.address !== undefined) {
    const tags = new Set(Array.isArray(changes.tags) ? changes.tags : (existingOrder.tags || []));
    if (Object.keys(missingDeliveryFields).length) tags.add('missing_delivery_information');
    else tags.delete('missing_delivery_information');
    changes.tags = [...tags];
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
    'paymentStatus',
    'paymentMethod',
    'codConfirmationStatus',
    'deliveryMethod',
    'trackingNumber'
  ]) {
    if (String(previousOrder?.[field] ?? '') !== String(nextOrder?.[field] ?? '')) fields.push(field);
  }
  if (JSON.stringify(previousOrder?.customer || {}) !== JSON.stringify(nextOrder?.customer || {})) fields.push('customer');
  if (JSON.stringify(previousOrder?.address || {}) !== JSON.stringify(nextOrder?.address || {})) fields.push('address');
  return fields;
}

function derivedOrderStatuses(status, existingOrder = {}) {
  const map = {
    received: { fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' },
    confirmed: { fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' },
    packed: { fulfillmentStatus: 'packed', deliveryStatus: 'ready' },
    shipped: { fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' },
    delivered: { fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' },
    cancelled: { fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' },
    returned: { fulfillmentStatus: 'shipped', deliveryStatus: 'returned' },
    failed: { fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' },
    unreachable: { fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }
  };
  const derived = { ...(map[status] || {}) };
  if (String(existingOrder.paymentMethod || '') === 'cash_on_delivery') {
    if (status === 'cancelled' || status === 'failed') derived.codConfirmationStatus = 'cancelled';
    if (status === 'unreachable') derived.codConfirmationStatus = 'unreachable';
    if (['confirmed', 'packed', 'shipped', 'delivered'].includes(status)) derived.codConfirmationStatus = 'confirmed';
  }
  return derived;
}

async function enqueuePancakeOrderUpdateIfLinked(previousOrder, nextOrder, { syncRepository = pancakeOrderSyncRepository } = {}) {
  const changedFields = changedPancakeFields(previousOrder, nextOrder);
  if (!changedFields.length || !nextOrder?.orderNumber) return null;
  await syncRepository.backfillSentOrderExportLinks?.({ limit: 100 });
  const detail = await syncRepository.getOrderSyncDetail(nextOrder.orderNumber);
  if (!detail?.pancakeOrderId) {
    await syncRepository.appendSyncLog({
      direction: 'outbound', entityType: 'order', entityId: nextOrder.orderNumber,
      orderNumber: nextOrder.orderNumber, level: 'warning', code: 'pancake_order_link_missing',
      message: 'Admin order update was saved locally but no Pancake order link exists.'
    });
    return { status: 'blocked', safeErrorCode: 'pancake_order_link_missing' };
  }
  const sortedFields = changedFields.sort();
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ changedFields: sortedFields, updatedAt: nextOrder.updatedAt || '' }))
    .digest('hex');
  const event = await syncRepository.enqueueSyncEvent({
    direction: 'outbound',
    entityType: 'order',
    entityId: nextOrder.orderNumber,
    orderNumber: nextOrder.orderNumber,
    pancakeOrderId: detail.pancakeOrderId,
    eventKey: `${nextOrder.orderNumber}:${sortedFields.join(',')}:${nextOrder.updatedAt || Date.now()}`,
    payloadHash,
    payload: { changedFields: sortedFields }
  });
  if (event?.status === 'pending') {
    await syncRepository.upsertOrderLink({
      ...detail,
      orderNumber: nextOrder.orderNumber,
      pancakeOrderId: detail.pancakeOrderId,
      syncStatus: 'pending_sync',
      lastLocalUpdatedAt: nextOrder.updatedAt || new Date().toISOString()
    });
    await syncRepository.appendSyncLog({
      direction: 'outbound', entityType: 'order', entityId: nextOrder.orderNumber,
      orderNumber: nextOrder.orderNumber, pancakeOrderId: detail.pancakeOrderId,
      level: 'info', code: nextOrder.status === 'cancelled'
        ? 'pancake_order_cancellation_queued'
        : 'pancake_order_update_queued',
      message: nextOrder.status === 'cancelled'
        ? 'Admin order cancellation queued for Pancake POS.'
        : 'Admin order update queued for Pancake POS.',
      metadata: { changedFields: sortedFields }
    });
  }
  return event;
}

function normalizeOrderCustomerUpdate(customer) {
  return normalizeCheckoutCustomer(customer);
}

function normalizeOrderAddressUpdate(address) {
  return normalizeDeliveryAddress(address);
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
  const customerName = normalizeCustomerName(order.customer);
  return {
    orderNumber: order.orderNumber,
    customerName: customerName.fullName,
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
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider || '',
    providerCheckoutSessionId: order.providerCheckoutSessionId || '',
    providerPaymentId: order.providerPaymentId || '',
    paidAmountCents: order.paidAmountCents,
    paidAt: order.paidAt || '',
    codConfirmationStatus: order.codConfirmationStatus || 'pending',
    itemCount: Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0,
    deliveryStatus: order.deliveryStatus || 'pending',
    deliveryMethod: order.deliveryMethod || 'Standard shipping',
    exportedToJnt: jntExport.exportedToJnt,
    jntExportedAt: jntExport.jntExportedAt,
    jntExportStatus: jntExport.status,
    jntMissingFields: jntExport.missingFields,
    missingDeliveryInformation: !hasCompleteDeliveryInformation(order),
    missingDeliveryFields: Object.keys(deliveryInformationIssues(order)),
    tags: Array.isArray(order.tags) ? order.tags : [],
    cancellationReason: order.cancellationReason || '',
    isTestOrder: Boolean(order.isTestOrder),
    placedAt: order.placedAt
  };
}

function filterAndSortOrders(orders, input = {}) {
  const status = String(input.status || '').trim();
  const fulfillmentStatus = String(input.fulfillmentStatus || '').trim();
  const paymentStatus = String(input.paymentStatus || '').trim();
  const search = String(input.q || '').trim().toLowerCase();
  const dateFilter = orderDateFilter(input);
  const sort = String(input.sort || 'placed_desc').trim();
  const missingDelivery = String(input.missingDelivery || input.missingDeliveryInformation || '').trim() === 'true';
  const isTestOrder = String(input.isTestOrder || '').trim();
  return orders
    .filter((order) => !status || order.status === status)
    .filter((order) => !fulfillmentStatus || order.fulfillmentStatus === fulfillmentStatus)
    .filter((order) => !paymentStatus || order.paymentStatus === paymentStatus)
    .filter((order) => !missingDelivery || !hasCompleteDeliveryInformation(order))
    .filter((order) => !isTestOrder || Boolean(order.isTestOrder) === (isTestOrder === 'true'))
    .filter((order) => !search || orderSearchText(order).includes(search))
    .filter((order) => matchesOrderDateFilter(order, dateFilter))
    .sort((a, b) => {
      if (sort === 'placed_asc') return new Date(a.placedAt || 0) - new Date(b.placedAt || 0);
      if (sort === 'total_desc') return Number(b.totalCents || 0) - Number(a.totalCents || 0);
      if (sort === 'total_asc') return Number(a.totalCents || 0) - Number(b.totalCents || 0);
      if (sort === 'customer_asc') return normalizeCustomerName(a.customer).fullName.localeCompare(normalizeCustomerName(b.customer).fullName);
      return new Date(b.placedAt || 0) - new Date(a.placedAt || 0);
    });
}

function orderListSummary(orders) {
  const revenueOrders = orders.filter((order) => orderCountsAsRevenue(order));
  return {
    total: orders.length,
    codPending: orders.filter((order) => order.codConfirmationStatus === 'pending' && order.status !== 'cancelled').length,
    jntReady: orders.filter((order) => jntExportSummary(order).status === 'ready').length,
    totalSalesCents: revenueOrders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0),
    totalItems: orders.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0),
    delivered: orders.filter((order) => order.status === 'delivered' || order.fulfillmentStatus === 'delivered' || order.deliveryStatus === 'delivered').length,
    missingDeliveryInformation: orders.filter((order) => !hasCompleteDeliveryInformation(order)).length
  };
}

function orderCountsAsRevenue(order) {
  if (order.isTestOrder) return false;
  if (['cancelled', 'canceled', 'failed', 'expired', 'unreachable', 'returned'].includes(String(order.status || '').toLowerCase())) return false;
  if (['failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(String(order.paymentStatus || '').toLowerCase())) return false;
  if (order.paymentMethod === 'paymongo') return ['paid', 'partially_refunded'].includes(String(order.paymentStatus || ''));
  return Number(order.totalCents || 0) > 0;
}

function ordersCsv(orders, syncDetails = new Map()) {
  const header = [
    'Order Number', 'Placed At', 'Order Status', 'Fulfillment Status', 'Delivery Status',
    'First Name', 'Last Name', 'Customer Name', 'Phone', 'Email', 'Address', 'Barangay',
    'City', 'Province', 'ZIP Code', 'Product Name', 'SKU', 'Variant', 'Quantity',
    'Unit Price PHP', 'Line Total PHP', 'Subtotal PHP', 'Discount PHP', 'Shipping PHP',
    'Total PHP', 'Payment Method', 'Payment Status', 'COD Status', 'PayMongo Checkout Session ID',
    'PayMongo Payment ID', 'Paid Amount PHP', 'Paid At', 'Courier', 'Tracking Number',
    'Pancake Order ID', 'Pancake Sync Status', 'Pancake Last Synced At', 'Pancake Last Error',
    'Cancellation Reason', 'Test Order'
  ];
  const rows = [];
  for (const order of orders) {
    const customer = normalizeCustomerName(order.customer);
    const items = Array.isArray(order.items) && order.items.length ? order.items : [{}];
    const sync = syncDetails.get(order.orderNumber) || {};
    for (const item of items) {
      rows.push([
        order.orderNumber, order.placedAt, order.status, order.fulfillmentStatus, order.deliveryStatus,
        customer.firstName, customer.lastName, customer.fullName, order.customer?.phone || '', order.customer?.email || '',
        order.address?.addressLine || '', order.address?.barangay || '', order.address?.city || '',
        order.address?.province || '', order.address?.postalCode || '', item.productName || '', item.sku || '',
        item.size || '', item.quantity || '', moneyCsv(item.unitPriceCents),
        moneyCsv(Number(item.unitPriceCents || 0) * Number(item.quantity || 0)), moneyCsv(order.subtotalCents),
        moneyCsv(order.discountTotalCents), moneyCsv(order.shippingFeeCents), moneyCsv(order.totalCents),
        order.paymentMethod, order.paymentStatus, order.codConfirmationStatus, order.providerCheckoutSessionId || '',
        order.providerPaymentId || '', moneyCsv(order.paidAmountCents), order.paidAt || '',
        order.deliveryMethod || '', order.trackingNumber || '', sync.pancakeOrderId || '',
        sync.syncStatus || 'not_linked', sync.lastSyncedAt || '', sync.safeErrorCode || '',
        order.cancellationReason || '', order.isTestOrder ? 'Yes' : 'No'
      ]);
    }
  }
  return [header, ...rows].map((row) => row.map((value) => csvValue(value, true)).join(',')).join('\r\n') + '\r\n';
}

function moneyCsv(cents) {
  if (cents === null || cents === undefined || cents === '') return '';
  return (Number(cents || 0) / 100).toFixed(2);
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
    normalizeCustomerName(order.customer).fullName,
    order.customer?.phone,
    order.customer?.email,
    order.address?.addressLine,
    order.trackingNumber,
    order.deliveryMethod,
    ...(order.items || []).flatMap((item) => [item.productName, item.sku, item.size])
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

module.exports = {
  adminRouter: router,
  enqueuePancakeOrderUpdateIfLinked,
  filterAndSortOrders,
  normalizeOrderUpdate,
  orderSummary
};
