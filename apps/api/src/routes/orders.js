const express = require('express');
const crypto = require('node:crypto');
const { findCatalogProductBySlug } = require('../products/catalogPresenter');
const { deductVariantStock } = require('../products/catalogRepository');
const {
  claimOrderMetaBrowserPurchase,
  completeOrderMetaBrowserPurchase,
  findOrderByIdempotencyKey,
  findOrderByNumber,
  saveOrder
} = require('../orders/orderRepository');
const { appendInventoryMovements } = require('../inventory/inventoryMovementRepository');
const { markCartSessionConverted } = require('../cartSessions/cartSessionRepository');
const { incrementDiscountUsage } = require('../discounts/discountRepository');
const { claimDiscountUsage } = require('../discounts/discountRepository');
const { quoteCart } = require('../promos/promoEngine');
const { findAccountById, verifyCustomerToken } = require('../customers/customerAccountRepository');
const { findAuthSession } = require('../auth/sessionRepository');
const { isProduction, sessionTokenFromRequest } = require('../auth/sessionHttp');
const { getStoreSettings, listEnabledPaymentMethodIds } = require('../settings/storeSettingsRepository');
const { hasDatabaseUrl, transaction } = require('../db/postgres');
const { env } = require('../config/env');
const { persistPostgresCheckout } = require('../orders/checkoutService');
const { META_CURRENCY, metaPurchaseEventId, parseMetaCookies, purchaseValue } = require('../marketing/metaEvent');
const {
  claimBrowserMetaPurchase,
  completeBrowserMetaPurchase,
  defaultBrowserPurchaseDependencies,
  queueMetaPurchase
} = require('../marketing/metaPurchaseService');
const pancakeOrderExportRepository = require('../integrations/pancake/pancakeOrderExportRepository');
const pancakeInventoryOutboxRepository = require('../integrations/pancake/pancakeInventoryOutboxRepository');
const { processInventorySyncJobs } = require('../integrations/pancake/pancakeInventoryOutboxService');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const { runOrderLiveExport } = require('../integrations/pancake/pancakeOrderExportService');
const { placeAuthoritativeCheckout } = require('../checkout/authoritativeCheckoutService');
const { claimIdempotency, completeIdempotency, hashIdempotencyKey } = require('../checkout/checkoutIdempotencyRepository');
const { findCheckoutQuoteForUpdate, consumeCheckoutQuote } = require('../checkout/checkoutQuoteRepository');
const { buildAuthoritativeQuote } = require('../checkout/checkoutQuoteService');
const { deriveConfirmationToken, hashConfirmationToken, verifyConfirmationToken } = require('../checkout/confirmationToken');
const { sha256Object } = require('../checkout/requestHash');
const { CommerceError } = require('../checkout/commerceError');
const { customerFullName, normalizeCustomerName } = require('../customers/customerName');
const { enqueueAdminNewOrderEmail } = require('../notifications/adminOrderEmailNotificationService');
const { enqueueOrderConfirmationNotifications } = require('../notifications/orderNotificationService');
const { requireCompleteDeliveryInformation } = require('../checkout/deliveryDetails');

const { enqueueOrderExport } = pancakeOrderExportRepository;

const legacyRouter = express.Router();

legacyRouter.get('/:orderNumber', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const order = await findOrderByNumber(orderNumber);

    if (!order) {
      return res.status(404).json({ error: 'Order confirmation not found' });
    }

    return res.json({ order: orderConfirmationPayload(order) });
  } catch (error) {
    return next(error);
  }
});

legacyRouter.post('/', async (req, res, next) => {
  try {
    const storeSettings = await getStoreSettings();
    if (storeSettings.website.maintenanceMode) {
      return res.status(503).json({ error: 'Store is under maintenance.' });
    }
    const order = await normalizeCheckout(req.body);
    const orderNumber = createOrderNumber();
    const customerAccountId = await resolveCustomerAccountId(req);
    const persistedOrder = {
      ...order,
      orderNumber,
      metaPurchaseEventId: metaPurchaseEventId({ orderNumber }),
      metaPurchaseTrackingVersion: 2,
      metaBrowserPurchaseClaimId: '',
      metaBrowserPurchaseClaimedAt: '',
      metaBrowserPurchaseSentAt: '',
      metaCapiPurchaseQueuedAt: '',
      metaCapiPurchaseSentAt: '',
      metaPurchaseStatus: 'eligible',
      metaPurchaseLastError: '',
      metaPurchaseValue: purchaseValue(order.totalCents),
      metaPurchaseCurrency: META_CURRENCY,
      currency: META_CURRENCY,
      channel: 'Online Store',
      codConfirmationStatus: 'pending',
      deliveryStatus: 'pending',
      deliveryMethod: 'Standard shipping',
      trackingNumber: '',
      tags: [],
      notes: '',
      customerAccountId,
      placedAt: new Date().toISOString()
    };
    const stockItems = order.items.map((item) => ({
      slug: String(item.productId).replace(/^catalog-/, ''),
      sku: item.sku,
      size: item.size,
      quantity: item.quantity,
      productName: item.productName
    }));
    const movements = order.items.map((item) => ({
      orderNumber,
      source: 'order',
      reason: 'order_created',
      productSlug: String(item.productId).replace(/^catalog-/, ''),
      productName: item.productName,
      sku: item.sku,
      size: item.size,
      quantityChange: -Math.abs(Number(item.quantity || 0))
    }));
    let completedOrder = persistedOrder;

    if (hasDatabaseUrl()) {
      const cookies = parseMetaCookies(req.headers.cookie);
      completedOrder = await persistPostgresCheckout({
        persistedOrder,
        cartSessionId: req.body?.cartSessionId,
        stockItems,
        movements,
        discountCode: persistedOrder.discountCode,
        requestContext: {
          ...cookies,
          clientIp: req.ip,
          clientUserAgent: req.get('user-agent') || '',
          sourceUrl: checkoutSourceUrl(req)
        }
      }, {
        transaction,
        findByIdempotencyKey: findOrderByIdempotencyKey,
        deductStock: deductVariantStock,
        saveOrder,
        appendMovements: appendInventoryMovements,
        convertCart: markCartSessionConverted,
        incrementDiscount: incrementDiscountUsage,
        enqueueOrderExport,
        enqueueAdminEmail: enqueueAdminNewOrderEmail,
        enqueueCustomerConfirmation: enqueueOrderConfirmationNotifications,
        queueMetaPurchase: (input) => queueMetaPurchase(input, { logger: console }),
        metaEnabled: env.meta.enabled
      });
    } else {
      await deductVariantStock(stockItems);
      await saveOrder(persistedOrder);
      await appendInventoryMovements(movements);
      await markCartSessionConverted(req.body?.cartSessionId, orderNumber);
      if (persistedOrder.discountCode) {
        await incrementDiscountUsage(persistedOrder.discountCode);
      }
      await enqueueOrderExport(persistedOrder);
      try {
        await enqueueAdminNewOrderEmail(persistedOrder);
      } catch (_error) {
        console.error('Admin order email could not be queued.', {
          orderNumber: persistedOrder.orderNumber,
          eventName: 'admin_new_order',
          status: 'queue_failed'
        });
      }
      try {
        await enqueueOrderConfirmationNotifications(persistedOrder);
      } catch (_error) {
        console.error('Customer order confirmation could not be queued.', {
          orderNumber: persistedOrder.orderNumber,
          eventName: 'order_received',
          status: 'queue_failed'
        });
      }
    }

    try {
      await (req.exportPancakeOrderNow || exportPancakeOrderNow)(completedOrder.orderNumber);
    } catch (error) {
      console.error('Realtime Pancake order export failed:', error?.message || error);
    }

    res.status(201).json({
      orderNumber: completedOrder.orderNumber,
      trackingEventId: metaPurchaseEventId(completedOrder),
      currency: META_CURRENCY,
      totalCents: completedOrder.totalCents,
      items: completedOrder.items.map((item) => ({
        variantId: item.variantId,
        externalPosVariantId: item.externalPosVariantId || '',
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents
      })),
      syncStatus: 'frontend_only',
      checkoutChannel: order.checkoutChannel,
      paymentMethod: order.paymentMethod,
      shippingRegion: order.shippingRegion,
      freeShippingUnlocked: order.freeShippingUnlocked,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentStatus: order.paymentStatus
    });
  } catch (error) {
    next(error);
  }
});

function checkoutSourceUrl(req) {
  const origin = String(req.get('origin') || '').trim();
  if (!/^https?:\/\//i.test(origin)) return '';
  try {
    return new URL('/checkout', origin).toString();
  } catch (_error) {
    return '';
  }
}

function createOrderNumber() {
  return `MCC-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function orderConfirmationPayload(order) {
  return {
    orderNumber: order.orderNumber,
    trackingEventId: order.metaPurchaseEventId || metaPurchaseEventId(order),
    customerName: customerFullName(order.customer),
    paymentMethod: 'Cash on Delivery',
    addressLine: order.address.addressLine,
    shippingRegionLabel: order.shippingRegionLabel,
    shippingFeeCents: order.shippingFeeCents,
    totalCents: order.totalCents,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    codConfirmationStatus: order.codConfirmationStatus || 'pending',
    placedAt: order.placedAt,
    customer: order.customer,
    address: order.address,
    items: order.items,
    subtotalCents: order.subtotalCents,
    discountCode: order.discountCode || '',
    discountTotalCents: order.discountTotalCents,
    discountSnapshot: order.discountSnapshot || {},
    cartSnapshot: order.cartSnapshot,
    checkoutChannel: order.checkoutChannel,
    shippingRegion: order.shippingRegion,
    freeShippingUnlocked: order.freeShippingUnlocked,
    adminEditableTotals: order.adminEditableTotals
  };
}

async function normalizeCheckout(body) {
  // Validate normalized values before cart pricing, inventory deduction, order
  // persistence, Meta dispatch, email queuing, or Pancake export. In
  // particular, whitespace-only strings cannot pass this boundary.
  const delivery = requireCompleteDeliveryInformation({
    customer: body.customer,
    address: body.address
  });

  if (!Array.isArray(body.items) || body.items.length === 0) {
    const error = new Error('Cart is empty');
    error.status = 400;
    throw error;
  }

  const items = await Promise.all(body.items.map(normalizeCheckoutItem));
  const quote = await quoteCart({
    items,
    discountCode: body.discountCode,
    shippingFeeCents: body.shippingFeeCents
  });
  const checkoutChannel = ['storefront_cart', 'storefront_checkout'].includes(body.checkoutChannel)
    ? body.checkoutChannel
    : 'storefront_checkout';
  const paymentMethod = body.paymentMethod ? String(body.paymentMethod).trim() : 'cash_on_delivery';
  const enabledPaymentMethods = await listEnabledPaymentMethodIds();
  if (!enabledPaymentMethods.includes(paymentMethod)) {
    const error = new Error('Payment method is not available.');
    error.status = 400;
    throw error;
  }
  const shippingRegion = body.shippingRegion ? String(body.shippingRegion).trim() : '';
  const shippingRegionLabel = body.shippingRegionLabel ? String(body.shippingRegionLabel).trim() : '';
  const freeShippingUnlocked = quote.freeShippingUnlocked || Boolean(body.freeShippingUnlocked);

  return {
    customer: delivery.customer,
    address: delivery.address,
    items,
    subtotalCents: quote.subtotalCents,
    discountCode: quote.discountCode,
    discountTotalCents: quote.discountTotalCents,
    discountSnapshot: quote.discountSnapshot,
    shippingFeeCents: quote.shippingFeeCents,
    shippingRegion,
    shippingRegionLabel,
    freeShippingUnlocked,
    totalCents: quote.totalCents,
    cartSnapshot: items.map((item) => ({ ...item })),
    checkoutChannel,
    paymentMethod,
    adminEditableTotals: {
      subtotalCents: quote.subtotalCents,
      discountTotalCents: quote.discountTotalCents,
      shippingFeeCents: quote.shippingFeeCents,
      shippingRegion,
      shippingRegionLabel,
      freeShippingUnlocked,
      totalCents: quote.totalCents
    },
    notes: '',
    status: 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'cod_pending'
  };
}

async function resolveCustomerAccountId(req) {
  const sessionToken = sessionTokenFromRequest(req, 'customer');
  const session = sessionToken ? await findAuthSession(sessionToken) : null;
  if (session?.actorType === 'customer') {
    const account = await findAccountById(session.actorId);
    if (account) return account.id;
  }

  if (isProduction()) return '';

  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  const accountId = verifyCustomerToken(header.slice(7));
  if (!accountId) return '';
  const account = await findAccountById(accountId);
  return account ? account.id : '';
}

async function normalizeCheckoutItem(item) {
  const quantity = Number(item.quantity);
  const unitPriceCents = Number(item.unitPriceCents);

  if (!item.productId || !item.variantId || !item.productName || !item.size || quantity <= 0 || unitPriceCents < 0) {
    const error = new Error('Cart item is invalid');
    error.status = 400;
    throw error;
  }

  const productSlug = String(item.productId).replace(/^catalog-/, '');
  const product = await findCatalogProductBySlug(productSlug);
  const variant = product?.variants.find((candidate) => candidate.id === item.variantId);

  if (!product || !variant) {
    const error = new Error('Cart item is no longer available');
    error.status = 400;
    throw error;
  }

  if (Number(variant.stockQuantity) < quantity) {
    const requestedSize = String(item.size || variant.size || '').trim();
    const error = new Error(`${requestedSize} is sold out for ${product.name}`);
    error.status = 400;
    throw error;
  }

  if (unitPriceCents !== Number(product.priceCents)) {
    const error = new Error('Cart item price has changed');
    error.status = 400;
    throw error;
  }

  return {
    productId: product.id,
    variantId: variant.id,
    productName: product.name,
    size: variant.size,
    imageUrl: typeof product.images?.[0] === 'string'
      ? product.images[0]
      : String(product.images?.[0]?.url || ''),
    sku: variant.sku,
    externalPosVariantId: variant.externalPosVariantId || '',
    quantity,
    unitPriceCents: product.priceCents
  };
}

function notFoundConfirmation(res) {
  return res.status(404).json({
    error: 'Order confirmation not found',
    code: 'confirmation_not_found'
  });
}

function publicOrderPayload(order) {
  return {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    totalCents: order.totalCents,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus
  };
}

function privateOrderPayload(order) {
  const customerName = normalizeCustomerName(order.customer);
  const paymentMethodLabel = order.paymentMethod === 'cash_on_delivery'
    ? 'Cash on Delivery'
    : String(order.paymentMethod || '').replaceAll('_', ' ');
  return {
    orderNumber: order.orderNumber,
    trackingEventId: order.metaPurchaseEventId || metaPurchaseEventId(order),
    customerName: customerName.fullName,
    customerFirstName: customerName.firstName,
    customerLastName: customerName.lastName,
    addressLine: order.address?.addressLine || '',
    address: order.address || {},
    paymentMethod: order.paymentMethod,
    paymentMethodLabel,
    shippingRegionLabel: order.shippingRegionLabel || '',
    shippingFeeCents: order.shippingFeeCents,
    items: order.items || [],
    subtotalCents: order.subtotalCents,
    discountCode: order.discountCode || '',
    discountTotalCents: order.discountTotalCents,
    totalCents: order.totalCents,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider || '',
    providerCheckoutSessionId: order.providerCheckoutSessionId || '',
    providerPaymentId: order.providerPaymentId || '',
    paidAmountCents: order.paidAmountCents,
    paidAt: order.paidAt || '',
    paymentExpiresAt: order.paymentExpiresAt || '',
    placedAt: order.placedAt
  };
}

function defaultAuthoritativeDependencies(req) {
  return {
    now: () => new Date(),
    confirmationSecret: env.checkout.confirmationSecret,
    idempotencyTtlMs: env.checkout.idempotencyTtlMs,
    hashRequest: sha256Object,
    hashKey: hashIdempotencyKey,
    createOrderNumber,
    transaction,
    claimIdempotency,
    loadQuote: findCheckoutQuoteForUpdate,
    refreshQuote: buildAuthoritativeQuote,
    deductStock: deductVariantStock,
    saveOrder,
    appendMovements: appendInventoryMovements,
    convertCart: markCartSessionConverted,
    claimPromo: claimDiscountUsage,
    insertMeta: async (client, order, requestContext) => {
      const result = await queueMetaPurchase({
        client, order, requestContext, enabled: env.meta.enabled
      }, { logger: console });
      return result.outbox;
    },
    enqueueOrderExport,
    enqueueAdminEmail: enqueueAdminNewOrderEmail,
    enqueueCustomerConfirmation: enqueueOrderConfirmationNotifications,
    enqueueInventorySync: (slugs, source, options) => pancakeInventoryOutboxRepository.enqueueInventorySync(slugs, source, {
      ...options,
      maxAttempts: env.pancake.syncMaxAttempts
    }),
    consumeQuote: consumeCheckoutQuote,
    completeIdempotency,
    deriveToken: deriveConfirmationToken,
    hashToken: hashConfirmationToken
  };
}

async function exportPancakeOrderNow(orderNumber) {
  if (env.pancake.mode !== 'live') {
    return { status: 'skipped', reason: 'pancake_mode_not_live' };
  }
  return runOrderLiveExport({
    config: env.pancake,
    client: createPancakeClient(env.pancake),
    repository: pancakeOrderExportRepository,
    orderNumber
  });
}

async function syncOrderInventoryNow(orderNumber) {
  if (env.pancake.mode !== 'live') return { status: 'skipped', reason: 'pancake_mode_not_live' };
  const order = await findOrderByNumber(orderNumber, { includeRelated: false });
  const productSlugs = [...new Set((order?.items || []).map((item) => String(item.productId || '').replace(/^catalog-/, '')).filter(Boolean))];
  if (!productSlugs.length) return { status: 'complete', processedCount: 0 };
  return processInventorySyncJobs({
    config: env.pancake,
    client: createPancakeClient(env.pancake),
    repository: pancakeInventoryOutboxRepository,
    productSlugs
  });
}

const DEFAULT_ROUTE_DEPENDENCIES = {
  authoritativeDependencies: defaultAuthoritativeDependencies,
  exportPancakeOrderNow,
  findOrderByNumber,
  getStoreSettings,
  logger: console,
  claimBrowserMetaPurchase: (input) => claimBrowserMetaPurchase(input, defaultBrowserPurchaseDependencies({
    claimOrder: claimOrderMetaBrowserPurchase,
    completeClaim: completeOrderMetaBrowserPurchase
  })),
  completeBrowserMetaPurchase: (input) => completeBrowserMetaPurchase(input, defaultBrowserPurchaseDependencies({
    claimOrder: claimOrderMetaBrowserPurchase,
    completeClaim: completeOrderMetaBrowserPurchase
  })),
  placeAuthoritativeCheckout,
  resolveCustomerAccountId,
  verifyConfirmationToken,
  v2Required: env.checkout.v2Required
};

function createOrderRouter(overrides = {}) {
  const dependencies = { ...DEFAULT_ROUTE_DEPENDENCIES, ...overrides };
  const router = express.Router();

  router.post('/:orderNumber/meta-purchase/claim', async (req, res, next) => {
    try {
      const result = await dependencies.claimBrowserMetaPurchase({
        orderNumber: String(req.params.orderNumber || '').trim(),
        confirmationToken: String(req.get('X-Order-Confirmation') || '')
      });
      if (!result) return notFoundConfirmation(res);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/:orderNumber/meta-purchase/complete', async (req, res, next) => {
    try {
      const result = await dependencies.completeBrowserMetaPurchase({
        orderNumber: String(req.params.orderNumber || '').trim(),
        confirmationToken: String(req.get('X-Order-Confirmation') || ''),
        claimId: String(req.body?.claimId || '').trim(),
        sent: req.body?.sent === true
      });
      if (!result) return notFoundConfirmation(res);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:orderNumber/confirmation', async (req, res, next) => {
    try {
      const order = await dependencies.findOrderByNumber(String(req.params.orderNumber || '').trim());
      const token = String(req.get('X-Order-Confirmation') || '');
      if (!order || !dependencies.verifyConfirmationToken(token, order.confirmationTokenHash)) {
        return notFoundConfirmation(res);
      }
      return res.json({ order: privateOrderPayload(order) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:orderNumber', async (req, res, next) => {
    try {
      const order = await dependencies.findOrderByNumber(String(req.params.orderNumber || '').trim());
      if (!order) return notFoundConfirmation(res);
      return res.json({ order: publicOrderPayload(order) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const settings = await dependencies.getStoreSettings();
      if (settings.website.maintenanceMode) {
        return res.status(503).json({ error: 'Store is under maintenance.' });
      }
      if (req.body?.quoteId) {
        const paymentMethod = String(req.body?.paymentMethod || 'cash_on_delivery').trim();
        const enabledPaymentMethods = Array.isArray(settings.payments?.methods)
          ? settings.payments.methods.filter((method) => method.enabled).map((method) => method.id)
          : ['cash_on_delivery'];
        if (!enabledPaymentMethods.includes(paymentMethod)) {
          throw new CommerceError('Payment method is not available.', {
            code: 'payment_method_unavailable', status: 400
          });
        }
        if (paymentMethod === 'paymongo') {
          throw new CommerceError('Use the secure PayMongo checkout endpoint.', {
            code: 'paymongo_checkout_required', status: 400
          });
        }
        const customerAccountId = await dependencies.resolveCustomerAccountId(req);
        const cookies = parseMetaCookies(req.headers.cookie);
        const result = await dependencies.placeAuthoritativeCheckout({
          ...req.body,
          customerAccountId,
          idempotencyKey: req.get('Idempotency-Key') || '',
          requestContext: {
            ...cookies,
            clientIp: req.ip,
            clientUserAgent: req.get('user-agent') || '',
            sourceUrl: checkoutSourceUrl(req)
          }
        }, dependencies.authoritativeDependencies(req));
        try {
          const pancakeExport = await dependencies.exportPancakeOrderNow(result.orderNumber);
          if (Number(pancakeExport?.summary?.sentCount || 0) > 0) {
            await syncOrderInventoryNow(result.orderNumber);
          }
        } catch (error) {
          dependencies.logger?.error?.('Realtime Pancake order/inventory sync failed:', error?.message || error);
        }
        return res.status(201).json(result);
      }
      if (dependencies.v2Required) {
        throw new CommerceError('Refresh checkout to continue.', {
          code: 'checkout_upgrade_required', status: 409
        });
      }
      req.exportPancakeOrderNow = dependencies.exportPancakeOrderNow;
      return legacyRouter.handle(req, res, next);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const orderRouter = createOrderRouter();

module.exports = {
  createOrderRouter,
  defaultAuthoritativeDependencies,
  exportPancakeOrderNow,
  orderRouter,
  normalizeCheckout,
  privateOrderPayload,
  publicOrderPayload,
  resolveCustomerAccountId,
  syncOrderInventoryNow
};
