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

function pancakeConfig(source = process.env) {
  const mode = String(source.PANCAKE_MODE || 'disabled').trim().toLowerCase();
  if (!['disabled', 'read_only', 'shadow', 'live'].includes(mode)) {
    throw new Error('PANCAKE_MODE must be disabled, read_only, shadow, or live');
  }
  const apiBaseUrl = String(source.PANCAKE_API_BASE_URL || 'https://pos.pages.fm/api/v1').trim().replace(/\/$/, '');
  const appEnv = String(source.APP_ENV || 'development').trim().toLowerCase();
  if (appEnv === 'production' && apiBaseUrl !== 'https://pos.pages.fm/api/v1') {
    throw new Error('PANCAKE_API_BASE_URL must use the official Pancake API host in production');
  }
  const timeout = Number(source.PANCAKE_REQUEST_TIMEOUT_MS || 20000);
  const apiKey = String(source.PANCAKE_API_KEY || '');
  const catalogInteger = (name, fallback, maximum) => {
    const raw = source[name];
    const value = Number(raw === undefined || raw === '' ? fallback : raw);
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
      throw new Error(`${name} Pancake catalog value must be an integer from 1 to ${maximum}`);
    }
    return value;
  };
  const autoSyncBoolean = (name, fallback) => {
    const raw = source[name];
    if (raw === undefined || raw === '') return fallback;
    const value = String(raw).trim().toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} Pancake auto sync value must be true or false`);
  };
  const autoSyncInteger = (name, fallback, minimum, maximum) => {
    const raw = source[name];
    const value = Number(raw === undefined || raw === '' ? fallback : raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${name} Pancake auto sync value must be an integer from ${minimum} to ${maximum}`);
    }
    return value;
  };
  const autoSyncDefault = mode === 'read_only' || mode === 'shadow' || mode === 'live';
  return {
    mode,
    configured: Boolean(apiKey.trim() && String(source.PANCAKE_SHOP_ID || '').trim()),
    apiKeyConfigured: Boolean(apiKey.trim()),
    apiBaseUrl,
    apiKey,
    shopId: String(source.PANCAKE_SHOP_ID || '').trim(),
    warehouseId: String(source.PANCAKE_WAREHOUSE_ID || '').trim(),
    orderSourceId: String(source.PANCAKE_ORDER_SOURCE_ID || '').trim(),
    webhookSecret: String(source.PANCAKE_WEBHOOK_SECRET || ''),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20000,
    catalogPageSize: catalogInteger('PANCAKE_CATALOG_PAGE_SIZE', 100, 100),
    catalogMaxPages: catalogInteger('PANCAKE_CATALOG_MAX_PAGES', 100, 500),
    autoSyncEnabled: autoSyncBoolean('PANCAKE_AUTO_SYNC_ENABLED', autoSyncDefault),
    autoSyncIntervalMs: autoSyncInteger('PANCAKE_AUTO_SYNC_INTERVAL_MS', 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    autoSyncStartupDelayMs: autoSyncInteger('PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS', 15 * 1000, 0, 5 * 60 * 1000)
  };
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
    notifications: notificationConfig(source),
    pancake: pancakeConfig(source)
  };
}

const env = buildEnv();

module.exports = { buildEnv, env, metaConfig, checkoutConfig, notificationConfig, pancakeConfig, validateProductionConfig };
