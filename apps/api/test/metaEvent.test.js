const test = require('node:test');
const assert = require('node:assert/strict');
const { metaConfig } = require('../src/config/env');

test('Meta CAPI is disabled by default', () => {
  assert.deepEqual(metaConfig({}), { enabled: false });
});

test('Meta CAPI validates enabled configuration', () => {
  assert.throws(
    () => metaConfig({ META_CONVERSIONS_API_ENABLED: 'true' }),
    /META_PIXEL_ID is required/
  );

  assert.deepEqual(metaConfig({
    META_CONVERSIONS_API_ENABLED: 'true',
    META_PIXEL_ID: '595813035761213',
    META_CONVERSIONS_API_ACCESS_TOKEN: 'test-token',
    META_GRAPH_API_VERSION: 'v-test',
    DATABASE_URL: 'postgres://test'
  }), {
    enabled: true,
    pixelId: '595813035761213',
    accessToken: 'test-token',
    graphApiVersion: 'v-test',
    testEventCode: ''
  });
});
