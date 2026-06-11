const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ORDER_ITEM = {
  productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
  productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
  size: 'Small',
  quantity: 1,
  unitPriceCents: 64900
};

test('admin dashboard page has login order management and status controls', async () => {
  const root = path.join(__dirname, '..');
  const adminHtml = await fs.readFile(path.join(root, 'public', 'admin.html'), 'utf8');
  const adminLoginHtml = await fs.readFile(path.join(root, 'public', 'admin-login.html'), 'utf8');
  const adminJs = await fs.readFile(path.join(root, 'public', 'js', 'admin.js'), 'utf8');
  const styles = await fs.readFile(path.join(root, 'public', 'styles.css'), 'utf8');

  assert.match(adminHtml, /<title>Admin Orders \| Maria Clara<\/title>/);
  assert.match(adminLoginHtml, /<title>Admin Login \| Maria Clara<\/title>/);
  assert.match(adminLoginHtml, /data-admin-login-form/);
  assert.match(adminLoginHtml, /data-admin-login-panel/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-account-login-page\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-account-login-shell\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-account-login-card\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-shopify-login-header\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-shopify-login-layout\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-shopify-login-main\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-login-benefits\b/);
  assert.match(adminLoginHtml, /class="[^"]*\badmin-login-trial-panel\b/);
  assert.match(adminLoginHtml, /Log in to Maria Clara/);
  assert.match(adminLoginHtml, /Manage products, inventory, orders, and storefront updates from one workspace/);
  assert.match(adminLoginHtml, /New to Maria Clara Admin/);
  assert.match(adminLoginHtml, /Ready\. Set\. Sell\./);
  assert.match(adminLoginHtml, /Privacy and security tools/);
  assert.match(adminLoginHtml, /data-admin-login-password/);
  assert.match(adminLoginHtml, />Log in<\/button>/);
  assert.doesNotMatch(adminLoginHtml, /Google|Facebook|Apple|Continue with/i);
  assert.match(adminHtml, /class="[^"]*\badmin-frame\b[^"]*\bcontainer-fluid\b[^"]*\bg-0\b/);
  assert.match(adminHtml, /admin-auth-pending/);
  assert.match(adminHtml, /class="[^"]*\badmin-sidebar\b[^"]*\bcol-12\b[^"]*\bcol-lg-3\b/);
  assert.match(adminHtml, /data-admin-nav/);
  assert.match(adminHtml, /data-admin-dashboard-summary/);
  assert.match(adminHtml, /data-admin-dashboard-date-range/);
  assert.match(adminHtml, /data-admin-dashboard-work/);
  assert.match(adminHtml, /data-admin-dashboard-sales/);
  assert.match(adminHtml, /data-admin-dashboard-actions/);
  assert.match(adminHtml, /data-admin-dashboard-sales-chart/);
  assert.match(adminHtml, /data-admin-dashboard-order-status-chart/);
  assert.match(adminHtml, /data-admin-dashboard-inventory-chart/);
  assert.match(adminHtml, /data-admin-dashboard-shipping-chart/);
  assert.match(adminHtml, /data-admin-dashboard-recent-orders/);
  assert.match(adminHtml, /data-admin-dashboard-product-alerts/);
  assert.match(adminHtml, /data-admin-dashboard-refresh/);
  assert.match(adminHtml, />Orders<\/a>/);
  assert.doesNotMatch(adminHtml, /data-admin-nav-count="orders"/);
  assert.doesNotMatch(adminHtml, /admin-nav-subitem/);
  assert.doesNotMatch(adminHtml, />Drafts<\/a>/);
  assert.doesNotMatch(adminHtml, />Abandoned checkouts<\/a>/);
  assert.match(adminHtml, />Products<\/a>/);
  assert.match(adminHtml, /class="[^"]*\badmin-topbar\b[^"]*\bnavbar\b/);
  assert.match(adminHtml, /class="admin-topbar-search"/);
  assert.match(adminHtml, /data-admin-global-search/);
  assert.match(adminHtml, /data-admin-notifications/);
  assert.match(adminHtml, /data-admin-store-name/);
  assert.match(adminHtml, /data-admin-profile/);
  assert.match(adminHtml, /class="admin-page-heading"/);
  [
    'Dashboard',
    'Products',
    'Settings'
  ].forEach((label) => {
    assert.match(adminHtml, new RegExp(`>${label}<\\/a>`));
  });
  [
    'Customers',
    'Discounts',
    'Shipping Settings'
  ].forEach((label) => {
    assert.doesNotMatch(adminHtml, new RegExp(`data-admin-nav-link="[^"]+">${label}<\\/a>`));
  });
  assert.match(adminHtml, /data-admin-nav-link="website-content">Website<\/a>/);
  assert.match(adminHtml, /data-admin-page="settings"[\s\S]*Working now[\s\S]*Coming next/);
  [
    'Marketing',
    'Markets',
    'Analytics'
  ].forEach((label) => {
    assert.doesNotMatch(adminHtml, new RegExp(`>${label}<\\/a>`));
  });
  [
    'Sales channels',
    'Point of Sale',
    'TikTok',
    'Facebook &amp; Instagram',
    'Apps'
  ].forEach((label) => {
    assert.doesNotMatch(adminHtml, new RegExp(`>${label}<\\/a>|>${label}<\\/span>`));
  });
  assert.doesNotMatch(adminHtml, /data-admin-login-form/);
  assert.match(adminHtml, /data-admin-orders/);
  assert.match(adminHtml, /data-admin-order-detail/);
  assert.match(adminHtml, /data-admin-status-filter/);
  assert.doesNotMatch(adminHtml, /data-admin-order-metrics/);
  assert.match(adminHtml, /data-admin-order-work-queues/);
  assert.match(adminHtml, /admin-orders-index/);
  assert.match(adminHtml, /admin-orders-filter-shell/);
  assert.match(adminHtml, /admin-order-table-toolbar/);
  assert.match(adminHtml, /Search and filter/);
  assert.doesNotMatch(adminHtml, /data-admin-order-column-settings/);
  assert.doesNotMatch(adminHtml, /data-admin-create-order/);
  assert.doesNotMatch(adminHtml, /Create order/);
  assert.match(adminHtml, /data-admin-order-date-filter/);
  assert.match(adminHtml, /data-admin-order-payment-filter/);
  assert.match(adminHtml, /data-admin-order-fulfillment-filter/);
  assert.match(adminHtml, /data-admin-export-jnt/);
  assert.doesNotMatch(adminHtml, /data-admin-order-more-actions/);
  assert.match(adminHtml, /data-admin-page="products"/);
  assert.match(adminHtml, /data-admin-page="customers"/);
  assert.match(adminHtml, /data-admin-page="website-content"/);
  assert.match(adminHtml, /data-admin-page="shipping-settings"/);
  assert.match(adminHtml, /data-admin-page="settings"/);
  assert.match(adminJs, /data-admin-update-form/);
  assert.match(adminJs, /COD confirmation/);
  assert.match(adminJs, /renderOrderWorkQueues/);
  assert.match(adminJs, /admin-order-work-queue/);
  assert.match(adminJs, /Needs COD confirmation/);
  assert.match(adminJs, /Ready for J&T/);
  assert.match(adminJs, /Ready to ship/);
  assert.match(adminJs, /jntExportStatusLabel/);
  assert.match(adminJs, /jntExportStatusBadgeClass/);
  assert.match(adminJs, /data-admin-jnt-missing-fields/);
  assert.match(adminJs, /renderOrderContactActions/);
  assert.match(adminJs, /copyOrderText/);
  assert.match(adminJs, /function adminPageFromHash/);
  assert.match(adminJs, /function setAdminPageHash/);
  assert.match(adminJs, /window\.addEventListener\('hashchange'/);
  assert.match(adminJs, /window\.history\.pushState/);
  assert.match(adminJs, /Fulfillment checklist/);
  assert.match(adminJs, /data-admin-copy-order-phone/);
  assert.match(adminJs, /data-admin-copy-order-address/);
  assert.match(adminJs, /data-admin-order-customer-fields/);
  assert.match(adminJs, /name="customerFullName"/);
  assert.match(adminJs, /name="customerPhone"/);
  assert.match(adminJs, /name="addressHouseAddress"/);
  assert.match(adminJs, /data-admin-address-province/);
  assert.match(adminJs, /data-admin-address-city/);
  assert.match(adminJs, /data-admin-address-barangay/);
  assert.match(adminJs, /loadJntAddressGuide/);
  assert.match(adminJs, /\/data\/jnt-address-guide\.json/);
  assert.match(adminJs, /hydrateAdminOrderAddressDropdowns/);
  assert.match(adminJs, /syncAdminOrderAddressLine/);
  assert.match(adminJs, /name="addressLine"/);
  assert.match(adminJs, /formatAdminOrderAddress/);
  assert.match(adminJs, /selectedOrderNumbers/);
  assert.match(adminJs, /exportJntOrders/);
  assert.match(adminJs, /\/api\/admin\/orders\/export\/jnt/);
  assert.match(adminJs, /JNT_Orders_/);
  assert.match(adminJs, /\/api\/admin\/login/);
  assert.match(adminJs, /\/api\/admin\/session/);
  assert.match(adminJs, /redirectToLogin/);
  assert.match(adminJs, /admin-login\.html/);
  assert.match(adminJs, /\/api\/admin\/orders/);
  assert.match(adminJs, /localStorage\.setItem\('maria-clara-admin-token'/);
  assert.match(adminJs, /authorization:\s*`Bearer \$\{adminToken\}`/);
  assert.match(adminJs, /method:\s*'PATCH'/);
  assert.doesNotMatch(adminJs, /renderOrderMetrics/);
  assert.doesNotMatch(adminJs, /admin-order-metric-strip/);
  assert.match(adminJs, /admin-order-table/);
  assert.match(adminJs, /admin-order-primary/);
  assert.match(adminJs, /admin-order-name-cell/);
  assert.match(adminJs, /admin-order-table-footer/);
  assert.match(adminJs, /admin-order-pagination/);
  assert.match(adminJs, /setOrderDetailMode/);
  assert.match(adminJs, /data-admin-order-back/);
  [
    'Order',
    'Date',
    'Customer',
    'Channel',
    'Total',
    'Payment status',
    'Fulfillment status',
    'J&T status',
    'Items',
    'Delivery method'
  ].forEach((label) => {
    assert.match(adminJs, new RegExp(label));
  });
  assert.match(adminJs, /renderSummaryCards/);
  assert.match(adminJs, /loadDashboardSummary/);
  assert.match(adminJs, /dashboardDateRangeInput/);
  assert.match(adminJs, /filterDashboardOrdersByRange/);
  assert.match(adminJs, /renderDashboardWorkPanel/);
  assert.match(adminJs, /data-admin-dashboard-link="collections"/);
  assert.match(adminJs, /renderDashboardSummary/);
  assert.match(adminJs, /Total shipping fee/);
  assert.match(adminJs, /From all placed orders/);
  assert.match(adminJs, /shippingCollected/);
  assert.match(adminJs, /renderDashboardSales/);
  assert.match(adminJs, /renderDashboardCharts/);
  assert.match(adminJs, /renderDashboardSalesChart/);
  assert.match(adminJs, /renderDashboardOrderStatusChart/);
  assert.match(adminJs, /renderDashboardInventoryChart/);
  assert.match(adminJs, /renderDashboardShippingChart/);
  assert.match(adminJs, /renderDashboardRecentOrders/);
  assert.match(adminJs, /renderDashboardProductAlerts/);
  assert.match(adminJs, /renderDashboardActions/);
  assert.match(adminJs, /exportOrders/);
  assert.match(adminJs, /renderAdminPage/);
  assert.match(adminJs, /function animateAdminPageSection/);
  assert.match(adminJs, /animateAdminPageSection\(normalizedPage\)/);
  assert.match(adminJs, /admin-badge/);
  assert.match(adminJs, /function statusBadgeClass/);
  assert.match(adminJs, /function formatAdminDate/);
  assert.match(styles, /\.admin-shell\s*{/);
  assert.match(styles, /\.admin-auth-pending \.admin-frame\s*{/);
  assert.match(styles, /\.admin-login-screen\s*{/);
  assert.match(styles, /\.admin-account-login-shell\s*{/);
  assert.match(styles, /\.admin-account-login-card\s*{/);
  assert.match(styles, /\.admin-shopify-login-header\s*{/);
  assert.match(styles, /\.admin-shopify-login-layout\s*{/);
  assert.match(styles, /\.admin-shopify-login-main\s*{/);
  assert.match(styles, /\.admin-login-benefits\s*{/);
  assert.match(styles, /\.admin-login-trial-panel\s*{/);
  assert.match(styles, /\.admin-account-logo\s*{/);
  assert.match(styles, /\.admin-frame\s*{/);
  assert.match(styles, /\.admin-sidebar\s*{/);
  assert.match(styles, /\.admin-card\s*{/);
  assert.match(styles, /\.admin-dashboard-date-filter\s*{/);
  assert.match(styles, /\.admin-dashboard-work-grid\s*{/);
  assert.match(styles, /\.admin-order-table\s*{/);
  assert.match(styles, /\.admin-orders-index\s*{/);
  assert.match(styles, /\.admin-order-work-queues\s*{/);
  assert.match(styles, /\.admin-order-detail-grid\s*{/);
  assert.match(styles, /\.admin-order-contact-actions\s*{/);
  assert.match(styles, /\.admin-fulfillment-checklist\s*{/);
  assert.match(styles, /\.admin-orders-filter-shell\s*{/);
  assert.match(styles, /\.admin-order-table-toolbar\s*{/);
  assert.match(styles, /\.admin-order-primary\s*{/);
  assert.match(styles, /\.admin-order-table-footer\s*{/);
  assert.match(styles, /\.admin-order-pagination\s*{/);
  assert.match(styles, /\.admin-page-section\.is-order-detailing/);
  assert.match(styles, /\.admin-badge\s*{/);
  assert.match(styles, /\.admin-topbar-search\s*{/);
  assert.match(styles, /\.admin-summary-grid\s*{/);
  assert.match(styles, /\.admin-dashboard-grid\s*{/);
  assert.match(styles, /\.admin-dashboard-chart\s*{/);
  assert.match(styles, /\.admin-dashboard-bar-chart\s*{/);
  assert.match(styles, /\.admin-dashboard-donut\s*{/);
  assert.match(styles, /\.admin-dashboard-legend\s*{/);
  assert.match(styles, /\.admin-dashboard-stat-list\s*{/);
  assert.match(styles, /\.admin-dashboard-list-row\s*{/);
  assert.match(styles, /\.admin-dashboard-actions\s*{/);
  assert.match(styles, /\.admin-tabs\s*{/);
  assert.match(styles, /\.admin-icon-button\s*{/);
  assert.match(styles, /\.admin-page-section\.is-page-transitioning\s*{[^}]*animation:\s*admin-page-enter\s+220ms\s+ease-out/s);
});

test('admin order APIs require login and support list detail and status updates', async () => {
  const previousOrdersDataFile = process.env.ORDERS_DATA_FILE;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-orders-')), 'orders.json');
  process.env.ADMIN_PASSWORD = 'admin-test-password';

  const app = createFreshApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const rejectedListResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders`);
    const rejectedListBody = await rejectedListResponse.json();

    assert.equal(rejectedListResponse.status, 401);
    assert.equal(rejectedListBody.error, 'Admin authentication is required');

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin-test-password' })
    });
    const loginBody = await loginResponse.json();

    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.token, 'local-admin-token');

    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/admin/session`, adminRequest(loginBody.token));
    const sessionBody = await sessionResponse.json();

    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionBody.authenticated, true);

    const orderNumber = await createOrder(port, {
      fullName: 'Admin Customer',
      phone: '09170000001',
      houseAddress: '55 Admin Street',
      barangay: 'Bucandala IV',
      city: 'Imus City',
      province: 'Cavite',
      shippingFeeCents: 8000
    });

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders?q=admin`, adminRequest(loginBody.token));
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.orders.length, 1);
    assert.equal(listBody.orders[0].orderNumber, orderNumber);
    assert.equal(listBody.orders[0].customerName, 'Admin Customer');
    assert.equal(listBody.orders[0].status, 'received');
    assert.equal(listBody.orders[0].shippingFeeCents, 8000);
    assert.equal(listBody.orders[0].codConfirmationStatus, 'pending');
    assert.equal(listBody.orders[0].channel, 'Online Store');
    assert.equal(listBody.orders[0].itemCount, 1);
    assert.equal(listBody.orders[0].deliveryStatus, 'pending');
    assert.equal(listBody.orders[0].deliveryMethod, 'Standard shipping');
    assert.equal(listBody.orders[0].jntExportStatus, 'ready');
    assert.equal(listBody.orders[0].exportedToJnt, false);
    assert.deepEqual(listBody.orders[0].jntMissingFields, []);
    assert.deepEqual(listBody.orders[0].tags, []);

    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${encodeURIComponent(orderNumber)}`, adminRequest(loginBody.token));
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.order.orderNumber, orderNumber);
    assert.equal(detailBody.order.customer.phone, '09170000001');
    assert.equal(detailBody.order.items[0].variantId, ORDER_ITEM.variantId);

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      ...adminRequest(loginBody.token),
      headers: {
        ...adminRequest(loginBody.token).headers,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        status: 'confirmed',
        fulfillmentStatus: 'packed',
        paymentStatus: 'cod_pending',
        codConfirmationStatus: 'confirmed',
        deliveryStatus: 'ready',
        deliveryMethod: 'Courier pickup',
        trackingNumber: 'MC123456',
        tags: ['confirmed', 'priority'],
        notes: 'Customer confirmed by text.',
        customer: {
          fullName: 'Edited Admin Customer',
          phone: '+639171111111',
          email: 'edited@example.com'
        },
        address: {
          houseAddress: '99 Edited Street',
          barangay: 'BUCANDALA IV',
          city: 'IMUS',
          province: 'CAVITE',
          addressLine: '99 Edited Street, BUCANDALA IV, IMUS, CAVITE, Philippines'
        }
      })
    });
    const updateBody = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.order.status, 'confirmed');
    assert.equal(updateBody.order.fulfillmentStatus, 'packed');
    assert.equal(updateBody.order.codConfirmationStatus, 'confirmed');
    assert.equal(updateBody.order.deliveryStatus, 'ready');
    assert.equal(updateBody.order.deliveryMethod, 'Courier pickup');
    assert.equal(updateBody.order.trackingNumber, 'MC123456');
    assert.deepEqual(updateBody.order.tags, ['confirmed', 'priority']);
    assert.equal(updateBody.order.notes, 'Customer confirmed by text.');
    assert.equal(updateBody.order.customer.fullName, 'Edited Admin Customer');
    assert.equal(updateBody.order.customer.phone, '+639171111111');
    assert.equal(updateBody.order.customer.email, 'edited@example.com');
    assert.equal(updateBody.order.address.houseAddress, '99 Edited Street');
    assert.equal(updateBody.order.address.barangay, 'BUCANDALA IV');
    assert.equal(updateBody.order.address.city, 'IMUS');
    assert.equal(updateBody.order.address.province, 'CAVITE');
    assert.equal(updateBody.order.address.addressLine, '99 Edited Street, BUCANDALA IV, IMUS, CAVITE, Philippines');

    const filteredResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders?status=confirmed`, adminRequest(loginBody.token));
    const filteredBody = await filteredResponse.json();

    assert.equal(filteredResponse.status, 200);
    assert.equal(filteredBody.orders.length, 1);
    assert.equal(filteredBody.orders[0].status, 'confirmed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersDataFile);
    restoreEnv('ADMIN_PASSWORD', previousAdminPassword);
  }
});

test('admin order status updates reject unsupported statuses', async () => {
  const previousOrdersDataFile = process.env.ORDERS_DATA_FILE;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-orders-')), 'orders.json');
  process.env.ADMIN_PASSWORD = 'admin-test-password';

  const app = createFreshApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const orderNumber = await createOrder(port, {
      fullName: 'Invalid Status Customer',
      phone: '09170000002',
      houseAddress: '56 Admin Street',
      barangay: 'Bucandala IV',
      city: 'Imus City',
      province: 'Cavite',
      shippingFeeCents: 8000
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      ...adminRequest('local-admin-token'),
      headers: {
        ...adminRequest('local-admin-token').headers,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ status: 'lost' })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Order status is invalid');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersDataFile);
    restoreEnv('ADMIN_PASSWORD', previousAdminPassword);
  }
});

function adminRequest(token) {
  return {
    headers: {
      authorization: `Bearer ${token}`
    }
  };
}

async function createOrder(port, customer) {
  const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      customer: { fullName: customer.fullName, phone: customer.phone, email: '' },
      address: {
        addressLine: `${customer.houseAddress}, ${customer.barangay}, ${customer.city}, ${customer.province}, Philippines`,
        houseAddress: customer.houseAddress,
        barangay: customer.barangay,
        city: customer.city,
        province: customer.province,
        country: 'Philippines',
        postalCode: ''
      },
      shippingFeeCents: customer.shippingFeeCents,
      checkoutChannel: 'storefront_checkout',
      paymentMethod: 'cash_on_delivery',
      shippingRegion: 'metro_manila_cavite',
      shippingRegionLabel: 'Metro Manila & Cavite Region',
      freeShippingUnlocked: false,
      discountTotalCents: 0,
      items: [ORDER_ITEM]
    })
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  return body.orderNumber;
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/admin')];
  delete require.cache[require.resolve('../src/routes/orders')];
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
