const test = require('node:test');
const assert = require('node:assert/strict');

function structuredAddress({ province = 'CAVITE', district = 'IMUS', commune = 'BUCANDALA IV' } = {}) {
  return {
    countryCode: '63',
    province: { id: '63-province', name: province },
    district: { id: '63-district', name: district },
    commune: { id: '63-commune', name: commune }
  };
}

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

test('maps official numeric Pancake status codes', () => {
  const { mapPancakeStatus } = require('../src/integrations/pancake/pancakeOrderMapper');
  assert.equal(mapPancakeStatus(0).status, 'received');
  assert.equal(mapPancakeStatus(8).status, 'packed');
  assert.equal(mapPancakeStatus(2).status, 'shipped');
  assert.equal(mapPancakeStatus(3).status, 'delivered');
  assert.equal(mapPancakeStatus(6).status, 'cancelled');
  assert.equal(mapPancakeStatus(5).status, 'returned');
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
      commune_name: 'Barangay',
      district_name: 'Makati',
      province_name: 'Metro Manila',
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
  assert.equal(order.address.houseAddress, '123 Street');
  assert.equal(order.address.barangay, 'Barangay');
  assert.equal(order.address.city, 'Makati');
  assert.equal(order.address.province, 'Metro Manila');
  assert.equal(order.address.postalCode, '1200');
  assert.equal(order.address.formattedFullAddress, '123 Street, Barangay, Makati, Metro Manila, 1200, Philippines');
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

test('normalizes official Pancake partner tracking fields', () => {
  const { normalizePancakeOrder } = require('../src/integrations/pancake/pancakeOrderMapper');
  const order = normalizePancakeOrder({
    id: 456,
    status: 2,
    partner: {
      partner_name: 'J&T Express',
      partner_status: 'shipping',
      extend_code: 'JT-OFFICIAL-123'
    }
  });

  assert.equal(order.status, 'shipped');
  assert.equal(order.deliveryMethod, 'J&T Express');
  assert.equal(order.trackingNumber, 'JT-OFFICIAL-123');
  assert.equal(order.deliveryStatus, 'out_for_delivery');
});

test('builds outbound Pancake order update payload from local order changes', () => {
  const { buildPancakeOrderUpdatePayload } = require('../src/integrations/pancake/pancakeOrderMapper');
  const payload = buildPancakeOrderUpdatePayload({
    order: {
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      deliveryStatus: 'out_for_delivery',
      deliveryMethod: 'J&T Express',
      trackingNumber: 'JNT123',
      customer: { fullName: 'Maria Customer', phone: '09171234567', email: 'buyer@example.com' },
      items: [{ quantity: 1, unitPriceCents: 64900 }],
      totalCents: 76900,
      shippingFeeCents: 12000,
      discountTotalCents: 0,
      freeShippingUnlocked: false,
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'cod_pending',
      address: {
        houseAddress: '123 Street', barangay: 'Barangay One', city: 'Makati',
        province: 'Metro Manila', addressLine: '123 Street, Barangay One, Makati, Metro Manila, Philippines', postalCode: '1200'
      },
      notes: 'Pack carefully'
    },
    changedFields: ['status', 'trackingNumber', 'deliveryMethod', 'customer', 'address', 'notes'],
    addressMapping: structuredAddress({ province: 'Metro Manila', district: 'Makati', commune: 'Barangay One' })
  });
  assert.equal(payload.status, 2);
  assert.equal(payload.partner.extend_code, 'JNT123');
  assert.equal(payload.shipping_partner, 'J&T Express');
  assert.equal(payload.bill_full_name, 'Maria Customer');
  assert.equal(payload.shipping_address.address, '123 Street');
  assert.equal(payload.shipping_address.commnue_name, 'Barangay One');
  assert.equal(payload.shipping_address.commune_id, '63-commune');
  assert.equal(payload.shipping_address.district_name, 'Makati');
  assert.equal(payload.shipping_address.province_name, 'Metro Manila');
  assert.equal(payload.shipping_address.post_code, '1200');
  assert.match(payload.shipping_address.full_address, /Barangay One, Makati, Metro Manila, 1200/);
  assert.equal(payload.shipping_fee, 120);
  assert.equal(payload.total_discount, 0);
  assert.equal(payload.is_free_shipping, false);
  assert.equal(payload.cod, 769);
  assert.equal(payload.transfer_money, 0);
  assert.equal(649 + payload.shipping_fee - payload.total_discount, payload.cod);
  assert.doesNotMatch(payload.note_print, /Pack carefully/);
  assert.match(payload.note, /cod_amount=769/);
  assert.match(payload.note_print, /website_status=shipped/);
});

test('address resync preserves discounted and free-shipping website totals', () => {
  const { buildPancakeOrderUpdatePayload } = require('../src/integrations/pancake/pancakeOrderMapper');
  const payload = buildPancakeOrderUpdatePayload({
    order: {
      orderNumber: 'MCC-ADDRESS-2',
      status: 'received',
      items: [{ quantity: 2, unitPriceCents: 64900 }],
      totalCents: 119800,
      shippingFeeCents: 0,
      discountTotalCents: 10000,
      freeShippingUnlocked: true,
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'cod_pending',
      customer: { firstName: 'Maria', lastName: 'Buyer', phone: '09171234567' },
      address: {
        houseAddress: '12 Test', barangay: 'BUCANDALA IV', city: 'IMUS',
        province: 'CAVITE', postalCode: '4103'
      }
    },
    changedFields: ['address'],
    addressMapping: structuredAddress()
  });

  assert.equal(payload.shipping_fee, 0);
  assert.equal(payload.total_discount, 100);
  assert.equal(payload.is_free_shipping, true);
  assert.equal(payload.cod, 1198);
  assert.equal(payload.transfer_money, 0);
  assert.equal((649 * 2) - payload.total_discount + payload.shipping_fee, payload.cod);
  assert.match(payload.note_print, /cod_amount=1198/);
});

test('address resync preserves the verified PayMongo paid amount', () => {
  const { buildPancakeOrderUpdatePayload } = require('../src/integrations/pancake/pancakeOrderMapper');
  const payload = buildPancakeOrderUpdatePayload({
    order: {
      orderNumber: 'MCC-ADDRESS-PAY', status: 'confirmed',
      items: [{ quantity: 1, unitPriceCents: 64900 }],
      totalCents: 76900, shippingFeeCents: 12000, discountTotalCents: 0,
      paymentMethod: 'paymongo', paymentStatus: 'paid', paidAmountCents: 76900,
      customer: { firstName: 'Maria', lastName: 'Buyer', phone: '09171234567' },
      address: { houseAddress: '12 Test', barangay: 'BUCANDALA IV', city: 'IMUS', province: 'CAVITE' }
    },
    changedFields: ['address'],
    addressMapping: structuredAddress()
  });

  assert.equal(payload.shipping_fee, 120);
  assert.equal(payload.cod, 0);
  assert.equal(payload.transfer_money, 769);
  assert.match(payload.note_print, /paid_amount=769/);
});

test('builds a verified PayMongo payment update with zero COD and prepaid transfer amount', () => {
  const { buildPancakeOrderUpdatePayload } = require('../src/integrations/pancake/pancakeOrderMapper');
  const payload = buildPancakeOrderUpdatePayload({
    order: {
      orderNumber: 'MCC-PAY-1', status: 'confirmed', checkoutChannel: 'storefront_checkout',
      paymentMethod: 'paymongo', paymentStatus: 'paid', totalCents: 72900, paidAmountCents: 72900,
      providerCheckoutSessionId: 'cs_1', providerPaymentId: 'pay_1', notes: 'Pack carefully',
      customer: { firstName: 'Maria', lastName: 'Buyer', phone: '09171234567' },
      address: { houseAddress: '12 Test', barangay: 'BUCANDALA IV', city: 'IMUS', province: 'CAVITE' }
    },
    changedFields: ['paymentMethod', 'paymentStatus', 'status']
  });
  assert.equal(payload.status, 1);
  assert.equal(payload.cod, 0);
  assert.equal(payload.transfer_money, 729);
  assert.match(payload.note_print, /payment_method=paymongo/);
  assert.match(payload.note_print, /payment_status=paid/);
  assert.match(payload.note_print, /paymongo_payment_id=pay_1/);
});

test('normalizes Pancake transfer payments and website status markers safely', () => {
  const { mapPancakeStatus, normalizePancakeOrder } = require('../src/integrations/pancake/pancakeOrderMapper');
  const paid = normalizePancakeOrder({
    id: 'PK-PAY-1', custom_id: 'MCC-PAY-1', status: 1, cod: 0, transfer_money: 729,
    note_print: 'payment_method=paymongo\npayment_status=paid\nwebsite_status=confirmed'
  });
  assert.equal(paid.paymentMethod, 'paymongo');
  assert.equal(paid.paymentStatus, 'paid');
  assert.equal(paid.codAmountCents, 0);
  assert.equal(paid.prepaidAmountCents, 72900);

  const unreachable = normalizePancakeOrder({
    id: 'PK-UNREACHABLE', custom_id: 'MCC-UNREACHABLE', status: 17,
    note_print: 'website_status=unreachable'
  });
  assert.equal(unreachable.status, 'unreachable');
  assert.equal(mapPancakeStatus(17).status, 'received');
});

test('verifies the retrieved Pancake structured address and rejects an empty dropdown ID', () => {
  const { verifyPancakeStructuredAddress } = require('../src/integrations/pancake/pancakeOrderMapper');
  const localOrder = {
    customer: { firstName: 'Juan', lastName: 'Dela Cruz', phone: '+639171234567', email: 'juan@example.com' },
    address: {
      houseAddress: '123 Sample Street', barangay: 'Bucandala IV', city: 'Imus City',
      province: 'Cavite', postalCode: '4103'
    }
  };
  const providerOrder = {
    bill_full_name: 'Juan Dela Cruz', bill_phone_number: '09171234567', bill_email: 'juan@example.com',
    shipping_address: {
      full_name: 'Juan Dela Cruz', phone_number: '09171234567', address: '123 Sample Street',
      full_address: '123 Sample Street, Bucandala iv, Imus, Cavite, 4103, Philippines',
      province_id: '63-province', province_name: 'Cavite',
      district_id: '63-district', district_name: 'Imus',
      commune_id: '63-commune', commnue_name: 'Bucandala iv',
      country_code: '63', post_code: '4103'
    }
  };
  const verified = verifyPancakeStructuredAddress({
    providerOrder, order: localOrder, mapping: structuredAddress()
  });
  assert.equal(verified.valid, true);
  assert.deepEqual(verified.issues, []);
  assert.equal(verified.persisted.communeId, '63-commune');

  providerOrder.shipping_address.commune_id = '';
  const invalid = verifyPancakeStructuredAddress({
    providerOrder, order: localOrder, mapping: structuredAddress()
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.includes('commune_id'));
});
