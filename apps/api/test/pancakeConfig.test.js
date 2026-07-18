const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEnv, pancakeConfig } = require('../src/config/env');

test('Pancake defaults to disabled without credentials', () => {
  assert.deepEqual(pancakeConfig({}), {
    mode: 'disabled',
    configured: false,
    apiKeyConfigured: false,
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: '',
    shopId: '',
    warehouseId: '',
    orderSourceId: '',
    webhookSecret: '',
    timeoutMs: 20000,
    orderCreateTimeoutMs: 60000,
    catalogPageSize: 100,
    catalogMaxPages: 100,
    autoSyncEnabled: false,
    autoSyncIntervalMs: 600000,
    autoSyncStartupDelayMs: 15000,
    orderPollIntervalMs: 300000,
    orderPollPageSize: 50,
    orderPollLookbackMs: 900000,
    syncMaxAttempts: 10,
    orderExportCutoffAt: ''
  });
});

test('Pancake read-only configuration keeps credentials on the server config', () => {
  const value = pancakeConfig({
    PANCAKE_MODE: 'read_only',
    PANCAKE_API_KEY: 'secret-key',
    PANCAKE_SHOP_ID: '1234',
    PANCAKE_WEBHOOK_SECRET: 'webhook-secret-with-more-than-32-characters'
  });
  assert.equal(value.configured, true);
  assert.equal(value.apiKeyConfigured, true);
  assert.equal(value.mode, 'read_only');
  assert.equal(value.shopId, '1234');
  assert.equal(value.apiKey, 'secret-key');
  assert.equal(value.webhookSecret, 'webhook-secret-with-more-than-32-characters');
  assert.equal(value.orderCreateTimeoutMs, 60000);
});

test('Pancake order creation gets a longer bounded timeout than read operations', () => {
  assert.equal(pancakeConfig({
    PANCAKE_REQUEST_TIMEOUT_MS: '30000',
    PANCAKE_ORDER_CREATE_TIMEOUT_MS: '90000'
  }).orderCreateTimeoutMs, 90000);
  assert.throws(() => pancakeConfig({
    PANCAKE_REQUEST_TIMEOUT_MS: '30000',
    PANCAKE_ORDER_CREATE_TIMEOUT_MS: '20000'
  }), /PANCAKE_ORDER_CREATE_TIMEOUT_MS/);
  assert.throws(() => pancakeConfig({
    PANCAKE_ORDER_CREATE_TIMEOUT_MS: '120001'
  }), /PANCAKE_ORDER_CREATE_TIMEOUT_MS/);
});

test('Pancake catalog discovery can start with an API key before shop selection', () => {
  const value = pancakeConfig({ PANCAKE_MODE: 'read_only', PANCAKE_API_KEY: 'secret-key' });
  assert.equal(value.apiKeyConfigured, true);
  assert.equal(value.configured, false);
  assert.equal(value.catalogPageSize, 100);
  assert.equal(value.catalogMaxPages, 100);
  assert.equal(value.autoSyncEnabled, true);
});

test('Pancake auto sync can be disabled and validates interval bounds', () => {
  const disabled = pancakeConfig({ PANCAKE_MODE: 'read_only', PANCAKE_AUTO_SYNC_ENABLED: 'false' });
  assert.equal(disabled.autoSyncEnabled, false);

  const custom = pancakeConfig({
    PANCAKE_MODE: 'shadow',
    PANCAKE_AUTO_SYNC_INTERVAL_MS: '120000',
    PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS: '0'
  });
  assert.equal(custom.autoSyncEnabled, true);
  assert.equal(custom.autoSyncIntervalMs, 120000);
  assert.equal(custom.autoSyncStartupDelayMs, 0);
  assert.equal(pancakeConfig({
    PANCAKE_MODE: 'live',
    PANCAKE_ORDER_EXPORT_CUTOFF_AT: '2026-07-12T00:00:00Z'
  }).autoSyncEnabled, true);

  for (const source of [
    { PANCAKE_AUTO_SYNC_INTERVAL_MS: '59999' },
    { PANCAKE_AUTO_SYNC_INTERVAL_MS: '86400001' },
    { PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS: '-1' },
    { PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS: '300001' }
  ]) assert.throws(() => pancakeConfig({ PANCAKE_MODE: 'read_only', ...source }), /Pancake auto sync/);
});

test('Pancake config exposes order polling and retry settings', () => {
  const value = pancakeConfig({
    PANCAKE_MODE: 'live',
    PANCAKE_ORDER_EXPORT_CUTOFF_AT: '2026-07-12T00:00:00Z',
    PANCAKE_API_KEY: 'secret-key',
    PANCAKE_SHOP_ID: '1234',
    PANCAKE_ORDER_POLL_INTERVAL_MS: '120000',
    PANCAKE_ORDER_POLL_PAGE_SIZE: '25',
    PANCAKE_ORDER_POLL_LOOKBACK_MS: '900000',
    PANCAKE_SYNC_MAX_ATTEMPTS: '7'
  });
  assert.equal(value.orderPollIntervalMs, 120000);
  assert.equal(value.orderPollPageSize, 25);
  assert.equal(value.orderPollLookbackMs, 900000);
  assert.equal(value.syncMaxAttempts, 7);
  assert.equal(value.orderExportCutoffAt, '2026-07-12T00:00:00.000Z');

  for (const source of [
    { PANCAKE_ORDER_POLL_INTERVAL_MS: '59999' },
    { PANCAKE_ORDER_POLL_INTERVAL_MS: '86400001' },
    { PANCAKE_ORDER_POLL_PAGE_SIZE: '0' },
    { PANCAKE_ORDER_POLL_PAGE_SIZE: '101' },
    { PANCAKE_ORDER_POLL_LOOKBACK_MS: '59999' },
    { PANCAKE_ORDER_POLL_LOOKBACK_MS: '604800001' },
    { PANCAKE_SYNC_MAX_ATTEMPTS: '0' },
    { PANCAKE_SYNC_MAX_ATTEMPTS: '101' }
  ]) assert.throws(() => pancakeConfig({ PANCAKE_MODE: 'read_only', ...source }), /Pancake auto sync/);
});

test('Pancake live mode requires a valid order export cutover timestamp', () => {
  assert.throws(() => pancakeConfig({ PANCAKE_MODE: 'live' }), /PANCAKE_ORDER_EXPORT_CUTOFF_AT is required/);
  assert.throws(() => pancakeConfig({
    PANCAKE_MODE: 'live',
    PANCAKE_ORDER_EXPORT_CUTOFF_AT: 'not-a-date'
  }), /valid ISO timestamp/);
});

test('production live mode requires a strong Pancake webhook secret', () => {
  const base = {
    APP_ENV: 'production',
    PANCAKE_MODE: 'live',
    PANCAKE_ORDER_EXPORT_CUTOFF_AT: '2026-07-12T00:00:00Z'
  };
  assert.throws(() => pancakeConfig(base), /PANCAKE_WEBHOOK_SECRET/);
  assert.equal(pancakeConfig({
    ...base,
    PANCAKE_WEBHOOK_SECRET: 'strong-pancake-webhook-secret-32-plus'
  }).webhookSecret, 'strong-pancake-webhook-secret-32-plus');
});

test('Pancake catalog bounds accept safe integers and reject invalid values', () => {
  const value = pancakeConfig({ PANCAKE_CATALOG_PAGE_SIZE: '50', PANCAKE_CATALOG_MAX_PAGES: '200' });
  assert.equal(value.catalogPageSize, 50);
  assert.equal(value.catalogMaxPages, 200);
  for (const source of [
    { PANCAKE_CATALOG_PAGE_SIZE: '0' },
    { PANCAKE_CATALOG_PAGE_SIZE: '1.5' },
    { PANCAKE_CATALOG_PAGE_SIZE: '101' },
    { PANCAKE_CATALOG_MAX_PAGES: '0' },
    { PANCAKE_CATALOG_MAX_PAGES: '501' }
  ]) assert.throws(() => pancakeConfig(source), /Pancake catalog/);
});

test('Pancake rejects unsupported modes and non-official production hosts', () => {
  assert.throws(() => pancakeConfig({ PANCAKE_MODE: 'write_everything' }), /PANCAKE_MODE/);
  assert.throws(() => pancakeConfig({
    APP_ENV: 'production',
    PANCAKE_API_BASE_URL: 'https://example.com/api'
  }), /official Pancake API host/);
});

test('buildEnv carries Pancake configuration', () => {
  const value = buildEnv({ APP_ENV: 'development', PANCAKE_MODE: 'read_only' });
  assert.equal(value.pancake.mode, 'read_only');
  assert.equal(value.pancake.configured, false);
});
