const test = require('node:test');
const assert = require('node:assert/strict');

const { buildJntParcelDraft, previewJntParcel } = require('../src/jnt/jntParcelService');

const order = {
  orderNumber: 'MC-2001', paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', totalCents: 149900,
  parcelWeightGrams: 700, parcelWeightOverrideGrams: 850,
  customer: { fullName: 'Buyer Name', phone: '09171234567' },
  address: { houseAddress: '12 Street', barangay: 'BUCANDALA IV', city: 'IMUS', province: 'CAVITE', country: 'Philippines' },
  items: [{ productName: 'Shirt', size: 'M', quantity: 2 }]
};

test('builds a provider-neutral J&T parcel draft using effective weight and COD amount', () => {
  const draft = buildJntParcelDraft(order);
  assert.equal(draft.weightGrams, 850);
  assert.equal(draft.weightKg, 0.85);
  assert.equal(draft.codAmountCents, 149900);
  assert.equal(draft.quantity, 2);
  assert.equal(previewJntParcel(order).ready, true);
});

test('preview reports missing fields and live mode is blocked without official PH API support', () => {
  const preview = previewJntParcel({ orderNumber: 'MC-EMPTY', customer: {}, address: {}, items: [] });
  assert.equal(preview.ready, false);
  assert.ok(preview.missingFields.includes('valid phone number'));
  assert.throws(() => previewJntParcel(order, { mode: 'live' }), (error) => error.status === 503 && error.code === 'jnt_api_unavailable');
});
