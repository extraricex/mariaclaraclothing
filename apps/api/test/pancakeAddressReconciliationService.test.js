const test = require('node:test');
const assert = require('node:assert/strict');

function order() {
  return {
    orderNumber: 'MCC-ADDRESS-TEST',
    placedAt: '2026-07-18T00:00:00.000Z',
    customer: { firstName: 'Juan', lastName: 'Dela Cruz', phone: '09171234567', email: 'juan@example.com' },
    address: {
      houseAddress: '123 Sample Street',
      provinceCode: 'CAVITE', province: 'Cavite',
      cityCode: 'CAVITE|IMUS', city: 'Imus City',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV', barangay: 'Bucandala IV',
      postalCode: '4103'
    },
    items: [{ quantity: 1, unitPriceCents: 64900 }],
    totalCents: 64900,
    shippingFeeCents: 0,
    discountTotalCents: 0,
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'cod_pending',
    status: 'confirmed'
  };
}

function mapping() {
  return {
    countryCode: '63',
    province: { id: '63_826', name: 'Cavite' },
    district: { id: '63_8261588', name: 'Imus' },
    commune: { id: '63_82615881238', name: 'Bucandala iv' },
    mappingStatus: 'resolved',
    resolvedAt: '2026-07-18T00:01:00.000Z'
  };
}

test('approved reconciliation updates one existing Pancake order and verifies retrieval without recreation', async () => {
  const service = require('../src/integrations/pancake/pancakeAddressReconciliationService');
  const localOrder = order();
  const calls = [];
  let providerOrder = {
    id: 'PK-EXISTING', bill_full_name: 'Juan Dela Cruz', bill_phone_number: '09171234567', bill_email: 'juan@example.com',
    shipping_address: { address: '123 Sample Street', full_address: '123 Sample Street, Cavite' }
  };
  const client = {
    createOrder: async () => { throw new Error('must not recreate'); },
    updateOrder: async (_shopId, pancakeOrderId, payload) => {
      calls.push(['update', pancakeOrderId]);
      providerOrder = {
        ...providerOrder,
        bill_full_name: payload.bill_full_name,
        bill_phone_number: payload.bill_phone_number,
        bill_email: payload.bill_email,
        shipping_address: { ...payload.shipping_address }
      };
    },
    getOrder: async (_shopId, pancakeOrderId) => {
      calls.push(['get', pancakeOrderId]);
      return providerOrder;
    }
  };
  const records = [];
  const syncRepository = {
    getOrderSyncDetail: async () => ({ orderNumber: localOrder.orderNumber, pancakeOrderId: 'PK-EXISTING', shopId: 'shop-1' }),
    upsertOrderLink: async (value) => records.push(['link', value]),
    appendSyncLog: async (value) => records.push(['log', value])
  };
  const result = await service.reconcileOneAddress({
    orderNumber: localOrder.orderNumber,
    client,
    config: { shopId: 'shop-1' },
    orderRepository: { findOrderByNumber: async () => localOrder },
    exportRepository: { recordOrderAddressVerification: async (value) => records.push(['verification', value]) },
    syncRepository,
    geoResolver: async () => mapping()
  });

  assert.equal(result.status, 'verified');
  assert.equal(result.verification.valid, true);
  assert.deepEqual(calls, [['update', 'PK-EXISTING'], ['get', 'PK-EXISTING']]);
  assert.equal(providerOrder.shipping_address.province_id, '63_826');
  assert.equal(providerOrder.shipping_address.district_id, '63_8261588');
  assert.equal(providerOrder.shipping_address.commune_id, '63_82615881238');
  assert.equal(providerOrder.shipping_address.commnue_name, 'Bucandala iv');
  assert.equal(records.find(([type]) => type === 'verification')[1].providerVerification.valid, true);
});

test('bulk reconciliation refuses an unconfirmed historical update', async () => {
  const { applyAddressReconciliation } = require('../src/integrations/pancake/pancakeAddressReconciliationService');
  await assert.rejects(
    applyAddressReconciliation({ orderNumbers: ['MCC-ADDRESS-TEST'], confirmed: false }),
    (error) => error.code === 'pancake_reconciliation_confirmation_required'
  );
});
