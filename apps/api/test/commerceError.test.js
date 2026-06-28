const test = require('node:test');
const assert = require('node:assert/strict');
const { CommerceError } = require('../src/checkout/commerceError');
const { checkoutConfig } = require('../src/config/env');
const { errorHandler } = require('../src/app');

test('CommerceError carries a public code, status, and details', () => {
  const error = new CommerceError('Quote expired', {
    code: 'quote_expired',
    status: 409,
    details: { quoteId: 'q-1' }
  });

  assert.equal(error.message, 'Quote expired');
  assert.equal(error.code, 'quote_expired');
  assert.equal(error.status, 409);
  assert.deepEqual(error.details, { quoteId: 'q-1' });
});

test('checkout config validates V2 secrets and durations', () => {
  assert.deepEqual(checkoutConfig({}), {
    v2Required: false,
    confirmationSecret: '',
    quoteTtlMs: 900000,
    idempotencyTtlMs: 86400000
  });
  assert.throws(
    () => checkoutConfig({ CHECKOUT_V2_REQUIRED: 'true' }),
    /ORDER_CONFIRMATION_SECRET/
  );
});

test('app exposes its error handler for contract testing', () => {
  assert.equal(typeof errorHandler, 'function');
});

test('error handler preserves the legacy message and adds commerce fields', () => {
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  errorHandler(new CommerceError('Quote expired', {
    code: 'quote_expired',
    status: 409,
    details: { quoteId: 'q-1' }
  }), null, response, null);

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    error: 'Quote expired',
    code: 'quote_expired',
    details: { quoteId: 'q-1' }
  });
});
