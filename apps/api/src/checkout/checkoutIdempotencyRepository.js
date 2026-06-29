const crypto = require('node:crypto');
const { CommerceError } = require('./commerceError');

function hashIdempotencyKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey || '').trim()).digest('hex');
}

function fromRow(row) {
  if (!row) return null;
  return {
    keyHash: row.key_hash,
    requestHash: row.request_hash,
    status: row.status,
    orderNumber: row.order_number || '',
    response: typeof row.response === 'string' ? JSON.parse(row.response) : (row.response || {}),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : ''
  };
}

async function claimIdempotency(client, { keyHash, requestHash, expiresAt }) {
  await client.query(
    `INSERT INTO checkout_idempotency (key_hash, request_hash, status, expires_at)
     VALUES ($1, $2, 'in_progress', $3)
     ON CONFLICT (key_hash) DO NOTHING`,
    [keyHash, requestHash, expiresAt]
  );
  const result = await client.query(
    'SELECT * FROM checkout_idempotency WHERE key_hash = $1 FOR UPDATE',
    [keyHash]
  );
  const record = fromRow(result.rows[0]);
  if (!record || record.requestHash !== requestHash) {
    throw new CommerceError('This checkout key was already used for another request.', {
      code: 'idempotency_conflict', status: 409
    });
  }
  return record;
}

async function completeIdempotency(client, { keyHash, orderNumber, response }) {
  const result = await client.query(
    `UPDATE checkout_idempotency
     SET status = 'completed', order_number = $2, response = $3::jsonb, updated_at = now()
     WHERE key_hash = $1
     RETURNING *`,
    [keyHash, orderNumber, JSON.stringify(response)]
  );
  return fromRow(result.rows[0]);
}

module.exports = { claimIdempotency, completeIdempotency, hashIdempotencyKey };
