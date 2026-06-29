const crypto = require('node:crypto');

function isoDate(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function fromCheckoutQuote(row) {
  if (!row) return null;
  return {
    id: row.id,
    cartSessionId: row.cart_session_id,
    requestHash: row.request_hash,
    snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    finalizable: Boolean(row.finalizable),
    expiresAt: isoDate(row.expires_at),
    consumedOrderNumber: row.consumed_order_number || '',
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at)
  };
}

async function insertCheckoutQuote(client, snapshot, { ttlMs, now = new Date() } = {}) {
  const id = crypto.randomUUID();
  const createdAt = new Date(now);
  const lifetime = Number(ttlMs);
  const expiresAt = new Date(createdAt.getTime() + (
    Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 15 * 60 * 1000
  ));
  const result = await client.query(
    `INSERT INTO checkout_quotes (
       id, cart_session_id, request_hash, snapshot, finalizable,
       expires_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      snapshot.cartSessionId,
      snapshot.requestHash,
      JSON.stringify(snapshot),
      Boolean(snapshot.finalizable),
      expiresAt,
      createdAt,
      createdAt
    ]
  );
  return fromCheckoutQuote(result.rows[0]);
}

async function findCheckoutQuoteForUpdate(client, quoteId) {
  const result = await client.query(
    'SELECT * FROM checkout_quotes WHERE id = $1 FOR UPDATE',
    [String(quoteId || '')]
  );
  return fromCheckoutQuote(result.rows[0]);
}

async function consumeCheckoutQuote(client, quoteId, orderNumber) {
  const result = await client.query(
    `UPDATE checkout_quotes
     SET consumed_order_number = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [String(quoteId || ''), String(orderNumber || '')]
  );
  return fromCheckoutQuote(result.rows[0]);
}

async function deleteExpiredCheckoutQuotes(client, now = new Date()) {
  const result = await client.query(
    'DELETE FROM checkout_quotes WHERE expires_at <= $1',
    [now]
  );
  return result.rowCount;
}

module.exports = {
  consumeCheckoutQuote,
  deleteExpiredCheckoutQuotes,
  findCheckoutQuoteForUpdate,
  insertCheckoutQuote
};
