require('dotenv').config();

function optional(source, name, fallback = '') {
  return source[name] || fallback;
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

function notificationConfig(source = process.env) {
  const enabled = source.ORDER_NOTIFICATIONS_ENABLED === 'true';
  const sms = {
    apiKey: String(source.SEMAPHORE_API_KEY || ''),
    senderName: String(source.SEMAPHORE_SENDER_NAME || '').trim()
  };
  const email = {
    apiKey: String(source.RESEND_API_KEY || ''),
    from: String(source.ORDER_NOTIFICATION_FROM_EMAIL || '').trim()
  };
  sms.configured = enabled && Boolean(sms.apiKey);
  email.configured = enabled && Boolean(email.apiKey && email.from);
  return { enabled, sms, email };
}

function validateProductionConfig(source = process.env) {
  if (String(source.APP_ENV || 'development').trim().toLowerCase() !== 'production') return;
  if (!String(source.DATABASE_URL || '').trim()) {
    throw new Error('DATABASE_URL is required in production');
  }
  const adminToken = String(source.ADMIN_TOKEN || '');
  if (!adminToken || adminToken === 'local-admin-token') {
    throw new Error('ADMIN_TOKEN must not use a local default in production');
  }
  const adminPassword = String(source.ADMIN_PASSWORD || '');
  if (!adminPassword || adminPassword === 'admin') {
    throw new Error('ADMIN_PASSWORD must not use a local default in production');
  }
  if (String(source.CUSTOMER_AUTH_SECRET || '').length < 32) {
    throw new Error('CUSTOMER_AUTH_SECRET must be at least 32 characters in production');
  }
  if (String(source.ORDER_CONFIRMATION_SECRET || '').length < 32) {
    throw new Error('ORDER_CONFIRMATION_SECRET must be at least 32 characters in production');
  }
  const jsonPersistenceOverrides = [
    'ORDERS_DATA_FILE',
    'CUSTOMER_ACCOUNTS_DATA_FILE',
    'PRODUCTS_DATA_FILE',
    'CART_SESSIONS_DATA_FILE',
    'DISCOUNTS_DATA_FILE',
    'INVENTORY_MOVEMENTS_DATA_FILE',
    'ORDER_NOTIFICATIONS_DATA_FILE',
    'STORE_SETTINGS_FILE',
    'ADMIN_CREDENTIALS_FILE',
    'SITE_CONTENT_FILE'
  ];
  for (const name of jsonPersistenceOverrides) {
    if (String(source[name] || '').trim()) {
      throw new Error(`${name} is not allowed in production; use PostgreSQL persistence`);
    }
  }
}

function buildEnv(source = process.env) {
  validateProductionConfig(source);
  return {
    appEnv: String(source.APP_ENV || 'development').trim().toLowerCase(),
    port: Number(optional(source, 'PORT', '3000')),
    meta: metaConfig(source),
    checkout: checkoutConfig(source),
    notifications: notificationConfig(source)
  };
}

const env = buildEnv();

module.exports = { buildEnv, env, metaConfig, checkoutConfig, notificationConfig, validateProductionConfig };
