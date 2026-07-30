const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { errorHandler } = require('../src/app');
const { createPayMongoRouter } = require('../src/routes/paymongo');

async function withServer(dependencies, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/payments/paymongo', createPayMongoRouter(dependencies));
  app.use(errorHandler);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('PayMongo checkout persists the consented official Meta parameter-builder context', async () => {
  let checkoutInput;
  await withServer({
    config: { configured: true, reservationMinutes: 15 },
    client: {},
    getStoreSettings: async () => ({
      payments: { methods: [{ id: 'paymongo', enabled: true }] },
      marketing: { metaPixel: { requireConsent: true } }
    }),
    resolveCustomerAccountId: async () => '',
    defaultAuthoritativeDependencies: () => ({}),
    placeAuthoritativeCheckout: async (input) => {
      checkoutInput = input;
      return { orderNumber: 'MCC-PAYMONGO-1', totalCents: 14252, confirmationToken: 'secret' };
    },
    ensureCheckoutSession: async () => ({
      order: { paymentStatus: 'pending', providerCheckoutSessionId: 'cs_test_1' },
      checkoutUrl: 'https://checkout.paymongo.com/test'
    })
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/payments/paymongo/create-checkout-session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': 'idem-paymongo-123456789',
        Cookie: '_fbp=fb.1.1785332985000.browser; _fbc=fb.1.1785332985000.MetaClick_ABC-123',
        Referer: 'https://www.facebook.com/ad?campaign=summer'
      },
      body: JSON.stringify({
        quoteId: 'quote-1',
        customer: { fullName: 'Maria Test', phone: '09171234567' },
        paymentMethod: 'paymongo',
        metaTrackingConsent: 'accepted'
      })
    });
    assert.equal(response.status, 201);
  });

  assert.equal(checkoutInput.paymentMethod, 'paymongo');
  assert.equal(checkoutInput.requestContext.metaConsentGranted, true);
  assert.equal(checkoutInput.requestContext.metaTrackingConsent, 'accepted');
  assert.match(checkoutInput.requestContext.fbp, /^fb\.1\.1785332985000\.browser\.[a-zA-Z0-9]{8}$/);
  assert.match(checkoutInput.requestContext.fbc, /^fb\.1\.1785332985000\.MetaClick_ABC-123\.[a-zA-Z0-9]{8}$/);
  assert.match(
    checkoutInput.requestContext.referrerUrl,
    /^https:\/\/www\.facebook\.com\/ad\?campaign=summer\.[a-zA-Z0-9]{8}$/
  );
});

test('PayMongo checkout does not generate Meta identifiers when consent is declined', async () => {
  let checkoutInput;
  await withServer({
    config: { configured: true, reservationMinutes: 15 },
    client: {},
    getStoreSettings: async () => ({
      payments: { methods: [{ id: 'paymongo', enabled: true }] },
      marketing: { metaPixel: { requireConsent: true } }
    }),
    resolveCustomerAccountId: async () => '',
    defaultAuthoritativeDependencies: () => ({}),
    placeAuthoritativeCheckout: async (input) => {
      checkoutInput = input;
      return { orderNumber: 'MCC-PAYMONGO-2', totalCents: 14252, confirmationToken: 'secret' };
    },
    ensureCheckoutSession: async () => ({
      order: { paymentStatus: 'pending', providerCheckoutSessionId: 'cs_test_2' },
      checkoutUrl: 'https://checkout.paymongo.com/test'
    })
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/payments/paymongo/create-checkout-session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': 'idem-paymongo-987654321',
        Cookie: '_fbp=fb.1.1785332985000.browser'
      },
      body: JSON.stringify({
        quoteId: 'quote-1',
        customer: { fullName: 'Maria Test', phone: '09171234567' },
        paymentMethod: 'paymongo',
        metaTrackingConsent: 'declined'
      })
    });
    assert.equal(response.status, 201);
  });

  assert.equal(checkoutInput.requestContext.metaConsentGranted, false);
  assert.equal(checkoutInput.requestContext.metaTrackingConsent, 'declined');
  assert.equal(checkoutInput.requestContext.fbp, undefined);
  assert.equal(checkoutInput.requestContext.fbc, undefined);
});
