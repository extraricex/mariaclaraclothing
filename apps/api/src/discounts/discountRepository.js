const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const DEFAULT_DISCOUNTS_FILE = path.join(__dirname, '..', '..', 'data', 'discounts.json');
const DISCOUNT_TYPES = new Set(['percentage', 'fixed']);
const DISCOUNT_STATUSES = new Set(['active', 'disabled']);

function discountsDataFile() {
  return process.env.DISCOUNTS_DATA_FILE || DEFAULT_DISCOUNTS_FILE;
}

function usePostgresDiscounts() {
  return hasDatabaseUrl() && !process.env.DISCOUNTS_DATA_FILE;
}

function normalizeDiscountCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeDiscount(discount) {
  const code = normalizeDiscountCode(discount.code);
  const type = DISCOUNT_TYPES.has(discount.type) ? discount.type : 'percentage';
  const status = DISCOUNT_STATUSES.has(discount.status) ? discount.status : 'active';
  const value = Math.max(0, Math.round(Number(discount.value) || 0));
  const usageLimit = discount.usageLimit === null || discount.usageLimit === undefined || discount.usageLimit === ''
    ? null
    : Math.max(0, Math.round(Number(discount.usageLimit) || 0));
  const minimumSubtotalCents = discount.minimumSubtotalCents === null || discount.minimumSubtotalCents === undefined || discount.minimumSubtotalCents === ''
    ? null
    : Math.max(0, Math.round(Number(discount.minimumSubtotalCents) || 0));
  const endsAt = discount.endsAt ? new Date(discount.endsAt).toISOString() : null;

  return {
    code,
    type,
    value,
    status,
    endsAt,
    usageLimit,
    usageCount: Math.max(0, Math.round(Number(discount.usageCount) || 0)),
    minimumSubtotalCents,
    createdAt: discount.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function validateDiscount(discount) {
  if (!discount.code) {
    const error = new Error('Discount code is required');
    error.status = 400;
    throw error;
  }
  if (discount.type === 'percentage' && (discount.value < 1 || discount.value > 100)) {
    const error = new Error('Percentage discount must be between 1 and 100');
    error.status = 400;
    throw error;
  }
  if (discount.type === 'fixed' && discount.value < 1) {
    const error = new Error('Fixed discount must be at least 1 centavo');
    error.status = 400;
    throw error;
  }
}

function readDiscountsFile() {
  const filePath = discountsDataFile();
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed.discounts) ? parsed.discounts : [];
}

function writeDiscountsFile(discounts) {
  fs.writeFileSync(discountsDataFile(), `${JSON.stringify({ discounts }, null, 2)}\n`);
}

function fromPostgresDiscount(row) {
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    status: row.status,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    usageLimit: row.usage_limit,
    usageCount: row.usage_count,
    minimumSubtotalCents: row.minimum_subtotal_cents,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function listDiscounts() {
  if (usePostgresDiscounts()) {
    return query('SELECT * FROM discount_codes ORDER BY created_at DESC')
      .then(({ rows }) => rows.map(fromPostgresDiscount));
  }
  return readDiscountsFile();
}

function findDiscountByCode(code) {
  const normalized = normalizeDiscountCode(code);
  if (!normalized) return usePostgresDiscounts() ? Promise.resolve(null) : null;
  if (usePostgresDiscounts()) {
    return query('SELECT * FROM discount_codes WHERE code = $1', [normalized])
      .then(({ rows }) => rows.length ? fromPostgresDiscount(rows[0]) : null);
  }
  return readDiscountsFile().find((discount) => discount.code === normalized) || null;
}

function saveDiscount(discount) {
  const record = normalizeDiscount(discount);
  validateDiscount(record);

  if (usePostgresDiscounts()) {
    return query(
      `INSERT INTO discount_codes (code, type, value, status, ends_at, usage_limit, usage_count, minimum_subtotal_cents, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (code) DO UPDATE SET
         type = EXCLUDED.type,
         value = EXCLUDED.value,
         status = EXCLUDED.status,
         ends_at = EXCLUDED.ends_at,
         usage_limit = EXCLUDED.usage_limit,
         usage_count = EXCLUDED.usage_count,
         minimum_subtotal_cents = EXCLUDED.minimum_subtotal_cents,
         updated_at = EXCLUDED.updated_at`,
      [record.code, record.type, record.value, record.status, record.endsAt, record.usageLimit,
        record.usageCount, record.minimumSubtotalCents, record.createdAt, record.updatedAt]
    ).then(() => record);
  }

  const discounts = readDiscountsFile().filter((existing) => existing.code !== record.code);
  discounts.unshift(record);
  writeDiscountsFile(discounts);
  return record;
}

function deleteDiscount(code) {
  const normalized = normalizeDiscountCode(code);
  if (usePostgresDiscounts()) {
    return query('DELETE FROM discount_codes WHERE code = $1 RETURNING *', [normalized])
      .then(({ rows }) => rows.length ? fromPostgresDiscount(rows[0]) : null);
  }
  const discounts = readDiscountsFile();
  const deleted = discounts.find((discount) => discount.code === normalized) || null;
  if (deleted) {
    writeDiscountsFile(discounts.filter((discount) => discount.code !== normalized));
  }
  return deleted;
}

function incrementDiscountUsage(code) {
  const normalized = normalizeDiscountCode(code);
  if (usePostgresDiscounts()) {
    return query(
      'UPDATE discount_codes SET usage_count = usage_count + 1, updated_at = now() WHERE code = $1',
      [normalized]
    ).then(() => undefined);
  }
  const discounts = readDiscountsFile();
  const discount = discounts.find((existing) => existing.code === normalized);
  if (discount) {
    discount.usageCount = Number(discount.usageCount || 0) + 1;
    discount.updatedAt = new Date().toISOString();
    writeDiscountsFile(discounts);
  }
  return undefined;
}

function discountValidationError(discount, subtotalCents) {
  if (!discount || discount.status !== 'active') {
    return 'Discount code is invalid';
  }
  if (discount.endsAt && new Date(discount.endsAt).getTime() < Date.now()) {
    return 'Discount code has expired';
  }
  if (discount.usageLimit !== null && Number(discount.usageCount || 0) >= discount.usageLimit) {
    return 'Discount code usage limit reached';
  }
  if (discount.minimumSubtotalCents !== null && subtotalCents < discount.minimumSubtotalCents) {
    return 'Order subtotal is below the minimum for this discount code';
  }
  return null;
}

function computeDiscountCents(discount, subtotalCents) {
  if (discount.type === 'fixed') {
    return Math.min(discount.value, subtotalCents);
  }
  return Math.round((subtotalCents * discount.value) / 100);
}

module.exports = {
  computeDiscountCents,
  deleteDiscount,
  discountValidationError,
  findDiscountByCode,
  incrementDiscountUsage,
  listDiscounts,
  normalizeDiscountCode,
  saveDiscount
};
