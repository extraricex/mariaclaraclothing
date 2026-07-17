const test = require('node:test');
const assert = require('node:assert/strict');

const {
  backfillPancakeDeliveryAddresses
} = require('../src/integrations/pancake/pancakeAddressBackfillService');

function incompleteOrder(orderNumber) {
  return {
    orderNumber,
    checkoutChannel: 'storefront_checkout',
    paymentMethod: 'paymongo',
    paymentStatus: 'paid',
    status: 'confirmed',
    customer: { fullName: 'Juan Dela Cruz', phone: '' },
    address: { houseAddress: '123 Sample Street' },
    tags: ['missing_delivery_information']
  };
}

test('Pancake address backfill audits first and only applies complete readable provider data', async () => {
  const orders = new Map([
    ['MCC-RECOVER', incompleteOrder('MCC-RECOVER')],
    ['MCC-STILL-MISSING', incompleteOrder('MCC-STILL-MISSING')]
  ]);
  const updates = [];
  const statusEvents = [];
  const syncLogs = [];
  const orderRepository = {
    listOrders: async () => [...orders.values()],
    updateOrder: async (orderNumber, changes) => {
      updates.push([orderNumber, changes]);
      orders.set(orderNumber, { ...orders.get(orderNumber), ...changes });
    },
    appendOrderStatusEvent: async (orderNumber, event) => statusEvents.push([orderNumber, event])
  };
  const syncRepository = {
    getOrderSyncDetail: async (orderNumber) => ({ pancakeOrderId: `PK-${orderNumber}` }),
    appendSyncLog: async (entry) => syncLogs.push(entry)
  };
  const client = {
    getOrder: async (_shopId, pancakeOrderId) => pancakeOrderId.endsWith('MCC-RECOVER') ? {
      id: pancakeOrderId,
      bill_full_name: 'Juan Dela Cruz',
      shipping_address: {
        full_name: 'Juan Dela Cruz',
        phone_number: '+63 917-123-4567',
        address: '123 Sample Street',
        commune_name: 'Bucandala IV',
        district_name: 'Imus City',
        province_name: 'Cavite',
        post_code: '4103'
      }
    } : {
      id: pancakeOrderId,
      shipping_address: { address: 'Unknown Street', full_address: 'Unknown Street, Cavite' }
    }
  };

  const audit = await backfillPancakeDeliveryAddresses({
    client, config: { shopId: 'shop-1' }, orderRepository, syncRepository
  });
  assert.deepEqual(audit, {
    mode: 'audit', incompleteCount: 2, linkedCount: 2, recoverableCount: 1,
    appliedCount: 0, providerIncompleteCount: 1, failedCount: 0
  });
  assert.equal(updates.length, 0);

  const applied = await backfillPancakeDeliveryAddresses({
    apply: true, client, config: { shopId: 'shop-1' }, orderRepository, syncRepository
  });
  assert.equal(applied.appliedCount, 1);
  assert.equal(orders.get('MCC-RECOVER').status, 'confirmed');
  assert.equal(orders.get('MCC-RECOVER').paymentStatus, 'paid');
  assert.equal(orders.get('MCC-RECOVER').customer.phone, '09171234567');
  assert.equal(orders.get('MCC-RECOVER').address.barangay, 'Bucandala IV');
  assert.equal(orders.get('MCC-RECOVER').address.city, 'Imus City');
  assert.equal(orders.get('MCC-RECOVER').address.province, 'Cavite');
  assert.match(orders.get('MCC-RECOVER').address.formattedFullAddress, /Bucandala IV, Imus City, Cavite 4103/);
  assert.equal(orders.get('MCC-RECOVER').tags.includes('missing_delivery_information'), false);
  assert.equal(statusEvents.length, 1);
  assert.equal(syncLogs[0].code, 'pancake_delivery_address_backfilled');
});
