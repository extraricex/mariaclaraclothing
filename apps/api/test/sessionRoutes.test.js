const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function freshApp() {
  for (const modulePath of [
    '../src/app',
    '../src/routes/admin',
    '../src/routes/customer',
    '../src/settings/storeSettingsRepository',
    '../src/customers/customerAccountRepository',
    '../src/auth/sessionRepository'
  ]) delete require.cache[require.resolve(modulePath)];
  return require('../src/app').createApp();
}

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return values.map((value) => value.split(';')[0]).filter(Boolean).join('; ');
}

async function withServer(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-cookie-sessions-'));
  const previous = Object.fromEntries(['APP_ENV', 'STORE_SETTINGS_FILE', 'ADMIN_CREDENTIALS_FILE', 'CUSTOMER_ACCOUNTS_DATA_FILE']
    .map((name) => [name, process.env[name]]));
  process.env.APP_ENV = 'development';
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'settings.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'credentials.json');
  process.env.CUSTOMER_ACCOUNTS_DATA_FILE = path.join(tempDir, 'customers.json');
  const server = freshApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.entries(previous).forEach(([name, value]) => restoreEnv(name, value));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('admin cookie session authenticates reads, requires CSRF for writes, and logs out', async () => {
  await withServer(async (port) => {
    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    const cookie = cookieHeader(login);
    assert.match(login.headers.get('set-cookie') || '', /HttpOnly/i);
    assert.match(login.headers.get('set-cookie') || '', /SameSite=Lax/i);
    assert.ok(loginBody.csrfToken);
    assert.match(cookie, /mc_admin_session=/);

    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
      headers: { cookie }
    })).status, 200);

    const blocked = await fetch(`http://127.0.0.1:${port}/api/admin/collections`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cookie Collection' })
    });
    assert.equal(blocked.status, 403);
    assert.match((await blocked.json()).error, /CSRF/i);

    const allowed = await fetch(`http://127.0.0.1:${port}/api/admin/collections`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': loginBody.csrfToken },
      body: JSON.stringify({ name: 'Cookie Collection' })
    });
    assert.equal(allowed.status, 201);

    const logout = await fetch(`http://127.0.0.1:${port}/api/admin/logout`, {
      method: 'POST', headers: { cookie, 'x-csrf-token': loginBody.csrfToken }
    });
    assert.equal(logout.status, 204);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/session`, { headers: { cookie } })).status, 401);
  });
});

test('customer cookie session protects profile mutations and logs out', async () => {
  await withServer(async (port) => {
    const registration = await fetch(`http://127.0.0.1:${port}/api/customer/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Cookie Customer', email: 'cookie@example.com', phone: '09171234567', password: 'strong-password'
      })
    });
    assert.equal(registration.status, 201);
    const body = await registration.json();
    const cookie = cookieHeader(registration);
    assert.ok(body.csrfToken);
    assert.match(cookie, /mc_customer_session=/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/customer/me`, { headers: { cookie } })).status, 200);

    assert.equal((await fetch(`http://127.0.0.1:${port}/api/customer/me`, {
      method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ fullName: 'Blocked' })
    })).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/customer/me`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': body.csrfToken },
      body: JSON.stringify({ fullName: 'Updated Customer' })
    })).status, 200);

    assert.equal((await fetch(`http://127.0.0.1:${port}/api/customer/logout`, {
      method: 'POST', headers: { cookie, 'x-csrf-token': body.csrfToken }
    })).status, 204);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/customer/me`, { headers: { cookie } })).status, 401);
  });
});

test('production mode rejects legacy admin bearer authentication', async () => {
  await withServer(async (port) => {
    process.env.APP_ENV = 'production';
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
      headers: { authorization: 'Bearer local-admin-token' }
    });
    assert.equal(response.status, 401);
  });
});

test('changing admin credentials revokes old sessions and issues a replacement session', async () => {
  await withServer(async (port) => {
    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    const loginBody = await login.json();
    const oldCookie = cookieHeader(login);

    const changed = await fetch(`http://127.0.0.1:${port}/api/admin/settings/security/password`, {
      method: 'POST',
      headers: {
        cookie: oldCookie,
        'content-type': 'application/json',
        'x-csrf-token': loginBody.csrfToken
      },
      body: JSON.stringify({ currentPassword: 'admin', newPassword: 'replacement-password' })
    });
    assert.equal(changed.status, 200);
    const changedBody = await changed.json();
    const replacementCookie = cookieHeader(changed);
    assert.ok(changedBody.csrfToken);
    assert.match(replacementCookie, /mc_admin_session=/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
      headers: { cookie: oldCookie }
    })).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
      headers: { cookie: replacementCookie }
    })).status, 200);
  });
});
