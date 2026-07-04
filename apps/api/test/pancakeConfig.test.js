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
    timeoutMs: 8000,
    catalogPageSize: 100,
    catalogMaxPages: 100
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
});

test('Pancake catalog discovery can start with an API key before shop selection', () => {
  const value = pancakeConfig({ PANCAKE_MODE: 'read_only', PANCAKE_API_KEY: 'secret-key' });
  assert.equal(value.apiKeyConfigured, true);
  assert.equal(value.configured, false);
  assert.equal(value.catalogPageSize, 100);
  assert.equal(value.catalogMaxPages, 100);
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
