const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CONTROLLED_TEST_TTL_MS,
  createControlledMetaTestGrant,
  isControlledMetaTestOrder,
  verifyControlledMetaTestGrant
} = require('../src/marketing/metaControlledTest');

const secret = 'controlled-meta-test-secret-value-1234567890';
const datasetId = '595813035761213';
const issuedAt = new Date('2026-07-22T04:00:00.000Z');

test('controlled Meta test grants are signed, primary-dataset-bound, and short lived', () => {
  const token = createControlledMetaTestGrant({
    reference: 'META-TEST-20260722-ABC12345',
    testEventCode: 'TEST12345',
    datasetId,
    now: issuedAt,
    nonce: 'fixed-test-nonce'
  }, secret);

  const grant = verifyControlledMetaTestGrant(token, {
    secret,
    expectedDatasetId: datasetId,
    now: new Date(issuedAt.getTime() + 60_000)
  });
  assert.deepEqual(grant, {
    reference: 'META-TEST-20260722-ABC12345',
    testEventCode: 'TEST12345',
    datasetId,
    issuedAt: Math.floor(issuedAt.getTime() / 1000),
    expiresAt: Math.floor((issuedAt.getTime() + CONTROLLED_TEST_TTL_MS) / 1000),
    nonce: 'fixed-test-nonce'
  });
  assert.equal(verifyControlledMetaTestGrant(token, {
    secret,
    expectedDatasetId: '763597815708078',
    now: issuedAt
  }), null);
  assert.equal(verifyControlledMetaTestGrant(`${token.slice(0, -1)}x`, {
    secret,
    expectedDatasetId: datasetId,
    now: issuedAt
  }), null);
  assert.equal(verifyControlledMetaTestGrant(token, {
    secret,
    expectedDatasetId: datasetId,
    now: new Date(issuedAt.getTime() + CONTROLLED_TEST_TTL_MS + 1000)
  }), null);
});

test('only an unexpired order created by the controlled Meta path is recognized', () => {
  const now = new Date('2026-07-22T04:05:00.000Z');
  const base = {
    isTestOrder: true,
    paymentMetadata: {
      metaControlledTest: true,
      metaTestReference: 'META-TEST-20260722-ABC12345',
      metaPrimaryDatasetId: datasetId,
      metaTestGrantExpiresAt: Math.floor(now.getTime() / 1000) + 60
    }
  };
  assert.equal(isControlledMetaTestOrder(base, { now }), true);
  assert.equal(isControlledMetaTestOrder({ ...base, isTestOrder: false }, { now }), false);
  assert.equal(isControlledMetaTestOrder({
    ...base,
    paymentMetadata: { ...base.paymentMetadata, metaTestGrantExpiresAt: Math.floor(now.getTime() / 1000) }
  }, { now }), false);
});

test('the database permits only one order for each controlled Meta test reference', () => {
  const migration = fs.readFileSync(path.join(
    __dirname, '..', 'db', 'migrations', '20260722_meta_controlled_test_checkout.sql'
  ), 'utf8');
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS orders_meta_controlled_test_reference_idx/);
  assert.match(migration, /payment_metadata->>'metaTestReference'/);
  assert.match(migration, /payment_metadata->>'metaControlledTest' = 'true'/);
});
