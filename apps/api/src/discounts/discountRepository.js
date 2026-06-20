const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const DEFAULT_DISCOUNTS_FILE = path.join(__dirname, '..', '..', 'data', 'discounts.json');
const DISCOUNT_TYPES = new Set(['percentage', 'fixed', 'buy_more_save_more', 'free_shipping', 'bundle']);
const DISCOUNT_STATUSES = new Set(['active', 'disabled']);
const DISCOUNT_METHODS = new Set(['code', 'automatic']);

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
  const method = DISCOUNT_METHODS.has(discount.method) ? discount.method : 'code';
  const value = Math.max(0, Math.round(Number(discount.value) || 0));
  const minimumQuantity = discount.minimumQuantity === null || discount.minimumQuantity === undefined || discount.minimumQuantity === ''
    ? null
    : Math.max(0, Math.round(Number(discount.minimumQuantity) || 0));
  const usageLimit = discount.usageLimit === null || discount.usageLimit === undefined || discount.usageLimit === ''
    ? null
    : Math.max(0, Math.round(Number(discount.usageLimit) || 0));
  const priority = Math.max(0, Math.round(Number(discount.priority) || 0));
  const minimumSubtotalCents = discount.minimumSubtotalCents === null || discount.minimumSubtotalCents === undefined || discount.minimumSubtotalCents === ''
    ? null
    : Math.max(0, Math.round(Number(discount.minimumSubtotalCents) || 0));
  const startsAt = discount.startsAt ? new Date(discount.startsAt).toISOString() : null;
  const endsAt = discount.endsAt ? new Date(discount.endsAt).toISOString() : null;
  const rules = normalizeRules(discount.rules);

  return {
    code,
    name: String(discount.name || code || 'Automatic promo').trim(),
    description: String(discount.description || '').trim(),
    method,
    type,
    value,
    status,
    startsAt,
    endsAt,
    usageLimit,
    usageCount: Math.max(0, Math.round(Number(discount.usageCount) || 0)),
    priority,
    minimumQuantity,
    minimumSubtotalCents,
    bannerText: String(discount.bannerText || '').trim(),
    terms: String(discount.terms || '').trim(),
    rules,
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
  if (discount.type === 'buy_more_save_more' && discount.rules.length === 0) {
    const error = new Error('Buy More Save More promos require at least one rule');
    error.status = 400;
    throw error;
  }
}

function normalizeRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => {
      const discountType = rule?.discountType === 'percentage' ? 'percentage' : 'fixed';
      const discountValue = Math.max(0, Math.round(Number(rule?.discountValue || 0)));
      const discountValueCents = Math.max(0, Math.round(Number(rule?.discountValueCents || 0)));
      return {
        minimumQuantity: Math.max(1, Math.round(Number(rule?.minimumQuantity || 0))),
        minimumSubtotalCents: rule?.minimumSubtotalCents === null || rule?.minimumSubtotalCents === undefined || rule?.minimumSubtotalCents === ''
          ? null
          : Math.max(0, Math.round(Number(rule.minimumSubtotalCents) || 0)),
        discountType,
        discountValue,
        discountValueCents,
        freeShipping: Boolean(rule?.freeShipping)
      };
    })
    .filter((rule) => {
      if (rule.minimumQuantity <= 0) return false;
      if (rule.freeShipping) return true;
      if (rule.discountType === 'percentage') return rule.discountValue > 0;
      return rule.discountValueCents > 0;
    });
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
    name: row.name || row.code,
    description: row.description || '',
    method: row.method || 'code',
    type: row.type,
    value: row.value,
    status: row.status,
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    usageLimit: row.usage_limit,
    usageCount: row.usage_count,
    priority: row.priority || 0,
    minimumQuantity: row.minimum_quantity,
    minimumSubtotalCents: row.minimum_subtotal_cents,
    bannerText: row.banner_text || '',
    terms: row.terms || '',
    rules: Array.isArray(row.rules) ? row.rules : [],
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
      `INSERT INTO discount_codes (
         code, name, description, method, type, value, status, starts_at, ends_at,
         usage_limit, usage_count, priority, minimum_quantity, minimum_subtotal_cents,
         banner_text, terms, rules, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         method = EXCLUDED.method,
         type = EXCLUDED.type,
         value = EXCLUDED.value,
         status = EXCLUDED.status,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         usage_limit = EXCLUDED.usage_limit,
         usage_count = EXCLUDED.usage_count,
         priority = EXCLUDED.priority,
         minimum_quantity = EXCLUDED.minimum_quantity,
         minimum_subtotal_cents = EXCLUDED.minimum_subtotal_cents,
         banner_text = EXCLUDED.banner_text,
         terms = EXCLUDED.terms,
         rules = EXCLUDED.rules,
         updated_at = EXCLUDED.updated_at`,
      [
        record.code,
        record.name,
        record.description,
        record.method,
        record.type,
        record.value,
        record.status,
        record.startsAt,
        record.endsAt,
        record.usageLimit,
        record.usageCount,
        record.priority,
        record.minimumQuantity,
        record.minimumSubtotalCents,
        record.bannerText,
        record.terms,
        JSON.stringify(record.rules),
        record.createdAt,
        record.updatedAt
      ]
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
