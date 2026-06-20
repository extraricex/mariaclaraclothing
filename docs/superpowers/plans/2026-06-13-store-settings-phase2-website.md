# Store Settings Phase 2 (Website Section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the announcement ticker, info pages (FAQ / Shipping & Returns / Terms), SEO defaults, and maintenance mode admin-editable via a new `website` section in the phase-1 settings module.

**Architecture:** Extend `storeSettingsRepository` with a `website` section whose normalizer merges incoming values over the *stored* section (partial updates — the section is edited from two admin pages). The existing generic admin routes and public `/api/storefront-settings` endpoint carry the new data. The React storefront renders ticker/SEO/info pages from settings and gains a `MaintenanceGate`; `POST /api/orders` is blocked with 503 while maintenance mode is on.

**Tech Stack:** Express, node:test, React 18, dual JSON/PostgreSQL persistence (existing `store_settings` table — no schema change).

**Spec:** `docs/superpowers/specs/2026-06-13-store-settings-phase2-website-design.md`

**Conflict guard:** Do NOT touch `AdminLayout.jsx`, `Orders.jsx`, `OrderDetail.jsx`, `Checkout.jsx`, `adminOrders.test.js`, or the orders area of `admin.js` (owned by the unmerged `codex-edits` branch). Shared-file edits are limited to `App.jsx` (route wrapping) and `orders.js` (one guard block).

---

### Task 1: Worktree setup

**Files:** none

- [ ] **Step 1: Create the worktree and branch**

```bash
cd /Users/ronmrls/Desktop/Desktop/wood-panel/maria-clara/mariaclaraclothing
git worktree add ../mariaclaraclothing-settings-phase2 -b settings-phase2-website
cd ../mariaclaraclothing-settings-phase2
npm install
```

- [ ] **Step 2: Verify the baseline is green**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test` and `node --test apps/web/test/*.test.js`
Expected: all pass (66 API / 7 web at time of writing).

---

### Task 2: Repository `website` section with partial-update semantics

**Files:**
- Modify: `apps/api/src/settings/storeSettingsRepository.js`
- Test: `apps/api/test/storeSettingsRepository.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `apps/api/test/storeSettingsRepository.test.js`:

```js
test('website settings merge partial updates over the stored section', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-website-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();

    const defaults = repository.getStoreSettings();
    assert.equal(defaults.website.maintenanceMode, false);
    assert.equal(defaults.website.ticker.length, 4);
    assert.equal(defaults.website.seo.title, 'Maria Clara Clothing — Premium Philippine Streetwear');
    assert.ok(defaults.website.infoPages.faq.length >= 3);
    assert.ok(defaults.website.infoPages.shippingReturns.length >= 3);
    assert.ok(defaults.website.infoPages.terms.length >= 3);
    assert.ok(defaults.website.infoPages.faq[0].heading);
    assert.ok(defaults.website.infoPages.faq[0].body);

    // partial update: ticker only
    const afterTicker = repository.updateSettingsSection('website', { ticker: ['Big drop Friday'] });
    assert.deepEqual(afterTicker.website.ticker, ['Big drop Friday']);
    assert.equal(afterTicker.website.seo.title, defaults.website.seo.title);
    assert.deepEqual(afterTicker.website.infoPages.terms, defaults.website.infoPages.terms);

    // partial update: one info page only — ticker and the other pages survive
    const afterFaq = repository.updateSettingsSection('website', {
      infoPages: { faq: [{ heading: 'New question', body: 'New answer.' }] }
    });
    assert.deepEqual(afterFaq.website.infoPages.faq, [{ heading: 'New question', body: 'New answer.' }]);
    assert.deepEqual(afterFaq.website.infoPages.shippingReturns, defaults.website.infoPages.shippingReturns);
    assert.deepEqual(afterFaq.website.ticker, ['Big drop Friday']);

    // partial update: maintenance toggle preserves everything else
    const afterMaintenance = repository.updateSettingsSection('website', { maintenanceMode: true });
    assert.equal(afterMaintenance.website.maintenanceMode, true);
    assert.deepEqual(afterMaintenance.website.infoPages.faq, [{ heading: 'New question', body: 'New answer.' }]);

    assert.throws(() => repository.updateSettingsSection('website', { ticker: [] }),
      /Ticker must have 1 to 8 items\./);
    assert.throws(() => repository.updateSettingsSection('website', { ticker: ['ok', '  '] }),
      /Ticker items must be non-empty text\./);
    assert.throws(() => repository.updateSettingsSection('website', { infoPages: { blog: [] } }),
      /Info page is invalid\./);
    assert.throws(() => repository.updateSettingsSection('website', { infoPages: { faq: [{ heading: '', body: 'x' }] } }),
      /Info page sections need a heading and body\./);
    assert.throws(() => repository.updateSettingsSection('website', { infoPages: { faq: [] } }),
      /Info pages must have 1 to 30 sections\./);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/storeSettingsRepository.test.js`
Expected: new test FAILS (`defaults.website` is `undefined`).

- [ ] **Step 3: Implement** — in `apps/api/src/settings/storeSettingsRepository.js`:

**3a.** Change the sections constant and add the page-key set:

```js
const SETTINGS_SECTIONS = ['general', 'shipping', 'payments', 'website'];
const WEBSITE_INFO_PAGE_KEYS = ['faq', 'shippingReturns', 'terms'];
```

**3b.** Add `website` to `defaultStoreSettings()` (after the `payments` key). The info-page copy is today's hard-coded storefront text, converted to `{ heading, body }`:

```js
    website: {
      ticker: [
        'Free shipping on 2+ items',
        'Cash on delivery nationwide',
        '240 GSM premium cotton',
        'Ships via J&T Express'
      ],
      seo: {
        title: 'Maria Clara Clothing — Premium Philippine Streetwear',
        description: 'Oversized and crop-box 240 GSM cotton shirts. Cash on delivery nationwide. Free shipping on 2+ items.',
        imageUrl: ''
      },
      maintenanceMode: false,
      infoPages: {
        faq: [
          { heading: 'How does Cash on Delivery work?', body: 'Place your order online — no payment needed. We text your mobile number to confirm, then ship via J&T Express. You pay the rider in cash when the parcel arrives.' },
          { heading: 'How long is delivery?', body: 'Metro Manila and Cavite: 2–4 days. Other Luzon provinces: 3–6 days. Visayas and Mindanao: 5–8 days. We confirm by text before shipping.' },
          { heading: 'How much is shipping?', body: 'Metro Manila & Cavite ₱80, Luzon ₱120, Visayas/Mindanao ₱180. Order any 2 items and shipping is free.' },
          { heading: 'What if my size is sold out?', body: 'Drops are limited runs. Follow our socials for restocks — once a run sells through, it usually does not return.' },
          { heading: 'What is 240 GSM cotton?', body: 'GSM is fabric weight. 240 GSM is heavyweight tee territory: structured, opaque, and it keeps its shape after repeated washing.' }
        ],
        shippingReturns: [
          { heading: 'Shipping coverage', body: 'We ship nationwide via J&T Express with structured Philippine addresses (province, city/municipality, barangay). Some barangays are not confirmed for door-to-door delivery; we review those orders before shipping and coordinate by text.' },
          { heading: 'Shipping rates', body: 'Metro Manila & Cavite ₱80 · Luzon ₱120 · Visayas/Mindanao ₱180. Free shipping on any order of 2 or more items.' },
          { heading: 'Order confirmation', body: 'Every COD order is confirmed by text message before it ships. Unreachable numbers may cause the order to be cancelled.' },
          { heading: 'Returns & exchanges', body: 'Wrong or damaged item? Message us within 7 days of delivery with photos and we will arrange a replacement. Items must be unworn and unwashed. Size exchanges are subject to stock availability; buyer shoulders return shipping for size exchanges.' }
        ],
        terms: [
          { heading: 'Orders', body: 'All orders are Cash on Delivery and are confirmed via text message before fulfillment. We reserve the right to cancel orders we cannot confirm.' },
          { heading: 'Pricing', body: 'Prices are in Philippine pesos and may change without notice. The price at the time of your order is what you pay.' },
          { heading: 'Product', body: 'Colors may vary slightly from photos due to screen settings and photography lighting. Measurements in size charts have a ±2cm tolerance.' },
          { heading: 'Privacy', body: 'Your name, mobile number, and address are used only to fulfill and deliver your order. We never sell your information.' },
          { heading: 'Contact', body: 'Questions about these terms? Reach us through our social channels or the contact details on your order confirmation text.' }
        ]
      }
    }
```

**3c.** Add the website normalizers (after `normalizePayments`):

```js
function normalizeTicker(ticker) {
  if (!Array.isArray(ticker) || ticker.length < 1 || ticker.length > 8) {
    throw badRequest('Ticker must have 1 to 8 items.');
  }
  return ticker.map((item) => {
    const text = String(item || '').trim();
    if (!text) {
      throw badRequest('Ticker items must be non-empty text.');
    }
    return text;
  });
}

function normalizeSeo(seo, current) {
  const value = seo && typeof seo === 'object' ? seo : {};
  return {
    title: String(value.title || '').trim() || current.title,
    description: String(value.description || '').trim() || current.description,
    imageUrl: String(value.imageUrl || '').trim()
  };
}

function normalizeInfoPages(infoPages, current) {
  const value = infoPages && typeof infoPages === 'object' ? infoPages : {};
  const unknownPage = Object.keys(value).find((key) => !WEBSITE_INFO_PAGE_KEYS.includes(key));
  if (unknownPage) {
    throw badRequest('Info page is invalid.');
  }
  const result = {};
  for (const key of WEBSITE_INFO_PAGE_KEYS) {
    if (value[key] === undefined) {
      result[key] = current[key];
      continue;
    }
    const rows = Array.isArray(value[key]) ? value[key] : null;
    if (!rows || rows.length < 1 || rows.length > 30) {
      throw badRequest('Info pages must have 1 to 30 sections.');
    }
    result[key] = rows.map((row) => {
      const heading = String(row?.heading || '').trim();
      const body = String(row?.body || '').trim();
      if (!heading || !body) {
        throw badRequest('Info page sections need a heading and body.');
      }
      return { heading, body };
    });
  }
  return result;
}

function normalizeWebsite(website, current = defaultStoreSettings().website) {
  const value = website && typeof website === 'object' ? website : {};
  return {
    ticker: value.ticker === undefined ? current.ticker : normalizeTicker(value.ticker),
    seo: value.seo === undefined ? current.seo : normalizeSeo(value.seo, current.seo),
    maintenanceMode: value.maintenanceMode === undefined ? current.maintenanceMode : Boolean(value.maintenanceMode),
    infoPages: value.infoPages === undefined ? current.infoPages : normalizeInfoPages(value.infoPages, current.infoPages)
  };
}
```

**3d.** Extend `normalizeStoreSettings` with the website key:

```js
function normalizeStoreSettings(settings) {
  const value = settings && typeof settings === 'object' ? settings : {};
  return {
    general: normalizeGeneral(value.general),
    shipping: normalizeShipping(value.shipping),
    payments: normalizePayments(value.payments),
    website: normalizeWebsite(value.website)
  };
}
```

**3e.** Replace `updateSettingsSection` so the website normalizer receives the stored section:

```js
function normalizeSectionValue(section, value, current) {
  if (section === 'general') return normalizeGeneral(value);
  if (section === 'shipping') return normalizeShipping(value);
  if (section === 'payments') return normalizePayments(value);
  return normalizeWebsite(value, current.website);
}

function updateSettingsSection(section, value) {
  if (!SETTINGS_SECTIONS.includes(section)) {
    throw badRequest('Settings section is invalid.');
  }

  if (usePostgresSettings()) {
    return readPostgresValue(SETTINGS_KEY).then(async (stored) => {
      const current = normalizeStoreSettings(stored || {});
      const next = { ...current, [section]: normalizeSectionValue(section, value, current) };
      await writePostgresValue(SETTINGS_KEY, next);
      return next;
    });
  }

  const current = normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
  const next = { ...current, [section]: normalizeSectionValue(section, value, current) };
  writeJsonFile(settingsDataFile(), next);
  return next;
}
```

(Delete the old `const normalizers = { ... }` line — `normalizeSectionValue` replaces it.)

- [ ] **Step 4: Run the tests**

Run: `DATABASE_URL= node --test apps/api/test/storeSettingsRepository.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settings/storeSettingsRepository.js apps/api/test/storeSettingsRepository.test.js
git commit -m "Add website section to store settings with partial updates"
```

---

### Task 3: Public endpoint carries the website data

**Files:**
- Modify: `apps/api/src/routes/storeSettings.js`
- Test: `apps/api/test/adminSettings.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `apps/api/test/adminSettings.test.js`:

```js
test('website settings flow through the admin and public endpoints', async () => {
  await withSettingsServer(async (port) => {
    const tickerPut = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/website`,
      adminRequest('PUT', { ticker: ['Big drop Friday'] })
    );
    assert.equal(tickerPut.status, 200);
    const afterTicker = await tickerPut.json();
    assert.deepEqual(afterTicker.settings.website.ticker, ['Big drop Friday']);
    assert.equal(afterTicker.settings.website.maintenanceMode, false);

    const seoPut = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/website`,
      adminRequest('PUT', { seo: { title: 'MC Streetwear', description: 'Heavyweight tees.' } })
    );
    assert.equal(seoPut.status, 200);
    const afterSeo = await seoPut.json();
    assert.equal(afterSeo.settings.website.seo.title, 'MC Streetwear');
    // earlier partial update preserved
    assert.deepEqual(afterSeo.settings.website.ticker, ['Big drop Friday']);

    const badTicker = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/website`,
      adminRequest('PUT', { ticker: [] })
    );
    assert.equal(badTicker.status, 400);
    assert.equal((await badTicker.json()).error, 'Ticker must have 1 to 8 items.');

    const publicResponse = await fetch(`http://127.0.0.1:${port}/api/storefront-settings`);
    const publicBody = await publicResponse.json();
    assert.deepEqual(publicBody.settings.ticker, ['Big drop Friday']);
    assert.equal(publicBody.settings.seo.title, 'MC Streetwear');
    assert.equal(publicBody.settings.maintenanceMode, false);
    assert.ok(Array.isArray(publicBody.settings.infoPages.faq));
    assert.ok(publicBody.settings.infoPages.faq[0].heading);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: the new test FAILS on the public assertions (`publicBody.settings.ticker` is `undefined`); the admin PUT assertions pass already (generic route).

- [ ] **Step 3: Implement** — in `apps/api/src/routes/storeSettings.js`, extend the response object: after the `shipping: settings.shipping,` line add

```js
        ticker: settings.website.ticker,
        seo: settings.website.seo,
        maintenanceMode: settings.website.maintenanceMode,
        infoPages: settings.website.infoPages,
```

- [ ] **Step 4: Run the tests**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/storeSettings.js apps/api/test/adminSettings.test.js
git commit -m "Expose website settings on the storefront endpoint"
```

---

### Task 4: Maintenance mode blocks order creation

**Files:**
- Modify: `apps/api/src/routes/orders.js`
- Test: `apps/api/test/maintenanceMode.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/maintenanceMode.test.js`:

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
  delete require.cache[require.resolve('../src/routes/storeSettings')];
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  return require('../src/app').createApp();
}

test('maintenance mode blocks checkout and is reversible', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-maintenance-'));
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

  function putWebsite(body) {
    return fetch(`http://127.0.0.1:${port}/api/admin/settings/website`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function postOrder() {
    return fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
  }

  try {
    assert.equal((await putWebsite({ maintenanceMode: true })).status, 200);

    const blocked = await postOrder();
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).error, 'Store is under maintenance.');

    // admin API stays available while maintenance is on
    const adminOk = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    assert.equal(adminOk.status, 200);

    assert.equal((await putWebsite({ maintenanceMode: false })).status, 200);

    // back to normal validation (empty payload → 400, not 503)
    const after = await postOrder();
    assert.equal(after.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/maintenanceMode.test.js`
Expected: FAIL — the blocked POST returns 400 (validation) instead of 503.

- [ ] **Step 3: Implement** — in `apps/api/src/routes/orders.js`:

**3a.** Extend the existing settings import:

```js
const { getStoreSettings, listEnabledPaymentMethodIds } = require('../settings/storeSettingsRepository');
```

**3b.** Find the order-creation handler `router.post('/', async (req, res, next) => {` and add this guard as the first statement inside its `try` block (before any body handling):

```js
    const storeSettings = await getStoreSettings();
    if (storeSettings.website.maintenanceMode) {
      return res.status(503).json({ error: 'Store is under maintenance.' });
    }
```

- [ ] **Step 4: Run the tests**

Run: `DATABASE_URL= node --test apps/api/test/maintenanceMode.test.js`
Expected: PASS.

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all green (maintenance defaults to off).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/orders.js apps/api/test/maintenanceMode.test.js
git commit -m "Block order creation while maintenance mode is on"
```

---

### Task 5: Web defaults + Shell ticker + SEO tags

**Files:**
- Modify: `apps/web/src/lib/storeSettings.js`
- Modify: `apps/web/src/components/Shell.jsx`
- Test: `apps/web/test/storefrontSettingsSource.test.js` (append)

- [ ] **Step 1: Write the failing source test** — append to `apps/web/test/storefrontSettingsSource.test.js`:

```js
test('store settings lib carries website defaults and an SEO applier', async () => {
  const source = await readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8');

  assert.match(source, /ticker:/);
  assert.match(source, /DEFAULT_INFO_PAGES/);
  assert.match(source, /maintenanceMode: false/);
  assert.match(source, /export function applySeoTags/);
});

test('shell renders the ticker and SEO tags from settings', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /applySeoTags/);
  assert.match(source, /storeInfo\?\.ticker/);
  assert.match(source, /function Ticker\(\{ items \}\)/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/test/storefrontSettingsSource.test.js`
Expected: the two new tests FAIL.

- [ ] **Step 3: Extend the web lib** — in `apps/web/src/lib/storeSettings.js`:

**3a.** Add above `DEFAULT_STOREFRONT_SETTINGS` (the copy matches the API defaults; it is the fetch-failure fallback):

```js
export const DEFAULT_INFO_PAGES = {
  faq: [
    { heading: 'How does Cash on Delivery work?', body: 'Place your order online — no payment needed. We text your mobile number to confirm, then ship via J&T Express. You pay the rider in cash when the parcel arrives.' },
    { heading: 'How long is delivery?', body: 'Metro Manila and Cavite: 2–4 days. Other Luzon provinces: 3–6 days. Visayas and Mindanao: 5–8 days. We confirm by text before shipping.' },
    { heading: 'How much is shipping?', body: 'Metro Manila & Cavite ₱80, Luzon ₱120, Visayas/Mindanao ₱180. Order any 2 items and shipping is free.' },
    { heading: 'What if my size is sold out?', body: 'Drops are limited runs. Follow our socials for restocks — once a run sells through, it usually does not return.' },
    { heading: 'What is 240 GSM cotton?', body: 'GSM is fabric weight. 240 GSM is heavyweight tee territory: structured, opaque, and it keeps its shape after repeated washing.' }
  ],
  shippingReturns: [
    { heading: 'Shipping coverage', body: 'We ship nationwide via J&T Express with structured Philippine addresses (province, city/municipality, barangay). Some barangays are not confirmed for door-to-door delivery; we review those orders before shipping and coordinate by text.' },
    { heading: 'Shipping rates', body: 'Metro Manila & Cavite ₱80 · Luzon ₱120 · Visayas/Mindanao ₱180. Free shipping on any order of 2 or more items.' },
    { heading: 'Order confirmation', body: 'Every COD order is confirmed by text message before it ships. Unreachable numbers may cause the order to be cancelled.' },
    { heading: 'Returns & exchanges', body: 'Wrong or damaged item? Message us within 7 days of delivery with photos and we will arrange a replacement. Items must be unworn and unwashed. Size exchanges are subject to stock availability; buyer shoulders return shipping for size exchanges.' }
  ],
  terms: [
    { heading: 'Orders', body: 'All orders are Cash on Delivery and are confirmed via text message before fulfillment. We reserve the right to cancel orders we cannot confirm.' },
    { heading: 'Pricing', body: 'Prices are in Philippine pesos and may change without notice. The price at the time of your order is what you pay.' },
    { heading: 'Product', body: 'Colors may vary slightly from photos due to screen settings and photography lighting. Measurements in size charts have a ±2cm tolerance.' },
    { heading: 'Privacy', body: 'Your name, mobile number, and address are used only to fulfill and deliver your order. We never sell your information.' },
    { heading: 'Contact', body: 'Questions about these terms? Reach us through our social channels or the contact details on your order confirmation text.' }
  ]
};
```

**3b.** Add the website fields to `DEFAULT_STOREFRONT_SETTINGS` (after `paymentMethods`):

```js
  ticker: [
    'Free shipping on 2+ items',
    'Cash on delivery nationwide',
    '240 GSM premium cotton',
    'Ships via J&T Express'
  ],
  seo: {
    title: 'Maria Clara Clothing — Premium Philippine Streetwear',
    description: 'Oversized and crop-box 240 GSM cotton shirts. Cash on delivery nationwide. Free shipping on 2+ items.',
    imageUrl: ''
  },
  maintenanceMode: false,
  infoPages: DEFAULT_INFO_PAGES
```

**3c.** Add at the end of the file:

```js
function upsertMetaTag(attribute, name, content) {
  let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function applySeoTags(seo) {
  if (!seo) return;
  if (seo.title) document.title = seo.title;
  if (seo.description) upsertMetaTag('name', 'description', seo.description);
  if (seo.imageUrl) upsertMetaTag('property', 'og:image', seo.imageUrl);
}
```

- [ ] **Step 4: Wire the Shell** — in `apps/web/src/components/Shell.jsx`:

**4a.** Extend the lib import:

```js
import { applySeoTags, loadStorefrontSettings } from '../lib/storeSettings.js';
```

**4b.** Make `Ticker` take items (replace `function Ticker() {` and the `sequence` line):

```js
function Ticker({ items }) {
  const sequence = [...items, ...items, ...items];
```

**4c.** In the `Shell` component, after the existing `loadStorefrontSettings().then(setStoreInfo);` effect, add the SEO effect:

```js
  useEffect(() => {
    applySeoTags(storeInfo?.seo);
  }, [storeInfo]);
```

**4d.** Pass the ticker items where `<Ticker />` is rendered:

```jsx
      <Ticker items={storeInfo?.ticker || TICKER_ITEMS} />
```

(`TICKER_ITEMS` stays as the pre-fetch fallback.)

- [ ] **Step 5: Run tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/storeSettings.js apps/web/src/components/Shell.jsx apps/web/test/storefrontSettingsSource.test.js
git commit -m "Drive announcement ticker and SEO tags from store settings"
```

---

### Task 6: MaintenanceGate + settings-driven InfoPage

**Files:**
- Create: `apps/web/src/components/MaintenanceGate.jsx`
- Modify: `apps/web/src/pages/InfoPage.jsx` (rewrite)
- Modify: `apps/web/src/App.jsx`
- Test: `apps/web/test/storefrontSettingsSource.test.js` (append)

- [ ] **Step 1: Write the failing source test** — append:

```js
test('maintenance gate wraps the storefront but not the admin', async () => {
  const gate = await readFile(path.join(root, 'components', 'MaintenanceGate.jsx'), 'utf8');
  assert.match(gate, /maintenanceMode/);
  assert.match(gate, /We'll be right back/);

  const app = await readFile(path.join(root, 'App.jsx'), 'utf8');
  assert.match(app, /<MaintenanceGate><Shell \/><\/MaintenanceGate>/);
  assert.match(app, /<MaintenanceGate><Checkout \/><\/MaintenanceGate>/);
  assert.doesNotMatch(app, /<MaintenanceGate><AdminLayout/);
});

test('info pages render sections from settings by pageKey', async () => {
  const source = await readFile(path.join(root, 'pages', 'InfoPage.jsx'), 'utf8');
  assert.match(source, /pageKey/);
  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /section\.heading/);
  assert.match(source, /section\.body/);
  assert.doesNotMatch(source, /FAQ_SECTIONS/);

  const app = await readFile(path.join(root, 'App.jsx'), 'utf8');
  assert.match(app, /pageKey="faq"/);
  assert.match(app, /pageKey="shippingReturns"/);
  assert.match(app, /pageKey="terms"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/test/storefrontSettingsSource.test.js`
Expected: the two new tests FAIL (gate file missing).

- [ ] **Step 3: Create the gate**

Create `apps/web/src/components/MaintenanceGate.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { loadStorefrontSettings } from '../lib/storeSettings.js';

export default function MaintenanceGate({ children }) {
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    loadStorefrontSettings().then((settings) => setMaintenance(Boolean(settings.maintenanceMode)));
  }, []);

  if (!maintenance) return children;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <p className="display text-4xl">Maria<span className="text-accent">Clara</span></p>
      <h1 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em]">We'll be right back</h1>
      <p className="mt-3 max-w-sm text-sm text-ink-soft">
        The store is briefly down for maintenance. Follow our socials for updates — we won't be long.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `InfoPage.jsx`**

Replace the entire file with:

```jsx
import { useEffect, useState } from 'react';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';

export default function InfoPage({ title, pageKey }) {
  const [sections, setSections] = useState(DEFAULT_STOREFRONT_SETTINGS.infoPages[pageKey] || []);

  useEffect(() => {
    let active = true;
    setSections(DEFAULT_STOREFRONT_SETTINGS.infoPages[pageKey] || []);
    loadStorefrontSettings().then((settings) => {
      const rows = settings.infoPages?.[pageKey];
      if (active && Array.isArray(rows) && rows.length) setSections(rows);
    });
    return () => {
      active = false;
    };
  }, [pageKey]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 lg:px-8">
      <p className="eyebrow">Maria Clara Clothing</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{title}</h1>
      <div className="mt-10">
        {sections.map((section, index) => (
          <details key={section.heading} className="group border-t border-line py-5" open={index === 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold uppercase tracking-[0.12em]">
              {section.heading}
              <span className="text-accent transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{section.body}</p>
          </details>
        ))}
        <div className="hairline" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `App.jsx`**

**5a.** Replace the InfoPage import line:

```js
import InfoPage from './pages/InfoPage.jsx';
```

and add below the Shell import:

```js
import MaintenanceGate from './components/MaintenanceGate.jsx';
```

**5b.** Wrap the storefront route groups and update the info routes:

```jsx
      <Route element={<MaintenanceGate><Shell /></MaintenanceGate>}>
```

```jsx
        <Route path="/faq" element={<InfoPage title="Frequently asked questions" pageKey="faq" />} />
        <Route path="/shipping-returns" element={<InfoPage title="Shipping & returns" pageKey="shippingReturns" />} />
        <Route path="/terms" element={<InfoPage title="Terms of service" pageKey="terms" />} />
```

```jsx
      <Route path="/checkout" element={<MaintenanceGate><Checkout /></MaintenanceGate>} />
```

and the catch-all:

```jsx
      <Route path="*" element={<MaintenanceGate><Shell /></MaintenanceGate>} />
```

- [ ] **Step 6: Run tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/MaintenanceGate.jsx apps/web/src/pages/InfoPage.jsx apps/web/src/App.jsx apps/web/test/storefrontSettingsSource.test.js
git commit -m "Add maintenance gate and settings-driven info pages"
```

---

### Task 7: Admin Website-content editors (ticker + info pages)

**Files:**
- Create: `apps/web/src/admin/TickerEditor.jsx`
- Create: `apps/web/src/admin/InfoPagesEditor.jsx`
- Modify: `apps/web/src/admin/Banners.jsx`
- Test: `apps/web/test/adminWebsiteContentSource.test.js` (new)

- [ ] **Step 1: Write the failing source test**

Create `apps/web/test/adminWebsiteContentSource.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const adminRoot = path.join(import.meta.dirname, '..', 'src', 'admin');

test('ticker editor saves the ticker subfield of website settings', async () => {
  const source = await readFile(path.join(adminRoot, 'TickerEditor.jsx'), 'utf8');
  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /\{ ticker: items \}/);
  assert.match(source, /Add item/);
});

test('info pages editor saves one page at a time', async () => {
  const source = await readFile(path.join(adminRoot, 'InfoPagesEditor.jsx'), 'utf8');
  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /infoPages: \{ \[active\]: rows \}/);
  assert.match(source, /shippingReturns/);
  assert.match(source, /Add section/);
});

test('website content page hosts the ticker and info-page editors', async () => {
  const source = await readFile(path.join(adminRoot, 'Banners.jsx'), 'utf8');
  assert.match(source, /TickerEditor/);
  assert.match(source, /InfoPagesEditor/);
  assert.match(source, /\/api\/admin\/settings/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/test/adminWebsiteContentSource.test.js`
Expected: FAIL (files missing).

- [ ] **Step 3: Create `TickerEditor.jsx`**

```jsx
import { useState } from 'react';
import { adminSend } from '../lib/adminApi.js';

export default function TickerEditor({ initial }) {
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function update(index, value) {
    setItems((current) => current.map((item, i) => (i === index ? value : item)));
  }

  function move(index, delta) {
    setItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { ticker: items });
      setItems(body.settings.website.ticker);
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Announcement ticker</p>
          <p className="mt-1 text-sm text-ink-soft">Scrolling messages at the very top of the storefront.</p>
        </div>
        <button type="button" className="btn-ink" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save ticker'}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input className="field flex-1" value={item} onChange={(e) => update(index, e.target.value)} />
            <button type="button" className="border border-line px-2 py-1 text-xs hover:border-ink" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" className="border border-line px-2 py-1 text-xs hover:border-ink" onClick={() => move(index, 1)} disabled={index === items.length - 1}>↓</button>
            <button type="button" className="text-xs text-clay underline hover:text-accent" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} disabled={items.length <= 1}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-3" onClick={() => setItems((current) => [...current, ''])} disabled={items.length >= 8}>
        Add item
      </button>
      {status?.message && (
        <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">{status.message}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create `InfoPagesEditor.jsx`**

```jsx
import { useState } from 'react';
import { adminSend } from '../lib/adminApi.js';

const PAGES = [
  { key: 'faq', label: 'FAQ' },
  { key: 'shippingReturns', label: 'Shipping & Returns' },
  { key: 'terms', label: 'Terms' }
];

export default function InfoPagesEditor({ initial }) {
  const [pages, setPages] = useState(initial);
  const [active, setActive] = useState('faq');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const rows = pages[active] || [];

  function setRows(updater) {
    setPages((current) => ({ ...current, [active]: updater(current[active] || []) }));
  }

  function updateRow(index, field, value) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function move(index, delta) {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { infoPages: { [active]: rows } });
      setPages(body.settings.website.infoPages);
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Info pages</p>
          <p className="mt-1 text-sm text-ink-soft">FAQ, Shipping &amp; Returns, and Terms shown on the storefront.</p>
        </div>
        <button type="button" className="btn-ink" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : `Save ${PAGES.find((page) => page.key === active)?.label}`}
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        {PAGES.map((page) => (
          <button
            key={page.key}
            type="button"
            className={`border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${active === page.key ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}
            onClick={() => { setActive(page.key); setStatus(null); }}
          >
            {page.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="border border-line p-3">
            <input className="field" placeholder="Heading" value={row.heading} onChange={(e) => updateRow(index, 'heading', e.target.value)} />
            <textarea className="field mt-2" rows="3" placeholder="Body" value={row.body} onChange={(e) => updateRow(index, 'body', e.target.value)} />
            <div className="mt-2 flex gap-3 text-xs">
              <button type="button" className="border border-line px-3 py-1 hover:border-ink" onClick={() => move(index, -1)} disabled={index === 0}>↑ Up</button>
              <button type="button" className="border border-line px-3 py-1 hover:border-ink" onClick={() => move(index, 1)} disabled={index === rows.length - 1}>↓ Down</button>
              <button type="button" className="text-clay underline hover:text-accent" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} disabled={rows.length <= 1}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-3" onClick={() => setRows((current) => [...current, { heading: '', body: '' }])} disabled={rows.length >= 30}>
        Add section
      </button>
      {status?.message && (
        <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">{status.message}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Host them on the Website-content page** — in `apps/web/src/admin/Banners.jsx`:

**5a.** Add imports:

```js
import TickerEditor from './TickerEditor.jsx';
import InfoPagesEditor from './InfoPagesEditor.jsx';
```

**5b.** Add website state + load (next to the existing `load`/`useEffect`):

```js
  const [website, setWebsite] = useState(null);

  useEffect(() => {
    adminJson('/api/admin/settings')
      .then((body) => setWebsite(body.settings.website))
      .catch((err) => setMessage(err.message));
  }, []);
```

**5c.** Render the editors at the bottom of the page, after the banners `<div className="mt-8 space-y-4">…</div>` block:

```jsx
      {website && <TickerEditor initial={website.ticker} />}
      {website && <InfoPagesEditor initial={website.infoPages} />}
```

**5d.** Update the page heading copy: `Logo & homepage banners` → `Logo, banners & website text`.

- [ ] **Step 6: Run tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/admin/TickerEditor.jsx apps/web/src/admin/InfoPagesEditor.jsx apps/web/src/admin/Banners.jsx apps/web/test/adminWebsiteContentSource.test.js
git commit -m "Add ticker and info-page editors to website content admin"
```

---

### Task 8: SEO + Maintenance cards on Settings

**Files:**
- Modify: `apps/web/src/admin/Settings.jsx`
- Test: `apps/web/test/adminSettingsSource.test.js` (append)

- [ ] **Step 1: Write the failing source test** — append to `apps/web/test/adminSettingsSource.test.js`:

```js
test('settings page includes SEO and maintenance cards', async () => {
  const source = await readFile(settingsPath, 'utf8');

  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /Share image URL/);
  assert.match(source, /maintenanceMode/);
  assert.match(source, /checkout is disabled/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/test/adminSettingsSource.test.js`
Expected: new test FAILS.

- [ ] **Step 3: Implement** — in `apps/web/src/admin/Settings.jsx`:

**3a.** Add the two cards (before `export default function Settings()`):

```jsx
function SeoCard({ initial }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await adminSend('PUT', '/api/admin/settings/website', { seo: form });
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="SEO" hint="Browser title, search description, and social share image.">
      <div className="mt-4 space-y-3">
        <Field label="Site title"><input className="field mt-1" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Meta description"><textarea className="field mt-1" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Share image URL"><input className="field mt-1" placeholder="https://… or /uploads/…" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} /></Field>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save SEO settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function MaintenanceCard({ initial }) {
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { maintenanceMode: enabled });
      setEnabled(body.settings.website.maintenanceMode);
      setStatus({ tone: 'ok', message: body.settings.website.maintenanceMode ? 'Maintenance mode is ON — the storefront is hidden.' : 'Maintenance mode is off. The storefront is live.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Maintenance" hint="Take the storefront offline while you make changes.">
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          <span className="font-semibold">Enable maintenance mode</span>
          <span className="mt-1 block text-xs text-clay">
            Customers see a "be right back" screen and checkout is disabled. The admin dashboard stays available, so you can turn this off any time.
          </span>
        </span>
      </label>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save maintenance setting'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}
```

**3b.** Render them in `Settings()` between `<PaymentsCard …/>` and `<SecurityCard />`:

```jsx
        <SeoCard initial={settings.website.seo} />
        <MaintenanceCard initial={settings.website.maintenanceMode} />
```

- [ ] **Step 4: Run tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/Settings.jsx apps/web/test/adminSettingsSource.test.js
git commit -m "Add SEO and maintenance cards to admin settings"
```

---

### Task 9: Contract + README updates

**Files:**
- Modify: `apps/api/data/admin-contracts/settings.json`
- Modify: `apps/api/src/settings/README.md`

- [ ] **Step 1: Update the contract** — replace `apps/api/data/admin-contracts/settings.json`:

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
    "announcementTicker",
    "infoPages",
    "seoDefaults",
    "maintenanceMode",
    "policyLinks"
  ],
  "futureAdminActions": [
    "configure notifications",
    "edit message templates",
    "configure checkout settings",
    "configure inventory settings",
    "configure export settings"
  ]
}
```

- [ ] **Step 2: Update the README** — in `apps/api/src/settings/README.md`, replace the first bullet's section list and the closing line:

Change `(`general`, `shipping`, `payments` sections)` to `(`general`, `shipping`, `payments`, `website` sections — website covers the announcement ticker, info pages, SEO defaults, and maintenance mode with partial-update merge semantics)`.

Change the final paragraph to:

```markdown
Future phases: notifications, message templates, checkout/inventory/export settings
(see `docs/enhancementdata.md`).
```

- [ ] **Step 3: Verify the readiness test**

Run: `DATABASE_URL= node --test apps/api/test/adminReadiness.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/data/admin-contracts/settings.json apps/api/src/settings/README.md
git commit -m "Update settings contract and docs for website section"
```

---

### Task 10: Full verification

**Files:** none

- [ ] **Step 1: Full suites + build**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all pass.

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 2: Live smoke test (JSON mode, temp files)** — start the API with temp `STORE_SETTINGS_FILE`, then:

- `PUT /api/admin/settings/website` with `{ ticker: ['Smoke test'] }` → 200; `GET /api/storefront-settings` shows `ticker: ['Smoke test']` and untouched `infoPages`.
- `PUT` `{ maintenanceMode: true }` → `POST /api/orders` returns 503; `PUT` `{ maintenanceMode: false }` → returns 400 for an empty payload.

- [ ] **Step 3: Hand off** per `superpowers:finishing-a-development-branch` (merge to `main` + push expected, matching phase 1; rebuild and commit `apps/web/dist` on main after merge, then rebuild the Docker stack so the user can review).
