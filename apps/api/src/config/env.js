require('dotenv').config();

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

function metaConfig(source = process.env) {
  const enabled = source.META_CONVERSIONS_API_ENABLED === 'true';
  if (!enabled) return { enabled: false };

  const required = [
    'META_PIXEL_ID',
    'META_CONVERSIONS_API_ACCESS_TOKEN',
    'META_GRAPH_API_VERSION',
    'DATABASE_URL'
  ];
  for (const name of required) {
    if (!String(source[name] || '').trim()) {
      throw new Error(`${name} is required when Meta CAPI is enabled`);
    }
  }

  return {
    enabled: true,
    pixelId: String(source.META_PIXEL_ID).trim(),
    accessToken: String(source.META_CONVERSIONS_API_ACCESS_TOKEN),
    graphApiVersion: String(source.META_GRAPH_API_VERSION).trim(),
    testEventCode: String(source.META_CONVERSIONS_API_TEST_EVENT_CODE || '').trim()
  };
}

function checkoutConfig(source = process.env) {
  const v2Required = source.CHECKOUT_V2_REQUIRED === 'true';
  const confirmationSecret = String(source.ORDER_CONFIRMATION_SECRET || '');
  if (v2Required && confirmationSecret.length < 32) {
    throw new Error('ORDER_CONFIRMATION_SECRET must be at least 32 characters when checkout V2 is required');
  }

  return {
    v2Required,
    confirmationSecret,
    quoteTtlMs: 15 * 60 * 1000,
    idempotencyTtlMs: 24 * 60 * 60 * 1000
  };
}

const env = {
  port: Number(optional('PORT', '3000')),
  meta: metaConfig(),
  checkout: checkoutConfig()
};

module.exports = { env, metaConfig, checkoutConfig };
