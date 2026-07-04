const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEnv, pancakeConfig } = require('../src/config/env');

test('Pancake defaults to disabled without credentials', () => {
  assert.deepEqual(pancakeConfig({}), {
    mode: 'disabled',
    configured: false,
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: '',
    shopId: '',
    warehouseId: '',
    orderSourceId: '',
    webhookSecret: '',
    timeoutMs: 8000
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
  assert.equal(value.mode, 'read_only');
  assert.equal(value.shopId, '1234');
  assert.equal(value.apiKey, 'secret-key');
  assert.equal(value.webhookSecret, 'webhook-secret-with-more-than-32-characters');
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
