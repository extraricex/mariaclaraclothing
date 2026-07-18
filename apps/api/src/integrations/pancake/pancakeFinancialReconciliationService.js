const crypto = require('node:crypto');

const orderRepositoryDefault = require('../../orders/orderRepository');
const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const geoRepositoryDefault = require('./pancakeGeoRepository');
const { resolvePancakeAddress } = require('./pancakeGeoService');
const {
  buildPancakeOrderFinancialPayload,
  buildPancakeOrderUpdatePayload,
  normalizePancakeOrder
} = require('./pancakeOrderMapper');

function uniqueOrderNumbers(values = []) {
  return [...new Set(values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean))];
}

function centsFromPesos(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function isPayMongo(order = {}) {
  return String(order.paymentMethod || order.paymentProvider || '').trim().toLowerCase() === 'paymongo';
}

function providerFinancialAudit(order = {}, providerOrder = {}) {
  const normalized = normalizePancakeOrder(providerOrder);
  const expected = buildPancakeOrderFinancialPayload(order);
  const paymongo = isPayMongo(order);
  const expectedProviderPayableCents = centsFromPesos(paymongo ? expected.transfer_money : expected.cod);
  const providerPayableCents = paymongo
    ? Number(normalized.prepaidAmountCents || 0)
    : Number(normalized.codAmountCents || 0);
  const websiteTotalCents = Number(order.totalCents);
  const expectedShippingFeeCents = Number(order.shippingFeeCents || 0);
  const expectedDiscountTotalCents = Number(order.discountTotalCents || 0);
  const differences = [];

  if (!Number.isInteger(websiteTotalCents) || websiteTotalCents <= 0) differences.push('website_total_invalid');
  if (Number(normalized.shippingFeeCents || 0) !== expectedShippingFeeCents) differences.push('shipping_fee');
  if (Number(normalized.discountTotalCents || 0) !== expectedDiscountTotalCents) differences.push('discount_total');
  if (providerPayableCents !== expectedProviderPayableCents) differences.push('provider_payable');

  return {
    currency: 'PHP',
    websiteTotalCents,
    expectedShippingFeeCents,
    pancakeShippingFeeCents: Number(normalized.shippingFeeCents || 0),
    expectedDiscountTotalCents,
    pancakeDiscountTotalCents: Number(normalized.discountTotalCents || 0),
    expectedProviderPayableCents,
    providerPayableCents,
    providerPayableType: paymongo ? 'prepaid' : 'cod',
    differences,
    matches: differences.length === 0,
    providerUpdatedAt: normalized.pancakeUpdatedAt || ''
  };
}

function safeProviderCode(error) {
  const code = String(error?.code || '').trim();
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_financial_reconciliation_failed';
}

function repairEventIdentity(orderNumber, pancakeOrderId, audit) {
  const snapshotHash = crypto.createHash('sha256').update(JSON.stringify({
    orderNumber,
    pancakeOrderId,
    websiteTotalCents: audit.websiteTotalCents,
    expectedShippingFeeCents: audit.expectedShippingFeeCents,
    expectedDiscountTotalCents: audit.expectedDiscountTotalCents,
    expectedProviderPayableCents: audit.expectedProviderPayableCents,
    pancakeShippingFeeCents: audit.pancakeShippingFeeCents,
    pancakeDiscountTotalCents: audit.pancakeDiscountTotalCents,
    providerPayableCents: audit.providerPayableCents,
    providerUpdatedAt: audit.providerUpdatedAt
  })).digest('hex');
  return `financial-reconciliation:${snapshotHash}`;
}

function baseResult(orderNumber, pancakeOrderId = '') {
  return {
    orderNumber,
    pancakeOrderId,
    currency: 'PHP',
    status: 'unchecked',
    differences: []
  };
}

function publicAuditResult(orderNumber, pancakeOrderId, audit, status) {
  return {
    ...baseResult(orderNumber, pancakeOrderId),
    status,
    websiteTotalCents: audit.websiteTotalCents,
    expectedShippingFeeCents: audit.expectedShippingFeeCents,
    pancakeShippingFeeCents: audit.pancakeShippingFeeCents,
    expectedDiscountTotalCents: audit.expectedDiscountTotalCents,
    pancakeDiscountTotalCents: audit.pancakeDiscountTotalCents,
    expectedProviderPayableCents: audit.expectedProviderPayableCents,
    providerPayableCents: audit.providerPayableCents,
    providerPayableType: audit.providerPayableType,
    differences: audit.differences
  };
}

function summarize(results, { apply, scopedOrderCount }) {
  const count = (status) => results.filter((item) => item.status === status).length;
  return {
    mode: apply ? 'apply' : 'audit',
    scopedOrderCount,
    checkedCount: results.filter((item) => !['missing_link', 'missing_order', 'provider_error'].includes(item.status)).length,
    correctCount: count('correct'),
    initialMismatchCount: results.filter((item) => [
      'mismatch', 'corrected', 'repair_failed', 'repair_pending', 'invalid_website_order'
    ].includes(item.status)).length,
    correctedCount: count('corrected'),
    remainingMismatchCount: results.filter((item) => [
      'mismatch', 'repair_failed', 'repair_pending', 'invalid_website_order'
    ].includes(item.status)).length,
    missingCount: count('missing_link') + count('missing_order'),
    failedCount: count('provider_error') + count('repair_failed') + count('invalid_website_order'),
    results
  };
}

async function markRepairFailure({
  syncRepository,
  event,
  link,
  order,
  code,
  now,
  differences = []
}) {
  if (event?.id) {
    await syncRepository.markSyncEventRetryable(event.id, {
      safeErrorCode: code,
      nextAttemptAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    });
  }
  await syncRepository.upsertOrderLink({
    orderNumber: link.orderNumber,
    pancakeOrderId: link.pancakeOrderId,
    shopId: link.shopId,
    syncStatus: 'sync_failed',
    lastLocalUpdatedAt: order.updatedAt || now.toISOString(),
    safeErrorCode: code
  });
  await syncRepository.appendSyncLog({
    direction: 'outbound', entityType: 'order', entityId: link.orderNumber,
    orderNumber: link.orderNumber, pancakeOrderId: link.pancakeOrderId,
    level: 'warning', code,
    message: 'Pancake financial reconciliation did not match the authoritative website order.',
    metadata: { differences }
  });
}

async function repairMismatch({
  order,
  link,
  initialAudit,
  config,
  client,
  syncRepository,
  geoRepository,
  geoResolver,
  now
}) {
  const identity = {
    direction: 'outbound',
    entityType: 'order',
    entityId: link.orderNumber,
    eventKey: repairEventIdentity(link.orderNumber, link.pancakeOrderId, initialAudit)
  };
  await syncRepository.enqueueSyncEvent({
    ...identity,
    orderNumber: link.orderNumber,
    pancakeOrderId: link.pancakeOrderId,
    payloadHash: identity.eventKey.split(':')[1],
    // Keep the durable event free of customer/address data. The worker builds
    // the provider payload from the authoritative order record at dispatch.
    payload: {
      changedFields: ['address', 'paymentMethod', 'paymentStatus'],
      reason: 'financial_reconciliation',
      expectedTotalCents: initialAudit.websiteTotalCents,
      expectedProviderPayableCents: initialAudit.expectedProviderPayableCents,
      currency: 'PHP'
    },
    nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  });
  const stored = await syncRepository.getSyncEventByIdentity(identity);
  const event = stored && await syncRepository.claimSyncEventById(stored.id, { now: now.toISOString() });
  if (!event) {
    return { status: 'repair_pending', audit: initialAudit };
  }

  try {
    const addressMapping = await geoResolver(order.address, { client, repository: geoRepository });
    const payload = buildPancakeOrderUpdatePayload({
      order,
      changedFields: ['address', 'paymentMethod', 'paymentStatus'],
      addressMapping
    });
    await client.updateOrder(config.shopId, link.pancakeOrderId, payload);
    const providerOrder = await client.getOrder(config.shopId, link.pancakeOrderId);
    const finalAudit = providerFinancialAudit(order, providerOrder);
    if (!finalAudit.matches) {
      await markRepairFailure({
        syncRepository, event, link, order,
        code: 'pancake_financial_reconciliation_mismatch',
        now,
        differences: finalAudit.differences
      });
      return { status: 'repair_failed', audit: finalAudit };
    }

    await syncRepository.markSyncEventSucceeded(event.id);
    await syncRepository.upsertOrderLink({
      orderNumber: link.orderNumber,
      pancakeOrderId: link.pancakeOrderId,
      shopId: link.shopId,
      syncStatus: 'synced',
      lastSyncedAt: now.toISOString(),
      lastLocalUpdatedAt: order.updatedAt || now.toISOString(),
      safeErrorCode: ''
    });
    await syncRepository.appendSyncLog({
      direction: 'outbound', entityType: 'order', entityId: link.orderNumber,
      orderNumber: link.orderNumber, pancakeOrderId: link.pancakeOrderId,
      level: 'info', code: 'pancake_order_financial_reconciled',
      message: 'Pancake financial values were synchronized to the authoritative website order.',
      metadata: { changedFields: ['address', 'paymentMethod', 'paymentStatus'] }
    });
    return { status: 'corrected', audit: finalAudit };
  } catch (error) {
    const code = safeProviderCode(error);
    await markRepairFailure({ syncRepository, event, link, order, code, now });
    return { status: 'repair_failed', audit: initialAudit, safeErrorCode: code };
  }
}

async function reconcilePancakeOrderFinancials({
  apply = false,
  orderNumbers = [],
  config,
  client,
  orderRepository = orderRepositoryDefault,
  syncRepository = syncRepositoryDefault,
  geoRepository = geoRepositoryDefault,
  geoResolver = resolvePancakeAddress,
  now = () => new Date()
}) {
  const scope = uniqueOrderNumbers(orderNumbers);
  if (apply && !scope.length) {
    const error = new Error('Apply mode requires at least one explicit --order scope.');
    error.code = 'pancake_financial_apply_scope_required';
    throw error;
  }
  if (!config?.shopId || !client?.getOrder) {
    const error = new Error('Pancake shop and client are required.');
    error.code = 'pancake_financial_reconciliation_not_configured';
    throw error;
  }
  if (apply && (config.mode !== 'live' || !client?.updateOrder)) {
    const error = new Error('Pancake financial repair requires live mode.');
    error.code = 'pancake_financial_apply_requires_live_mode';
    throw error;
  }

  const links = await syncRepository.listOrderLinks({ orderNumbers: scope });
  const linkByOrder = new Map(links.map((link) => [link.orderNumber, link]));
  const targetNumbers = scope.length ? scope : links.map((link) => link.orderNumber);
  const results = [];

  for (const orderNumber of targetNumbers) {
    const link = linkByOrder.get(orderNumber);
    if (!link?.pancakeOrderId) {
      results.push({ ...baseResult(orderNumber), status: 'missing_link' });
      continue;
    }
    const order = await orderRepository.findOrderByNumber(orderNumber);
    if (!order) {
      results.push({ ...baseResult(orderNumber, link.pancakeOrderId), status: 'missing_order' });
      continue;
    }

    let providerOrder;
    try {
      providerOrder = await client.getOrder(config.shopId, link.pancakeOrderId);
    } catch (error) {
      results.push({
        ...baseResult(orderNumber, link.pancakeOrderId),
        status: 'provider_error',
        safeErrorCode: safeProviderCode(error)
      });
      continue;
    }
    const audit = providerFinancialAudit(order, providerOrder);
    if (audit.matches) {
      results.push(publicAuditResult(orderNumber, link.pancakeOrderId, audit, 'correct'));
      continue;
    }
    if (!apply) {
      results.push(publicAuditResult(orderNumber, link.pancakeOrderId, audit, 'mismatch'));
      continue;
    }
    if (audit.differences.includes('website_total_invalid')) {
      const invalid = publicAuditResult(orderNumber, link.pancakeOrderId, audit, 'invalid_website_order');
      invalid.safeErrorCode = 'pancake_financial_website_total_invalid';
      results.push(invalid);
      continue;
    }

    const repaired = await repairMismatch({
      order, link, initialAudit: audit, config, client, syncRepository,
      geoRepository, geoResolver, now: now()
    });
    const result = publicAuditResult(orderNumber, link.pancakeOrderId, repaired.audit, repaired.status);
    if (repaired.safeErrorCode) result.safeErrorCode = repaired.safeErrorCode;
    results.push(result);
  }

  return summarize(results, { apply, scopedOrderCount: scope.length });
}

module.exports = {
  providerFinancialAudit,
  reconcilePancakeOrderFinancials,
  uniqueOrderNumbers
};
