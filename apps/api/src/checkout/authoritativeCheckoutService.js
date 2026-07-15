const { CommerceError } = require('./commerceError');
const { metaPurchaseEventId } = require('../marketing/metaEvent');
const {
  normalizeCheckoutCustomer,
  requireCompleteDeliveryInformation
} = require('./deliveryDetails');

function fail(message, code, status = 409, details) {
  throw new CommerceError(message, { code, status, details });
}

function normalizedRequest(input) {
  return {
    quoteId: String(input.quoteId || '').trim(),
    cartSessionId: String(input.cartSessionId || '').trim(),
    customer: normalizeCheckoutCustomer(input.customer),
    paymentMethod: String(input.paymentMethod || 'cash_on_delivery').trim()
  };
}

function currentTotals(snapshot) {
  return {
    subtotalCents: snapshot.subtotalCents,
    discountTotalCents: snapshot.discountTotalCents,
    shippingFeeCents: snapshot.shippingFeeCents,
    totalCents: snapshot.totalCents
  };
}

function manualDiscountCode(snapshot) {
  const method = snapshot?.discountSnapshot?.method || (snapshot?.discountCode ? 'code' : '');
  return method === 'code' ? snapshot.discountCode || '' : '';
}

function buildOrder(input, request, quote, orderNumber, tokenHash, now) {
  const snapshot = quote.snapshot;
  const paymentMethod = String(input.paymentMethod || 'cash_on_delivery');
  return {
    orderNumber,
    metaPurchaseEventId: metaPurchaseEventId({ orderNumber }),
    metaPurchaseTrackingVersion: 2,
    metaBrowserPurchaseClaimId: '',
    metaBrowserPurchaseClaimedAt: '',
    metaBrowserPurchaseSentAt: '',
    metaCapiPurchaseQueuedAt: '',
    metaCapiPurchaseSentAt: '',
    metaPurchaseStatus: paymentMethod === 'paymongo' ? 'pending_payment' : 'eligible',
    metaPurchaseLastError: '',
    customer: request.customer,
    address: snapshot.address,
    items: snapshot.items,
    subtotalCents: snapshot.subtotalCents,
    discountCode: snapshot.discountCode || '',
    discountTotalCents: snapshot.discountTotalCents,
    discountSnapshot: snapshot.discountSnapshot || {},
    shippingFeeCents: snapshot.shippingFeeCents,
    shippingRegion: snapshot.shippingRegion,
    shippingRegionLabel: snapshot.shippingRegionLabel,
    freeShippingUnlocked: Boolean(snapshot.freeShippingUnlocked),
    totalCents: snapshot.totalCents,
    parcelWeightGrams: Number(snapshot.parcelWeightGrams || 0),
    parcelWeightOverrideGrams: null,
    cartSnapshot: snapshot.items,
    checkoutChannel: 'storefront_checkout',
    paymentMethod,
    paymentProvider: input.paymentMethod === 'paymongo' ? 'paymongo' : '',
    channel: 'Online Store',
    status: input.paymentMethod === 'paymongo' ? 'pending_payment' : 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: input.paymentMethod === 'cash_on_delivery' ? 'cod_pending' : 'pending_payment',
    paymentExpiresAt: input.paymentExpiresAt || null,
    inventoryReservationStatus: input.paymentMethod === 'paymongo' ? 'reserved' : 'committed',
    paymentMetadata: input.paymentMethod === 'paymongo'
      ? { metaRequestContext: input.requestContext || {} }
      : {},
    codConfirmationStatus: 'pending',
    deliveryStatus: 'pending',
    deliveryMethod: 'Standard shipping',
    trackingNumber: '',
    tags: [],
    // Historical orders may retain notes in storage, but checkout no longer
    // collects or persists customer delivery notes for new orders.
    notes: '',
    customerAccountId: String(input.customerAccountId || ''),
    confirmationTokenHash: tokenHash,
    confirmationTokenCreatedAt: now.toISOString(),
    placedAt: now.toISOString(),
    adminEditableTotals: currentTotals(snapshot)
  };
}

function checkoutResponse(order) {
  return {
    orderNumber: order.orderNumber,
    trackingEventId: order.metaPurchaseEventId || metaPurchaseEventId(order),
    currency: 'PHP',
    totalCents: order.totalCents,
    items: order.items.map((item) => ({
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
  };
}

async function placeAuthoritativeCheckout(input = {}, deps) {
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    fail('Idempotency-Key must be between 16 and 200 characters.', 'idempotency_key_invalid', 400);
  }
  const request = normalizedRequest(input);
  if (!request.quoteId || !request.cartSessionId) {
    fail('Quote and cart session are required.', 'checkout_invalid', 400);
  }
  const now = deps.now();
  const requestHash = deps.hashRequest(request);
  const keyHash = deps.hashKey(idempotencyKey);

  return deps.transaction(async (client) => {
    const idempotency = await deps.claimIdempotency(client, {
      keyHash,
      requestHash,
      expiresAt: new Date(now.getTime() + deps.idempotencyTtlMs)
    });
    if (idempotency.requestHash !== requestHash) {
      fail('This checkout key was already used for another request.', 'idempotency_conflict');
    }
    if (idempotency.status === 'completed') {
      return {
        ...idempotency.response,
        confirmationToken: deps.deriveToken(idempotency.orderNumber, idempotencyKey, deps.confirmationSecret)
      };
    }

    const quote = await deps.loadQuote(client, request.quoteId);
    if (!quote) fail('Checkout quote not found.', 'quote_not_found', 404);
    if (quote.cartSessionId !== request.cartSessionId) fail('Checkout quote does not match this cart.', 'quote_mismatch');
    if (!quote.finalizable || !quote.snapshot?.finalizable) fail('Checkout quote is not ready to place.', 'quote_not_finalizable');
    if (new Date(quote.expiresAt).getTime() <= now.getTime()) fail('Checkout quote has expired.', 'quote_expired');
    if (quote.consumedOrderNumber) fail('Checkout quote was already used.', 'quote_consumed');

    const validatedDelivery = requireCompleteDeliveryInformation({
      customer: request.customer,
      address: quote.snapshot.address
    });

    const refreshed = await deps.refreshQuote({
      cartSessionId: request.cartSessionId,
      items: quote.snapshot.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
      address: validatedDelivery.address,
      discountCode: manualDiscountCode(quote.snapshot)
    }, { client });
    if (refreshed.pricingFingerprint !== quote.snapshot.pricingFingerprint) {
      fail('Checkout totals changed. Review the updated quote.', 'quote_changed', 409, currentTotals(refreshed));
    }

    const orderNumber = deps.createOrderNumber();
    const confirmationToken = deps.deriveToken(orderNumber, idempotencyKey, deps.confirmationSecret);
    const order = buildOrder(input, {
      ...request,
      customer: validatedDelivery.customer
    }, {
      ...quote,
      snapshot: { ...quote.snapshot, address: validatedDelivery.address }
    }, orderNumber, deps.hashToken(confirmationToken), now);
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
      quantityChange: -Math.abs(Number(item.quantity))
    }));

    await deps.deductStock(stockItems, { client });
    await deps.saveOrder(order, { client });
    await deps.appendMovements(movements, { client });
    if (deps.enqueueInventorySync) {
      await deps.enqueueInventorySync([...new Set(stockItems.map((item) => item.slug))], 'website_order', { client });
    }
    await deps.convertCart(request.cartSessionId, orderNumber, { client });
    if (manualDiscountCode(order)) await deps.claimPromo(order.discountCode, { client });
    if (order.paymentMethod !== 'paymongo') await deps.insertMeta(client, order, input.requestContext || {});
    if (deps.enqueueOrderExport) await deps.enqueueOrderExport(order, { client });
    await deps.consumeQuote(client, quote.id, orderNumber);
    const response = checkoutResponse(order);
    await deps.completeIdempotency(client, { keyHash, orderNumber, response });
    if (order.paymentMethod !== 'paymongo' && deps.enqueueAdminEmail) {
      await deps.enqueueAdminEmail(order, { client });
    }
    return { ...response, confirmationToken };
  });
}

module.exports = { checkoutResponse, placeAuthoritativeCheckout };
