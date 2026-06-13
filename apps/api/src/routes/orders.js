const express = require('express');
const crypto = require('node:crypto');
const { findCatalogProductBySlug } = require('../products/catalogPresenter');
const { findOrderByNumber, saveOrder } = require('../orders/orderRepository');
const {
  computeDiscountCents,
  discountValidationError,
  findDiscountByCode,
  incrementDiscountUsage
} = require('../discounts/discountRepository');
const { findAccountById, verifyCustomerToken } = require('../customers/customerAccountRepository');
const { getStoreSettings, listEnabledPaymentMethodIds } = require('../settings/storeSettingsRepository');

const router = express.Router();

router.get('/:orderNumber', async (req, res, next) => {
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

router.post('/', async (req, res, next) => {
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
      channel: 'Online Store',
      codConfirmationStatus: 'pending',
      deliveryStatus: 'pending',
      deliveryMethod: 'Standard shipping',
      trackingNumber: '',
      tags: [],
      notes: order.notes || '',
      customerAccountId,
      placedAt: new Date().toISOString()
    };
    await saveOrder(persistedOrder);

    if (persistedOrder.discountCode) {
      await incrementDiscountUsage(persistedOrder.discountCode);
    }

    res.status(201).json({
      orderNumber,
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

function createOrderNumber() {
  return `DEMO-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function orderConfirmationPayload(order) {
  return {
    orderNumber: order.orderNumber,
    customerName: order.customer.fullName,
    paymentMethod: 'Cash on Delivery',
    addressLine: order.address.addressLine,
    shippingRegionLabel: order.shippingRegionLabel,
    shippingFeeCents: order.shippingFeeCents,
    totalCents: order.totalCents,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    codConfirmationStatus: order.codConfirmationStatus || 'pending',
    notes: order.notes || '',
    placedAt: order.placedAt,
    customer: order.customer,
    address: order.address,
    items: order.items,
    subtotalCents: order.subtotalCents,
    discountCode: order.discountCode || '',
    discountTotalCents: order.discountTotalCents,
    cartSnapshot: order.cartSnapshot,
    checkoutChannel: order.checkoutChannel,
    shippingRegion: order.shippingRegion,
    freeShippingUnlocked: order.freeShippingUnlocked,
    adminEditableTotals: order.adminEditableTotals
  };
}

async function normalizeCheckout(body) {
  if (!body.customer?.fullName || !body.customer?.phone) {
    const error = new Error('Full name and mobile number are required');
    error.status = 400;
    throw error;
  }

  if (
    !body.address?.addressLine ||
    !body.address?.houseAddress ||
    !body.address?.barangay ||
    !body.address?.city ||
    !body.address?.province
  ) {
    const error = new Error('House address, barangay, city/municipality, and province are required');
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    const error = new Error('Cart is empty');
    error.status = 400;
    throw error;
  }

  const items = await Promise.all(body.items.map(normalizeCheckoutItem));
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const { discountCode, discountTotalCents } = await resolveCheckoutDiscount(body, subtotalCents);
  const shippingFeeCents = Math.max(0, Number(body.shippingFeeCents || 0));
  const totalCents = subtotalCents - discountTotalCents + shippingFeeCents;
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
  const freeShippingUnlocked = Boolean(body.freeShippingUnlocked);
  const notes = body.notes ? String(body.notes).trim() : '';

  return {
    customer: {
      fullName: String(body.customer.fullName).trim(),
      phone: String(body.customer.phone).trim(),
      email: body.customer.email ? String(body.customer.email).trim() : ''
    },
    address: {
      addressLine: String(body.address.addressLine || '').trim(),
      houseAddress: String(body.address.houseAddress || '').trim(),
      barangay: String(body.address.barangay || '').trim(),
      city: String(body.address.city || '').trim(),
      province: String(body.address.province || '').trim(),
      country: String(body.address.country || 'Philippines').trim(),
      postalCode: String(body.address.postalCode || '').trim()
    },
    items,
    subtotalCents,
    discountCode,
    discountTotalCents,
    shippingFeeCents,
    shippingRegion,
    shippingRegionLabel,
    freeShippingUnlocked,
    totalCents,
    cartSnapshot: items.map((item) => ({ ...item })),
    checkoutChannel,
    paymentMethod,
    adminEditableTotals: {
      subtotalCents,
      discountTotalCents,
      shippingFeeCents,
      shippingRegion,
      shippingRegionLabel,
      freeShippingUnlocked,
      totalCents
    },
    notes,
    status: 'received',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'cod_pending'
  };
}

async function resolveCustomerAccountId(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  const accountId = verifyCustomerToken(header.slice(7));
  if (!accountId) return '';
  const account = await findAccountById(accountId);
  return account ? account.id : '';
}

async function resolveCheckoutDiscount(body, subtotalCents) {
  const code = String(body.discountCode || '').trim();

  if (!code) {
    // No code: keep legacy behavior (client-sent value, admin-editable totals).
    return { discountCode: '', discountTotalCents: Math.max(0, Number(body.discountTotalCents || 0)) };
  }

  const discount = await findDiscountByCode(code);
  const validationError = discountValidationError(discount, subtotalCents);

  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }

  return {
    discountCode: discount.code,
    discountTotalCents: computeDiscountCents(discount, subtotalCents)
  };
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
    const error = new Error(`${variant.size} is sold out for ${product.name}`);
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
    quantity,
    unitPriceCents: product.priceCents
  };
}

module.exports = { orderRouter: router };
