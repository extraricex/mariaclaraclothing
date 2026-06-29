const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// Isolate the catalog so order-creation stock deduction never mutates the committed fixture.
const nodeFsForProducts = require('node:fs');
const nodeOsForProducts = require('node:os');
const nodePathForProducts = require('node:path');
process.env.PRODUCTS_DATA_FILE = nodePathForProducts.join(
  nodeFsForProducts.mkdtempSync(nodePathForProducts.join(nodeOsForProducts.tmpdir(), 'mc-products-')),
  'products.json'
);
nodeFsForProducts.copyFileSync(
  nodePathForProducts.join(__dirname, '..', 'data', 'products.json'),
  process.env.PRODUCTS_DATA_FILE
);

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/customer')];
  delete require.cache[require.resolve('../src/routes/orders')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  delete require.cache[require.resolve('../src/customers/customerAccountRepository')];
  return require('../src/app').createApp();
}

function jsonRequest(port, pathname, { token, ...options } = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
}

const ORDER_ITEM = {
  productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
  productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
  size: 'Small',
  quantity: 1,
  unitPriceCents: 64900
};

function checkoutPayload(phone = '09171230001') {
  return {
    customer: { fullName: 'Maria Test', phone, email: '' },
    address: {
      addressLine: '12 Test St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Test St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    shippingFeeCents: 8000,
    items: [ORDER_ITEM]
  };
}

test('customer accounts: register, login, profile, order linking', async () => {
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousAccountsFile = process.env.CUSTOMER_ACCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-accounts-'));
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.CUSTOMER_ACCOUNTS_DATA_FILE = path.join(tempDir, 'customer-accounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    // Guest order placed before registration must not become account-owned by phone alone.
    const guestOrder = await jsonRequest(port, '/api/orders', {
      method: 'POST',
      body: JSON.stringify(checkoutPayload('09171230001'))
    });
    assert.equal(guestOrder.status, 201);

    // register
    const registerResponse = await jsonRequest(port, '/api/customer/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Maria Test', email: 'Maria@Example.com', phone: '09171230001', password: 'sikretong-malupit' })
    });
    assert.equal(registerResponse.status, 201);
    const { token, customer } = await registerResponse.json();
    assert.ok(token);
    assert.equal(customer.email, 'maria@example.com');
    assert.equal(customer.savedAddress, null);
    assert.equal(customer.passwordHash, undefined);

    // duplicate email
    const duplicate = await jsonRequest(port, '/api/customer/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Maria Two', email: 'maria@example.com', phone: '09171230002', password: 'sikretong-malupit' })
    });
    assert.equal(duplicate.status, 400);
    assert.deepEqual(await duplicate.json(), { error: 'An account with this email already exists' });

    // weak password
    const weak = await jsonRequest(port, '/api/customer/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Weak', email: 'weak@example.com', phone: '09171230003', password: 'short' })
    });
    assert.equal(weak.status, 400);
    assert.deepEqual(await weak.json(), { error: 'Password must be at least 8 characters' });

    // login wrong password
    const wrongPassword = await jsonRequest(port, '/api/customer/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'maria@example.com', password: 'wrong-password' })
    });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(await wrongPassword.json(), { error: 'Email or password is incorrect' });

    // login success
    const login = await jsonRequest(port, '/api/customer/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'maria@example.com', password: 'sikretong-malupit' })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.ok(loginBody.token);

    // me requires auth
    const unauthorizedMe = await jsonRequest(port, '/api/customer/me');
    assert.equal(unauthorizedMe.status, 401);

    const me = await jsonRequest(port, '/api/customer/me', { token: loginBody.token });
    assert.equal(me.status, 200);

    // save address
    const updateResponse = await jsonRequest(port, '/api/customer/me', {
      method: 'PUT',
      token: loginBody.token,
      body: JSON.stringify({ savedAddress: {
        houseAddress: '12 Test St',
        provinceCode: 'CAVITE', province: 'CAVITE',
        cityCode: 'CAVITE|IMUS', city: 'IMUS',
        barangayCode: 'CAVITE|IMUS|BUCANDALA IV', barangay: 'BUCANDALA IV',
        datasetVersion: '2026-06-05', postalCode: ''
      } })
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.customer.savedAddress.barangay, 'BUCANDALA IV');
    assert.equal(updated.customer.savedAddress.provinceCode, 'CAVITE');
    assert.equal(updated.customer.savedAddress.cityCode, 'CAVITE|IMUS');
    assert.equal(updated.customer.savedAddress.barangayCode, 'CAVITE|IMUS|BUCANDALA IV');

    // logged-in checkout stamps customerAccountId
    const memberOrder = await jsonRequest(port, '/api/orders', {
      method: 'POST',
      token: loginBody.token,
      body: JSON.stringify(checkoutPayload('09998887777'))
    });
    assert.equal(memberOrder.status, 201);

    // History contains only the explicitly account-stamped order.
    const ordersResponse = await jsonRequest(port, '/api/customer/orders', { token: loginBody.token });
    assert.equal(ordersResponse.status, 200);
    const { orders } = await ordersResponse.json();
    assert.equal(orders.length, 1);
    assert.ok(orders.every((order) => order.items.length === 1));
    assert.ok(orders.every((order) => order.totalCents === 64900 + 8000));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('CUSTOMER_ACCOUNTS_DATA_FILE', previousAccountsFile);
  }
});
