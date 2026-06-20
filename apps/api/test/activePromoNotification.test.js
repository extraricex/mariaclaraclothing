const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/discounts')];
  delete require.cache[require.resolve('../src/discounts/discountRepository')];
  return require('../src/app').createApp();
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function seedDiscounts(discounts) {
  await fs.writeFile(process.env.DISCOUNTS_DATA_FILE, `${JSON.stringify({ discounts }, null, 2)}\n`);
}

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'GET'
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: text ? JSON.parse(text) : {}
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function promo(overrides = {}) {
  return {
    code: 'BMSM2026',
    name: 'Buy More Save More',
    method: 'automatic',
    type: 'buy_more_save_more',
    value: 0,
    status: 'active',
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    minimumQuantity: 2,
    minimumSubtotalCents: null,
    bannerText: 'Buy 2 and get more savings today',
    terms: '',
    rules: [
      {
        minimumQuantity: 2,
        discountType: 'percentage',
        discountValue: 10,
        discountValueCents: 0,
        freeShipping: true
      }
    ],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

test('active promo notification returns only current active promos', async () => {
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-notification-'));
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    await seedDiscounts([promo()]);
    const activeResponse = await getJson(port, '/api/discounts/active-notification');
    assert.equal(activeResponse.status, 200);
    assert.deepEqual(activeResponse.body, {
      notification: {
        promoId: 'BMSM2026',
        text: 'Buy 2 and get more savings today',
        name: 'Buy More Save More',
        type: 'buy_more_save_more',
        method: 'automatic'
      }
    });

    await seedDiscounts([promo({ status: 'disabled' })]);
    const disabledResponse = await getJson(port, '/api/discounts/active-notification');
    assert.equal(disabledResponse.status, 200);
    assert.deepEqual(disabledResponse.body, { notification: null });

    await seedDiscounts([promo({ startsAt: '2999-01-01T00:00:00.000Z' })]);
    const futureResponse = await getJson(port, '/api/discounts/active-notification');
    assert.equal(futureResponse.status, 200);
    assert.deepEqual(futureResponse.body, { notification: null });

    await seedDiscounts([promo({ endsAt: '2000-01-01T00:00:00.000Z' })]);
    const expiredResponse = await getJson(port, '/api/discounts/active-notification');
    assert.equal(expiredResponse.status, 200);
    assert.deepEqual(expiredResponse.body, { notification: null });
  } finally {
    await closeServer(server);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
  }
});

test('active promo notification falls back when banner text is blank', async () => {
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-notification-'));
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    await seedDiscounts([promo({ bannerText: '' })]);
    const response = await getJson(port, '/api/discounts/active-notification');
    assert.equal(response.status, 200);
    assert.equal(response.body.notification.text, 'Buy More Save More Promo');
  } finally {
    await closeServer(server);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
  }
});

test('active promo notification chooses the highest priority eligible promo', async () => {
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-notification-priority-'));
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    await seedDiscounts([
      promo({
        code: 'LOWPROMO',
        name: 'Low Priority Promo',
        bannerText: 'Low priority banner',
        priority: 1
      }),
      promo({
        code: 'HIGHPROMO',
        name: 'High Priority Promo',
        bannerText: 'High priority banner',
        priority: 10
      }),
      promo({
        code: 'DISABLEDHIGH',
        name: 'Disabled High Priority Promo',
        bannerText: 'Disabled high banner',
        priority: 99,
        status: 'disabled'
      })
    ]);

    const response = await getJson(port, '/api/discounts/active-notification');

    assert.equal(response.status, 200);
    assert.equal(response.body.notification.promoId, 'HIGHPROMO');
    assert.equal(response.body.notification.text, 'High priority banner');
  } finally {
    await closeServer(server);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
  }
});
