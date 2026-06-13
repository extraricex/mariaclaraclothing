const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const DEFAULT_ORDERS_FILE = path.join(__dirname, '..', '..', 'data', 'orders.json');

function ordersDataFile() {
  return process.env.ORDERS_DATA_FILE || DEFAULT_ORDERS_FILE;
}

function usePostgresOrders() {
  return hasDatabaseUrl() && !process.env.ORDERS_DATA_FILE;
}

async function readOrderStore() {
  try {
    const raw = await fs.readFile(ordersDataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { orders: [] };
    }
    throw error;
  }
}

async function writeOrderStore(store) {
  const filePath = ordersDataFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ orders: store.orders }, null, 2)}\n`);
}

async function saveOrder(order) {
  if (usePostgresOrders()) {
    await upsertPostgresOrder(order);
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

async function listOrders() {
  if (usePostgresOrders()) {
    const result = await query('SELECT * FROM orders ORDER BY placed_at DESC');
    return result.rows.map(fromPostgresOrder);
  }

  const store = await readOrderStore();
  return store.orders
    .slice()
    .sort((a, b) => String(b.placedAt || '').localeCompare(String(a.placedAt || '')));
}

async function findOrderByNumber(orderNumber) {
  if (usePostgresOrders()) {
    const result = await query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
    return result.rows[0] ? fromPostgresOrder(result.rows[0]) : null;
  }

  const store = await readOrderStore();
  return store.orders.find((order) => order.orderNumber === orderNumber) || null;
}

async function updateOrder(orderNumber, changes) {
  if (usePostgresOrders()) {
    const existing = await findOrderByNumber(orderNumber);
    if (!existing) return null;
    const updatedOrder = {
      ...existing,
      ...changes,
      updatedAt: new Date().toISOString()
    };
    await upsertPostgresOrder(updatedOrder);
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

async function resetOrderRepositoryForTests() {
  if (usePostgresOrders()) {
    await query('DELETE FROM orders');
    return;
  }
  await writeOrderStore({ orders: [] });
}

async function upsertPostgresOrder(order) {
  await query(
    `INSERT INTO orders (
      order_number, customer, address, items, subtotal_cents, discount_total_cents,
      shipping_fee_cents, shipping_region, shipping_region_label, free_shipping_unlocked,
      total_cents, cart_snapshot, checkout_channel, payment_method, channel, status,
      fulfillment_status, payment_status, cod_confirmation_status, delivery_status,
      delivery_method, tracking_number, tags, notes, exported_to_jnt, jnt_exported_at,
      admin_editable_totals, placed_at, updated_at, discount_code, discount_snapshot
    ) VALUES (
      $1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10,
      $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23::jsonb, $24, $25, $26, $27::jsonb, $28, $29, $30, $31::jsonb
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
      discount_snapshot = EXCLUDED.discount_snapshot,
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
      order.status || 'received',
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
      JSON.stringify(order.discountSnapshot || {})
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
    discountSnapshot: row.discount_snapshot || {},
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

module.exports = {
  findOrderByNumber,
  listOrders,
  resetOrderRepositoryForTests,
  saveOrder,
  updateOrder
};
