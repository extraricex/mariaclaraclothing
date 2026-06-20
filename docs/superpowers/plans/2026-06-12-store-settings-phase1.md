# Store Settings Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/settings` a real settings editor (general store info, shipping fees/rules, payment methods, admin password/token) whose saved values drive the React storefront checkout and footer.

**Architecture:** New `storeSettingsRepository` following the repo's dual JSON/Postgres pattern (one `store_settings` key/value JSONB table; `data/store-settings.json` + gitignored `data/admin-credentials.json` in JSON mode). Admin routes read/write settings sections; a public `/api/storefront-settings` endpoint exposes the storefront-safe subset consumed by checkout and the footer. Admin auth resolves stored credentials first, env defaults second, so all existing tests and dev flows keep working.

**Tech Stack:** Express, node:test, React 18, dual JSON/PostgreSQL persistence, scrypt password hashing (same scheme as `customerAccountRepository`).

**Spec:** `docs/superpowers/specs/2026-06-12-store-settings-phase1-design.md`

**Conflict guard:** Another developer's unmerged branch (`codex-edits`) edits `apps/api/src/routes/admin.js` (orders area, lines ~400+), `apps/api/src/routes/orders.js`, `apps/web/src/pages/Checkout.jsx`, `apps/api/db/schema.sql`, `apps/api/src/app.js`, `AdminLayout.jsx`, and `apps/api/test/adminOrders.test.js`. This plan only adds new files plus additive hunks in `admin.js` (site-content area, ~line 180), `app.js` (one mount line), `schema.sql` (new table at end), `orders.js` (one validation block), and `Checkout.jsx`. Do NOT touch `AdminLayout.jsx` or `adminOrders.test.js`.

---

### Task 1: Worktree setup

**Files:** none (environment only)

- [ ] **Step 1: Create the worktree and branch** (per `superpowers:using-git-worktrees`)

```bash
cd /Users/ronmrls/Desktop/Desktop/wood-panel/maria-clara/mariaclaraclothing
git worktree add ../mariaclaraclothing-settings-phase1 -b settings-phase1
cd ../mariaclaraclothing-settings-phase1
npm install
```

- [ ] **Step 2: Verify the baseline is green**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all tests pass (run from the worktree root; empty env vars neutralize any local `.env`).

---

### Task 2: Store settings repository + schema + gitignore

**Files:**
- Create: `apps/api/src/settings/storeSettingsRepository.js`
- Modify: `apps/api/db/schema.sql` (append)
- Modify: `.gitignore` (append)
- Test: `apps/api/test/storeSettingsRepository.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/storeSettingsRepository.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function freshRepository() {
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  return require('../src/settings/storeSettingsRepository');
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test('store settings expose defaults, save sections, and validate input', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-settings-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();

    const defaults = repository.getStoreSettings();
    assert.equal(defaults.general.storeName, 'Maria Clara Clothing');
    assert.equal(defaults.shipping.regions.length, 3);
    assert.equal(defaults.shipping.regions.find((region) => region.id === 'metro_manila_cavite').feeCents, 8000);
    assert.equal(defaults.shipping.freeShippingMinimumItems, 2);
    assert.equal(defaults.payments.methods.find((method) => method.id === 'cash_on_delivery').enabled, true);
    assert.equal(defaults.payments.methods.find((method) => method.id === 'gcash').enabled, false);

    const updated = repository.updateSettingsSection('shipping', {
      regions: [{ id: 'luzon', feeCents: 15000 }],
      freeShippingEnabled: false,
      freeShippingMinimumItems: 3
    });
    assert.equal(updated.shipping.regions.find((region) => region.id === 'luzon').feeCents, 15000);
    assert.equal(updated.shipping.regions.find((region) => region.id === 'metro_manila_cavite').feeCents, 8000);
    assert.equal(updated.shipping.freeShippingEnabled, false);

    const reread = repository.getStoreSettings();
    assert.equal(reread.shipping.freeShippingMinimumItems, 3);

    assert.equal(repository.updateSettingsSection('payments', {
      methods: [{ id: 'gcash', enabled: true, instructions: 'Send to 0917 000 0000.' }]
    }).payments.methods.find((method) => method.id === 'gcash').instructions, 'Send to 0917 000 0000.');
    assert.deepEqual(await repository.listEnabledPaymentMethodIds(), ['cash_on_delivery', 'gcash']);

    assert.throws(() => repository.updateSettingsSection('shipping', { regions: [{ id: 'luzon', feeCents: -1 }] }),
      /must be a non-negative integer/);
    assert.throws(() => repository.updateSettingsSection('shipping', { freeShippingMinimumItems: 0 }),
      /Free shipping minimum items must be an integer of at least 1\./);
    assert.throws(() => repository.updateSettingsSection('payments', { methods: [{ id: 'cash_on_delivery', enabled: false }] }),
      /Cash on Delivery cannot be disabled\./);
    assert.throws(() => repository.updateSettingsSection('payments', { methods: [{ id: 'paypal', enabled: true }] }),
      /Payment method is invalid\./);
    assert.throws(() => repository.updateSettingsSection('general', { contactEmail: 'not-an-email' }),
      /Contact email is invalid\./);
    assert.throws(() => repository.updateSettingsSection('nope', {}),
      /Settings section is invalid\./);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('admin credentials hash passwords and rotate tokens', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-credentials-'));
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');

  try {
    const repository = freshRepository();

    assert.equal(repository.getAdminCredentials(), null);

    const record = repository.setAdminPassword('my-new-password');
    assert.ok(record.token);
    assert.ok(record.passwordHash);
    assert.notEqual(record.passwordHash, 'my-new-password');

    const stored = repository.getAdminCredentials();
    assert.equal(repository.verifyAdminPassword('my-new-password', stored), true);
    assert.equal(repository.verifyAdminPassword('wrong-password', stored), false);

    const rotated = repository.rotateAdminToken();
    assert.notEqual(rotated.token, record.token);
    assert.equal(repository.verifyAdminPassword('my-new-password', repository.getAdminCredentials()), true);
  } finally {
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/storeSettingsRepository.test.js`
Expected: FAIL with `Cannot find module '../src/settings/storeSettingsRepository'`

- [ ] **Step 3: Write the repository**

Create `apps/api/src/settings/storeSettingsRepository.js`:

```js
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const DEFAULT_SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'store-settings.json');
const DEFAULT_CREDENTIALS_FILE = path.join(__dirname, '..', '..', 'data', 'admin-credentials.json');
const SETTINGS_KEY = 'storeSettings';
const CREDENTIALS_KEY = 'adminCredentials';
const SETTINGS_SECTIONS = ['general', 'shipping', 'payments'];
const SHIPPING_REGION_IDS = ['metro_manila_cavite', 'luzon', 'visayas_mindanao'];
const PAYMENT_METHOD_IDS = ['cash_on_delivery', 'gcash', 'bank_transfer'];

let postgresCredentialsCache = { loaded: false, value: null };

function settingsDataFile() {
  return process.env.STORE_SETTINGS_FILE || DEFAULT_SETTINGS_FILE;
}

function credentialsDataFile() {
  return process.env.ADMIN_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE;
}

function usePostgresSettings() {
  return hasDatabaseUrl() && !process.env.STORE_SETTINGS_FILE;
}

function usePostgresCredentials() {
  return hasDatabaseUrl() && !process.env.ADMIN_CREDENTIALS_FILE;
}

function isPromise(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function defaultStoreSettings() {
  return {
    general: {
      storeName: 'Maria Clara Clothing',
      contactEmail: '',
      contactNumber: '',
      storeAddress: '',
      socialLinks: { facebook: '', instagram: '', tiktok: '' }
    },
    shipping: {
      regions: [
        { id: 'metro_manila_cavite', label: 'Metro Manila & Cavite', feeCents: 8000, deliveryEstimate: 'Estimated delivery: Metro Manila and Cavite 2-4 days.' },
        { id: 'luzon', label: 'Luzon', feeCents: 12000, deliveryEstimate: 'Estimated delivery: Luzon provinces 3-6 days.' },
        { id: 'visayas_mindanao', label: 'Visayas & Mindanao', feeCents: 18000, deliveryEstimate: 'Estimated delivery: Visayas and Mindanao 5-8 days.' }
      ],
      freeShippingEnabled: true,
      freeShippingMinimumItems: 2
    },
    payments: {
      methods: [
        { id: 'cash_on_delivery', label: 'Cash on Delivery', enabled: true, instructions: '' },
        { id: 'gcash', label: 'GCash', enabled: false, instructions: '' },
        { id: 'bank_transfer', label: 'Bank Transfer', enabled: false, instructions: '' }
      ]
    }
  };
}

function normalizeGeneral(general) {
  const value = general && typeof general === 'object' ? general : {};
  const socialLinks = value.socialLinks && typeof value.socialLinks === 'object' ? value.socialLinks : {};
  const contactEmail = String(value.contactEmail || '').trim();
  if (contactEmail && !contactEmail.includes('@')) {
    throw badRequest('Contact email is invalid.');
  }
  return {
    storeName: String(value.storeName || '').trim() || 'Maria Clara Clothing',
    contactEmail,
    contactNumber: String(value.contactNumber || '').trim(),
    storeAddress: String(value.storeAddress || '').trim(),
    socialLinks: {
      facebook: String(socialLinks.facebook || '').trim(),
      instagram: String(socialLinks.instagram || '').trim(),
      tiktok: String(socialLinks.tiktok || '').trim()
    }
  };
}

function normalizeShipping(shipping) {
  const value = shipping && typeof shipping === 'object' ? shipping : {};
  const defaults = defaultStoreSettings().shipping;
  const incoming = Array.isArray(value.regions) ? value.regions : [];

  const unknownRegion = incoming.find((region) => region && !SHIPPING_REGION_IDS.includes(region.id));
  if (unknownRegion) {
    throw badRequest('Shipping region is invalid.');
  }

  const regions = defaults.regions.map((fallback) => {
    const match = incoming.find((region) => region && region.id === fallback.id) || {};
    const feeCents = match.feeCents === undefined ? fallback.feeCents : Number(match.feeCents);
    if (!Number.isInteger(feeCents) || feeCents < 0) {
      throw badRequest(`Shipping fee for ${fallback.label} must be a non-negative integer of centavos.`);
    }
    return {
      id: fallback.id,
      label: String(match.label || fallback.label).trim() || fallback.label,
      feeCents,
      deliveryEstimate: String(match.deliveryEstimate || fallback.deliveryEstimate).trim() || fallback.deliveryEstimate
    };
  });

  const freeShippingMinimumItems = value.freeShippingMinimumItems === undefined
    ? defaults.freeShippingMinimumItems
    : Number(value.freeShippingMinimumItems);
  if (!Number.isInteger(freeShippingMinimumItems) || freeShippingMinimumItems < 1) {
    throw badRequest('Free shipping minimum items must be an integer of at least 1.');
  }

  return {
    regions,
    freeShippingEnabled: value.freeShippingEnabled === undefined
      ? defaults.freeShippingEnabled
      : Boolean(value.freeShippingEnabled),
    freeShippingMinimumItems
  };
}

function normalizePayments(payments) {
  const value = payments && typeof payments === 'object' ? payments : {};
  const defaults = defaultStoreSettings().payments;
  const incoming = Array.isArray(value.methods) ? value.methods : [];

  const unknownMethod = incoming.find((method) => method && !PAYMENT_METHOD_IDS.includes(method.id));
  if (unknownMethod) {
    throw badRequest('Payment method is invalid.');
  }

  const methods = defaults.methods.map((fallback) => {
    const match = incoming.find((method) => method && method.id === fallback.id) || {};
    const enabled = match.enabled === undefined ? fallback.enabled : Boolean(match.enabled);
    if (fallback.id === 'cash_on_delivery' && !enabled) {
      throw badRequest('Cash on Delivery cannot be disabled.');
    }
    return {
      id: fallback.id,
      label: String(match.label || fallback.label).trim() || fallback.label,
      enabled,
      instructions: String(match.instructions || '').trim()
    };
  });

  return { methods };
}

function normalizeStoreSettings(settings) {
  const value = settings && typeof settings === 'object' ? settings : {};
  return {
    general: normalizeGeneral(value.general),
    shipping: normalizeShipping(value.shipping),
    payments: normalizePayments(value.payments)
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readPostgresValue(key) {
  const result = await query('SELECT value FROM store_settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function writePostgresValue(key, value) {
  await query(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

function getStoreSettings() {
  if (usePostgresSettings()) {
    return readPostgresValue(SETTINGS_KEY).then((stored) => normalizeStoreSettings(stored || {}));
  }
  return normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
}

function updateSettingsSection(section, value) {
  if (!SETTINGS_SECTIONS.includes(section)) {
    throw badRequest('Settings section is invalid.');
  }
  const normalizers = { general: normalizeGeneral, shipping: normalizeShipping, payments: normalizePayments };
  const normalized = normalizers[section](value);

  if (usePostgresSettings()) {
    return readPostgresValue(SETTINGS_KEY).then(async (stored) => {
      const next = { ...normalizeStoreSettings(stored || {}), [section]: normalized };
      await writePostgresValue(SETTINGS_KEY, next);
      return next;
    });
  }

  const next = { ...normalizeStoreSettings(readJsonFile(settingsDataFile()) || {}), [section]: normalized };
  writeJsonFile(settingsDataFile(), next);
  return next;
}

function listEnabledPaymentMethodIds() {
  const settings = getStoreSettings();
  if (isPromise(settings)) {
    return settings.then((value) => value.payments.methods.filter((method) => method.enabled).map((method) => method.id));
  }
  return settings.payments.methods.filter((method) => method.enabled).map((method) => method.id);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { passwordHash: hash, passwordSalt: salt };
}

function verifyAdminPassword(password, credentials) {
  if (!credentials?.passwordHash || !credentials?.passwordSalt) return false;
  const { passwordHash } = hashPassword(password, credentials.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(credentials.passwordHash, 'hex'));
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getAdminCredentials() {
  if (usePostgresCredentials()) {
    if (postgresCredentialsCache.loaded) return Promise.resolve(postgresCredentialsCache.value);
    return readPostgresValue(CREDENTIALS_KEY).then((value) => {
      postgresCredentialsCache = { loaded: true, value };
      return value;
    });
  }
  return readJsonFile(credentialsDataFile());
}

function saveCredentials(record) {
  if (usePostgresCredentials()) {
    return writePostgresValue(CREDENTIALS_KEY, record).then(() => {
      postgresCredentialsCache = { loaded: true, value: record };
      return record;
    });
  }
  writeJsonFile(credentialsDataFile(), record);
  return record;
}

function setAdminPassword(newPassword) {
  const record = {
    ...hashPassword(newPassword),
    token: newToken(),
    updatedAt: new Date().toISOString()
  };
  return saveCredentials(record);
}

function rotateAdminToken() {
  const current = getAdminCredentials();
  const build = (existing) => ({
    ...(existing || {}),
    token: newToken(),
    updatedAt: new Date().toISOString()
  });
  if (isPromise(current)) {
    return current.then((existing) => saveCredentials(build(existing)));
  }
  return saveCredentials(build(current));
}

function resetStoreSettingsForTests() {
  postgresCredentialsCache = { loaded: false, value: null };
}

module.exports = {
  defaultStoreSettings,
  getAdminCredentials,
  getStoreSettings,
  listEnabledPaymentMethodIds,
  resetStoreSettingsForTests,
  rotateAdminToken,
  setAdminPassword,
  updateSettingsSection,
  verifyAdminPassword
};
```

- [ ] **Step 4: Append the table to `apps/api/db/schema.sql`** (at the end of the file)

```sql

CREATE TABLE IF NOT EXISTS store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 5: Gitignore the credentials file** — append to the root `.gitignore` under the "Environment and secrets" block:

```
apps/api/data/admin-credentials.json
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `DATABASE_URL= node --test apps/api/test/storeSettingsRepository.test.js`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/settings/storeSettingsRepository.js apps/api/db/schema.sql .gitignore apps/api/test/storeSettingsRepository.test.js
git commit -m "Add store settings repository with dual persistence"
```

---

### Task 3: Admin settings routes (GET + section PUT)

**Files:**
- Modify: `apps/api/src/routes/admin.js` (imports at top; routes right after the `POST /site-content/logo/image` route, ~line 180)
- Test: `apps/api/test/adminSettings.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/adminSettings.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

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
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  try {
    delete require.cache[require.resolve('../src/routes/storeSettings')];
  } catch (_error) {
    // route file does not exist until Task 5
  }
  return require('../src/app').createApp();
}

function adminRequest(method = 'GET', body, token = ADMIN_TOKEN) {
  return {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
}

async function withSettingsServer(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-settings-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  const previousAdminToken = process.env.ADMIN_TOKEN;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;

  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  delete process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_PASSWORD;

  const app = createFreshApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;

  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    restoreEnv('ADMIN_PASSWORD', previousAdminPassword);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('admin settings require authentication', async () => {
  await withSettingsServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/settings`);
    assert.equal(response.status, 401);
  });
});

test('admin settings expose defaults and save sections', async () => {
  await withSettingsServer(async (port) => {
    const defaultsResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest());
    assert.equal(defaultsResponse.status, 200);
    const defaults = await defaultsResponse.json();
    assert.equal(defaults.settings.general.storeName, 'Maria Clara Clothing');
    assert.equal(defaults.settings.shipping.regions.length, 3);
    assert.equal(defaults.settings.payments.methods.length, 3);
    assert.equal(JSON.stringify(defaults).includes('passwordHash'), false);

    const shippingResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/shipping`,
      adminRequest('PUT', {
        regions: [{ id: 'metro_manila_cavite', feeCents: 9900 }],
        freeShippingEnabled: true,
        freeShippingMinimumItems: 4
      })
    );
    assert.equal(shippingResponse.status, 200);
    const shipping = await shippingResponse.json();
    assert.equal(shipping.settings.shipping.regions.find((region) => region.id === 'metro_manila_cavite').feeCents, 9900);
    assert.equal(shipping.settings.shipping.freeShippingMinimumItems, 4);

    const generalResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/general`,
      adminRequest('PUT', { storeName: 'Maria Clara MNL', contactEmail: 'hello@mariaclara.ph' })
    );
    assert.equal(generalResponse.status, 200);
    assert.equal((await generalResponse.json()).settings.general.storeName, 'Maria Clara MNL');

    const badFee = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/shipping`,
      adminRequest('PUT', { regions: [{ id: 'luzon', feeCents: -5 }] })
    );
    assert.equal(badFee.status, 400);

    const badSection = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/everything`,
      adminRequest('PUT', {})
    );
    assert.equal(badSection.status, 400);
    assert.equal((await badSection.json()).error, 'Settings section is invalid.');

    const codOff = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/payments`,
      adminRequest('PUT', { methods: [{ id: 'cash_on_delivery', enabled: false }] })
    );
    assert.equal(codOff.status, 400);
    assert.equal((await codOff.json()).error, 'Cash on Delivery cannot be disabled.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: FAIL — `GET /api/admin/settings` returns 404 (route missing), so status assertions fail.

- [ ] **Step 3: Add the routes**

In `apps/api/src/routes/admin.js`, add to the require block at the top of the file:

```js
const {
  getAdminCredentials,
  getStoreSettings,
  rotateAdminToken,
  setAdminPassword,
  updateSettingsSection,
  verifyAdminPassword
} = require('../settings/storeSettingsRepository');
```

Then, directly after the `POST /site-content/logo/image` route handler (~line 180) and before `POST /products/import`, add:

```js
router.get('/settings', async (_req, res, next) => {
  try {
    return res.json({ settings: await getStoreSettings() });
  } catch (error) {
    return next(error);
  }
});

router.put('/settings/:section', async (req, res, next) => {
  try {
    const settings = await updateSettingsSection(req.params.section, req.body || {});
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});
```

(`getAdminCredentials`, `verifyAdminPassword`, `setAdminPassword`, and `rotateAdminToken` are imported now but first used in Task 4.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.js apps/api/test/adminSettings.test.js
git commit -m "Add admin store settings endpoints"
```

---

### Task 4: Admin password change and token rotation

**Files:**
- Modify: `apps/api/src/routes/admin.js` (login route ~line 108, `requireAdmin` ~line 480, new security routes after the settings routes from Task 3)
- Test: `apps/api/test/adminSettings.test.js` (append)

- [ ] **Step 1: Write the failing tests** — append to `apps/api/test/adminSettings.test.js`:

```js
test('admin can change the password and the token rotates', async () => {
  await withSettingsServer(async (port) => {
    const wrongCurrent = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'nope', newPassword: 'brand-new-password' })
    );
    assert.equal(wrongCurrent.status, 401);
    assert.equal((await wrongCurrent.json()).error, 'Current password is invalid');

    const tooShort = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'short' })
    );
    assert.equal(tooShort.status, 400);
    assert.equal((await tooShort.json()).error, 'Password must be at least 8 characters.');

    const changed = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'brand-new-password' })
    );
    assert.equal(changed.status, 200);
    const { token: newToken } = await changed.json();
    assert.ok(newToken);
    assert.notEqual(newToken, ADMIN_TOKEN);

    // the default token no longer authenticates
    const oldTokenResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest());
    assert.equal(oldTokenResponse.status, 401);

    // the new token works
    const newTokenResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest('GET', undefined, newToken));
    assert.equal(newTokenResponse.status, 200);

    // the old password no longer logs in; the new one returns the new token
    const oldLogin = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'brand-new-password' })
    });
    assert.equal(newLogin.status, 200);
    assert.equal((await newLogin.json()).token, newToken);
  });
});

test('admin can rotate the token without changing the password', async () => {
  await withSettingsServer(async (port) => {
    const rotated = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/rotate-token`,
      adminRequest('POST', {})
    );
    assert.equal(rotated.status, 200);
    const { token } = await rotated.json();
    assert.ok(token);
    assert.notEqual(token, ADMIN_TOKEN);

    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest())).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest('GET', undefined, token))).status, 200);

    // env password still logs in (no password change happened) and returns the rotated token
    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).token, token);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: the two new tests FAIL (404 on the security routes).

- [ ] **Step 3: Implement auth resolution + security routes**

In `apps/api/src/routes/admin.js`:

**3a.** Replace the login route (~line 108) with:

```js
router.post('/login', async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    const credentials = await getAdminCredentials();
    const valid = credentials?.passwordHash
      ? Boolean(password) && verifyAdminPassword(password, credentials)
      : Boolean(password) && password === adminPassword();

    if (!valid) {
      return res.status(401).json({ error: 'Admin password is invalid' });
    }

    return res.json({ token: credentials?.token || adminToken() });
  } catch (error) {
    return next(error);
  }
});
```

**3b.** Replace `requireAdmin` (~line 480) with:

```js
async function requireAdmin(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const credentials = await getAdminCredentials();
    const activeToken = credentials?.token || adminToken();

    if (!token || token !== activeToken) {
      return res.status(401).json({ error: 'Admin authentication is required' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
```

**3c.** Add the security routes between `GET /settings` and `PUT /settings/:section` from Task 3 (they are `POST`s on literal paths, so there is no routing conflict with the `PUT` param route — this placement just keeps literal paths above param paths, matching the file's convention):

```js
router.post('/settings/security/password', async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const credentials = await getAdminCredentials();
    const currentValid = credentials?.passwordHash
      ? Boolean(currentPassword) && verifyAdminPassword(currentPassword, credentials)
      : Boolean(currentPassword) && currentPassword === adminPassword();

    if (!currentValid) {
      return res.status(401).json({ error: 'Current password is invalid' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const record = await setAdminPassword(newPassword);
    return res.json({ token: record.token });
  } catch (error) {
    return next(error);
  }
});

router.post('/settings/security/rotate-token', async (req, res, next) => {
  try {
    const record = await rotateAdminToken();
    return res.json({ token: record.token });
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 4: Run the settings tests, then the full API suite** (auth touched — everything must stay green)

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: PASS (4 tests)

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.js apps/api/test/adminSettings.test.js
git commit -m "Add admin password change and token rotation"
```

---

### Task 5: Public storefront-settings endpoint

**Files:**
- Create: `apps/api/src/routes/storeSettings.js`
- Modify: `apps/api/src/app.js` (one import + one mount line)
- Test: `apps/api/test/adminSettings.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `apps/api/test/adminSettings.test.js`:

```js
test('public storefront settings expose only the safe subset', async () => {
  await withSettingsServer(async (port) => {
    await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/payments`,
      adminRequest('PUT', { methods: [{ id: 'gcash', enabled: true, instructions: 'Send to 0917 000 0000.' }] })
    );
    await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'brand-new-password' })
    );

    const response = await fetch(`http://127.0.0.1:${port}/api/storefront-settings`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const body = await response.json();
    assert.equal(body.settings.storeName, 'Maria Clara Clothing');
    assert.equal(body.settings.shipping.regions.length, 3);
    assert.deepEqual(
      body.settings.paymentMethods.map((method) => method.id),
      ['cash_on_delivery', 'gcash']
    );
    assert.equal(body.settings.paymentMethods.find((method) => method.id === 'gcash').instructions, 'Send to 0917 000 0000.');

    const raw = JSON.stringify(body);
    assert.equal(raw.includes('bank_transfer'), false);
    assert.equal(raw.includes('passwordHash'), false);
    assert.equal(raw.includes('"token"'), false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: the new test FAILS with status 404 on `/api/storefront-settings`.

- [ ] **Step 3: Create the route**

Create `apps/api/src/routes/storeSettings.js`:

```js
const express = require('express');
const { getStoreSettings } = require('../settings/storeSettingsRepository');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (_req, res, next) => {
  try {
    const settings = await getStoreSettings();
    return res.json({
      settings: {
        storeName: settings.general.storeName,
        contactEmail: settings.general.contactEmail,
        contactNumber: settings.general.contactNumber,
        storeAddress: settings.general.storeAddress,
        socialLinks: settings.general.socialLinks,
        shipping: settings.shipping,
        paymentMethods: settings.payments.methods
          .filter((method) => method.enabled)
          .map(({ id, label, instructions }) => ({ id, label, instructions }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = { storeSettingsRouter: router };
```

**3b.** In `apps/api/src/app.js`, add to the imports:

```js
const { storeSettingsRouter } = require('./routes/storeSettings');
```

and add the mount after `app.use('/api/customer', customerRouter);`:

```js
app.use('/api/storefront-settings', storeSettingsRouter);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/storeSettings.js apps/api/src/app.js apps/api/test/adminSettings.test.js
git commit -m "Add public storefront settings endpoint"
```

---

### Task 6: Checkout payment-method validation

**Files:**
- Modify: `apps/api/src/routes/orders.js` (one import + one validation block in `normalizeCheckout`)
- Test: `apps/api/test/checkoutPaymentMethods.test.js` (new — do NOT add to `adminOrders.test.js`, the other developer owns that file)

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/checkoutPaymentMethods.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { writeJntExportBuffer } = require('../src/jnt/jntExport');

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
  delete require.cache[require.resolve('../src/routes/storeSettings')];
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  return require('../src/app').createApp();
}

async function findInStockItem(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/products`);
  const { products } = await response.json();
  for (const product of products) {
    const variant = (product.variants || []).find((candidate) => Number(candidate.stockQuantity) > 0);
    if (variant) {
      return {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        size: variant.size,
        quantity: 1,
        unitPriceCents: variant.priceCents ?? product.priceCents
      };
    }
  }
  throw new Error('No in-stock product found in the catalog fixture.');
}

function checkoutPayload(item, paymentMethod) {
  return {
    customer: { fullName: 'Juan Dela Cruz', phone: '09171234567', email: '' },
    address: {
      addressLine: '12 Sampaguita St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Sampaguita St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    items: [item],
    shippingFeeCents: 8000,
    paymentMethod
  };
}

test('checkout rejects disabled payment methods and accepts enabled ones', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-checkout-payments-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousAdminToken = process.env.ADMIN_TOKEN;

  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  const app = createFreshApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;

  try {
    const item = await findInStockItem(port);

    const rejected = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutPayload(item, 'gcash'))
    });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, 'Payment method is not available.');

    const enableResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings/payments`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ methods: [{ id: 'gcash', enabled: true, instructions: 'Send to 0917 000 0000.' }] })
    });
    assert.equal(enableResponse.status, 200);

    const accepted = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutPayload(item, 'gcash'))
    });
    assert.equal(accepted.status, 201);
    const { orderNumber } = await accepted.json();

    const orderResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${orderNumber}`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    const { order } = await orderResponse.json();
    assert.equal(order.paymentMethod, 'gcash');

    // COD stays accepted by default
    const codOrder = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutPayload(item, 'cash_on_delivery'))
    });
    assert.equal(codOrder.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('J&T export writes a zero COD amount for prepaid orders', () => {
  const order = {
    orderNumber: 'DEMO-1765000000000-ab12',
    customer: { fullName: 'Juan Dela Cruz', phone: '09171234567', email: '' },
    address: {
      addressLine: '12 Sampaguita St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Sampaguita St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    items: [{ productName: 'KAMALAYAN BLOOM BLACK', size: 'Medium', quantity: 1, unitPriceCents: 74900 }],
    totalCents: 74900,
    paymentMethod: 'gcash',
    notes: ''
  };

  const buffer = writeJntExportBuffer([order]);
  const sheet = XLSX.read(buffer, { type: 'buffer' }).Sheets.List;
  // columns A–M; data starts at row 9: K = parcel value, L = COD amount
  assert.equal(Number(sheet.K9?.v), 749);
  assert.equal(String(sheet.L9?.v), '0');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/checkoutPaymentMethods.test.js`
Expected: the checkout test FAILS — the `gcash` order is accepted (201) instead of rejected (400). The J&T prepaid test should already PASS (the export code on `main` already writes `isCod ? total : '0'`); it locks the behavior in. If it fails instead, inspect the actual cell values before changing the assertion — the parcel-value cell may be a string.

- [ ] **Step 3: Add the validation**

In `apps/api/src/routes/orders.js`, add to the require block at the top:

```js
const { listEnabledPaymentMethodIds } = require('../settings/storeSettingsRepository');
```

In `normalizeCheckout`, directly after the existing line
`const paymentMethod = body.paymentMethod ? String(body.paymentMethod).trim() : 'cash_on_delivery';`, add:

```js
  const enabledPaymentMethods = await listEnabledPaymentMethodIds();
  if (!enabledPaymentMethods.includes(paymentMethod)) {
    const error = new Error('Payment method is not available.');
    error.status = 400;
    throw error;
  }
```

(`normalizeCheckout` is already `async`; the J&T export already writes the COD-amount column as `'0'` for non-COD orders via `isCod ? total : '0'` in `apps/api/src/jnt/jntExport.js` — no export change needed.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL= node --test apps/api/test/checkoutPaymentMethods.test.js`
Expected: PASS.

Also run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all green (existing checkout tests send no `paymentMethod` or COD, which stays enabled by default).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/orders.js apps/api/test/checkoutPaymentMethods.test.js
git commit -m "Validate checkout payment method against store settings"
```

---

### Task 7: Storefront settings lib + checkout wiring

**Files:**
- Create: `apps/web/src/lib/storeSettings.js`
- Modify: `apps/web/src/pages/Checkout.jsx`
- Test: `apps/web/test/storefrontSettingsSource.test.js` (new)

- [ ] **Step 1: Write the failing source test**

Create `apps/web/test/storefrontSettingsSource.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('storeSettings lib fetches the public endpoint with safe fallbacks', async () => {
  const source = await readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8');

  assert.match(source, /\/api\/storefront-settings/);
  assert.match(source, /DEFAULT_STOREFRONT_SETTINGS/);
  assert.match(source, /export function loadStorefrontSettings/);
  assert.match(source, /export function regionFee/);
  assert.match(source, /export function regionEstimate/);
  assert.match(source, /export function isFreeShipping/);
  assert.match(source, /export function freeShippingHint/);
});

test('checkout uses store settings for shipping and payment methods', async () => {
  const source = await readFile(path.join(root, 'pages', 'Checkout.jsx'), 'utf8');

  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /name="payment-method"/);
  assert.match(source, /setPaymentMethod/);
  assert.match(source, /method\.instructions/);
  assert.match(source, /regionFee\(/);
  assert.match(source, /isFreeShipping\(/);
  // the hard-coded fee/threshold paths must be gone
  assert.doesNotMatch(source, /feeForRegion/);
  assert.doesNotMatch(source, /cartQuantity\(items\) >= 2/);
  assert.doesNotMatch(source, /paymentMethod: 'cash_on_delivery'/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test apps/web/test/storefrontSettingsSource.test.js`
Expected: FAIL — `lib/storeSettings.js` does not exist.

- [ ] **Step 3: Create the lib**

Create `apps/web/src/lib/storeSettings.js`:

```js
export const DEFAULT_STOREFRONT_SETTINGS = {
  storeName: 'Maria Clara Clothing',
  contactEmail: '',
  contactNumber: '',
  storeAddress: '',
  socialLinks: { facebook: '', instagram: '', tiktok: '' },
  shipping: {
    regions: [
      { id: 'metro_manila_cavite', label: 'Metro Manila & Cavite', feeCents: 8000, deliveryEstimate: 'Estimated delivery: Metro Manila and Cavite 2-4 days.' },
      { id: 'luzon', label: 'Luzon', feeCents: 12000, deliveryEstimate: 'Estimated delivery: Luzon provinces 3-6 days.' },
      { id: 'visayas_mindanao', label: 'Visayas & Mindanao', feeCents: 18000, deliveryEstimate: 'Estimated delivery: Visayas and Mindanao 5-8 days.' }
    ],
    freeShippingEnabled: true,
    freeShippingMinimumItems: 2
  },
  paymentMethods: [
    { id: 'cash_on_delivery', label: 'Cash on Delivery', instructions: '' }
  ]
};

let settingsPromise = null;

export function loadStorefrontSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch('/api/storefront-settings', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load storefront settings.');
        return response.json();
      })
      .then((body) => ({ ...DEFAULT_STOREFRONT_SETTINGS, ...(body.settings || {}) }))
      .catch(() => {
        settingsPromise = null;
        return DEFAULT_STOREFRONT_SETTINGS;
      });
  }
  return settingsPromise;
}

function findRegion(settings, region) {
  return settings.shipping.regions.find((candidate) => candidate.id === region) || null;
}

export function regionFee(settings, region) {
  const match = findRegion(settings, region);
  return match ? Number(match.feeCents) : 12000;
}

export function regionEstimate(settings, region) {
  const match = findRegion(settings, region);
  return match ? match.deliveryEstimate : 'Complete your address to see estimated delivery time.';
}

export function isFreeShipping(settings, quantity) {
  return settings.shipping.freeShippingEnabled && quantity >= settings.shipping.freeShippingMinimumItems;
}

export function freeShippingHint(settings, quantity) {
  if (!settings.shipping.freeShippingEnabled) return 'Standard shipping rates apply.';
  const needed = Math.max(0, settings.shipping.freeShippingMinimumItems - quantity);
  return `Add ${needed} more item${needed === 1 ? '' : 's'} to unlock free shipping.`;
}
```

- [ ] **Step 4: Wire `Checkout.jsx`**

All edits to `apps/web/src/pages/Checkout.jsx`:

**4a.** Replace the `addressGuide.js` import block (keep `regionLabel` — drop `deliveryEstimate` and `feeForRegion`) and add the settings import:

```js
import {
  loadBarangays,
  loadCities,
  loadProvinces,
  regionForProvince,
  regionLabel
} from '../lib/addressGuide.js';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  freeShippingHint,
  isFreeShipping,
  loadStorefrontSettings,
  regionEstimate,
  regionFee
} from '../lib/storeSettings.js';
```

**4b.** Replace `checkoutTotals` and `cartSnapshotFields`:

```js
function checkoutTotals(items, region, discountTotalCents, settings) {
  const subtotal = subtotalCents(items);
  const freeShippingUnlocked = isFreeShipping(settings, cartQuantity(items));
  const shippingFeeCents = items.length && !freeShippingUnlocked && region !== 'pending_address'
    ? regionFee(settings, region)
    : 0;
  const discount = Math.min(discountTotalCents, subtotal);
  return {
    subtotalCents: subtotal,
    shippingFeeCents,
    discountTotalCents: discount,
    totalCents: subtotal - discount + shippingFeeCents,
    shippingRegion: region,
    shippingRegionLabel: regionLabel(region),
    freeShippingUnlocked
  };
}

function cartSnapshotFields(items, totals, paymentMethod) {
  return {
    checkoutChannel: 'storefront_checkout',
    paymentMethod,
    shippingRegion: totals.shippingRegion,
    shippingRegionLabel: totals.shippingRegionLabel,
    freeShippingUnlocked: totals.freeShippingUnlocked,
    cartSnapshot: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku || '',
      slug: item.slug || '',
      productName: item.productName,
      size: item.size,
      imageUrl: item.imageUrl || '',
      unitPriceCents: Number(item.unitPriceCents || 0),
      quantity: Number(item.quantity || 0)
    })),
    adminEditableTotals: {
      subtotalCents: totals.subtotalCents,
      discountTotalCents: totals.discountTotalCents,
      shippingFeeCents: totals.shippingFeeCents,
      totalCents: totals.totalCents
    }
  };
}
```

**4c.** Inside the component, add state and the settings load effect (next to the existing `loadProvinces` effect):

```js
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');

  useEffect(() => {
    loadStorefrontSettings().then(setSettings);
  }, []);

  // if an admin disables the chosen method between loads, fall back to COD
  useEffect(() => {
    if (!settings.paymentMethods.some((method) => method.id === paymentMethod)) {
      setPaymentMethod('cash_on_delivery');
    }
  }, [settings, paymentMethod]);
```

**4d.** Update the totals memo and submit-time totals to pass settings:

```js
  const totals = useMemo(() => checkoutTotals(items, region, discountCents, settings), [items, region, discountCents, settings]);
```

and in `handleSubmit`:

```js
    const submitTotals = checkoutTotals(items, regionForProvince(province), discountCents, settings);
```

**4e.** In the payload spread, pass the method: `...cartSnapshotFields(items, submitTotals, paymentMethod)`. Update the sessionStorage write to use the selected label:

```js
      const methodLabel = settings.paymentMethods.find((method) => method.id === paymentMethod)?.label || 'Cash on Delivery';
      sessionStorage.setItem('maria-clara-last-order', JSON.stringify({
        orderNumber: result.orderNumber,
        customerName: payload.customer.fullName,
        paymentMethod: methodLabel,
        addressLine: payload.address.addressLine,
        shippingRegionLabel: submitTotals.shippingRegionLabel,
        shippingFeeCents: submitTotals.shippingFeeCents,
        totalCents: submitTotals.totalCents,
        placedAt: new Date().toISOString()
      }));
```

**4f.** Add the payment fieldset after the shipping-address fieldset (before the delivery-estimate line):

```jsx
          <fieldset className="mt-8 space-y-3">
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Payment</legend>
            {settings.paymentMethods.map((method) => (
              <label key={method.id} className="flex items-start gap-3 border border-line px-4 py-3 text-sm">
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={paymentMethod === method.id}
                  onChange={() => setPaymentMethod(method.id)}
                />
                <span>
                  <span className="font-semibold">{method.label}</span>
                  {paymentMethod === method.id && method.instructions && (
                    <span className="mt-1 block text-xs text-ink-soft">{method.instructions}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
```

**4g.** Settings-driven copy. Delivery estimate line:

```jsx
          <p className="mt-6 text-sm text-ink-soft">{addressReady ? regionEstimate(settings, region) : 'Complete your address to see estimated delivery time.'}</p>
```

Submit button + footnote:

```jsx
          <button type="submit" className="btn-ink mt-6 w-full" disabled={pending}>
            {pending ? 'Placing order...' : paymentMethod === 'cash_on_delivery' ? 'Place COD order' : 'Place order'}
          </button>
          <p className="mt-3 text-xs text-clay">
            {paymentMethod === 'cash_on_delivery'
              ? 'No payment now. We text you to confirm, then you pay cash on delivery.'
              : 'We text you to confirm your order and payment before shipping.'}
          </p>
```

Free-shipping hint in the summary aside:

```jsx
              <p className="mt-4 bg-cream px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                {totals.freeShippingUnlocked ? 'Free shipping unlocked.' : freeShippingHint(settings, cartQuantity(items))}
              </p>
```

- [ ] **Step 5: Run the tests + build**

Run: `node --test apps/web/test/storefrontSettingsSource.test.js`
Expected: PASS.

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all web tests pass; Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/storeSettings.js apps/web/src/pages/Checkout.jsx apps/web/test/storefrontSettingsSource.test.js
git commit -m "Drive checkout shipping and payment methods from store settings"
```

---

### Task 8: Admin Settings page

**Files:**
- Rewrite: `apps/web/src/admin/Settings.jsx`
- Test: `apps/web/test/adminSettingsSource.test.js` (new)

- [ ] **Step 1: Write the failing source test**

Create `apps/web/test/adminSettingsSource.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const settingsPath = path.join(import.meta.dirname, '..', 'src', 'admin', 'Settings.jsx');

test('admin settings page edits all four sections against the settings API', async () => {
  const source = await readFile(settingsPath, 'utf8');

  assert.match(source, /\/api\/admin\/settings/);
  assert.match(source, /\/api\/admin\/settings\/general/);
  assert.match(source, /\/api\/admin\/settings\/shipping/);
  assert.match(source, /\/api\/admin\/settings\/payments/);
  assert.match(source, /\/api\/admin\/settings\/security\/password/);
  assert.match(source, /\/api\/admin\/settings\/security\/rotate-token/);
  assert.match(source, /setAdminToken/);
  assert.match(source, /freeShippingMinimumItems/);
  // peso at the UI edge only
  assert.match(source, /centsFromPeso/);
  assert.doesNotMatch(source, /name="feeCents"/);
  // the old static placeholder is gone
  assert.doesNotMatch(source, /WORKING_NOW/);
  assert.doesNotMatch(source, /Coming next/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test apps/web/test/adminSettingsSource.test.js`
Expected: FAIL — the current placeholder page has none of these hooks.

- [ ] **Step 3: Rewrite the page**

Replace the entire contents of `apps/web/src/admin/Settings.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { adminJson, adminSend, setAdminToken } from '../lib/adminApi.js';

function pesoFromCents(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function centsFromPeso(value) {
  const peso = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(peso) && peso >= 0 ? Math.round(peso * 100) : NaN;
}

function Status({ status }) {
  if (!status?.message) return null;
  return (
    <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">
      {status.message}
    </p>
  );
}

function SectionCard({ title, hint, children }) {
  return (
    <section className="border border-line bg-paper p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">{title}</h2>
      {hint && <p className="mt-1 text-xs text-clay">{hint}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-clay">
      {label}
      {children}
    </label>
  );
}

function GeneralCard({ initial }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  function setSocial(field, value) {
    setForm((current) => ({ ...current, socialLinks: { ...current.socialLinks, [field]: value } }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await adminSend('PUT', '/api/admin/settings/general', form);
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="General" hint="Store identity shown to customers.">
      <div className="mt-4 space-y-3">
        <Field label="Store name"><input className="field mt-1" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} /></Field>
        <Field label="Contact email"><input className="field mt-1" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
        <Field label="Contact number"><input className="field mt-1" value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} /></Field>
        <Field label="Store address"><textarea className="field mt-1" rows="2" value={form.storeAddress} onChange={(e) => set('storeAddress', e.target.value)} /></Field>
        <Field label="Facebook link"><input className="field mt-1" value={form.socialLinks.facebook} onChange={(e) => setSocial('facebook', e.target.value)} /></Field>
        <Field label="Instagram link"><input className="field mt-1" value={form.socialLinks.instagram} onChange={(e) => setSocial('instagram', e.target.value)} /></Field>
        <Field label="TikTok link"><input className="field mt-1" value={form.socialLinks.tiktok} onChange={(e) => setSocial('tiktok', e.target.value)} /></Field>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save general settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function ShippingCard({ initial }) {
  const [regions, setRegions] = useState(initial.regions.map((region) => ({ ...region, feePeso: pesoFromCents(region.feeCents) })));
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(initial.freeShippingEnabled);
  const [minimumItems, setMinimumItems] = useState(String(initial.freeShippingMinimumItems));
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function setRegion(id, field, value) {
    setRegions((current) => current.map((region) => (region.id === id ? { ...region, [field]: value } : region)));
  }

  async function save() {
    setStatus(null);
    const payloadRegions = [];
    for (const region of regions) {
      const feeCents = centsFromPeso(region.feePeso);
      if (!Number.isInteger(feeCents)) {
        setStatus({ tone: 'error', message: `Enter a valid peso fee for ${region.label}.` });
        return;
      }
      payloadRegions.push({ id: region.id, label: region.label, feeCents, deliveryEstimate: region.deliveryEstimate });
    }
    setSaving(true);
    try {
      await adminSend('PUT', '/api/admin/settings/shipping', {
        regions: payloadRegions,
        freeShippingEnabled,
        freeShippingMinimumItems: Number(minimumItems)
      });
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Shipping" hint="Fees and delivery estimates applied at checkout.">
      <div className="mt-4 space-y-4">
        {regions.map((region) => (
          <div key={region.id} className="border-b border-line/60 pb-4 last:border-0">
            <p className="text-sm font-semibold">{region.label}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Fee (₱)">
                <input className="field mt-1" inputMode="decimal" value={region.feePeso} onChange={(e) => setRegion(region.id, 'feePeso', e.target.value)} />
              </Field>
              <Field label="Delivery estimate">
                <input className="field mt-1" value={region.deliveryEstimate} onChange={(e) => setRegion(region.id, 'deliveryEstimate', e.target.value)} />
              </Field>
            </div>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={freeShippingEnabled} onChange={(e) => setFreeShippingEnabled(e.target.checked)} />
          Offer free shipping at a minimum item count
        </label>
        {freeShippingEnabled && (
          <Field label="Free shipping minimum items">
            <input className="field mt-1 max-w-32" inputMode="numeric" value={minimumItems} onChange={(e) => setMinimumItems(e.target.value)} />
          </Field>
        )}
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save shipping settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function PaymentsCard({ initial }) {
  const [methods, setMethods] = useState(initial.methods);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function setMethod(id, field, value) {
    setMethods((current) => current.map((method) => (method.id === id ? { ...method, [field]: value } : method)));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await adminSend('PUT', '/api/admin/settings/payments', { methods });
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Payments" hint="Enabled methods appear at checkout. Cash on Delivery is always on.">
      <div className="mt-4 space-y-4">
        {methods.map((method) => (
          <div key={method.id} className="border-b border-line/60 pb-4 last:border-0">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={method.enabled}
                disabled={method.id === 'cash_on_delivery'}
                onChange={(e) => setMethod(method.id, 'enabled', e.target.checked)}
              />
              {method.label}
            </label>
            <Field label="Customer instructions">
              <textarea
                className="field mt-1"
                rows="2"
                placeholder={method.id === 'gcash' ? 'e.g. Send payment to GCash 0917 000 0000 (Maria Clara).' : ''}
                value={method.instructions}
                onChange={(e) => setMethod(method.id, 'instructions', e.target.value)}
              />
            </Field>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save payment settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function SecurityCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(false);

  async function changePassword() {
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({ tone: 'error', message: 'New password and confirmation do not match.' });
      return;
    }
    setPending(true);
    try {
      const body = await adminSend('POST', '/api/admin/settings/security/password', { currentPassword, newPassword });
      setAdminToken(body.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus({ tone: 'ok', message: 'Password changed. Other sessions were signed out.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  async function rotateToken() {
    setStatus(null);
    setPending(true);
    try {
      const body = await adminSend('POST', '/api/admin/settings/security/rotate-token', {});
      setAdminToken(body.token);
      setStatus({ tone: 'ok', message: 'Admin token rotated. Other sessions were signed out.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard title="Security" hint="Single-admin account. Changing the password signs out every other session.">
      <div className="mt-4 space-y-3">
        <Field label="Current password"><input className="field mt-1" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password (min. 8 characters)"><input className="field mt-1" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><input className="field mt-1" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-ink" disabled={pending} onClick={changePassword}>
          {pending ? 'Working…' : 'Change password'}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={rotateToken}>
          Rotate admin token
        </button>
      </div>
      <Status status={status} />
    </SectionCard>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminJson('/api/admin/settings')
      .then((body) => setSettings(body.settings))
      .catch((loadError) => setError(loadError.message));
  }, []);

  if (error) return <p className="text-sm text-accent-deep">{error}</p>;
  if (!settings) return <p className="text-sm text-clay">Loading settings…</p>;

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Settings</p>
      <h1 className="display mt-1 text-3xl">Store settings</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Saved changes apply to the customer website immediately.
      </p>
      <div className="mt-8 space-y-4">
        <GeneralCard initial={settings.general} />
        <ShippingCard initial={settings.shipping} />
        <PaymentsCard initial={settings.payments} />
        <SecurityCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests + build**

Run: `node --test apps/web/test/adminSettingsSource.test.js`
Expected: PASS.

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/Settings.jsx apps/web/test/adminSettingsSource.test.js
git commit -m "Rewrite admin settings page with live settings editor"
```

---

### Task 9: Storefront footer contact info

**Files:**
- Modify: `apps/web/src/components/Shell.jsx` (footer block, ~lines 139–178)
- Test: `apps/web/test/storefrontSettingsSource.test.js` (append)

- [ ] **Step 1: Write the failing source test** — append to `apps/web/test/storefrontSettingsSource.test.js`:

```js
test('storefront footer shows contact info from store settings', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /contactEmail/);
  assert.match(source, /contactNumber/);
  assert.match(source, /socialLinks/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test apps/web/test/storefrontSettingsSource.test.js`
Expected: the new test FAILS (Shell.jsx has no settings usage).

- [ ] **Step 3: Implement**

In `apps/web/src/components/Shell.jsx`:

**3a.** Add the import:

```js
import { loadStorefrontSettings } from '../lib/storeSettings.js';
```

**3b.** Add state + effect inside the component (next to the existing site-content/logo state):

```js
  const [storeInfo, setStoreInfo] = useState(null);

  useEffect(() => {
    loadStorefrontSettings().then(setStoreInfo);
  }, []);
```

**3c.** In the footer, inside the `sm:grid-cols-3` grid's last column (the "Promise" block), append a contact list after the existing paragraph:

```jsx
              {storeInfo && (storeInfo.contactEmail || storeInfo.contactNumber) && (
                <ul className="mt-4 space-y-1 text-sm text-paper/80">
                  {storeInfo.contactEmail && (
                    <li><a className="hover:text-accent" href={`mailto:${storeInfo.contactEmail}`}>{storeInfo.contactEmail}</a></li>
                  )}
                  {storeInfo.contactNumber && <li>{storeInfo.contactNumber}</li>}
                </ul>
              )}
              {storeInfo && Object.values(storeInfo.socialLinks || {}).some(Boolean) && (
                <ul className="mt-3 flex gap-4 text-sm text-paper/80">
                  {Object.entries(storeInfo.socialLinks).filter(([, url]) => url).map(([name, url]) => (
                    <li key={name}>
                      <a className="capitalize hover:text-accent" href={url} target="_blank" rel="noreferrer">{name}</a>
                    </li>
                  ))}
                </ul>
              )}
```

- [ ] **Step 4: Run the tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all green (including the pinned `shellSource.test.js` assertions — they only check the header logo and cart icon, untouched here).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Shell.jsx apps/web/test/storefrontSettingsSource.test.js
git commit -m "Show store contact details in the storefront footer"
```

---

### Task 10: Contracts and module README

**Files:**
- Modify: `apps/api/data/admin-contracts/settings.json`
- Modify: `apps/api/src/settings/README.md`

- [ ] **Step 1: Update the contract** — replace the contents of `apps/api/data/admin-contracts/settings.json`:

```json
{
  "area": "settings",
  "managedFields": [
    "storeName",
    "contactEmail",
    "contactNumber",
    "storeAddress",
    "socialLinks",
    "shippingRules",
    "freeShippingRule",
    "paymentMethods",
    "adminPassword",
    "adminToken",
    "policyLinks",
    "seoDefaults"
  ],
  "futureAdminActions": [
    "edit policy links",
    "edit SEO defaults",
    "configure notifications",
    "edit message templates",
    "configure maintenance mode"
  ]
}
```

- [ ] **Step 2: Update the README** — replace the contents of `apps/api/src/settings/README.md`:

```markdown
# Settings

Store settings module backing `/admin/settings` and the public storefront settings API.

- `storeSettingsRepository.js` — dual JSON/Postgres persistence for the settings document
  (`general`, `shipping`, `payments` sections) and the admin credentials record
  (scrypt password hash + bearer token). JSON files: `data/store-settings.json` and the
  gitignored `data/admin-credentials.json` (test overrides `STORE_SETTINGS_FILE` /
  `ADMIN_CREDENTIALS_FILE`). Postgres: `store_settings` key/value JSONB table.
- Admin endpoints live in `src/routes/admin.js` (`GET/PUT /api/admin/settings*`,
  `POST /api/admin/settings/security/*`); the storefront-safe subset is served by
  `src/routes/storeSettings.js` at `GET /api/storefront-settings`.
- Admin auth resolves stored credentials first and falls back to `ADMIN_PASSWORD` /
  `ADMIN_TOKEN` env defaults when no credentials record exists.

Future phases: policy links, SEO defaults, notifications, message templates,
maintenance mode (see `docs/enhancementdata.md`).
```

- [ ] **Step 3: Verify the readiness test still passes**

Run: `DATABASE_URL= node --test apps/api/test/adminReadiness.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/data/admin-contracts/settings.json apps/api/src/settings/README.md
git commit -m "Update settings contract and module docs"
```

---

### Task 11: Full verification

**Files:** none

- [ ] **Step 1: Full API suite**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all tests pass.

- [ ] **Step 2: Full web suite + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all tests pass; build succeeds.

- [ ] **Step 3: Manual smoke test (JSON mode)**

```bash
PORT=3199 npm run dev:api &
npm run dev:web
```

- Log in at `/admin/login` (password `admin`), open `/admin/settings`.
- Change the Luzon fee to ₱150, save; open `/checkout` with a 1-item cart and a Luzon
  address → shipping shows ₱150.00.
- Enable GCash with instructions, save; checkout shows the GCash radio + instructions;
  place an order → admin order detail shows payment method `gcash`.
- Change the password (e.g. `my-better-password`), confirm you stay signed in, sign out,
  log back in with the new password.
- Delete the temp `apps/api/data/store-settings.json` / `apps/api/data/admin-credentials.json`
  afterwards if you want to restore env-default auth for local dev.

- [ ] **Step 4: Postgres migration check (optional but recommended if Docker is available)**

```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/maria_clara npm run db:migrate
```

Expected: migration applies the `store_settings` table without errors.

- [ ] **Step 5: Final commit if anything changed, then hand off** per `superpowers:finishing-a-development-branch` (merge into `main` or PR — user decides; do NOT merge into `codex-edits`).
