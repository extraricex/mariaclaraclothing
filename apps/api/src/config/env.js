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

function validatedHttpsUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch (_error) {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must be a clean HTTPS URL without credentials, query, or fragment`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function oauthConfig(source = process.env) {
  const appEnv = String(source.APP_ENV || 'development').trim().toLowerCase();
  const frontendRaw = String(source.FRONTEND_URL || (appEnv === 'production' ? '' : 'http://localhost:5173')).trim();
  const callbackRaw = String(source.AUTH_CALLBACK_URL || (appEnv === 'production' ? '' : 'http://localhost:3000/api/customer/oauth')).trim();
  const validateBase = (value, name) => {
    if (appEnv === 'production') return validatedHttpsUrl(value, name);
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error(`${name} must be a clean HTTP(S) URL`);
    }
    return parsed.toString().replace(/\/$/, '');
  };
  const provider = (name, id, secret) => {
    const clientId = String(source[id] || '').trim();
    const clientSecret = String(source[secret] || '');
    if (Boolean(clientId) !== Boolean(clientSecret)) {
      throw new Error(`${id} and ${secret} must both be set or both be empty`);
    }
    return { name, clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
  };
  const frontendUrl = validateBase(frontendRaw, 'FRONTEND_URL');
  const callbackBaseUrl = validateBase(callbackRaw, 'AUTH_CALLBACK_URL');
  const frontend = new URL(frontendUrl);
  const callback = new URL(callbackBaseUrl);
  if (callback.pathname !== '/api/customer/oauth' || (appEnv === 'production' && callback.origin !== frontend.origin)) {
    throw new Error('AUTH_CALLBACK_URL must use FRONTEND_URL origin and the /api/customer/oauth path');
  }
  return {
    frontendUrl,
    callbackBaseUrl,
    google: provider('google', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    facebook: provider('facebook', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET')
  };
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
  const orderExportCutoffRaw = String(source.PANCAKE_ORDER_EXPORT_CUTOFF_AT || '').trim();
  const orderExportCutoffAt = orderExportCutoffRaw ? new Date(orderExportCutoffRaw) : null;
  if (orderExportCutoffRaw && Number.isNaN(orderExportCutoffAt.getTime())) {
    throw new Error('PANCAKE_ORDER_EXPORT_CUTOFF_AT must be a valid ISO timestamp');
  }
  if (mode === 'live' && !orderExportCutoffAt) {
    throw new Error('PANCAKE_ORDER_EXPORT_CUTOFF_AT is required in live mode');
  }
  const webhookSecret = String(source.PANCAKE_WEBHOOK_SECRET || '');
  if (appEnv === 'production' && mode === 'live' && webhookSecret.length < 32) {
    throw new Error('PANCAKE_WEBHOOK_SECRET must be at least 32 characters in production live mode');
  }
  const orderPollIntervalMs = autoSyncInteger('PANCAKE_ORDER_POLL_INTERVAL_MS', 5 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000);
  const orderPollPageSize = autoSyncInteger('PANCAKE_ORDER_POLL_PAGE_SIZE', 50, 1, 100);
  const orderPollLookbackMs = autoSyncInteger('PANCAKE_ORDER_POLL_LOOKBACK_MS', 15 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000);
  const syncMaxAttempts = autoSyncInteger('PANCAKE_SYNC_MAX_ATTEMPTS', 10, 1, 100);
  return {
    mode,
    configured: Boolean(apiKey.trim() && String(source.PANCAKE_SHOP_ID || '').trim()),
    apiKeyConfigured: Boolean(apiKey.trim()),
    apiBaseUrl,
    apiKey,
    shopId: String(source.PANCAKE_SHOP_ID || '').trim(),
    warehouseId: String(source.PANCAKE_WAREHOUSE_ID || '').trim(),
    orderSourceId: String(source.PANCAKE_ORDER_SOURCE_ID || '').trim(),
    webhookSecret,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20000,
    catalogPageSize: catalogInteger('PANCAKE_CATALOG_PAGE_SIZE', 100, 100),
    catalogMaxPages: catalogInteger('PANCAKE_CATALOG_MAX_PAGES', 100, 500),
    autoSyncEnabled: autoSyncBoolean('PANCAKE_AUTO_SYNC_ENABLED', autoSyncDefault),
    autoSyncIntervalMs: autoSyncInteger('PANCAKE_AUTO_SYNC_INTERVAL_MS', 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    autoSyncStartupDelayMs: autoSyncInteger('PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS', 15 * 1000, 0, 5 * 60 * 1000),
    orderPollIntervalMs,
    orderPollPageSize,
    orderPollLookbackMs,
    syncMaxAttempts,
    orderExportCutoffAt: orderExportCutoffAt ? orderExportCutoffAt.toISOString() : ''
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
    oauth: oauthConfig(source),
    pancake: pancakeConfig(source)
  };
}

const env = buildEnv();

module.exports = { buildEnv, env, metaConfig, checkoutConfig, notificationConfig, oauthConfig, pancakeConfig, validateProductionConfig };
