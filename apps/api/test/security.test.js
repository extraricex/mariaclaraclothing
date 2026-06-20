const test = require('node:test');
const assert = require('node:assert/strict');

// Isolate the catalog so any order-creation never mutates the committed fixture.
const nodeFs = require('node:fs');
const nodeOs = require('node:os');
const nodePath = require('node:path');
process.env.PRODUCTS_DATA_FILE = nodePath.join(
  nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'mc-sec-products-')),
  'products.json'
);
nodeFs.copyFileSync(
  nodePath.join(__dirname, '..', 'data', 'products.json'),
  process.env.PRODUCTS_DATA_FILE
);

const ADMIN_TOKEN = 'local-admin-token';

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/admin')];
  delete require.cache[require.resolve('../src/routes/orders')];
  delete require.cache[require.resolve('../src/middleware/rateLimit')];
  return require('../src/app').createApp();
}

async function withServer(run) {
  const app = createFreshApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;
  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('admin login is rate limited after too many attempts', async () => {
  const prevMax = process.env.ADMIN_LOGIN_RATE_LIMIT_MAX;
  const prevWindow = process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS;
  process.env.ADMIN_LOGIN_RATE_LIMIT_MAX = '2';
  process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    await withServer(async (port) => {
      function login() {
        return fetch(`http://127.0.0.1:${port}/api/admin/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'wrong-password' })
        });
      }

      assert.equal((await login()).status, 401);
      assert.equal((await login()).status, 401);

      const limited = await login();
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).error, 'Too many login attempts. Please try again later.');
      assert.ok(limited.headers.get('retry-after'), 'sets a Retry-After header');
    });
  } finally {
    restoreEnv('ADMIN_LOGIN_RATE_LIMIT_MAX', prevMax);
    restoreEnv('ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS', prevWindow);
  }
});

test('checkout is rate limited but order confirmation reads are not', async () => {
  const prevMax = process.env.CHECKOUT_RATE_LIMIT_MAX;
  const prevWindow = process.env.CHECKOUT_RATE_LIMIT_WINDOW_MS;
  process.env.CHECKOUT_RATE_LIMIT_MAX = '2';
  process.env.CHECKOUT_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    await withServer(async (port) => {
      function postOrder() {
        return fetch(`http://127.0.0.1:${port}/api/orders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        });
      }

      // The limiter runs before route validation, so invalid bodies still count.
      assert.notEqual((await postOrder()).status, 429);
      assert.notEqual((await postOrder()).status, 429);
      assert.equal((await postOrder()).status, 429);

      // GET confirmation must never be throttled by the checkout limiter.
      for (let i = 0; i < 5; i += 1) {
        const read = await fetch(`http://127.0.0.1:${port}/api/orders/DEMO-does-not-exist`);
        assert.notEqual(read.status, 429);
      }
    });
  } finally {
    restoreEnv('CHECKOUT_RATE_LIMIT_MAX', prevMax);
    restoreEnv('CHECKOUT_RATE_LIMIT_WINDOW_MS', prevWindow);
  }
});

test('a limit of 0 disables the limiter', async () => {
  const prevMax = process.env.ADMIN_LOGIN_RATE_LIMIT_MAX;
  process.env.ADMIN_LOGIN_RATE_LIMIT_MAX = '0';

  try {
    await withServer(async (port) => {
      for (let i = 0; i < 6; i += 1) {
        const res = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'wrong-password' })
        });
        assert.equal(res.status, 401, 'never throttled when disabled');
      }
    });
  } finally {
    restoreEnv('ADMIN_LOGIN_RATE_LIMIT_MAX', prevMax);
  }
});

test('admin auth accepts the valid token and rejects wrong-length tokens', async () => {
  const prevToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  try {
    await withServer(async (port) => {
      const ok = await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
      });
      assert.equal(ok.status, 200);

      // Same length, different value.
      const sameLength = `${'x'.repeat(ADMIN_TOKEN.length)}`;
      const wrongSame = await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
        headers: { authorization: `Bearer ${sameLength}` }
      });
      assert.equal(wrongSame.status, 401);

      // Different length must not throw — the constant-time compare guards length first.
      const wrongLen = await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
        headers: { authorization: 'Bearer short' }
      });
      assert.equal(wrongLen.status, 401);
    });
  } finally {
    restoreEnv('ADMIN_TOKEN', prevToken);
  }
});
