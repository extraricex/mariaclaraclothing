const { hasDatabaseUrl, query } = require('../db/postgres');
const { listOrders } = require('../orders/orderRepository');
const { customerFullName } = require('../customers/customerName');

async function listMetaEventCoverage({ startUtc, endExclusiveUtc } = {}) {
  if (!hasDatabaseUrl()) return [];
  const result = await query(
    `SELECT event_name, source, status, count(*)::integer AS event_count
       FROM meta_event_dispatches
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY event_name, source, status
      ORDER BY event_name, source, status`,
    [startUtc, endExclusiveUtc]
  );
  return result.rows.map((row) => ({
    eventName: row.event_name,
    source: row.source,
    status: row.status,
    count: Number(row.event_count || 0)
  }));
}

function iso(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueText(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function cachedPancakePayableCents(normalized = {}, paymentMethod = '') {
  const prepaid = numberOrNull(normalized.prepaidAmountCents);
  const cod = numberOrNull(normalized.codAmountCents);
  const subtotal = numberOrNull(normalized.subtotalCents);
  const discount = numberOrNull(normalized.discountTotalCents);
  const shipping = numberOrNull(normalized.shippingFeeCents);
  const calculated = subtotal !== null && discount !== null && shipping !== null
    ? Math.max(0, subtotal - discount + shipping)
    : null;
  const paymongo = String(paymentMethod || normalized.paymentMethod || '').trim().toLowerCase() === 'paymongo';
  if (paymongo) return prepaid !== null && prepaid > 0 ? prepaid : calculated;
  if (cod !== null && cod > 0) return cod;
  if (prepaid !== null && prepaid > 0) return prepaid;
  return calculated ?? numberOrNull(normalized.totalCents);
}

function normalizeOutboxEvents(value) {
  const records = Array.isArray(value) ? value : [];
  return records.map((record) => ({
    eventId: String(record?.eventId || ''),
    status: String(record?.status || ''),
    attemptCount: Math.max(0, Number(record?.attemptCount || 0)),
    value: numberOrNull(record?.value),
    currency: String(record?.currency || ''),
    sentAt: iso(record?.sentAt),
    lastError: String(record?.lastError || '')
  }));
}

function normalizeDispatchEvents(value) {
  const records = Array.isArray(value) ? value : [];
  return records.map((record) => ({
    eventId: String(record?.eventId || ''),
    source: String(record?.source || ''),
    status: String(record?.status || ''),
    attemptCount: Math.max(0, Number(record?.attemptCount || 0)),
    value: numberOrNull(record?.value),
    currency: String(record?.currency || ''),
    sentAt: iso(record?.sentAt),
    errorCode: String(record?.errorCode || ''),
    errorMessage: String(record?.errorMessage || '')
  }));
}

function postgresRow(row) {
  const pancakeOrderIds = uniqueText([
    row.pancake_order_id,
    ...(Array.isArray(row.pancake_snapshot_order_ids) ? row.pancake_snapshot_order_ids : [])
  ]);
  return {
    recordType: 'website_order',
    orderNumber: String(row.order_number || ''),
    customerDisplayName: customerFullName(row.customer || {}) || 'Customer',
    customer: row.customer || {},
    address: row.address || {},
    items: Array.isArray(row.items) ? row.items : [],
    placedAt: iso(row.placed_at),
    paidAt: iso(row.paid_at),
    paymentMethod: String(row.payment_method || ''),
    paymentProvider: String(row.payment_provider || ''),
    paymentStatus: String(row.payment_status || ''),
    status: String(row.status || ''),
    inventoryReservationStatus: String(row.inventory_reservation_status || ''),
    checkoutChannel: String(row.checkout_channel || ''),
    isTestOrder: Boolean(row.is_test_order),
    totalCents: Number(row.total_cents || 0),
    paidAmountCents: numberOrNull(row.paid_amount_cents),
    currency: String(row.currency || ''),
    metaPurchaseTrackingVersion: Number(row.meta_purchase_tracking_version || 1),
    metaPurchaseEventId: String(row.meta_purchase_event_id || ''),
    metaPurchaseValue: numberOrNull(row.meta_purchase_value),
    metaPurchaseCurrency: String(row.meta_purchase_currency || ''),
    metaPurchaseStatus: String(row.meta_purchase_status || ''),
    metaPurchaseLastError: String(row.meta_purchase_last_error || ''),
    metaBrowserPurchaseSentAt: iso(row.meta_browser_purchase_sent_at),
    metaCapiPurchaseQueuedAt: iso(row.meta_capi_purchase_queued_at),
    metaCapiPurchaseSentAt: iso(row.meta_capi_purchase_sent_at),
    outboxEvents: normalizeOutboxEvents(row.outbox_events),
    dispatchEvents: normalizeDispatchEvents(row.dispatch_events),
    pancakeLinkCount: Math.max(Number(row.pancake_link_count || 0), pancakeOrderIds.length),
    pancakeOrderId: pancakeOrderIds[0] || '',
    pancakeOrderIds,
    pancakeSyncStatus: String(row.pancake_sync_status || 'not_linked'),
    pancakeSafeErrorCode: String(row.pancake_safe_error_code || ''),
    pancakeExportStatus: String(row.pancake_export_status || 'not_queued'),
    pancakeExportAttemptCount: Number(row.pancake_export_attempt_count || 0),
    pancakeExportSafeErrorCode: String(row.pancake_export_safe_error_code || ''),
    pancakeTotalCents: numberOrNull(row.pancake_total_cents),
    pancakePayableCents: numberOrNull(row.pancake_payable_cents)
  };
}

function memoryRow(order) {
  return {
    recordType: 'website_order',
    orderNumber: String(order.orderNumber || ''),
    customerDisplayName: customerFullName(order.customer || {}) || 'Customer',
    customer: order.customer || {},
    address: order.address || {},
    items: Array.isArray(order.items) ? order.items : [],
    placedAt: iso(order.placedAt),
    paidAt: iso(order.paidAt),
    paymentMethod: String(order.paymentMethod || ''),
    paymentProvider: String(order.paymentProvider || ''),
    paymentStatus: String(order.paymentStatus || ''),
    status: String(order.status || ''),
    inventoryReservationStatus: String(order.inventoryReservationStatus || ''),
    checkoutChannel: String(order.checkoutChannel || ''),
    isTestOrder: Boolean(order.isTestOrder),
    totalCents: Number(order.totalCents || 0),
    paidAmountCents: numberOrNull(order.paidAmountCents),
    currency: String(order.currency || ''),
    metaPurchaseTrackingVersion: Number(order.metaPurchaseTrackingVersion || 1),
    metaPurchaseEventId: String(order.metaPurchaseEventId || ''),
    metaPurchaseValue: numberOrNull(order.metaPurchaseValue),
    metaPurchaseCurrency: String(order.metaPurchaseCurrency || ''),
    metaPurchaseStatus: String(order.metaPurchaseStatus || ''),
    metaPurchaseLastError: String(order.metaPurchaseLastError || ''),
    metaBrowserPurchaseSentAt: iso(order.metaBrowserPurchaseSentAt),
    metaCapiPurchaseQueuedAt: iso(order.metaCapiPurchaseQueuedAt),
    metaCapiPurchaseSentAt: iso(order.metaCapiPurchaseSentAt),
    outboxEvents: [],
    dispatchEvents: [],
    pancakeLinkCount: 0,
    pancakeOrderId: '',
    pancakeOrderIds: [],
    pancakeSyncStatus: 'not_linked',
    pancakeSafeErrorCode: '',
    pancakeExportStatus: 'not_queued',
    pancakeExportAttemptCount: 0,
    pancakeExportSafeErrorCode: '',
    pancakeTotalCents: null,
    pancakePayableCents: null
  };
}

async function listMetaOrderReconciliationRows({ startUtc, endExclusiveUtc } = {}) {
  const start = new Date(startUtc);
  const end = new Date(endExclusiveUtc);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error('A valid reconciliation time range is required.');
  }

  if (!hasDatabaseUrl()) {
    return (await listOrders())
      .filter((order) => {
        const placedAt = new Date(order.placedAt || 0);
        return Number.isFinite(placedAt.getTime()) && placedAt >= start && placedAt < end;
      })
      .map(memoryRow);
  }

  const result = await query(
    `SELECT
       o.order_number,o.customer,o.address,o.items,o.placed_at,o.paid_at,
       o.payment_method,o.payment_provider,o.payment_status,o.status,
       o.inventory_reservation_status,o.checkout_channel,o.is_test_order,
       o.total_cents,o.paid_amount_cents,o.currency,o.meta_purchase_tracking_version,
       o.meta_purchase_event_id,o.meta_purchase_value,o.meta_purchase_currency,
       o.meta_purchase_status,o.meta_purchase_last_error,o.meta_browser_purchase_sent_at,
       o.meta_capi_purchase_queued_at,o.meta_capi_purchase_sent_at,
       COALESCE(meta.events,'[]'::jsonb) AS outbox_events,
       COALESCE(dispatch.events,'[]'::jsonb) AS dispatch_events,
       COALESCE(pancake.link_count,0)::integer AS pancake_link_count,
       COALESCE(pancake.pancake_order_id,'') AS pancake_order_id,
       COALESCE(snapshot_stats.order_ids,ARRAY[]::text[]) AS pancake_snapshot_order_ids,
       COALESCE(pancake.sync_status,'not_linked') AS pancake_sync_status,
       COALESCE(pancake.safe_error_code,'') AS pancake_safe_error_code,
       COALESCE(export.status,'not_queued') AS pancake_export_status,
       COALESCE(export.attempt_count,0)::integer AS pancake_export_attempt_count,
       COALESCE(export.safe_error_code,'') AS pancake_export_safe_error_code,
       CASE
         WHEN snapshot.normalized->>'totalCents' ~ '^[0-9]+$'
         THEN (snapshot.normalized->>'totalCents')::bigint
         ELSE NULL
       END AS pancake_total_cents,
       CASE
         WHEN lower(o.payment_method) = 'paymongo'
           AND snapshot.normalized->>'prepaidAmountCents' ~ '^[0-9]+$'
           AND (snapshot.normalized->>'prepaidAmountCents')::bigint > 0
         THEN (snapshot.normalized->>'prepaidAmountCents')::bigint
         WHEN lower(o.payment_method) <> 'paymongo'
           AND snapshot.normalized->>'codAmountCents' ~ '^[0-9]+$'
           AND (snapshot.normalized->>'codAmountCents')::bigint > 0
         THEN (snapshot.normalized->>'codAmountCents')::bigint
         WHEN snapshot.normalized->>'subtotalCents' ~ '^[0-9]+$'
           AND snapshot.normalized->>'discountTotalCents' ~ '^[0-9]+$'
           AND snapshot.normalized->>'shippingFeeCents' ~ '^[0-9]+$'
         THEN GREATEST(
           0,
           (snapshot.normalized->>'subtotalCents')::bigint
             - (snapshot.normalized->>'discountTotalCents')::bigint
             + (snapshot.normalized->>'shippingFeeCents')::bigint
         )
         WHEN lower(o.payment_method) <> 'paymongo'
           AND snapshot.normalized->>'totalCents' ~ '^[0-9]+$'
         THEN (snapshot.normalized->>'totalCents')::bigint
         ELSE NULL
       END AS pancake_payable_cents
     FROM orders o
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
         'eventId',event.event_id,
         'status',event.status,
         'attemptCount',event.attempt_count,
         'value',event.payload->'custom_data'->>'value',
         'currency',event.payload->'custom_data'->>'currency',
         'sentAt',event.sent_at,
         'lastError',event.last_error
       ) ORDER BY event.created_at,event.id) AS events
       FROM marketing_event_outbox event
       WHERE event.aggregate_id=o.order_number AND event.event_name='Purchase'
     ) meta ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
         'eventId',event.event_id,
         'source',event.source,
         'status',event.status,
         'attemptCount',event.attempt_count,
         'value',event.value,
         'currency',event.currency,
         'sentAt',event.sent_at,
         'errorCode',event.error_code,
         'errorMessage',event.error_message
       ) ORDER BY event.created_at,event.id) AS events
       FROM meta_event_dispatches event
       WHERE event.order_number=o.order_number AND event.event_name='Purchase'
     ) dispatch ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS link_count,
              max(link.pancake_order_id) AS pancake_order_id,
              max(link.sync_status) AS sync_status,
              max(link.safe_error_code) AS safe_error_code
       FROM pancake_order_links link
       WHERE link.order_number=o.order_number
     ) pancake ON true
     LEFT JOIN pancake_order_exports export ON export.order_number=o.order_number
     LEFT JOIN LATERAL (
       SELECT count(DISTINCT candidate.pancake_order_id)::integer AS order_count,
              array_agg(DISTINCT candidate.pancake_order_id)
                FILTER (WHERE candidate.pancake_order_id <> '') AS order_ids
       FROM pancake_order_snapshots candidate
       WHERE candidate.order_number=o.order_number
          OR (pancake.pancake_order_id <> '' AND candidate.pancake_order_id=pancake.pancake_order_id)
     ) snapshot_stats ON true
     LEFT JOIN LATERAL (
       SELECT candidate.normalized
       FROM pancake_order_snapshots candidate
       WHERE candidate.order_number=o.order_number
          OR (pancake.pancake_order_id <> '' AND candidate.pancake_order_id=pancake.pancake_order_id)
       ORDER BY candidate.last_seen_at DESC
       LIMIT 1
     ) snapshot ON true
     WHERE o.placed_at >= $1 AND o.placed_at < $2
     ORDER BY o.placed_at DESC,o.order_number DESC`,
    [start.toISOString(), end.toISOString()]
  );
  const pancakeOnly = await query(
    `SELECT snapshot.pancake_order_id,snapshot.order_number,snapshot.normalized,
            snapshot.pancake_updated_at,snapshot.last_seen_at
       FROM pancake_order_snapshots snapshot
       LEFT JOIN orders direct_order
         ON snapshot.order_number <> '' AND direct_order.order_number=snapshot.order_number
       LEFT JOIN pancake_order_links link ON link.pancake_order_id=snapshot.pancake_order_id
       LEFT JOIN orders linked_order ON linked_order.order_number=link.order_number
      WHERE COALESCE(snapshot.pancake_updated_at,snapshot.last_seen_at) >= $1
        AND COALESCE(snapshot.pancake_updated_at,snapshot.last_seen_at) < $2
        AND direct_order.order_number IS NULL
        AND linked_order.order_number IS NULL
      ORDER BY COALESCE(snapshot.pancake_updated_at,snapshot.last_seen_at) DESC,snapshot.pancake_order_id`,
    [start.toISOString(), end.toISOString()]
  );
  return [
    ...result.rows.map(postgresRow),
    ...pancakeOnly.rows.map((row) => {
      const normalized = row.normalized || {};
      return {
        recordType: 'pancake_only',
        orderNumber: String(row.order_number || ''),
        customerDisplayName: '',
        customer: {},
        address: {},
        items: [],
        placedAt: iso(row.pancake_updated_at || row.last_seen_at),
        paidAt: '',
        paymentMethod: String(normalized.paymentMethod || ''),
        paymentProvider: '',
        paymentStatus: String(normalized.paymentStatus || ''),
        status: String(normalized.status || ''),
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
        pancakeOrderId: String(row.pancake_order_id || ''),
        pancakeOrderIds: uniqueText([row.pancake_order_id]),
        pancakeSyncStatus: 'provider_snapshot_only',
        pancakeSafeErrorCode: '',
        pancakeExportStatus: 'not_applicable',
        pancakeExportAttemptCount: 0,
        pancakeExportSafeErrorCode: '',
        pancakeTotalCents: numberOrNull(normalized.totalCents),
        pancakePayableCents: cachedPancakePayableCents(normalized, normalized.paymentMethod)
      };
    })
  ];
}

module.exports = {
  cachedPancakePayableCents,
  listMetaEventCoverage,
  listMetaOrderReconciliationRows,
  memoryRow,
  normalizeDispatchEvents,
  normalizeOutboxEvents,
  postgresRow
};
