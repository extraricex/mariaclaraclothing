const DEFAULT_META_CURRENCY = 'PHP';

function resolveMetaCurrency(source = process.env) {
  const configured = String(source?.META_CURRENCY || DEFAULT_META_CURRENCY)
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(configured) && configured === DEFAULT_META_CURRENCY
    ? configured
    : DEFAULT_META_CURRENCY;
}

const META_CURRENCY = resolveMetaCurrency();

function normalizeMetaValue(amount) {
  const normalized = typeof amount === 'number'
    ? amount
    : Number(String(amount ?? '').replace(/[₱,\s]/g, '').trim());
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return Number(normalized.toFixed(2));
}

function centavosToMetaPesos(amountInCentavos) {
  const raw = typeof amountInCentavos === 'number'
    ? amountInCentavos
    : String(amountInCentavos ?? '').trim();
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) return null;
  const cents = Number(raw);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return normalizeMetaValue(cents / 100);
}

function validateMetaPurchase({ value, currency, eventId } = {}) {
  const errors = [];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push('Purchase value must be a numeric amount greater than 0.');
  }
  if (currency !== META_CURRENCY) {
    errors.push(`Purchase currency must be exactly "${META_CURRENCY}".`);
  }
  if (!String(eventId || '').trim()) {
    errors.push('Meta Purchase event ID is required.');
  }
  return { valid: errors.length === 0, errors };
}

function validateMetaPurchaseEvent(event = {}) {
  const validation = validateMetaPurchase({
    value: event?.custom_data?.value,
    currency: event?.custom_data?.currency,
    eventId: event?.event_id
  });
  if (event?.event_name !== 'Purchase') {
    validation.errors.push('Meta Purchase event name must be exactly "Purchase".');
    validation.valid = false;
  }
  return validation;
}

module.exports = {
  DEFAULT_META_CURRENCY,
  META_CURRENCY,
  centavosToMetaPesos,
  normalizeMetaValue,
  resolveMetaCurrency,
  validateMetaPurchase,
  validateMetaPurchaseEvent
};
