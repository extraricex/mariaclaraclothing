const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config/env');

const SAFE_PRODUCTION = {
  APP_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgres://store:secret@database/store',
  ADMIN_TOKEN: 'production-admin-token-with-more-than-32-characters',
  ADMIN_PASSWORD: 'production-admin-password-with-more-than-16-characters',
  CUSTOMER_AUTH_SECRET: 'production-customer-secret-with-more-than-32-characters',
  CHECKOUT_V2_REQUIRED: 'true',
  ORDER_CONFIRMATION_SECRET: 'production-confirmation-secret-more-than-32-characters',
  AUTH_CALLBACK_URL: 'https://mariaclaraclothing.com/api/customer/oauth',
  FRONTEND_URL: 'https://mariaclaraclothing.com',
  META_CONVERSIONS_API_ENABLED: 'false',
  ORDER_NOTIFICATIONS_ENABLED: 'false'
};

test('configuration exposes a source-driven environment builder', () => {
  assert.equal(typeof config.buildEnv, 'function');
});

test('development configuration keeps local defaults usable', () => {
  assert.doesNotThrow(() => config.buildEnv?.({ APP_ENV: 'development' }));
});

test('production configuration requires PostgreSQL', () => {
  assert.throws(
    () => config.buildEnv?.({ ...SAFE_PRODUCTION, DATABASE_URL: '' }),
    /DATABASE_URL is required in production/
  );
});

test('production configuration rejects known local admin credentials', () => {
  assert.throws(
    () => config.buildEnv?.({ ...SAFE_PRODUCTION, ADMIN_TOKEN: 'local-admin-token' }),
    /ADMIN_TOKEN must not use a local default/
  );
  assert.throws(
    () => config.buildEnv?.({ ...SAFE_PRODUCTION, ADMIN_PASSWORD: 'admin' }),
    /ADMIN_PASSWORD must not use a local default/
  );
});

test('production configuration requires strong customer and confirmation secrets', () => {
  assert.throws(
    () => config.buildEnv?.({ ...SAFE_PRODUCTION, CUSTOMER_AUTH_SECRET: '' }),
    /CUSTOMER_AUTH_SECRET must be at least 32 characters/
  );
  assert.throws(
    () => config.buildEnv?.({ ...SAFE_PRODUCTION, ORDER_CONFIRMATION_SECRET: 'short' }),
    /ORDER_CONFIRMATION_SECRET must be at least 32 characters/
  );
});

test('safe production configuration builds successfully', () => {
  const env = config.buildEnv?.(SAFE_PRODUCTION);
  assert.equal(env?.appEnv, 'production');
  assert.equal(env?.port, 3000);
  assert.equal(env?.oauth.frontendUrl, 'https://mariaclaraclothing.com');
});

test('OAuth configuration requires clean HTTPS production URLs and complete credential pairs', () => {
  assert.throws(() => config.buildEnv({ ...SAFE_PRODUCTION, FRONTEND_URL: 'http://mariaclaraclothing.com' }), /HTTPS URL/);
  assert.throws(() => config.buildEnv({ ...SAFE_PRODUCTION, AUTH_CALLBACK_URL: 'https://attacker.example/api/customer/oauth' }), /must use FRONTEND_URL origin/);
  assert.throws(() => config.buildEnv({ ...SAFE_PRODUCTION, GOOGLE_CLIENT_ID: 'client-only' }), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
  const env = config.buildEnv({ ...SAFE_PRODUCTION, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' });
  assert.equal(env.oauth.google.configured, true);
  assert.equal(env.oauth.facebook.configured, false);
});

test('production configuration rejects JSON persistence overrides', () => {
  for (const name of [
    'ORDERS_DATA_FILE',
    'CUSTOMER_ACCOUNTS_DATA_FILE',
    'PRODUCTS_DATA_FILE',
    'INVENTORY_MOVEMENTS_DATA_FILE',
    'ORDER_NOTIFICATIONS_DATA_FILE'
  ]) {
    assert.throws(
      () => config.buildEnv?.({ ...SAFE_PRODUCTION, [name]: `/tmp/${name}.json` }),
      new RegExp(`${name}.*not allowed in production`)
    );
  }
});
