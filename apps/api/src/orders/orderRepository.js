const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');
const { resolveRuntimeDataFile } = require('../db/runtimeDataFile');

const DEFAULT_ORDERS_FILE = path.join(__dirname, '..', '..', 'data', 'orders.json');

function ordersDataFile() {
  return resolveRuntimeDataFile('ORDERS_DATA_FILE', DEFAULT_ORDERS_FILE);
}

function usePostgresOrders() {
  return hasDatabaseUrl() && !process.env.ORDERS_DATA_FILE;
}

async function readOrderStore() {
  try {
    const raw = await fs.readFile(ordersDataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      statusEvents: Array.isArray(parsed.statusEvents) ? parsed.statusEvents : [],
      trackingNotifications: Array.isArray(parsed.trackingNotifications) ? parsed.trackingNotifications : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { orders: [], statusEvents: [], trackingNotifications: [] };
    }
    throw error;
  }
}

async function writeOrderStore(store) {
  const filePath = ordersDataFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({
    orders: store.orders,
    statusEvents: store.statusEvents || [],
    trackingNotifications: store.trackingNotifications || []
  }, null, 2)}\n`);
}

async function saveOrder(order, options = {}) {
  if (usePostgresOrders()) {
    await upsertPostgresOrder(order, options.client);
    return order;
  }

  const store = await readOrderStore();
  const existingIndex = store.orders.findIndex((item) => item.orderNumber === order.orderNumber);

  if (existingIndex >= 0) {
    store.orders[existingIndex] = order;
  } else {
    store.orders.push(order);
  }

  await writeOrderStore(store);
  return order;
}

async function findOrderByIdempotencyKey(key, options = {}) {
  const normalized = String(key || '').trim();
  if (!normalized) return null;
  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const result = await executor.query('SELECT * FROM orders WHERE checkout_idempotency_key = $1', [normalized]);
    return result.rows[0] ? fromPostgresOrder(result.rows[0]) : null;
  }
  const store = await readOrderStore();
  return store.orders.find((order) => order.checkoutIdempotencyKey === normalized) || null;
}

async function listOrders() {
  if (usePostgresOrders()) {
    const result = await query('SELECT * FROM orders ORDER BY placed_at DESC');
    return result.rows.map((row) => ({ ...fromPostgresOrder(row), statusEvents: [] }));
  }

  const store = await readOrderStore();
  return store.orders
    .slice()
    .sort((a, b) => String(b.placedAt || '').localeCompare(String(a.placedAt || '')))
    .map((order) => ({ ...order, statusEvents: [] }));
}

async function productSalesCounts() {
  if (usePostgresOrders()) {
    const result = await query(
      `SELECT COALESCE(NULLIF(item->>'productId', ''), NULLIF(item->>'slug', '')) AS product_id,
              SUM(GREATEST(0, CASE
                WHEN COALESCE(item->>'quantity', '') ~ '^\\d+$' THEN (item->>'quantity')::integer
                ELSE 0
              END))::integer AS quantity
         FROM orders
         CROSS JOIN LATERAL jsonb_array_elements(items) AS item
        WHERE lower(status) NOT IN ('cancelled','canceled','returned','failed','expired','unreachable','draft','pending_payment','abandoned_checkout')
          AND lower(payment_status) NOT IN ('unpaid','failed','expired','pending_payment','cancelled','canceled','refunded')
          AND COALESCE(NULLIF(item->>'productId', ''), NULLIF(item->>'slug', '')) IS NOT NULL
        GROUP BY COALESCE(NULLIF(item->>'productId', ''), NULLIF(item->>'slug', ''))`
    );
    return new Map(result.rows.map((row) => [String(row.product_id), Number(row.quantity || 0)]));
  }
  const store = await readOrderStore();
  const counts = new Map();
  const excludedStatuses = new Set(['cancelled', 'canceled', 'returned', 'failed', 'expired', 'unreachable', 'draft', 'pending_payment', 'abandoned_checkout']);
  const excludedPayments = new Set(['unpaid', 'failed', 'expired', 'pending_payment', 'cancelled', 'canceled', 'refunded']);
  for (const order of store.orders) {
    if (excludedStatuses.has(String(order.status || '').toLowerCase()) || excludedPayments.has(String(order.paymentStatus || '').toLowerCase())) continue;
    for (const item of order.items || []) {
      const productId = String(item.productId || item.slug || '').trim();
      if (!productId) continue;
      counts.set(productId, (counts.get(productId) || 0) + Math.max(0, Math.trunc(Number(item.quantity || 0))));
    }
  }
  return counts;
}

async function findOrderByNumber(orderNumber, options = {}) {
  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const lockClause = options.forUpdate ? ' FOR UPDATE' : '';
    const result = await executor.query(`SELECT * FROM orders WHERE order_number = $1${lockClause}`, [orderNumber]);
    if (!result.rows[0]) return null;
    const order = fromPostgresOrder(result.rows[0]);
    if (options.includeRelated === false) return order;
    return {
      ...order,
      statusEvents: await listOrderStatusEvents(orderNumber, options),
      trackingNotifications: await listOrderTrackingNotifications(orderNumber, options)
    };
  }

  const store = await readOrderStore();
  const order = store.orders.find((item) => item.orderNumber === orderNumber);
  if (!order) return null;
  return {
    ...order,
    statusEvents: store.statusEvents
      .filter((event) => event.orderNumber === orderNumber)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    trackingNotifications: store.trackingNotifications
      .filter((notification) => notification.orderNumber === orderNumber)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  };
}

async function updateOrder(orderNumber, changes, options = {}) {
  if (usePostgresOrders()) {
    const existing = options.existingOrder || await findOrderByNumber(orderNumber, {
      ...options,
      includeRelated: false
    });
    if (!existing) return null;
    const updatedOrder = {
      ...existing,
      ...changes,
      updatedAt: new Date().toISOString()
    };
    await upsertPostgresOrder(updatedOrder, options.client);
    return updatedOrder;
  }

  const store = await readOrderStore();
  const existingIndex = store.orders.findIndex((order) => order.orderNumber === orderNumber);

  if (existingIndex < 0) return null;

  const updatedOrder = {
    ...store.orders[existingIndex],
    ...changes,
    updatedAt: new Date().toISOString()
  };
  store.orders[existingIndex] = updatedOrder;
  await writeOrderStore(store);
  return updatedOrder;
}

async function updateOrderAdminEmailState(orderNumber, changes = {}, options = {}) {
  const status = String(changes.status || 'not_queued').trim().slice(0, 40);
  const errorMessage = String(changes.error || '').trim().slice(0, 1000);
  const sentAt = changes.sentAt || null;

  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `UPDATE orders
          SET admin_email_sent_at = COALESCE($2, admin_email_sent_at),
              admin_email_status = $3,
              admin_email_error = $4,
              updated_at = now()
        WHERE order_number = $1
        RETURNING *`,
      [orderNumber, sentAt, status, errorMessage]
    );
    return result.rows[0] ? fromPostgresOrder(result.rows[0]) : null;
  }

  const store = await readOrderStore();
  const existingIndex = store.orders.findIndex((order) => order.orderNumber === orderNumber);
  if (existingIndex < 0) return null;
  const existing = store.orders[existingIndex];
  const updated = {
    ...existing,
    adminEmailSentAt: sentAt || existing.adminEmailSentAt || '',
    adminEmailStatus: status,
    adminEmailError: errorMessage,
    updatedAt: new Date().toISOString()
  };
  store.orders[existingIndex] = updated;
  await writeOrderStore(store);
  return updated;
}

async function claimOrderMetaBrowserPurchase(orderNumber, {
  claimId,
  claimedAt = new Date(),
  staleBefore = new Date(Date.now() - 2 * 60_000)
} = {}, options = {}) {
  const normalizedClaimId = String(claimId || '').trim();
  if (!normalizedClaimId) return null;

  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `UPDATE orders
          SET meta_browser_purchase_claim_id = $2,
              meta_browser_purchase_claimed_at = $3,
              meta_purchase_status = CASE
                WHEN meta_capi_purchase_sent_at IS NOT NULL THEN 'capi_sent_browser_claimed'
                ELSE 'browser_claimed'
              END,
              meta_purchase_last_error = '',
              updated_at = now()
        WHERE order_number = $1
          AND meta_purchase_tracking_version >= 2
          AND meta_browser_purchase_sent_at IS NULL
          AND (meta_browser_purchase_claimed_at IS NULL OR meta_browser_purchase_claimed_at <= $4)
        RETURNING *`,
      [orderNumber, normalizedClaimId, claimedAt, staleBefore]
    );
    return result.rows[0] ? fromPostgresOrder(result.rows[0]) : null;
  }

  const store = await readOrderStore();
  const index = store.orders.findIndex((order) => order.orderNumber === orderNumber);
  if (index < 0) return null;
  const existing = store.orders[index];
  const previousClaimAt = new Date(existing.metaBrowserPurchaseClaimedAt || 0).getTime();
  if (Number(existing.metaPurchaseTrackingVersion || 1) < 2 || existing.metaBrowserPurchaseSentAt || previousClaimAt > staleBefore.getTime()) {
    return null;
  }
  const updated = {
    ...existing,
    metaBrowserPurchaseClaimId: normalizedClaimId,
    metaBrowserPurchaseClaimedAt: claimedAt.toISOString(),
    metaPurchaseStatus: existing.metaCapiPurchaseSentAt ? 'capi_sent_browser_claimed' : 'browser_claimed',
    metaPurchaseLastError: '',
    updatedAt: new Date().toISOString()
  };
  store.orders[index] = updated;
  await writeOrderStore(store);
  return updated;
}

async function completeOrderMetaBrowserPurchase(orderNumber, { claimId, sent, completedAt = new Date() } = {}, options = {}) {
  const normalizedClaimId = String(claimId || '').trim();
  if (!normalizedClaimId) return null;

  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `UPDATE orders
          SET meta_browser_purchase_claim_id = '',
              meta_browser_purchase_claimed_at = NULL,
              meta_browser_purchase_sent_at = CASE
                WHEN $3::boolean THEN COALESCE(meta_browser_purchase_sent_at, $4)
                ELSE meta_browser_purchase_sent_at
              END,
              meta_purchase_status = CASE
                WHEN $3::boolean AND meta_capi_purchase_sent_at IS NOT NULL THEN 'complete'
                WHEN $3::boolean THEN 'browser_sent'
                WHEN meta_capi_purchase_sent_at IS NOT NULL THEN 'capi_sent'
                WHEN meta_capi_purchase_queued_at IS NOT NULL THEN 'capi_queued'
                ELSE 'eligible'
              END,
              updated_at = now()
        WHERE order_number = $1
          AND meta_browser_purchase_claim_id = $2
        RETURNING *`,
      [orderNumber, normalizedClaimId, Boolean(sent), completedAt]
    );
    return result.rows[0] ? fromPostgresOrder(result.rows[0]) : null;
  }

  const store = await readOrderStore();
  const index = store.orders.findIndex((order) => order.orderNumber === orderNumber);
  if (index < 0 || store.orders[index].metaBrowserPurchaseClaimId !== normalizedClaimId) return null;
  const existing = store.orders[index];
  const updated = {
    ...existing,
    metaBrowserPurchaseClaimId: '',
    metaBrowserPurchaseClaimedAt: '',
    metaBrowserPurchaseSentAt: sent
      ? (existing.metaBrowserPurchaseSentAt || completedAt.toISOString())
      : (existing.metaBrowserPurchaseSentAt || ''),
    metaPurchaseStatus: sent
      ? (existing.metaCapiPurchaseSentAt ? 'complete' : 'browser_sent')
      : existing.metaCapiPurchaseSentAt
        ? 'capi_sent'
        : existing.metaCapiPurchaseQueuedAt
          ? 'capi_queued'
          : 'eligible',
    updatedAt: new Date().toISOString()
  };
  store.orders[index] = updated;
  await writeOrderStore(store);
  return updated;
}

async function resetOrderRepositoryForTests() {
  if (usePostgresOrders()) {
    await query('DELETE FROM order_status_events');
    await query('DELETE FROM order_tracking_notifications');
    await query('DELETE FROM orders');
    return;
  }
  await writeOrderStore({ orders: [], statusEvents: [], trackingNotifications: [] });
}

async function appendOrderStatusEvent(orderNumber, event, options = {}) {
  const normalized = normalizeStatusEvent(orderNumber, event);

  if (usePostgresOrders()) {
    const executor = options.client || { query };
    await executor.query(
      `INSERT INTO order_status_events (id, order_number, source, changes, note, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        normalized.id,
        normalized.orderNumber,
        normalized.source,
        JSON.stringify(normalized.changes),
        normalized.note,
        normalized.createdAt
      ]
    );
    return normalized;
  }

  const store = await readOrderStore();
  store.statusEvents.push(normalized);
  await writeOrderStore(store);
  return normalized;
}

async function listOrderStatusEvents(orderNumber, options = {}) {
  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `SELECT * FROM order_status_events
       WHERE order_number = $1
       ORDER BY created_at DESC, id DESC`,
      [orderNumber]
    );
    return result.rows.map(fromPostgresStatusEvent);
  }

  const store = await readOrderStore();
  return store.statusEvents
    .filter((event) => event.orderNumber === orderNumber)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function appendOrderTrackingNotification(orderNumber, notification) {
  const normalized = normalizeTrackingNotification(orderNumber, notification);

  if (usePostgresOrders()) {
    await query(
      `INSERT INTO order_tracking_notifications (
         id, order_number, channel, status, source, recipient, tracking_number, message, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        normalized.id,
        normalized.orderNumber,
        normalized.channel,
        normalized.status,
        normalized.source,
        normalized.recipient,
        normalized.trackingNumber,
        normalized.message,
        normalized.createdAt
      ]
    );
    return normalized;
  }

  const store = await readOrderStore();
  store.trackingNotifications.push(normalized);
  await writeOrderStore(store);
  return normalized;
}

async function listOrderTrackingNotifications(orderNumber, options = {}) {
  if (usePostgresOrders()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `SELECT * FROM order_tracking_notifications
       WHERE order_number = $1
       ORDER BY created_at DESC, id DESC`,
      [orderNumber]
    );
    return result.rows.map(fromPostgresTrackingNotification);
  }

  const store = await readOrderStore();
  return store.trackingNotifications
    .filter((notification) => notification.orderNumber === orderNumber)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function upsertPostgresOrder(order, transactionClient) {
  const executor = transactionClient || { query };
  await executor.query(
    `INSERT INTO orders (
      order_number, customer, address, items, subtotal_cents, discount_total_cents,
      shipping_fee_cents, shipping_region, shipping_region_label, free_shipping_unlocked,
      total_cents, cart_snapshot, checkout_channel, payment_method, channel, status,
      fulfillment_status, payment_status, cod_confirmation_status, delivery_status,
      delivery_method, tracking_number, tags, notes, exported_to_jnt, jnt_exported_at,
      admin_editable_totals, placed_at, updated_at, discount_code, customer_account_id, discount_snapshot,
      checkout_idempotency_key, confirmation_token_hash, confirmation_token_created_at,
      parcel_weight_grams, parcel_weight_override_grams,payment_provider,provider_checkout_session_id,
      provider_payment_id,paid_amount_cents,paid_at,payment_expires_at,inventory_reservation_status,payment_metadata,
      meta_purchase_event_id,meta_purchase_tracking_version,meta_browser_purchase_claim_id,
      meta_browser_purchase_claimed_at,meta_browser_purchase_sent_at,meta_capi_purchase_queued_at,
      meta_capi_purchase_sent_at,meta_purchase_status,meta_purchase_last_error
    ) VALUES (
      $1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10,
      $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23::jsonb, $24, $25, $26, $27::jsonb, $28, $29, $30, $31, $32::jsonb, $33, $34, $35, $36, $37,
      $38,$39,$40,$41,$42,$43,$44,$45::jsonb,$46,$47,$48,$49,$50,$51,$52,$53,$54
    )
    ON CONFLICT (order_number) DO UPDATE SET
      customer = EXCLUDED.customer,
      address = EXCLUDED.address,
      items = EXCLUDED.items,
      subtotal_cents = EXCLUDED.subtotal_cents,
      discount_total_cents = EXCLUDED.discount_total_cents,
      shipping_fee_cents = EXCLUDED.shipping_fee_cents,
      shipping_region = EXCLUDED.shipping_region,
      shipping_region_label = EXCLUDED.shipping_region_label,
      free_shipping_unlocked = EXCLUDED.free_shipping_unlocked,
      total_cents = EXCLUDED.total_cents,
      cart_snapshot = EXCLUDED.cart_snapshot,
      checkout_channel = EXCLUDED.checkout_channel,
      payment_method = EXCLUDED.payment_method,
      channel = EXCLUDED.channel,
      status = EXCLUDED.status,
      fulfillment_status = EXCLUDED.fulfillment_status,
      payment_status = EXCLUDED.payment_status,
      cod_confirmation_status = EXCLUDED.cod_confirmation_status,
      delivery_status = EXCLUDED.delivery_status,
      delivery_method = EXCLUDED.delivery_method,
      tracking_number = EXCLUDED.tracking_number,
      tags = EXCLUDED.tags,
      notes = EXCLUDED.notes,
      exported_to_jnt = EXCLUDED.exported_to_jnt,
      jnt_exported_at = EXCLUDED.jnt_exported_at,
      admin_editable_totals = EXCLUDED.admin_editable_totals,
      discount_code = EXCLUDED.discount_code,
      customer_account_id = EXCLUDED.customer_account_id,
      discount_snapshot = EXCLUDED.discount_snapshot,
      checkout_idempotency_key = EXCLUDED.checkout_idempotency_key,
      confirmation_token_hash = EXCLUDED.confirmation_token_hash,
      confirmation_token_created_at = EXCLUDED.confirmation_token_created_at,
      parcel_weight_grams = EXCLUDED.parcel_weight_grams,
      parcel_weight_override_grams = EXCLUDED.parcel_weight_override_grams,
      payment_provider = EXCLUDED.payment_provider,
      provider_checkout_session_id = EXCLUDED.provider_checkout_session_id,
      provider_payment_id = EXCLUDED.provider_payment_id,
      paid_amount_cents = EXCLUDED.paid_amount_cents,
      paid_at = EXCLUDED.paid_at,
      payment_expires_at = EXCLUDED.payment_expires_at,
      inventory_reservation_status = EXCLUDED.inventory_reservation_status,
      payment_metadata = EXCLUDED.payment_metadata,
      placed_at = EXCLUDED.placed_at,
      updated_at = now()`,
    [
      order.orderNumber,
      JSON.stringify(order.customer || {}),
      JSON.stringify(order.address || {}),
      JSON.stringify(order.items || []),
      Number(order.subtotalCents || 0),
      Number(order.discountTotalCents || 0),
      Number(order.shippingFeeCents || 0),
      order.shippingRegion || '',
      order.shippingRegionLabel || '',
      Boolean(order.freeShippingUnlocked),
      Number(order.totalCents || 0),
      JSON.stringify(order.cartSnapshot || []),
      order.checkoutChannel || 'storefront_checkout',
      order.paymentMethod || 'cash_on_delivery',
      order.channel || 'Online Store',
      order.status || 'confirmed',
      order.fulfillmentStatus || 'unfulfilled',
      order.paymentStatus || 'cod_pending',
      order.codConfirmationStatus || 'pending',
      order.deliveryStatus || 'pending',
      order.deliveryMethod || 'Standard shipping',
      order.trackingNumber || '',
      JSON.stringify(order.tags || []),
      order.notes || '',
      Boolean(order.exportedToJnt),
      order.jntExportedAt || null,
      JSON.stringify(order.adminEditableTotals || {}),
      order.placedAt || new Date().toISOString(),
      order.updatedAt || null,
      order.discountCode || '',
      order.customerAccountId || '',
      JSON.stringify(order.discountSnapshot || {}),
      order.checkoutIdempotencyKey || '',
      order.confirmationTokenHash || '',
      order.confirmationTokenCreatedAt || null,
      Number(order.parcelWeightGrams || 0),
      order.parcelWeightOverrideGrams === null || order.parcelWeightOverrideGrams === undefined
        ? null
        : Number(order.parcelWeightOverrideGrams),
      order.paymentProvider || '',
      order.providerCheckoutSessionId || '',
      order.providerPaymentId || '',
      order.paidAmountCents === null || order.paidAmountCents === undefined ? null : Number(order.paidAmountCents),
      order.paidAt || null,
      order.paymentExpiresAt || null,
      order.inventoryReservationStatus || 'committed',
      JSON.stringify(order.paymentMetadata || {}),
      order.metaPurchaseEventId || '',
      Number(order.metaPurchaseTrackingVersion || 1),
      order.metaBrowserPurchaseClaimId || '',
      order.metaBrowserPurchaseClaimedAt || null,
      order.metaBrowserPurchaseSentAt || null,
      order.metaCapiPurchaseQueuedAt || null,
      order.metaCapiPurchaseSentAt || null,
      order.metaPurchaseStatus || 'legacy',
      String(order.metaPurchaseLastError || '').slice(0, 1000)
    ]
  );
}

function fromPostgresOrder(row) {
  return {
    orderNumber: row.order_number,
    customer: row.customer || {},
    address: row.address || {},
    items: row.items || [],
    subtotalCents: row.subtotal_cents,
    discountTotalCents: row.discount_total_cents,
    discountCode: row.discount_code || '',
    customerAccountId: row.customer_account_id || '',
    discountSnapshot: row.discount_snapshot || {},
    checkoutIdempotencyKey: row.checkout_idempotency_key || '',
    confirmationTokenHash: row.confirmation_token_hash || '',
    confirmationTokenCreatedAt: row.confirmation_token_created_at
      ? new Date(row.confirmation_token_created_at).toISOString()
      : '',
    parcelWeightGrams: Number(row.parcel_weight_grams || 0),
    parcelWeightOverrideGrams: row.parcel_weight_override_grams === null
      ? null
      : Number(row.parcel_weight_override_grams),
    shippingFeeCents: row.shipping_fee_cents,
    shippingRegion: row.shipping_region,
    shippingRegionLabel: row.shipping_region_label,
    freeShippingUnlocked: row.free_shipping_unlocked,
    totalCents: row.total_cents,
    cartSnapshot: row.cart_snapshot || [],
    checkoutChannel: row.checkout_channel,
    paymentMethod: row.payment_method,
    channel: row.channel,
    status: row.status,
    fulfillmentStatus: row.fulfillment_status,
    paymentStatus: row.payment_status,
    paymentProvider: row.payment_provider || '',
    providerCheckoutSessionId: row.provider_checkout_session_id || '',
    providerPaymentId: row.provider_payment_id || '',
    paidAmountCents: row.paid_amount_cents === null ? null : Number(row.paid_amount_cents),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : '',
    paymentExpiresAt: row.payment_expires_at ? new Date(row.payment_expires_at).toISOString() : '',
    inventoryReservationStatus: row.inventory_reservation_status || 'committed',
    paymentMetadata: row.payment_metadata || {},
    adminEmailSentAt: row.admin_email_sent_at ? new Date(row.admin_email_sent_at).toISOString() : '',
    adminEmailStatus: row.admin_email_status || 'not_queued',
    adminEmailError: row.admin_email_error || '',
    metaPurchaseEventId: row.meta_purchase_event_id || '',
    metaPurchaseTrackingVersion: Number(row.meta_purchase_tracking_version || 1),
    metaBrowserPurchaseClaimId: row.meta_browser_purchase_claim_id || '',
    metaBrowserPurchaseClaimedAt: row.meta_browser_purchase_claimed_at
      ? new Date(row.meta_browser_purchase_claimed_at).toISOString()
      : '',
    metaBrowserPurchaseSentAt: row.meta_browser_purchase_sent_at
      ? new Date(row.meta_browser_purchase_sent_at).toISOString()
      : '',
    metaCapiPurchaseQueuedAt: row.meta_capi_purchase_queued_at
      ? new Date(row.meta_capi_purchase_queued_at).toISOString()
      : '',
    metaCapiPurchaseSentAt: row.meta_capi_purchase_sent_at
      ? new Date(row.meta_capi_purchase_sent_at).toISOString()
      : '',
    metaPurchaseStatus: row.meta_purchase_status || 'legacy',
    metaPurchaseLastError: row.meta_purchase_last_error || '',
    codConfirmationStatus: row.cod_confirmation_status,
    deliveryStatus: row.delivery_status,
    deliveryMethod: row.delivery_method,
    trackingNumber: row.tracking_number,
    tags: row.tags || [],
    notes: row.notes || '',
    exportedToJnt: Boolean(row.exported_to_jnt),
    jntExportedAt: row.jnt_exported_at ? new Date(row.jnt_exported_at).toISOString() : '',
    adminEditableTotals: row.admin_editable_totals || {},
    placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

function normalizeStatusEvent(orderNumber, event) {
  const createdAt = event.createdAt || new Date().toISOString();
  return {
    id: event.id || `status-event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    orderNumber: String(orderNumber || event.orderNumber || '').trim(),
    source: String(event.source || 'admin').trim(),
    changes: event.changes && typeof event.changes === 'object' ? event.changes : {},
    note: String(event.note || ''),
    createdAt
  };
}

function normalizeTrackingNotification(orderNumber, notification) {
  const createdAt = notification.createdAt || new Date().toISOString();
  return {
    id: notification.id || `tracking-notification-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    orderNumber: String(orderNumber || notification.orderNumber || '').trim(),
    channel: String(notification.channel || 'sms').trim(),
    status: String(notification.status || 'recorded').trim(),
    source: String(notification.source || 'admin').trim(),
    recipient: String(notification.recipient || '').trim(),
    trackingNumber: String(notification.trackingNumber || '').trim(),
    message: String(notification.message || '').trim(),
    createdAt
  };
}

function fromPostgresStatusEvent(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    source: row.source,
    changes: row.changes || {},
    note: row.note || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

function fromPostgresTrackingNotification(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    channel: row.channel,
    status: row.status,
    source: row.source,
    recipient: row.recipient || '',
    trackingNumber: row.tracking_number || '',
    message: row.message || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

module.exports = {
  appendOrderStatusEvent,
  appendOrderTrackingNotification,
  claimOrderMetaBrowserPurchase,
  completeOrderMetaBrowserPurchase,
  findOrderByIdempotencyKey,
  findOrderByNumber,
  listOrderStatusEvents,
  listOrderTrackingNotifications,
  listOrders,
  productSalesCounts,
  resetOrderRepositoryForTests,
  saveOrder,
  updateOrder,
  updateOrderAdminEmailState
};
