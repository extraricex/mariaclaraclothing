# Store Settings Phase 3 (Inventory Section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the low-stock threshold (hard-coded `12`) admin-editable via a new `inventory` settings section, driving the storefront "Limited pieces" badges and all admin low-stock computations.

**Architecture:** Add an `inventory` section to the phase-1/2 settings module (standard defaults-backed semantics). The API's products area takes the threshold as a parameter (`productSummary`, `productStockFilter`, `productSummaryRecord`) resolved per-request via `getStoreSettings()`. The public `/api/storefront-settings` payload carries it; a new `useStorefrontSettings()` React hook feeds `ProductCard`/`Product`.

**Tech Stack:** Express, node:test, React 18, existing `store_settings` persistence (no schema change).

**Spec:** `docs/superpowers/specs/2026-06-13-store-settings-phase3-inventory-design.md`

**Conflict guard:** All `admin.js` edits are in the products area (the unmerged `codex-edits` branch only touches the orders area). Do not touch `Checkout.jsx`, `App.jsx`, `orders.js`, `AdminLayout.jsx`, or `adminOrders.test.js`.

---

### Task 1: Worktree setup

**Files:** none

- [ ] **Step 1: Create the worktree and branch**

```bash
cd /Users/ronmrls/Desktop/Desktop/wood-panel/maria-clara/mariaclaraclothing
git worktree add ../mariaclaraclothing-settings-phase3 -b settings-phase3-inventory
cd ../mariaclaraclothing-settings-phase3
npm install
```

If the worktree directory is missing after the command (registration hiccup seen in phase 2), run `git worktree prune` and retry with the existing branch: `git worktree add ../mariaclaraclothing-settings-phase3 settings-phase3-inventory`.

- [ ] **Step 2: Verify the baseline is green**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test` and `node --test apps/web/test/*.test.js`
Expected: all pass (69 API / 15 web at time of writing).

---

### Task 2: Repository `inventory` section

**Files:**
- Modify: `apps/api/src/settings/storeSettingsRepository.js`
- Test: `apps/api/test/storeSettingsRepository.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `apps/api/test/storeSettingsRepository.test.js`:

```js
test('inventory settings store the low stock threshold', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-inventory-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();

    assert.equal(repository.getStoreSettings().inventory.lowStockThreshold, 12);

    const updated = repository.updateSettingsSection('inventory', { lowStockThreshold: 30 });
    assert.equal(updated.inventory.lowStockThreshold, 30);
    assert.equal(repository.getStoreSettings().inventory.lowStockThreshold, 30);

    assert.throws(() => repository.updateSettingsSection('inventory', { lowStockThreshold: 0 }),
      /Low stock threshold must be an integer between 1 and 999\./);
    assert.throws(() => repository.updateSettingsSection('inventory', { lowStockThreshold: 1000 }),
      /Low stock threshold must be an integer between 1 and 999\./);
    assert.throws(() => repository.updateSettingsSection('inventory', { lowStockThreshold: 12.5 }),
      /Low stock threshold must be an integer between 1 and 999\./);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/storeSettingsRepository.test.js`
Expected: new test FAILS (`inventory` is `undefined`).

- [ ] **Step 3: Implement** — in `apps/api/src/settings/storeSettingsRepository.js`:

**3a.** Add `'inventory'` to the sections constant:

```js
const SETTINGS_SECTIONS = ['general', 'shipping', 'payments', 'website', 'inventory'];
```

**3b.** In `defaultStoreSettings()`, add after the `website` key (inside the returned object):

```js
    inventory: {
      lowStockThreshold: 12
    }
```

**3c.** Add the normalizer (after `normalizeWebsite`):

```js
function normalizeInventory(inventory) {
  const value = inventory && typeof inventory === 'object' ? inventory : {};
  const defaults = defaultStoreSettings().inventory;
  const lowStockThreshold = value.lowStockThreshold === undefined
    ? defaults.lowStockThreshold
    : Number(value.lowStockThreshold);
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 1 || lowStockThreshold > 999) {
    throw badRequest('Low stock threshold must be an integer between 1 and 999.');
  }
  return { lowStockThreshold };
}
```

**3d.** Extend `normalizeStoreSettings` (add the `inventory` key):

```js
    website: normalizeWebsite(value.website),
    inventory: normalizeInventory(value.inventory)
```

**3e.** Extend `normalizeSectionValue` (before the final `return normalizeWebsite(...)` line):

```js
  if (section === 'inventory') return normalizeInventory(value);
```

- [ ] **Step 4: Run the tests**

Run: `DATABASE_URL= node --test apps/api/test/storeSettingsRepository.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settings/storeSettingsRepository.js apps/api/test/storeSettingsRepository.test.js
git commit -m "Add inventory section to store settings"
```

---

### Task 3: Threshold drives the products API + public endpoint

**Files:**
- Modify: `apps/api/src/routes/admin.js` (products area only)
- Modify: `apps/api/src/routes/storeSettings.js`
- Test: `apps/api/test/adminSettings.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `apps/api/test/adminSettings.test.js`:

```js
test('low stock threshold drives product summaries and product settings', async () => {
  await withSettingsServer(async (port) => {
    const beforeResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, adminRequest());
    const before = await beforeResponse.json();

    const putResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/inventory`,
      adminRequest('PUT', { lowStockThreshold: 999 })
    );
    assert.equal(putResponse.status, 200);
    assert.equal((await putResponse.json()).settings.inventory.lowStockThreshold, 999);

    const productSettings = await (await fetch(`http://127.0.0.1:${port}/api/admin/products/settings`, adminRequest())).json();
    assert.equal(productSettings.settings.lowStockThreshold, 999);

    const after = await (await fetch(`http://127.0.0.1:${port}/api/admin/products`, adminRequest())).json();
    // with a 999 threshold every in-stock product counts as low stock
    assert.ok(after.summary.lowStock > before.summary.lowStock);
    assert.equal(after.summary.lowStock + after.summary.soldOut, after.summary.total);
    assert.ok(after.products.every((product) =>
      product.inventoryQuantity === 0 ? product.stockStatus === 'sold_out' : product.stockStatus === 'low_stock'));

    const publicBody = await (await fetch(`http://127.0.0.1:${port}/api/storefront-settings`)).json();
    assert.equal(publicBody.settings.inventory.lowStockThreshold, 999);

    const badPut = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/inventory`,
      adminRequest('PUT', { lowStockThreshold: 0 })
    );
    assert.equal(badPut.status, 400);
    assert.equal((await badPut.json()).error, 'Low stock threshold must be an integer between 1 and 999.');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: the new test FAILS (`productSettings.settings.lowStockThreshold` is `12`, summary unchanged).

- [ ] **Step 3: Implement** — in `apps/api/src/routes/admin.js`:

**3a.** Add a helper next to `productSummary` (~line 700):

```js
async function activeLowStockThreshold() {
  const settings = await getStoreSettings();
  return settings.inventory.lowStockThreshold;
}
```

(`getStoreSettings` is already imported from phase 1.)

**3b.** Thread the threshold through the three functions:

```js
function productSummary(products, lowStockThreshold) {
```
…and inside it: `productInventory(product) <= lowStockThreshold`.

```js
function productSummaryRecord(product, lowStockThreshold) {
```
…and inside it: `stockStatus: productStockFilter(product, lowStockThreshold),`.

```js
function productStockFilter(product, lowStockThreshold) {
```
…and inside it: `if (inventory <= lowStockThreshold) return 'low_stock';`.

**3c.** Update every call site:

- `POST /products/import` (~line 256):

```js
    const products = await replaceEditableProducts(incomingProducts);
    return res.json({ products, summary: productSummary(products, await activeLowStockThreshold()) });
```

- `GET /products` (~lines 360–377) — compute once and use in the filter/map/summary:

```js
    const allProducts = await listEditableProducts();
    const lowStockThreshold = await activeLowStockThreshold();
    const products = sortProductRecords(allProducts
      .filter((product) => !status || productStatus(product) === status)
      .filter((product) => !collection || product.collections.some((item) => item.toLowerCase() === collection))
      .filter((product) => !query || productSearchText(product).includes(query))
      .filter((product) => !stock || productStockFilter(product, lowStockThreshold) === stock)
      .map((product) => productSummaryRecord(product, lowStockThreshold)), sort);

    return res.json({
      products,
      summary: productSummary(allProducts, lowStockThreshold)
    });
```

- The four product-mutation responses (~lines 415, 424, 444, 458) all become:

```js
summary: productSummary(await listEditableProducts(), await activeLowStockThreshold())
```

**3d.** Make `GET /products/settings` (~line 262) read the stored value:

```js
router.get('/products/settings', async (req, res, next) => {
  try {
    return res.json({
      settings: {
        statuses: ['active', 'draft', 'archived'],
        defaultStatus: 'active',
        lowStockThreshold: await activeLowStockThreshold(),
        recommendedCollections: ['New Arrivals', 'Best Sellers', 'Maria Clara', 'Oversized Shirt', 'Sale'],
        recommendedVariantSizes: ['s', 'm', 'l', 'xl', 'xxl', 'xxxl'],
        imageGuidance: 'Use square or 4:5 product photos with clear alt text.'
      }
    });
  } catch (error) {
    return next(error);
  }
});
```

**3e.** In `apps/api/src/routes/storeSettings.js`, add to the public payload after `infoPages`:

```js
        inventory: settings.inventory,
```

- [ ] **Step 4: Run the tests**

Run: `DATABASE_URL= node --test apps/api/test/adminSettings.test.js`
Expected: PASS (7 tests).

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: all green (default threshold stays 12, so existing fixtures hold).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.js apps/api/src/routes/storeSettings.js apps/api/test/adminSettings.test.js
git commit -m "Drive low stock computations from inventory settings"
```

---

### Task 4: Storefront uses the threshold

**Files:**
- Modify: `apps/web/src/lib/storeSettings.js`
- Modify: `apps/web/src/components/ProductCard.jsx`
- Modify: `apps/web/src/pages/Product.jsx`
- Test: `apps/web/test/storefrontSettingsSource.test.js` (append)

- [ ] **Step 1: Write the failing source test** — append:

```js
test('storefront uses the low stock threshold from settings', async () => {
  const lib = await readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8');
  assert.match(lib, /export function useStorefrontSettings/);
  assert.match(lib, /lowStockThreshold: 12/);

  const card = await readFile(path.join(root, 'components', 'ProductCard.jsx'), 'utf8');
  assert.match(card, /useStorefrontSettings/);
  assert.match(card, /settings\.inventory\.lowStockThreshold/);
  assert.doesNotMatch(card, /<= 12/);

  const productPage = await readFile(path.join(root, 'pages', 'Product.jsx'), 'utf8');
  assert.match(productPage, /useStorefrontSettings/);
  assert.match(productPage, /settings\.inventory\.lowStockThreshold/);
  assert.doesNotMatch(productPage, /<= 12/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/test/storefrontSettingsSource.test.js`
Expected: new test FAILS.

- [ ] **Step 3: Implement**

**3a.** `apps/web/src/lib/storeSettings.js` — add at the very top of the file:

```js
import { useEffect, useState } from 'react';
```

Add to `DEFAULT_STOREFRONT_SETTINGS` (after `infoPages: DEFAULT_INFO_PAGES`):

```js
  infoPages: DEFAULT_INFO_PAGES,
  inventory: { lowStockThreshold: 12 }
```

Add at the end of the file:

```js
export function useStorefrontSettings() {
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);

  useEffect(() => {
    let active = true;
    loadStorefrontSettings().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return settings;
}
```

**3b.** `apps/web/src/components/ProductCard.jsx`:

```js
import { useStorefrontSettings } from '../lib/storeSettings.js';
```

Inside the component, add `const settings = useStorefrontSettings();` (first line of the body) and change the `limited` line to:

```js
  const limited = !soldOut && stock > 0 && stock <= settings.inventory.lowStockThreshold;
```

**3c.** `apps/web/src/pages/Product.jsx`:

```js
import { useStorefrontSettings } from '../lib/storeSettings.js';
```

Inside the component, add `const settings = useStorefrontSettings();` (next to the other hooks) and change the limited-note condition (~line 192) to:

```jsx
            {variant && Number(variant.stockQuantity) > 0 && Number(variant.stockQuantity) <= settings.inventory.lowStockThreshold && (
```

- [ ] **Step 4: Run tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/storeSettings.js apps/web/src/components/ProductCard.jsx apps/web/src/pages/Product.jsx apps/web/test/storefrontSettingsSource.test.js
git commit -m "Use settings low stock threshold for limited badges"
```

---

### Task 5: Inventory card on Settings

**Files:**
- Modify: `apps/web/src/admin/Settings.jsx`
- Test: `apps/web/test/adminSettingsSource.test.js` (append)

- [ ] **Step 1: Write the failing source test** — append:

```js
test('settings page includes the inventory card', async () => {
  const source = await readFile(settingsPath, 'utf8');

  assert.match(source, /\/api\/admin\/settings\/inventory/);
  assert.match(source, /Low stock threshold/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/test/adminSettingsSource.test.js`
Expected: new test FAILS.

- [ ] **Step 3: Implement** — in `apps/web/src/admin/Settings.jsx`, add before `function SeoCard`:

```jsx
function InventoryCard({ initial }) {
  const [threshold, setThreshold] = useState(String(initial.lowStockThreshold));
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/inventory', { lowStockThreshold: Number(threshold) });
      setThreshold(String(body.settings.inventory.lowStockThreshold));
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Inventory" hint="Stock thresholds used across the store.">
      <div className="mt-4">
        <Field label="Low stock threshold">
          <input className="field mt-1 max-w-32" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-clay">
          Products at or below this stock count show "Limited pieces" on the storefront and count as low stock in the admin.
        </p>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save inventory settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}
```

Render it in `Settings()` between `<PaymentsCard …/>` and `<SeoCard …/>`:

```jsx
        <InventoryCard initial={settings.inventory} />
```

- [ ] **Step 4: Run tests + build**

Run: `node --test apps/web/test/*.test.js && npm run build:web`
Expected: all pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/Settings.jsx apps/web/test/adminSettingsSource.test.js
git commit -m "Add inventory card to admin settings"
```

---

### Task 6: Contract + README

**Files:**
- Modify: `apps/api/data/admin-contracts/settings.json`
- Modify: `apps/api/src/settings/README.md`

- [ ] **Step 1: Update the contract** — in `apps/api/data/admin-contracts/settings.json`: add `"lowStockThreshold"` to `managedFields` (after `"maintenanceMode"`), and replace `futureAdminActions` with:

```json
  "futureAdminActions": [
    "configure notifications",
    "edit message templates",
    "configure checkout settings",
    "configure export settings"
  ]
```

- [ ] **Step 2: Update the README** — in `apps/api/src/settings/README.md`: change the section list to
`(`general`, `shipping`, `payments`, `website`, `inventory` sections — …)`, add a bullet
`- The \`inventory\` section's low-stock threshold drives the storefront "Limited pieces" badges, the admin low-stock counts/filters, and \`GET /api/admin/products/settings\`.`,
and update the closing line to `Future phases: notifications, message templates, checkout/export settings (see \`docs/enhancementdata.md\`).`

- [ ] **Step 3: Verify + commit**

Run: `DATABASE_URL= node --test apps/api/test/adminReadiness.test.js`
Expected: PASS.

```bash
git add apps/api/data/admin-contracts/settings.json apps/api/src/settings/README.md
git commit -m "Update settings contract and docs for inventory section"
```

---

### Task 7: Full verification

**Files:** none

- [ ] **Step 1: Full suites + build**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test` → all pass.
Run: `node --test apps/web/test/*.test.js && npm run build:web` → all pass, build succeeds.

- [ ] **Step 2: Live smoke test** — start the API with temp `STORE_SETTINGS_FILE`/`ADMIN_CREDENTIALS_FILE`/`ORDERS_DATA_FILE`, then:

- `PUT /api/admin/settings/inventory` `{ "lowStockThreshold": 999 }` → 200.
- `GET /api/admin/products` → `summary.lowStock + summary.soldOut === summary.total`.
- `GET /api/storefront-settings` → `settings.inventory.lowStockThreshold === 999`.

- [ ] **Step 3: Hand off** per `superpowers:finishing-a-development-branch` (merge to `main` + push, rebuild and commit `apps/web/dist` on main, rebuild the Docker stack).
