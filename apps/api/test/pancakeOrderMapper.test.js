const test = require('node:test');
const assert = require('node:assert/strict');

test('maps known Pancake status names to local status fields', () => {
  const { mapPancakeStatus } = require('../src/integrations/pancake/pancakeOrderMapper');
  assert.deepEqual(mapPancakeStatus('New'), { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' });
  assert.deepEqual(mapPancakeStatus('shipping'), { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' });
  assert.deepEqual(mapPancakeStatus('Packing'), { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' });
  assert.deepEqual(mapPancakeStatus('Delivered'), { status: 'delivered', fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' });
  assert.deepEqual(mapPancakeStatus('Cancelled'), { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' });
});

test('unknown Pancake status maps safely to other', () => {
  const { mapPancakeStatus } = require('../src/integrations/pancake/pancakeOrderMapper');
  assert.deepEqual(mapPancakeStatus('Provider Custom State'), { status: 'other', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' });
});

test('normalizes Pancake order payload into local order fields', () => {
  const { normalizePancakeOrder } = require('../src/integrations/pancake/pancakeOrderMapper');
  const order = normalizePancakeOrder({
    id: 'PK-1',
    custom_id: 'MCC-1',
    status: 'Delivered',
    bill_full_name: 'Maria Customer',
    bill_phone_number: '09171234567',
    bill_email: 'buyer@example.com',
    shipping_address: {
      address: '123 Street',
      full_address: '123 Street, Barangay, Makati, Metro Manila, Philippines',
      post_code: '1200'
    },
    items: [{ variation_info: { name: 'Shirt' }, variation_id: 'PV-1', quantity: 2, price: 899 }],
    shipping_fee: 100,
    total_discount: 50,
    total_price: 1848,
    note: 'Customer note',
    updated_at: '2026-07-10T00:00:00.000Z'
  });

  assert.equal(order.pancakeOrderId, 'PK-1');
  assert.equal(order.orderNumber, 'MCC-1');
  assert.equal(order.customer.fullName, 'Maria Customer');
  assert.equal(order.paymentMethod, 'cash_on_delivery');
  assert.equal(order.status, 'delivered');
  assert.equal(order.totalCents, 184800);
  assert.equal(order.shippingFeeCents, 10000);
});

test('normalizes Pancake shipping payment and tracking fields', () => {
  const { normalizePancakeOrder } = require('../src/integrations/pancake/pancakeOrderMapper');
  const order = normalizePancakeOrder({
    id: 'PK-2',
    custom_id: 'MCC-2',
    status: 'Confirmed',
    shipping_status: 'shipping',
    payment_method: 'gcash',
    payment_status: 'paid',
    shipping_partner: 'J&T Express',
    tracking_number: 'TRACK-2',
    estimated_delivery_date: '2026-07-12',
    delivery_notes: 'Leave with guard'
  });

  assert.equal(order.status, 'confirmed');
  assert.equal(order.deliveryStatus, 'out_for_delivery');
  assert.equal(order.paymentMethod, 'gcash');
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.deliveryMethod, 'J&T Express');
  assert.equal(order.trackingNumber, 'TRACK-2');
  assert.equal(order.estimatedDeliveryAt, '2026-07-12');
  assert.equal(order.deliveryNotes, 'Leave with guard');
});

test('normalizes nested Pancake shipment tracking fields', () => {
  const { normalizePancakeOrder } = require('../src/integrations/pancake/pancakeOrderMapper');
  const order = normalizePancakeOrder({
    id: 'PK-TRACK',
    custom_id: 'MCC-TRACK',
    status: 'Confirmed',
    shipping_info: {
      carrier_name: 'J&T Express',
      tracking_number: 'JT-123',
      shipping_status: 'shipping',
      estimated_delivery_date: '2026-07-15',
      delivery_notes: 'Call before delivery'
    }
  });

  assert.equal(order.deliveryMethod, 'J&T Express');
  assert.equal(order.trackingNumber, 'JT-123');
  assert.equal(order.deliveryStatus, 'out_for_delivery');
  assert.equal(order.estimatedDeliveryAt, '2026-07-15');
  assert.equal(order.deliveryNotes, 'Call before delivery');
});

test('builds outbound Pancake order update payload from local order changes', () => {
  const { buildPancakeOrderUpdatePayload } = require('../src/integrations/pancake/pancakeOrderMapper');
  const payload = buildPancakeOrderUpdatePayload({
    order: {
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      deliveryStatus: 'out_for_delivery',
      trackingNumber: 'JNT123',
      customer: { fullName: 'Maria Customer', phone: '09171234567', email: 'buyer@example.com' },
      address: { addressLine: '123 Street, Barangay, Makati', postalCode: '1200' },
      notes: 'Pack carefully'
    },
    changedFields: ['status', 'trackingNumber', 'customer', 'address', 'notes']
  });
  assert.equal(payload.status, 'Shipped');
  assert.equal(payload.tracking_number, 'JNT123');
  assert.equal(payload.bill_full_name, 'Maria Customer');
  assert.equal(payload.note_print, 'Pack carefully');
});
