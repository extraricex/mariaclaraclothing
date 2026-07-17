const crypto = require('node:crypto');
const { META_CURRENCY, buildMetaPurchaseEvent, logMetaPurchaseDevelopment, purchaseValue } = require('./metaEvent');
const { validateMetaPurchaseEvent } = require('./metaMoney');
const {
  insertMetaPurchaseOutbox,
  recordMetaPurchaseValidationFailure
} = require('./marketingEventOutboxRepository');

const BROWSER_CLAIM_LEASE_MS = 2 * 60_000;
const PURCHASE_SUCCESSFUL_STATUSES = new Set(['received', 'confirmed', 'packed', 'shipped', 'delivered']);

function metaPurchaseEligibility(order, { allowLegacyServer = false } = {}) {
  if (!order?.orderNumber) return { eligible: false, reason: 'order_missing' };
  if (!allowLegacyServer && Number(order.metaPurchaseTrackingVersion || 1) < 2) {
    return { eligible: false, reason: 'legacy_order_locked' };
  }
  const status = String(order.status || '').toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (['cancelled', 'failed', 'expired', 'abandoned'].includes(status) || ['cancelled', 'failed', 'expired'].includes(paymentStatus)) {
    return { eligible: false, reason: 'order_unsuccessful' };
  }

  const paymongo = order.paymentProvider === 'paymongo' || order.paymentMethod === 'paymongo';
  if (paymongo) {
    if (paymentStatus !== 'paid') return { eligible: false, reason: 'payment_not_paid' };
    if (!PURCHASE_SUCCESSFUL_STATUSES.has(status) || order.inventoryReservationStatus !== 'committed') {
      return { eligible: false, reason: 'order_not_committed' };
    }
    if (!Number.isInteger(Number(order.paidAmountCents)) || Number(order.paidAmountCents) !== Number(order.totalCents)) {
      return { eligible: false, reason: 'paid_amount_mismatch' };
    }
  } else if (order.paymentMethod !== 'cash_on_delivery') {
    return { eligible: false, reason: 'payment_method_ineligible' };
  } else if (!PURCHASE_SUCCESSFUL_STATUSES.has(status) || (order.inventoryReservationStatus && order.inventoryReservationStatus !== 'committed')) {
    return { eligible: false, reason: 'order_not_committed' };
  }

  const event = buildMetaPurchaseEvent({ order });
  if (!event) return { eligible: false, reason: 'invalid_purchase_data' };
  return { eligible: true, reason: 'eligible', event };
}

function browserPurchaseState(order) {
  return {
    eventId: String(order?.metaPurchaseEventId || ''),
    value: order?.metaPurchaseValue || purchaseValue(order?.totalCents),
    currency: order?.metaPurchaseCurrency || order?.currency || META_CURRENCY,
    status: String(order?.metaPurchaseStatus || 'legacy'),
    browserSentAt: order?.metaBrowserPurchaseSentAt || '',
    serverQueuedAt: order?.metaCapiPurchaseQueuedAt || '',
    serverSentAt: order?.metaCapiPurchaseSentAt || '',
    lastError: String(order?.metaPurchaseLastError || '')
  };
}

async function claimBrowserMetaPurchase({ orderNumber, confirmationToken }, dependencies) {
  return dependencies.transaction(async (client) => {
    const order = await dependencies.findOrder(orderNumber, { client, forUpdate: true, includeRelated: false });
    if (!order || !dependencies.verifyToken(confirmationToken, order.confirmationTokenHash)) return null;

    const eligibility = metaPurchaseEligibility(order);
    if (!eligibility.eligible) {
      return { shouldSend: false, reason: eligibility.reason, tracking: browserPurchaseState(order) };
    }
    if (order.metaBrowserPurchaseSentAt) {
      return { shouldSend: false, reason: 'already_sent', tracking: browserPurchaseState(order) };
    }

    const now = dependencies.now();
    const claimId = dependencies.randomId();
    const claimed = await dependencies.claimOrder(orderNumber, {
      claimId,
      claimedAt: now,
      staleBefore: new Date(now.getTime() - BROWSER_CLAIM_LEASE_MS)
    }, { client });
    if (!claimed) {
      const current = await dependencies.findOrder(orderNumber, { client, includeRelated: false });
      return {
        shouldSend: false,
        reason: current?.metaBrowserPurchaseSentAt ? 'already_sent' : 'claim_active',
        tracking: browserPurchaseState(current || order)
      };
    }

    const event = buildMetaPurchaseEvent({ order: claimed });
    if (!event) {
      await dependencies.completeClaim(orderNumber, { claimId, sent: false, completedAt: now }, { client });
      return { shouldSend: false, reason: 'invalid_purchase_data', tracking: browserPurchaseState(claimed) };
    }
    dependencies.logger?.info?.('Meta browser Purchase claimed.', {
      eventName: 'Purchase',
      eventId: event.event_id,
      orderNumber: claimed.orderNumber,
      value: event.custom_data.value,
      currency: event.custom_data.currency,
      source: 'browser',
      deduplicated: false
    });
    return {
      shouldSend: true,
      claimId,
      purchase: { eventId: event.event_id, payload: event.custom_data },
      tracking: browserPurchaseState(claimed)
    };
  });
}

async function completeBrowserMetaPurchase({ orderNumber, confirmationToken, claimId, sent }, dependencies) {
  return dependencies.transaction(async (client) => {
    const order = await dependencies.findOrder(orderNumber, { client, forUpdate: true, includeRelated: false });
    if (!order || !dependencies.verifyToken(confirmationToken, order.confirmationTokenHash)) return null;
    if (order.metaBrowserPurchaseSentAt) {
      return { completed: true, reason: 'already_sent', tracking: browserPurchaseState(order) };
    }
    const updated = await dependencies.completeClaim(orderNumber, {
      claimId,
      sent: Boolean(sent),
      completedAt: dependencies.now()
    }, { client });
    if (!updated) return { completed: false, reason: 'claim_not_owned', tracking: browserPurchaseState(order) };
    dependencies.logger?.info?.(sent ? 'Meta browser Purchase marked sent.' : 'Meta browser Purchase claim released.', {
      eventName: 'Purchase',
      eventId: updated.metaPurchaseEventId,
      orderNumber: updated.orderNumber,
      source: 'browser',
      sent: Boolean(sent),
      deduplicated: false
    });
    return { completed: Boolean(sent), reason: sent ? 'sent' : 'not_sent', tracking: browserPurchaseState(updated) };
  });
}

async function queueMetaPurchase({ client, order, requestContext = {}, enabled = false }, options = {}) {
  if (!enabled) return { status: 'disabled', event: null, outbox: null };
  const eligibility = metaPurchaseEligibility(order, { allowLegacyServer: true });
  const candidate = eligibility.eligible
    ? (options.buildEvent || buildMetaPurchaseEvent)({ order, requestContext })
    : null;
  const validation = candidate ? validateMetaPurchaseEvent(candidate) : { valid: false, errors: [] };
  const event = validation.valid ? candidate : null;
  const failureReason = eligibility.eligible
    ? (candidate ? validation.errors.join(' ') : 'invalid_purchase_data')
    : eligibility.reason;
  if (!event && eligibility.reason === 'invalid_purchase_data') {
    await (options.recordValidationFailure || recordMetaPurchaseValidationFailure)(
      client,
      order?.orderNumber,
      'Meta Purchase was blocked because the stored order total or item data is invalid.'
    );
  } else if (!event && eligibility.eligible) {
    await (options.recordValidationFailure || recordMetaPurchaseValidationFailure)(
      client,
      order?.orderNumber,
      failureReason || 'Meta Purchase payload validation failed.'
    );
  }
  const outbox = event
    ? await (options.insertEvent || insertMetaPurchaseOutbox)(client, event)
    : null;
  logMetaPurchaseDevelopment(options.logger || console, {
    order,
    event,
    conversionsApiSent: false,
    reason: !event ? failureReason : outbox ? 'queued' : 'duplicate'
  });
  return {
    status: !event ? (eligibility.eligible ? 'invalid_purchase_data' : eligibility.reason) : outbox ? 'queued' : 'duplicate',
    reason: !event ? failureReason : outbox ? 'queued' : 'duplicate',
    event,
    outbox
  };
}

function defaultBrowserPurchaseDependencies(overrides = {}) {
  const orderRepository = require('../orders/orderRepository');
  const { transaction } = require('../db/postgres');
  const { verifyConfirmationToken } = require('../checkout/confirmationToken');
  return {
    transaction,
    findOrder: orderRepository.findOrderByNumber,
    claimOrder: orderRepository.claimOrderMetaBrowserPurchase,
    completeClaim: orderRepository.completeOrderMetaBrowserPurchase,
    verifyToken: verifyConfirmationToken,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
    logger: console,
    ...overrides
  };
}

module.exports = {
  BROWSER_CLAIM_LEASE_MS,
  browserPurchaseState,
  claimBrowserMetaPurchase,
  completeBrowserMetaPurchase,
  defaultBrowserPurchaseDependencies,
  metaPurchaseEligibility,
  queueMetaPurchase
};
