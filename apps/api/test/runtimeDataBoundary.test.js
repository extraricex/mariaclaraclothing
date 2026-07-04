const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveRuntimeDataFile } = require('../src/db/runtimeDataFile');

test('runtime data paths preserve explicit overrides and isolate test-runner defaults', () => {
  const defaultFile = '/project/data/orders.json';
  assert.equal(resolveRuntimeDataFile('ORDERS_DATA_FILE', defaultFile, {
    environment: { ORDERS_DATA_FILE: '/custom/orders.json', NODE_TEST_CONTEXT: 'child' }
  }), '/custom/orders.json');
  assert.equal(resolveRuntimeDataFile('ORDERS_DATA_FILE', defaultFile, {
    environment: { NODE_TEST_CONTEXT: 'child' }, tmpdir: '/tmp', pid: 123
  }), path.join('/tmp', 'maria-clara-test-runtime', '123', 'orders.json'));
  assert.equal(resolveRuntimeDataFile('ORDERS_DATA_FILE', defaultFile, {
    environment: {}
  }), defaultFile);
});
