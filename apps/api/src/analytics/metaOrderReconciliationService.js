const { metaPurchaseEligibility } = require('../marketing/metaPurchaseService');
const { listMetaEventCoverage, listMetaOrderReconciliationRows } = require('./metaOrderReconciliationRepository');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const { normalizePancakeOrder } = require('../integrations/pancake/pancakeOrderMapper');

const BUSINESS_TIME_ZONE = 'Asia/Manila';
const MANILA_OFFSET = '+08:00';
const MAX_RANGE_DAYS = 366;

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_RECONCILIATION_RANGE';
  return error;
}

function calendarDate(value, label) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw validationError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw validationError(`${label} is not a valid calendar date.`);
  }
  return normalized;
}

function addUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + Number(days || 0));
  return value.toISOString().slice(0, 10);
}

function todayInManila(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function reconciliationDateRange(input = {}, now = new Date()) {
  const timezone = String(input.timezone || BUSINESS_TIME_ZONE).trim();
  if (timezone !== BUSINESS_TIME_ZONE) {
    throw validationError(`Reconciliation currently uses the business time zone ${BUSINESS_TIME_ZONE}.`);
  }
  const today = todayInManila(now);
  const start = calendarDate(input.start || addUtcDays(today, -6), 'start');
  const end = calendarDate(input.end || today, 'end');
  if (start > end) throw validationError('start must not be after end.');
  const dayCount = Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1;
  if (dayCount > MAX_RANGE_DAYS) throw validationError(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`);
  const endExclusiveDate = addUtcDays(end, 1);
  return {
    start,
    end,
    timezone,
    dayCount,
    startUtc: new Date(`${start}T00:00:00${MANILA_OFFSET}`).toISOString(),
    endExclusiveUtc: new Date(`${endExclusiveDate}T00:00:00${MANILA_OFFSET}`).toISOString()
  };
}

function centsFromMetaValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function safeDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  const numeric = Number(text);
  const isoText = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text}Z`
    : text;
  const date = /^\d{10}(?:\.\d+)?$/.test(text) && Number.isFinite(numeric)
    ? new Date(numeric * 1000)
    : new Date(isoText);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function pancakeCreatedAt(payload = {}) {
  return safeDate(
    payload.inserted_at
      || payload.created_at
      || payload.order_created_at
      || payload.order_date
      || payload.date_created
  );
}

function centsFromPancakePesos(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function pancakePayableCents(payload = {}, normalized = {}) {
  const cod = Number(normalized.codAmountCents || 0);
  if (Number.isFinite(cod) && cod > 0) return Math.round(cod);
  const prepaid = centsFromPancakePesos(
    Number(payload.transfer_money || 0)
      + Number(payload.charged_by_card || 0)
      + Number(payload.charged_by_qrpay || 0)
      + Number(payload.charged_by_vnpay || 0)
      + Number(payload.charged_by_momo || 0)
  );
  if (prepaid > 0) return prepaid;
  const calculated = Number(normalized.subtotalCents || 0)
    - Number(normalized.discountTotalCents || 0)
    + Number(normalized.shippingFeeCents || 0);
  return Math.max(0, Math.round(calculated || Number(normalized.totalCents || 0)));
}

function livePancakeRow(payload, { fallbackCreatedAt = '', source = 'list' } = {}) {
  const normalized = normalizePancakeOrder(payload);
  return {
    pancakeOrderId: normalized.pancakeOrderId,
    orderNumber: normalized.orderNumber,
    createdAt: pancakeCreatedAt(payload) || safeDate(fallbackCreatedAt),
    paymentMethod: normalized.paymentMethod,
    paymentStatus: normalized.paymentStatus,
    status: normalized.status,
    totalCents: Number(normalized.totalCents || 0),
    payableCents: pancakePayableCents(payload, normalized),
    source
  };
}

async function fetchLivePancakeOrders({ config, client, startUtc, endExclusiveUtc, websiteRows = [] } = {}) {
  const fetchedAt = new Date().toISOString();
  if (!config?.configured || !config?.shopId || typeof client?.listOrders !== 'function') {
    return {
      available: false,
      complete: false,
      providerListComplete: false,
      linkedDetailsComplete: false,
      status: 'not_configured',
      errorCode: 'pancake_not_configured',
      fetchedAt,
      providerTotalEntries: null,
      providerPeriodOrderCount: null,
      unresolvedCreatedAtCount: 0,
      linkedDetailCount: 0,
      linkedDetailErrorCount: 0,
      rows: []
    };
  }
  const start = new Date(startUtc);
  const end = new Date(endExclusiveUtc);
  const pageSize = Math.max(1, Math.min(100, Number(config.orderPollPageSize || 100)));
  const maxPages = 500;
  let pageNumber = 1;
  let totalPages = 1;
  let providerTotalEntries = null;
  const rows = [];
  let providerListComplete = false;
  let listErrorCode = '';
  let unresolvedCreatedAtCount = 0;
  try {
    do {
      // Read all shop pages and apply exact business-period bounds locally.
      // Pancake's date filter is based on updated_at, which is not equivalent
      // to the order-created period used for website/Meta reconciliation.
      const body = await client.listOrders(config.shopId, { pageNumber, pageSize });
      const bodyTotalPages = Math.max(1, Number(body.total_pages || body.totalPages || pageNumber));
      totalPages = Math.min(maxPages + 1, bodyTotalPages);
      const total = Number(body.total_entries ?? body.totalEntries);
      if (Number.isFinite(total) && total >= 0) providerTotalEntries = total;
      for (const payload of body.data || []) {
        const record = livePancakeRow(payload);
        const timestamp = new Date(record.createdAt || 0);
        if (!record.createdAt || !Number.isFinite(timestamp.getTime())) {
          unresolvedCreatedAtCount += 1;
          continue;
        }
        if (timestamp < start || timestamp >= end) continue;
        rows.push(record);
      }
      pageNumber += 1;
    } while (pageNumber <= totalPages && pageNumber <= maxPages);
    providerListComplete = totalPages <= maxPages && unresolvedCreatedAtCount === 0;
    if (totalPages > maxPages) listErrorCode = 'pancake_page_limit_reached';
    else if (unresolvedCreatedAtCount > 0) listErrorCode = 'pancake_created_at_missing';
  } catch (error) {
    listErrorCode = String(error?.code || 'pancake_live_fetch_failed');
  }
  const providerPeriodOrderCount = providerListComplete ? rows.length : null;

  const linked = websiteRows.filter((row) => row.recordType !== 'pancake_only' && row.pancakeOrderId);
  const maxLinkedDetails = 200;
  const detailsToFetch = linked.slice(0, maxLinkedDetails);
  let linkedDetailErrorCount = Math.max(0, linked.length - detailsToFetch.length);
  let linkedDetailCount = 0;
  if (typeof client.getOrder === 'function') {
    for (let index = 0; index < detailsToFetch.length; index += 5) {
      const batch = detailsToFetch.slice(index, index + 5);
      const results = await Promise.all(batch.map(async (websiteOrder) => {
        try {
          const payload = await client.getOrder(config.shopId, websiteOrder.pancakeOrderId);
          return { websiteOrder, record: livePancakeRow(payload, { fallbackCreatedAt: websiteOrder.placedAt, source: 'detail' }) };
        } catch (_error) {
          return { websiteOrder, record: null };
        }
      }));
      for (const result of results) {
        if (!result.record) {
          linkedDetailErrorCount += 1;
          continue;
        }
        linkedDetailCount += 1;
        const duplicateIndex = rows.findIndex((row) => (
          row.pancakeOrderId === result.record.pancakeOrderId
          || (result.record.orderNumber && row.orderNumber === result.record.orderNumber)
        ));
        if (duplicateIndex >= 0) rows.splice(duplicateIndex, 1);
        rows.push(result.record);
      }
    }
  } else {
    linkedDetailErrorCount += detailsToFetch.length;
  }
  const linkedDetailsComplete = linkedDetailErrorCount === 0;
  const complete = providerListComplete && linkedDetailsComplete;
  const status = complete ? 'complete' : rows.length ? 'partial' : 'failed';
  const errorCode = listErrorCode
    || (!linkedDetailsComplete ? (linked.length > maxLinkedDetails ? 'pancake_detail_limit_reached' : 'pancake_detail_fetch_failed') : '');
  return {
    available: complete,
    complete,
    providerListComplete,
    linkedDetailsComplete,
    status,
    errorCode,
    fetchedAt,
    providerTotalEntries,
    providerPeriodOrderCount,
    unresolvedCreatedAtCount,
    linkedDetailCount,
    linkedDetailErrorCount,
    rows
  };
}

function mergeLivePancakeRows(databaseRows, liveResult) {
  const websiteRows = databaseRows.filter((row) => row.recordType !== 'pancake_only');
  const cachedPancakeOnly = databaseRows.filter((row) => row.recordType === 'pancake_only');
  if (!Array.isArray(liveResult?.rows) || !liveResult.rows.length) return databaseRows;
  const byOrderNumber = new Map(websiteRows.filter((row) => row.orderNumber).map((row) => [row.orderNumber, row]));
  const byPancakeId = new Map(websiteRows.filter((row) => row.pancakeOrderId).map((row) => [row.pancakeOrderId, row]));
  const pancakeOnly = [];
  for (const live of liveResult.rows || []) {
    const match = byOrderNumber.get(live.orderNumber) || byPancakeId.get(live.pancakeOrderId);
    if (match) {
      const existingIds = unique([...(match.pancakeOrderIds || []), match.pancakeOrderId]);
      match.pancakeOrderIds = unique([...existingIds, live.pancakeOrderId]);
      match.pancakeLinkCount = Math.max(Number(match.pancakeLinkCount || 0), match.pancakeOrderIds.length);
      if (!match.pancakeOrderId) match.pancakeOrderId = live.pancakeOrderId;
      const evidence = Array.isArray(match.pancakeOrders) ? match.pancakeOrders : [];
      const liveEvidence = {
        pancakeOrderId: live.pancakeOrderId,
        totalCents: live.totalCents,
        payableCents: live.payableCents,
        source: live.source
      };
      const evidenceIndex = evidence.findIndex((item) => item.pancakeOrderId === live.pancakeOrderId);
      if (evidenceIndex >= 0) evidence[evidenceIndex] = liveEvidence;
      else evidence.push(liveEvidence);
      match.pancakeOrders = evidence;
      match.pancakeSyncStatus = 'live_provider_confirmed';
      if (match.pancakeOrderId === live.pancakeOrderId) {
        match.pancakeTotalCents = live.totalCents;
        match.pancakePayableCents = live.payableCents;
      }
      match.pancakeLiveSeen = true;
      continue;
    }
    pancakeOnly.push({
      recordType: 'pancake_only',
      orderNumber: live.orderNumber,
      customerDisplayName: '',
      customer: {},
      address: {},
      items: [],
      placedAt: live.createdAt,
      paidAt: '',
      paymentMethod: live.paymentMethod,
      paymentProvider: '',
      paymentStatus: live.paymentStatus,
      status: live.status,
      inventoryReservationStatus: '',
      checkoutChannel: 'pancake_pos',
      isTestOrder: false,
      totalCents: 0,
      paidAmountCents: null,
      currency: 'PHP',
      metaPurchaseTrackingVersion: 1,
      metaPurchaseEventId: '',
      metaPurchaseValue: null,
      metaPurchaseCurrency: '',
      metaPurchaseStatus: 'not_applicable',
      metaPurchaseLastError: '',
      metaBrowserPurchaseSentAt: '',
      metaCapiPurchaseQueuedAt: '',
      metaCapiPurchaseSentAt: '',
      outboxEvents: [],
      dispatchEvents: [],
      pancakeLinkCount: 0,
      pancakeOrderId: live.pancakeOrderId,
      pancakeOrderIds: unique([live.pancakeOrderId]),
      pancakeOrders: [{
        pancakeOrderId: live.pancakeOrderId,
        totalCents: live.totalCents,
        payableCents: live.payableCents,
        source: live.source
      }],
      pancakeSyncStatus: 'live_provider_only',
      pancakeSafeErrorCode: '',
      pancakeExportStatus: 'not_applicable',
      pancakeExportAttemptCount: 0,
      pancakeExportSafeErrorCode: '',
      pancakeTotalCents: live.totalCents,
      pancakePayableCents: live.payableCents,
      pancakeLiveSeen: true
    });
  }
  return [
    ...websiteRows,
    ...((liveResult.providerListComplete ?? liveResult.complete) ? pancakeOnly : cachedPancakeOnly)
  ];
}

function sourceDispatches(row, source) {
  return (row.dispatchEvents || []).filter((event) => event.source === source);
}

function reconcileOrder(row) {
  if (row.recordType === 'pancake_only') {
    return {
      recordType: 'pancake_only',
      reconciliationId: `pancake:${row.pancakeOrderId}`,
      orderNumber: row.orderNumber,
      orderDateTime: row.placedAt,
      paidAt: '',
      customerDisplayName: '',
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      orderStatus: row.status,
      orderSource: 'pancake_pos',
      isTestOrder: false,
      eligibleForPurchase: false,
      eligibilityReason: 'website_order_missing',
      actualFinalTotalCents: 0,
      actualCurrency: 'PHP',
      pancakeOrderId: row.pancakeOrderId,
      pancakeOrderIds: unique([...(row.pancakeOrderIds || []), row.pancakeOrderId]),
      pancakeOrders: row.pancakeOrders || [],
      pancakeSyncStatus: row.pancakeSyncStatus,
      pancakeExportStatus: row.pancakeExportStatus,
      pancakeTotalCents: row.pancakeTotalCents,
      pancakePayableCents: row.pancakePayableCents,
      metaEventId: '',
      browserPurchaseSent: false,
      capiPurchaseSent: false,
      browserPurchaseSentAt: '',
      capiPurchaseSentAt: '',
      browserServerEventIdMatch: true,
      metaValueCents: null,
      metaCurrency: '',
      browserAttemptCount: 0,
      capiAttemptCount: 0,
      expectedCountedPurchases: 0,
      reconciliationStatus: 'pancake_order_missing_website',
      warnings: ['pancake_order_missing_website'],
      lastMetaError: '',
      pancakeErrorCode: ''
    };
  }
  const eligibility = row.isTestOrder
    ? { eligible: false, reason: 'test_order' }
    : metaPurchaseEligibility(row);
  const outbox = row.outboxEvents || [];
  const browserDispatches = sourceDispatches(row, 'browser');
  const serverDispatches = sourceDispatches(row, 'server');
  const browserSent = browserDispatches.some((event) => event.status === 'sent') || Boolean(row.metaBrowserPurchaseSentAt);
  const serverSent = serverDispatches.some((event) => event.status === 'sent')
    || outbox.some((event) => event.status === 'sent')
    || Boolean(row.metaCapiPurchaseSentAt);
  const eventIds = unique([
    row.metaPurchaseEventId,
    ...outbox.map((event) => event.eventId),
    ...(row.dispatchEvents || []).map((event) => event.eventId)
  ]);
  const browserEventIds = unique(browserDispatches.map((event) => event.eventId));
  if (!browserEventIds.length && browserSent && row.metaPurchaseEventId) browserEventIds.push(row.metaPurchaseEventId);
  const serverEventIds = unique([
    ...serverDispatches.map((event) => event.eventId),
    ...outbox.map((event) => event.eventId),
    ...(serverSent && row.metaPurchaseEventId ? [row.metaPurchaseEventId] : [])
  ]);
  const sourceIds = unique([...browserEventIds, ...serverEventIds]);

  const metaValues = [
    row.metaPurchaseValue,
    ...outbox.map((event) => event.value),
    ...(row.dispatchEvents || []).map((event) => event.value)
  ].map(centsFromMetaValue).filter((value) => value !== null);
  const metaValueCents = metaValues[0] ?? null;
  const metaValueMismatch = metaValues.some((value) => value !== Number(row.totalCents || 0))
    || new Set(metaValues).size > 1;
  const currencies = unique([
    row.metaPurchaseCurrency,
    ...outbox.map((event) => event.currency),
    ...(row.dispatchEvents || []).map((event) => event.currency)
  ]);
  const metaCurrency = currencies[0] || '';
  const currencyInvalid = currencies.some((currency) => currency !== 'PHP')
    || ((browserSent || serverSent) && !currencies.length)
    || String(row.currency || '') !== 'PHP';

  const warnings = [];
  const pancakeOrderIds = unique([...(row.pancakeOrderIds || []), row.pancakeOrderId]);
  const pancakeOrders = Array.isArray(row.pancakeOrders) ? row.pancakeOrders : [];
  if (!eligibility.eligible) warnings.push(eligibility.reason);
  if (!eligibility.eligible && (browserSent || serverSent)) warnings.push('purchase_sent_when_ineligible');
  if (browserDispatches.length > 1) warnings.push('duplicate_browser_event');
  if (outbox.length > 1 || serverDispatches.length > 1) warnings.push('duplicate_server_event');
  if (sourceIds.length > 1) warnings.push('event_id_mismatch');
  if (metaValueMismatch) warnings.push('value_mismatch');
  if (currencyInvalid) warnings.push('currency_missing_or_invalid');
  if (eligibility.eligible && (!row.metaPurchaseEventId || (!browserSent && !serverSent))) warnings.push('missing_meta_event');
  if (Math.max(Number(row.pancakeLinkCount || 0), pancakeOrderIds.length) > 1) warnings.push('duplicate_pancake_order');
  if (eligibility.eligible && !row.pancakeOrderId) warnings.push('missing_pancake_order');
  const pancakePayables = pancakeOrders.length
    ? pancakeOrders.map((item) => item.payableCents).filter((value) => value !== null && value !== undefined)
    : row.pancakePayableCents !== null ? [row.pancakePayableCents] : [];
  if (pancakePayables.some((value) => Number(value) !== Number(row.totalCents || 0))) {
    warnings.push('pancake_value_mismatch');
  }

  let reconciliationStatus = 'correct';
  if (warnings.includes('purchase_sent_when_ineligible')) reconciliationStatus = 'purchase_sent_when_ineligible';
  else if (!eligibility.eligible) reconciliationStatus = 'not_eligible_for_purchase';
  else if (warnings.includes('duplicate_browser_event')) reconciliationStatus = 'duplicate_browser_event';
  else if (warnings.includes('duplicate_server_event')) reconciliationStatus = 'duplicate_server_event';
  else if (warnings.includes('event_id_mismatch')) reconciliationStatus = 'event_id_mismatch';
  else if (warnings.includes('value_mismatch') || warnings.includes('pancake_value_mismatch')) reconciliationStatus = 'value_mismatch';
  else if (warnings.includes('currency_missing_or_invalid')) reconciliationStatus = 'currency_missing';
  else if (warnings.includes('missing_meta_event')) reconciliationStatus = 'missing_meta_event';
  else if (warnings.includes('duplicate_pancake_order')) reconciliationStatus = 'duplicate_pancake_order';
  else if (warnings.includes('missing_pancake_order')) reconciliationStatus = 'missing_pancake_order';

  return {
    recordType: 'website_order',
    reconciliationId: `website:${row.orderNumber}`,
    orderNumber: row.orderNumber,
    orderDateTime: row.placedAt,
    paidAt: row.paidAt,
    customerDisplayName: row.customerDisplayName,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    orderStatus: row.status,
    orderSource: row.checkoutChannel,
    isTestOrder: row.isTestOrder,
    eligibleForPurchase: eligibility.eligible,
    eligibilityReason: eligibility.reason,
    actualFinalTotalCents: Number(row.totalCents || 0),
    actualCurrency: row.currency,
    pancakeOrderId: row.pancakeOrderId,
    pancakeOrderIds,
    pancakeOrders,
    pancakeSyncStatus: row.pancakeSyncStatus,
    pancakeExportStatus: row.pancakeExportStatus,
    pancakeTotalCents: row.pancakeTotalCents,
    pancakePayableCents: row.pancakePayableCents,
    metaEventId: row.metaPurchaseEventId,
    browserPurchaseSent: browserSent,
    capiPurchaseSent: serverSent,
    browserPurchaseSentAt: row.metaBrowserPurchaseSentAt || browserDispatches.find((event) => event.sentAt)?.sentAt || '',
    capiPurchaseSentAt: row.metaCapiPurchaseSentAt || serverDispatches.find((event) => event.sentAt)?.sentAt || outbox.find((event) => event.sentAt)?.sentAt || '',
    browserServerEventIdMatch: sourceIds.length <= 1,
    metaValueCents,
    metaCurrency,
    browserAttemptCount: browserDispatches.length
      ? browserDispatches.reduce((sum, event) => sum + Math.max(1, event.attemptCount), 0)
      : browserSent ? 1 : 0,
    capiAttemptCount: serverDispatches.length
      ? serverDispatches.reduce((sum, event) => sum + Math.max(1, event.attemptCount), 0)
      : outbox.reduce((sum, event) => sum + Number(event.attemptCount || 0), 0),
    expectedCountedPurchases: eligibility.eligible ? 1 : 0,
    reconciliationStatus,
    warnings,
    lastMetaError: row.metaPurchaseLastError
      || [...browserDispatches, ...serverDispatches].find((event) => event.errorMessage)?.errorMessage
      || outbox.find((event) => event.lastError)?.lastError
      || '',
    pancakeErrorCode: row.pancakeSafeErrorCode || row.pancakeExportSafeErrorCode || ''
  };
}

function summarize(rows) {
  const websiteRows = rows.filter((row) => row.recordType !== 'pancake_only');
  const pancakeOnlyRows = rows.filter((row) => row.recordType === 'pancake_only');
  const eligible = websiteRows.filter((row) => row.eligibleForPurchase);
  const metaIds = unique(eligible.map((row) => row.metaEventId));
  const pancakeIds = unique(rows.flatMap((row) => [row.pancakeOrderId, ...(row.pancakeOrderIds || [])]));
  const valuesByEventId = new Map();
  for (const row of eligible) {
    if (row.metaEventId && row.metaValueCents !== null && !valuesByEventId.has(row.metaEventId)) {
      valuesByEventId.set(row.metaEventId, row.metaValueCents);
    }
  }
  return {
    totalWebsiteOrders: websiteRows.length,
    eligiblePurchaseOrders: eligible.length,
    pancakeOrders: pancakeIds.length,
    pancakeOrdersMissingWebsite: pancakeOnlyRows.length,
    browserPurchaseAttempts: websiteRows.reduce((sum, row) => sum + row.browserAttemptCount, 0),
    capiPurchaseAttempts: websiteRows.reduce((sum, row) => sum + row.capiAttemptCount, 0),
    uniquePurchaseEventIds: metaIds.length,
    expectedMetaPurchaseCount: eligible.length,
    unexpectedMetaEvents: websiteRows.filter((row) => row.warnings.includes('purchase_sent_when_ineligible')).length,
    duplicateEventsDetected: rows.filter((row) => row.warnings.some((warning) => warning.startsWith('duplicate_'))).length,
    missingEvents: eligible.filter((row) => row.warnings.includes('missing_meta_event')).length,
    missingPancakeOrders: eligible.filter((row) => row.warnings.includes('missing_pancake_order')).length,
    valueMismatches: eligible.filter((row) => row.warnings.includes('value_mismatch') || row.warnings.includes('pancake_value_mismatch')).length,
    currencyIssues: eligible.filter((row) => row.warnings.includes('currency_missing_or_invalid')).length,
    totalActualOrderValueCents: eligible.reduce((sum, row) => sum + row.actualFinalTotalCents, 0),
    totalMetaPurchaseValueCents: [...valuesByEventId.values()].reduce((sum, value) => sum + value, 0)
  };
}

async function metaOrderReconciliation(input = {}, options = {}) {
  const dateRange = reconciliationDateRange(input, options.now || new Date());
  const [databaseRecords, eventCoverage] = await Promise.all([
    (options.listRows || listMetaOrderReconciliationRows)(dateRange),
    (options.listCoverage || listMetaEventCoverage)(dateRange)
  ]);
  const pancakeConfig = options.pancakeConfig || require('../config/env').env.pancake;
  const pancakeClient = options.pancakeClient || (pancakeConfig?.configured ? createPancakeClient(pancakeConfig) : null);
  const livePancake = await (options.fetchLivePancakeOrders || fetchLivePancakeOrders)({
    config: pancakeConfig,
    client: pancakeClient,
    websiteRows: databaseRecords,
    ...dateRange
  });
  const records = mergeLivePancakeRows(databaseRecords, livePancake);
  const rows = records.map(reconcileOrder);
  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    summary: summarize(rows),
    rows,
    eventCoverage,
    pancakeOnlyOrders: rows.filter((row) => row.recordType === 'pancake_only'),
    identityStrategy: {
      internalOrderIdField: 'order_number',
      publicOrderNumberField: 'order_number',
      note: 'This schema uses the immutable public order number as the database primary order identity; it does not have a separate internal order UUID.'
    },
    livePancake: {
      available: livePancake.available,
      complete: livePancake.complete,
      status: livePancake.status,
      errorCode: livePancake.errorCode,
      fetchedAt: livePancake.fetchedAt,
      providerTotalEntries: livePancake.providerTotalEntries,
      periodOrderCount: livePancake.providerPeriodOrderCount,
      providerListComplete: livePancake.providerListComplete,
      unresolvedCreatedAtCount: livePancake.unresolvedCreatedAtCount,
      linkedDetailsComplete: livePancake.linkedDetailsComplete,
      linkedDetailCount: livePancake.linkedDetailCount,
      linkedDetailErrorCount: livePancake.linkedDetailErrorCount
    },
    dataAvailability: {
      websiteDatabaseOrders: { available: true, source: 'Authoritative website order database' },
      pancakeOrderLinks: { available: true, source: 'Pancake order links, exports, and cached provider snapshots' },
      pancakeLiveCompleteness: {
        available: livePancake.complete,
        reason: livePancake.complete
          ? `Pancake was fetched read-only and fully paginated at ${livePancake.fetchedAt}. The exact provider-created period contains ${livePancake.providerPeriodOrderCount} orders, and ${livePancake.linkedDetailCount} linked website orders were verified from provider details.`
          : `Live Pancake completeness is unavailable (${livePancake.errorCode || livePancake.status}). Linked exports and cached snapshots are shown, but must not be treated as the complete Pancake order count.`
      },
      metaDispatches: { available: true, source: 'Saved browser/server dispatch ledger and CAPI outbox' },
      metaRawEvents: {
        available: false,
        reason: 'Raw Meta Events Manager events require a Meta export or an access token with the required dataset permissions.'
      },
      metaAdsAttributedPurchases: {
        available: false,
        reason: 'Ads-attributed purchases, attribution windows, reporting time, campaign filters, and ad-account time zone require Meta Ads Insights ads_read access or an exported report.'
      },
      automaticEventRules: {
        available: false,
        reason: 'Meta Event Setup Tool and automatic-event account rules must be reviewed in the Meta Events Manager interface.'
      }
    }
  };
}

module.exports = {
  BUSINESS_TIME_ZONE,
  centsFromMetaValue,
  fetchLivePancakeOrders,
  metaOrderReconciliation,
  mergeLivePancakeRows,
  pancakePayableCents,
  reconcileOrder,
  reconciliationDateRange,
  safeDate,
  summarize,
  todayInManila
};
