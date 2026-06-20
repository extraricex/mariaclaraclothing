const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const DEFAULT_CART_SESSIONS_FILE = path.join(__dirname, '..', '..', 'data', 'cart-sessions.json');

function cartSessionsDataFile() {
  return process.env.CART_SESSIONS_DATA_FILE || DEFAULT_CART_SESSIONS_FILE;
}

function usePostgresCartSessions() {
  return hasDatabaseUrl() && !process.env.CART_SESSIONS_DATA_FILE;
}

async function readStore() {
  try {
    const raw = await fs.readFile(cartSessionsDataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { sessions: [] };
    throw error;
  }
}

async function writeStore(store) {
  const filePath = cartSessionsDataFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ sessions: store.sessions }, null, 2)}\n`);
}

async function upsertCartSession(sessionId, payload) {
  const record = normalizeCartSession(sessionId, payload);
  if (usePostgresCartSessions()) {
    await query(
      `INSERT INTO cart_sessions (
        session_id, status, customer, address, items, item_count, subtotal_cents,
        checkout_started_at, converted_order_number, last_activity_at, updated_at
      ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (session_id) DO UPDATE SET
        status = CASE WHEN cart_sessions.converted_order_number <> '' THEN cart_sessions.status ELSE EXCLUDED.status END,
        customer = CASE WHEN cart_sessions.converted_order_number <> '' THEN cart_sessions.customer ELSE EXCLUDED.customer END,
        address = CASE WHEN cart_sessions.converted_order_number <> '' THEN cart_sessions.address ELSE EXCLUDED.address END,
        items = CASE WHEN cart_sessions.converted_order_number <> '' THEN cart_sessions.items ELSE EXCLUDED.items END,
        item_count = CASE WHEN cart_sessions.converted_order_number <> '' THEN cart_sessions.item_count ELSE EXCLUDED.item_count END,
        subtotal_cents = CASE WHEN cart_sessions.converted_order_number <> '' THEN cart_sessions.subtotal_cents ELSE EXCLUDED.subtotal_cents END,
        checkout_started_at = COALESCE(cart_sessions.checkout_started_at, EXCLUDED.checkout_started_at),
        converted_order_number = cart_sessions.converted_order_number,
        last_activity_at = EXCLUDED.last_activity_at,
        updated_at = EXCLUDED.updated_at`,
      [
        record.sessionId,
        record.status,
        JSON.stringify(record.customer),
        JSON.stringify(record.address),
        JSON.stringify(record.items),
        record.itemCount,
        record.subtotalCents,
        record.checkoutStartedAt || null,
        record.convertedOrderNumber,
        record.lastActivityAt,
        record.updatedAt
      ]
    );
    return record;
  }

  const store = await readStore();
  const index = store.sessions.findIndex((session) => session.sessionId === record.sessionId);
  if (index >= 0) {
    const existing = store.sessions[index];
    store.sessions[index] = existing.convertedOrderNumber ? {
      ...existing,
      lastActivityAt: record.lastActivityAt,
      updatedAt: record.updatedAt
    } : {
      ...existing,
      ...record,
      checkoutStartedAt: existing.checkoutStartedAt || record.checkoutStartedAt
    };
  } else {
    store.sessions.push(record);
  }
  await writeStore(store);
  return record;
}

async function listCartSessions(status) {
  if (usePostgresCartSessions()) {
    const result = await query(
      `SELECT * FROM cart_sessions
       WHERE ($1::text = '' OR status = $1)
         AND converted_order_number = ''
         AND item_count > 0
       ORDER BY last_activity_at DESC`,
      [String(status || '')]
    );
    return result.rows.map(fromPostgresCartSession);
  }

  const store = await readStore();
  return store.sessions
    .filter((session) => !status || session.status === status)
    .filter((session) => !session.convertedOrderNumber && Number(session.itemCount || 0) > 0)
    .sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')));
}

async function markCartSessionConverted(sessionId, orderNumber, options = {}) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const convertedAt = new Date().toISOString();

  if (usePostgresCartSessions()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `UPDATE cart_sessions
       SET status = 'converted',
           converted_order_number = $2,
           updated_at = $3
       WHERE session_id = $1
       RETURNING *`,
      [id, String(orderNumber || '').trim(), convertedAt]
    );
    return result.rows[0] ? fromPostgresCartSession(result.rows[0]) : null;
  }

  const store = await readStore();
  const index = store.sessions.findIndex((session) => session.sessionId === id);
  if (index < 0) return null;
  store.sessions[index] = {
    ...store.sessions[index],
    status: 'converted',
    convertedOrderNumber: String(orderNumber || '').trim(),
    updatedAt: convertedAt
  };
  await writeStore(store);
  return store.sessions[index];
}

function normalizeCartSession(sessionId, payload = {}) {
  const id = String(sessionId || '').trim();
  if (!id) {
    const error = new Error('Cart session id is required');
    error.status = 400;
    throw error;
  }

  const items = Array.isArray(payload.items) ? payload.items.map(normalizeItem).filter((item) => item.quantity > 0) : [];
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const checkoutStarted = Boolean(payload.checkoutStarted);
  const now = new Date().toISOString();
  const status = itemCount <= 0 ? 'empty' : checkoutStarted ? 'abandoned_checkout' : 'draft';

  return {
    sessionId: id,
    status,
    customer: normalizeCustomer(payload.customer),
    address: normalizeAddress(payload.address),
    items,
    itemCount,
    subtotalCents,
    checkoutStartedAt: checkoutStarted ? now : '',
    convertedOrderNumber: '',
    lastActivityAt: now,
    updatedAt: now
  };
}

function normalizeItem(item) {
  return {
    productId: String(item?.productId || '').trim(),
    variantId: String(item?.variantId || '').trim(),
    productName: String(item?.productName || '').trim(),
    size: String(item?.size || '').trim(),
    imageUrl: String(item?.imageUrl || '').trim(),
    unitPriceCents: Math.max(0, Math.round(Number(item?.unitPriceCents || 0))),
    quantity: Math.max(0, Math.round(Number(item?.quantity || 0)))
  };
}

function normalizeCustomer(customer = {}) {
  return {
    fullName: String(customer.fullName || '').trim(),
    phone: String(customer.phone || '').trim(),
    email: String(customer.email || '').trim()
  };
}

function normalizeAddress(address = {}) {
  return {
    addressLine: String(address.addressLine || '').trim(),
    province: String(address.province || '').trim(),
    city: String(address.city || '').trim(),
    barangay: String(address.barangay || '').trim()
  };
}

function cartSessionSummary(session) {
  const customerName = String(session.customer?.fullName || '').trim() || 'Anonymous';
  return {
    sessionId: session.sessionId,
    status: session.status,
    customerName,
    phone: session.customer?.phone || '',
    email: session.customer?.email || '',
    addressLine: session.address?.addressLine || '',
    itemCount: Number(session.itemCount || 0),
    subtotalCents: Number(session.subtotalCents || 0),
    items: Array.isArray(session.items) ? session.items : [],
    checkoutStartedAt: session.checkoutStartedAt || '',
    lastActivityAt: session.lastActivityAt || '',
    convertedOrderNumber: session.convertedOrderNumber || ''
  };
}

function fromPostgresCartSession(row) {
  return {
    sessionId: row.session_id,
    status: row.status,
    customer: row.customer || {},
    address: row.address || {},
    items: row.items || [],
    itemCount: row.item_count,
    subtotalCents: row.subtotal_cents,
    checkoutStartedAt: row.checkout_started_at ? new Date(row.checkout_started_at).toISOString() : '',
    convertedOrderNumber: row.converted_order_number || '',
    lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

module.exports = {
  cartSessionSummary,
  listCartSessions,
  markCartSessionConverted,
  upsertCartSession
};
