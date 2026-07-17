const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');
const { updateAccountPassword } = require('./customerAccountRepository');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'data', 'customer-password-resets.json');
const RESET_TTL_MS = 30 * 60 * 1000;

function dataFile() {
  return process.env.PASSWORD_RESETS_DATA_FILE || DEFAULT_FILE;
}

function usePostgres() {
  return hasDatabaseUrl() && !process.env.PASSWORD_RESETS_DATA_FILE;
}

function tokenHash(token) {
  const secret = String(process.env.PASSWORD_RESET_SECRET || process.env.CUSTOMER_AUTH_SECRET || process.env.AUTH_SECRET || '');
  if (secret.length < 32) {
    const error = new Error('Password reset is not configured.');
    error.code = 'PASSWORD_RESET_NOT_CONFIGURED';
    throw error;
  }
  return crypto.createHmac('sha256', secret).update(String(token || '')).digest('hex');
}

async function createPasswordReset(customerAccountId, { now = new Date(), ttlMs = RESET_TTL_MS } = {}) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const hash = tokenHash(token);
  if (usePostgres()) {
    await transaction(async (client) => {
      await client.query(
        'UPDATE customer_password_resets SET used_at=$2 WHERE customer_account_id=$1 AND used_at IS NULL',
        [customerAccountId, now]
      );
      await client.query(
        `INSERT INTO customer_password_resets (id,customer_account_id,token_hash,expires_at,created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, customerAccountId, hash, expiresAt, now]
      );
    });
  } else {
    const rows = readFile();
    rows.forEach((row) => { if (row.customerAccountId === customerAccountId && !row.usedAt) row.usedAt = now.toISOString(); });
    rows.push({ id, customerAccountId, tokenHash: hash, expiresAt, usedAt: '', createdAt: now.toISOString() });
    writeFile(rows.slice(-5000));
  }
  return { id, token, expiresAt };
}

async function consumePasswordReset(token, password, { now = new Date() } = {}) {
  const normalized = String(token || '');
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(normalized)) return null;
  const hash = tokenHash(normalized);
  if (usePostgres()) {
    return transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM customer_password_resets
          WHERE token_hash=$1 AND used_at IS NULL AND expires_at > $2
          FOR UPDATE`,
        [hash, now]
      );
      const row = result.rows[0];
      if (!row) return null;
      const changed = await updateAccountPassword(row.customer_account_id, password, { client });
      if (!changed) return null;
      await client.query('UPDATE customer_password_resets SET used_at=$2 WHERE id=$1', [row.id, now]);
      return { customerAccountId: row.customer_account_id };
    });
  }
  const rows = readFile();
  const row = rows.find((candidate) => candidate.tokenHash === hash && !candidate.usedAt && new Date(candidate.expiresAt) > now);
  if (!row) return null;
  const changed = await updateAccountPassword(row.customerAccountId, password);
  if (!changed) return null;
  row.usedAt = now.toISOString();
  writeFile(rows);
  return { customerAccountId: row.customerAccountId };
}

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    return Array.isArray(parsed.resets) ? parsed.resets : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeFile(resets) {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  fs.writeFileSync(dataFile(), `${JSON.stringify({ resets }, null, 2)}\n`);
}

module.exports = { RESET_TTL_MS, consumePasswordReset, createPasswordReset, tokenHash };
