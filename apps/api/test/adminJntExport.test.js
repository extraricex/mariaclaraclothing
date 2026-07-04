const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');

process.env.ORDER_NOTIFICATIONS_DATA_FILE = path.join(
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'mc-notifications-')),
  'order-notifications.json'
);

const ADMIN_TOKEN = 'local-admin-token';
const JNT_HEADERS = [
  'Receiver(*)',
  'Receiver Telephone (*)',
  'Receiver Address (*)',
  'Receiver Province (*)',
  'Receiver City (*)',
  'Receiver Region (*)',
  'Express Type (*)',
  'Parcel Name (*)',
  'Weight (kg)  (*)',
  'Total parcels(*)',
  'Parcel Value (Insurance Fee) (*)',
  'COD (PHP) (*)',
  'Remarks'
];

test('J&T template keeps required sheets and List row 8 headers', () => {
  const workbook = XLSX.readFile(path.join(__dirname, '..', 'data', 'jnt', 'jntexportfile.xlsx'));
  const list = workbook.Sheets.List;
  const guide = workbook.Sheets['Addressing guide'];

  assert.deepEqual(workbook.SheetNames, ['List', 'Addressing guide', 'Dịch vụ']);
  assert.equal(list['!ref'], 'A1:M5098');
  assert.equal(guide['!ref'], 'A1:D42989');
  assert.deepEqual(readRow(list, 8, 13), JNT_HEADERS);
  assert.deepEqual(readRow(guide, 1, 4), [
    'STATE/PROVINCE',
    'CITY/MUNICIPALITY',
    'TOWN/BARANGAY',
    'Can do delivery door to door'
  ]);
});

test('generated J&T address guide keeps template province city barangay hierarchy', async () => {
  const guide = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'public', 'data', 'jnt-address-guide.json'), 'utf8'));
  const cavite = guide.provinces.find((province) => province.name === 'CAVITE');
  const imus = guide.cities.CAVITE.find((city) => city.name === 'IMUS');
  const bucandala = guide.barangays[imus.code].find((barangay) => barangay.name === 'BUCANDALA IV');

  assert.equal(guide.metadata.source, 'data/jnt/jntexportfile.xlsx');
  assert.equal(guide.metadata.sheet, 'Addressing guide');
  assert.equal(guide.metadata.provinceCount, 82);
  assert.ok(guide.metadata.cityMunicipalityCount >= 1600);
  assert.ok(guide.metadata.barangayCount >= 42000);
  assert.equal(cavite.code, 'CAVITE');
  assert.equal(imus.code, 'CAVITE|IMUS');
  assert.equal(bucandala.code, 'CAVITE|IMUS|BUCANDALA IV');
  assert.equal(bucandala.doorToDoor, 'YES');
});

test('admin J&T export writes orders into template row 9 and validates missing fields', async () => {
  const previousOrdersDataFile = process.env.ORDERS_DATA_FILE;
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-jnt-export-')), 'orders.json');
  const app = createFreshApp();
  const { saveOrder, findOrderByNumber } = require('../src/orders/orderRepository');
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    await saveOrder(exampleOrder());
    await saveOrder({
      ...exampleOrder(),
      orderNumber: 'MCC-MISSING',
      customer: { fullName: '', phone: '' }
    });

    const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/export/jnt`, jsonAdminRequest('POST', {
      orderNumbers: ['MCC-MISSING']
    }));
    const invalidBody = await invalidResponse.json();

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidBody.error, 'Some orders are missing J&T export fields');
    assert.equal(invalidBody.orders[0].orderNumber, 'MCC-MISSING');
    assert.ok(invalidBody.orders[0].missing.includes('customer name'));

    const exportResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/export/jnt`, jsonAdminRequest('POST', {
      orderNumbers: ['MCC-1001']
    }));
    const buffer = Buffer.from(await exportResponse.arrayBuffer());
    const exportedWorkbook = XLSX.read(buffer, { type: 'buffer' });
    const list = exportedWorkbook.Sheets.List;
    const exportedOrder = await findOrderByNumber('MCC-1001');

    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-type') || '', /spreadsheetml/);
    assert.match(exportResponse.headers.get('content-disposition') || '', /JNT_Orders_\d{4}-\d{2}-\d{2}\.xlsx/);
    assert.deepEqual(exportedWorkbook.SheetNames, ['List', 'Addressing guide', 'Dịch vụ']);
    assert.deepEqual(readRow(list, 8, 13), JNT_HEADERS);
    assert.deepEqual(readRow(list, 9, 13), [
      'Maria Clara Customer',
      '+639171234567',
      '313 PAGASA SUBDIVISION, LANDMARK GATE 2',
      'CAVITE',
      'IMUS',
      'BUCANDALA IV',
      'EZ',
      'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt, KAMALAYAN BLOOM BLACK',
      '1',
      '1',
      '1498.00',
      '1498.00',
      'Small x1; Medium x1 | Please text before delivery'
    ]);
    assert.notDeepEqual(readRow(list, 9, 13), ['xxx', '+631234567890', 'BaoAnQu']);
    assert.equal(exportedOrder.exportedToJnt, true);
    assert.ok(exportedOrder.jntExportedAt);
    assert.equal(exportedOrder.status, 'shipped');
    assert.equal(exportedOrder.fulfillmentStatus, 'shipped');
    assert.equal(exportedOrder.deliveryStatus, 'out_for_delivery');
    assert.equal(exportedOrder.statusEvents.length, 1);
    assert.equal(exportedOrder.statusEvents[0].source, 'jnt_export');
    assert.equal(exportedOrder.statusEvents[0].changes.status.from, 'confirmed');
    assert.equal(exportedOrder.statusEvents[0].changes.status.to, 'shipped');
    assert.equal(exportedOrder.statusEvents[0].changes.fulfillmentStatus.from, 'unfulfilled');
    assert.equal(exportedOrder.statusEvents[0].changes.fulfillmentStatus.to, 'shipped');
    assert.equal(exportedOrder.statusEvents[0].changes.deliveryStatus.from, 'pending');
    assert.equal(exportedOrder.statusEvents[0].changes.deliveryStatus.to, 'out_for_delivery');
    assert.match(exportedOrder.statusEvents[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersDataFile);
  }
});

test('admin can record tracking notification only after J&T export or shipment', async () => {
  const previousOrdersDataFile = process.env.ORDERS_DATA_FILE;
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-tracking-notification-')), 'orders.json');
  const app = createFreshApp();
  const { saveOrder, findOrderByNumber } = require('../src/orders/orderRepository');
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    await saveOrder(exampleOrder());
    await saveOrder({
      ...exampleOrder(),
      orderNumber: 'MCC-SHIPPED',
      exportedToJnt: true,
      jntExportedAt: '2026-06-05T12:00:00.000Z',
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      deliveryStatus: 'out_for_delivery',
      trackingNumber: 'JNT123456789'
    });

    const blockedResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/orders/MCC-1001/tracking-notification`,
      jsonAdminRequest('POST', {})
    );
    const blockedBody = await blockedResponse.json();

    assert.equal(blockedResponse.status, 400);
    assert.equal(blockedBody.error, 'Tracking notifications require a shipped or J&T-exported order');

    const notificationResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/orders/MCC-SHIPPED/tracking-notification`,
      jsonAdminRequest('POST', { channel: 'sms' })
    );
    const notificationBody = await notificationResponse.json();
    const savedOrder = await findOrderByNumber('MCC-SHIPPED');

    assert.equal(notificationResponse.status, 200);
    assert.equal(notificationBody.notification.orderNumber, 'MCC-SHIPPED');
    assert.equal(notificationBody.notification.channel, 'sms');
    assert.equal(notificationBody.notification.status, 'recorded');
    assert.match(notificationBody.notification.message, /MCC-SHIPPED/);
    assert.match(notificationBody.notification.message, /JNT123456789/);
    assert.equal(notificationBody.order.trackingNotifications.length, 1);
    assert.equal(savedOrder.trackingNotifications.length, 1);
    assert.equal(savedOrder.trackingNotifications[0].source, 'admin');

    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/MCC-SHIPPED`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.order.trackingNotifications.length, 1);
    assert.equal(detailBody.order.trackingNotifications[0].trackingNumber, 'JNT123456789');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersDataFile);
  }
});

function readRow(sheet, rowNumber, width) {
  return Array.from({ length: width }).map((_value, index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowNumber - 1, c: index })];
    return cell ? String(cell.w ?? cell.v ?? '') : '';
  });
}

function exampleOrder() {
  return {
    orderNumber: 'MCC-1001',
    customer: {
      fullName: 'Maria Clara Customer',
      phone: '09171234567',
      email: ''
    },
    address: {
      addressLine: '313 PAGASA SUBDIVISION, LANDMARK GATE 2, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '313 PAGASA SUBDIVISION, LANDMARK GATE 2',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    items: [
      {
        productId: 'catalog-curiosity',
        variantId: 'catalog-curiosity-small',
        productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
        size: 'Small',
        quantity: 1,
        unitPriceCents: 74900
      },
      {
        productId: 'catalog-kamalayan',
        variantId: 'catalog-kamalayan-medium',
        productName: 'KAMALAYAN BLOOM BLACK',
        size: 'Medium',
        quantity: 1,
        unitPriceCents: 74900
      }
    ],
    subtotalCents: 149800,
    discountTotalCents: 0,
    shippingFeeCents: 0,
    shippingRegion: 'luzon',
    shippingRegionLabel: 'Luzon Region',
    freeShippingUnlocked: true,
    totalCents: 149800,
    cartSnapshot: [],
    checkoutChannel: 'storefront_checkout',
    paymentMethod: 'cash_on_delivery',
    channel: 'Online Store',
    status: 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'cod_pending',
    codConfirmationStatus: 'pending',
    deliveryStatus: 'pending',
    deliveryMethod: 'Standard shipping',
    trackingNumber: '',
    tags: [],
    notes: 'Please text before delivery',
    placedAt: '2026-06-05T10:00:00.000Z'
  };
}

function jsonAdminRequest(method, body) {
  return {
    method,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/admin')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  return require('../src/app').createApp();
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
