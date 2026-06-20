# Inventory Deduction on Order Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically deduct variant stock when an order is created so the store cannot oversell, in both JSON and PostgreSQL modes.

**Architecture:** Add a dual-mode `deductVariantStock(items)` to `catalogRepository.js` (Postgres: one transaction of guarded conditional `UPDATE`s; JSON: verify-all-then-subtract-and-write). Call it in `POST /api/orders` as the authoritative gate before `saveOrder`. Isolate product state in every order-creating test so deduction never mutates the committed `data/products.json`.

**Tech Stack:** Node.js (CommonJS), Express 4, `pg` via `src/db/postgres.js`, `node:test`.

Spec: `docs/superpowers/specs/2026-06-14-inventory-deduction-design.md`

**Working directory for all commands:** `apps/api/`.
**Always run tests with:** `DATABASE_URL= ADMIN_TOKEN= npm test` (forces JSON mode + default token).

Deduction item shape used throughout: `{ slug, size, quantity, productName }`.

---

### Task 1: `deductVariantStock` repository function

**Files:**
- Modify: `apps/api/src/products/catalogRepository.js`
- Create: `apps/api/test/inventoryDeduction.test.js`
- Modify: `apps/api/test/postgresPersistence.test.js`

- [ ] **Step 1: Write the failing repo tests**

Create `apps/api/test/inventoryDeduction.test.js`:

```js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const nodeOs = require('node:os');
const nodePath = require('node:path');

// Isolate the catalog so deduction never touches the committed data/products.json.
const REAL_PRODUCTS = nodePath.join(__dirname, '..', 'data', 'products.json');
process.env.PRODUCTS_DATA_FILE = nodePath.join(
  nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'mc-inv-')),
  'products.json'
);

const { loadEditableProducts, deductVariantStock } = require('../src/products/catalogRepository');

beforeEach(() => {
  nodeFs.copyFileSync(REAL_PRODUCTS, process.env.PRODUCTS_DATA_FILE);
});

function pickInStock(products) {
  for (const product of products) {
    for (const variant of product.variants) {
      if (Number(variant.stockQuantity) > 0) {
        return { slug: product.slug, size: variant.size, name: product.name, stock: Number(variant.stockQuantity) };
      }
    }
  }
  throw new Error('No in-stock variant in fixture');
}

function variantOf(products, slug, size) {
  return products.find((p) => p.slug === slug).variants.find((v) => v.size === size);
}

test('deductVariantStock reduces the ordered variant stock', async () => {
  const target = pickInStock(loadEditableProducts());
  await deductVariantStock([{ slug: target.slug, size: target.size, quantity: 1, productName: target.name }]);
  const after = variantOf(loadEditableProducts(), target.slug, target.size);
  assert.equal(Number(after.stockQuantity), target.stock - 1);
});

test('deductVariantStock blocks oversell and leaves stock unchanged', async () => {
  const target = pickInStock(loadEditableProducts());
  await assert.rejects(
    async () => deductVariantStock([{ slug: target.slug, size: target.size, quantity: target.stock + 1, productName: target.name }]),
    (err) => err.status === 409 && err.message === `${target.size} is sold out for ${target.name}`
  );
  const after = variantOf(loadEditableProducts(), target.slug, target.size);
  assert.equal(Number(after.stockQuantity), target.stock);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/inventoryDeduction.test.js`
Expected: FAIL — `deductVariantStock is not a function` (not yet exported).

- [ ] **Step 3: Implement `deductVariantStock` in `catalogRepository.js`**

In `apps/api/src/products/catalogRepository.js`, add these functions immediately after the
`writeEditableProducts` function (around line 126):

```js
function deductionSoldOutError(item) {
  const error = new Error(`${item.size} is sold out for ${item.productName || item.slug}`);
  error.status = 409;
  return error;
}

function deductVariantStock(items) {
  const deductions = (Array.isArray(items) ? items : []).map((item) => ({
    slug: String(item.slug || '').trim(),
    size: String(item.size || '').trim(),
    quantity: Number(item.quantity),
    productName: String(item.productName || '').trim()
  }));

  if (usePostgresProducts()) {
    return deductPostgresVariantStock(deductions);
  }
  return deductJsonVariantStock(deductions);
}

function deductJsonVariantStock(items) {
  const products = loadEditableProducts();
  const targets = items.map((item) => {
    const product = products.find((candidate) => candidate.slug === item.slug);
    const variant = product?.variants.find((candidate) => candidate.size === item.size);
    if (!variant || Number(variant.stockQuantity) < item.quantity) {
      throw deductionSoldOutError(item);
    }
    return variant;
  });
  targets.forEach((variant, index) => {
    variant.stockQuantity = Number(variant.stockQuantity) - items[index].quantity;
  });
  writeEditableProducts(products);
}

function deductPostgresVariantStock(items) {
  return transaction(async (client) => {
    for (const item of items) {
      const result = await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity - $1
          WHERE product_slug = $2 AND size = $3 AND stock_quantity >= $1`,
        [item.quantity, item.slug, item.size]
      );
      if (result.rowCount === 0) {
        throw deductionSoldOutError(item);
      }
    }
  });
}
```

Then add `deductVariantStock,` to the `module.exports` object (keep it alphabetical-ish, e.g. right after `deleteEditableProduct,`):

```js
module.exports = {
  catalogProducts,
  editableProducts,
  deductVariantStock,
  deleteEditableProduct,
  findCatalogProductBySlug,
  findEditableProductBySlug,
  listCatalogProducts,
  listEditableProducts,
  loadEditableProducts,
  normalizeEditableProduct,
  productsPath,
  replaceEditableProducts,
  saveEditableProduct,
  validateProducts
};
```

- [ ] **Step 4: Run the repo tests to verify they pass**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/inventoryDeduction.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the Postgres wiring assertion**

In `apps/api/test/postgresPersistence.test.js`, the `productRepository` source is already read.
Add these assertions next to the existing `assert.match(productRepository, /usePostgresProducts/);`:

```js
  assert.match(productRepository, /stock_quantity = stock_quantity - \$1/);
  assert.match(productRepository, /stock_quantity >= \$1/);
```

- [ ] **Step 6: Run the persistence test**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/postgresPersistence.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/products/catalogRepository.js apps/api/test/inventoryDeduction.test.js apps/api/test/postgresPersistence.test.js
git commit -m "Add atomic variant stock deduction to catalog repository"
```

---

### Task 2: Isolate product state in order-creating tests

**Files (modify each):**
- `apps/api/test/checkoutPaymentMethods.test.js`
- `apps/api/test/health.test.js`
- `apps/api/test/adminOrders.test.js`
- `apps/api/test/adminCartSessions.test.js`
- `apps/api/test/adminCustomersDiscounts.test.js`
- `apps/api/test/customerAccounts.test.js`
- `apps/api/test/maintenanceMode.test.js`

These seven files POST successful orders. Once Task 3 wires deduction into the route, a
non-isolated run would mutate the committed `data/products.json` and race other test
processes. This task pre-positions isolation (no behavior change yet, so the suite stays
green).

- [ ] **Step 1: Add the isolation block to each file**

At the **very top** of each file listed above — after its existing `require(...)` lines for
`node:fs`/`node:os`/`node:path` but **before any `require('../src/...')`** — insert this
block verbatim (uses uniquely-named bindings so it never clashes with the file's existing
`fs`/`os`/`path`, including files that import `node:fs/promises` as `fs`):

```js
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
```

Placement detail: it must run before the file (or its `createFreshApp`/`createApp`) first
requires `../src/app` or `../src/products/...`, so every catalog read and the deduction use
the temp copy. Putting it immediately below the file's last `node:`-builtin `require` line
satisfies this in all seven files (their `../src` requires come after, and any
`createFreshApp` requires lazily at call time).

- [ ] **Step 2: Run the full suite to confirm no regression**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: PASS — same count as before this task (behavior unchanged; tests now read an
identical temp copy of the catalog). Also confirm the committed fixture is untouched:

Run: `git -C ../.. status --porcelain apps/api/data/products.json` (from `apps/api`, this is
`git status --porcelain data/products.json`)
Expected: empty output (no modification to `data/products.json`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/checkoutPaymentMethods.test.js apps/api/test/health.test.js apps/api/test/adminOrders.test.js apps/api/test/adminCartSessions.test.js apps/api/test/adminCustomersDiscounts.test.js apps/api/test/customerAccounts.test.js apps/api/test/maintenanceMode.test.js
git commit -m "Isolate products fixture in order-creating tests"
```

---

### Task 3: Deduct stock in the order-creation route

**Files:**
- Modify: `apps/api/src/routes/orders.js`
- Modify: `apps/api/test/inventoryDeduction.test.js` (append API-level tests)

- [ ] **Step 1: Write the failing API tests**

Append to `apps/api/test/inventoryDeduction.test.js`:

```js
const ORDERS_DIR_BASE = nodePath.join(nodeOs.tmpdir(), 'mc-inv-orders-');

function checkoutBody(item) {
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
    paymentMethod: 'cash_on_delivery'
  };
}

async function startServer() {
  process.env.ORDERS_DATA_FILE = nodePath.join(nodeFs.mkdtempSync(ORDERS_DIR_BASE), 'orders.json');
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/orders')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  const app = require('../src/app').createApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return server;
}

async function firstInStock(port) {
  const { products } = await (await fetch(`http://127.0.0.1:${port}/api/products`)).json();
  for (const product of products) {
    const variant = (product.variants || []).find((v) => Number(v.stockQuantity) > 0);
    if (variant) {
      return {
        item: {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          quantity: 1,
          unitPriceCents: variant.priceCents ?? product.priceCents
        },
        slug: product.slug,
        size: variant.size,
        stock: Number(variant.stockQuantity)
      };
    }
  }
  throw new Error('No in-stock product');
}

test('creating an order deducts the ordered variant stock', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const picked = await firstInStock(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutBody(picked.item))
    });
    assert.equal(response.status, 201);
    const after = variantOf(loadEditableProducts(), picked.slug, picked.size);
    assert.equal(Number(after.stockQuantity), picked.stock - 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('ordering more than available stock is rejected and stock is unchanged', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const picked = await firstInStock(port);
    const oversized = { ...picked.item, quantity: picked.stock + 1 };
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutBody(oversized))
    });
    assert.equal(response.status, 400);
    const after = variantOf(loadEditableProducts(), picked.slug, picked.size);
    assert.equal(Number(after.stockQuantity), picked.stock);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
```

Note: the oversell case returns 400 here because `normalizeCheckoutItem`'s existing
read-only pre-check rejects it first (`<Size> is sold out for <Name>`, status 400). The
guarded 409 deduction path is the race-only backstop and is exercised by the Task 4
Postgres smoke test; this API test asserts the user-visible behavior (rejected + stock
unchanged).

- [ ] **Step 2: Run the API tests to verify the deduction test fails**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/inventoryDeduction.test.js`
Expected: FAIL — "creating an order deducts the ordered variant stock" fails (stock still
equals `picked.stock`, because the route does not deduct yet). The oversell test passes
already (pre-check).

- [ ] **Step 3: Wire deduction into the route**

In `apps/api/src/routes/orders.js`, add the import after line 3:

```js
const { deductVariantStock } = require('../products/catalogRepository');
```

Then, in the `POST /` handler, insert the deduction immediately before `await saveOrder(persistedOrder);`:

```js
    await deductVariantStock(order.items.map((item) => ({
      slug: String(item.productId).replace(/^catalog-/, ''),
      size: item.size,
      quantity: item.quantity,
      productName: item.productName
    })));
    await saveOrder(persistedOrder);
```

- [ ] **Step 4: Run the API tests to verify they pass**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/inventoryDeduction.test.js`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/orders.js apps/api/test/inventoryDeduction.test.js
git commit -m "Deduct variant stock when an order is created"
```

---

### Task 4: Full-suite + real-Postgres verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full api suite**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: PASS — all suites green, and `git status --porcelain data/products.json` is empty
(committed fixture untouched).

- [ ] **Step 2: Real-Postgres smoke test (atomic guard under concurrency)**

Start an ephemeral Postgres, migrate, then verify two concurrent deductions of the last
unit let exactly one succeed. Run from `apps/api`:

```bash
docker rm -f mc-inv-pg >/dev/null 2>&1
docker run -d --name mc-inv-pg -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke -p 55433:5432 postgres:16 >/dev/null
for i in $(seq 1 30); do docker exec mc-inv-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
DATABASE_URL="postgres://postgres:smoke@localhost:55433/smoke" node -e '
const { query, transaction, closePool } = require("./src/db/postgres");
const repo = require("./src/products/catalogRepository");
(async () => {
  await query(`CREATE TABLE IF NOT EXISTS product_variants (id bigserial PRIMARY KEY, product_slug text NOT NULL, size text NOT NULL, sku text NOT NULL DEFAULT '"'"''"'"', price_cents integer, stock_quantity integer NOT NULL DEFAULT 0, external_pos_variant_id text NOT NULL DEFAULT '"'"''"'"')`);
  await query("DELETE FROM product_variants WHERE product_slug = $1", ["smoke-tee"]);
  await query("INSERT INTO product_variants (product_slug, size, sku, stock_quantity) VALUES ($1,$2,$3,$4)", ["smoke-tee","Small","SMOKE-S",1]);
  const item = [{ slug: "smoke-tee", size: "Small", quantity: 1, productName: "Smoke Tee" }];
  const results = await Promise.allSettled([repo.deductVariantStock(item), repo.deductVariantStock(item)]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  const left = (await query("SELECT stock_quantity FROM product_variants WHERE product_slug=$1", ["smoke-tee"])).rows[0].stock_quantity;
  console.log("fulfilled=", ok, "rejected=", failed, "stock_left=", left);
  if (ok !== 1 || failed !== 1 || Number(left) !== 0) { console.error("SMOKE FAILED"); process.exit(1); }
  console.log("SMOKE PASSED");
})().catch((e) => { console.error(e); process.exit(1); }).finally(() => closePool());
'
docker rm -f mc-inv-pg >/dev/null 2>&1
```

Expected: `fulfilled= 1 rejected= 1 stock_left= 0` then `SMOKE PASSED`, and the container is
removed. (One of the two concurrent deductions wins; the guard blocks the other; no
oversell.)

- [ ] **Step 3: Final commit (if any verification fixes were needed)**

If Step 1 or 2 surfaced a fix, commit it; otherwise nothing to commit.

---

## Self-Review

**Spec coverage:**
- Atomic guarded decrement (PG) → Task 1 Step 3 `deductPostgresVariantStock`. ✓
- JSON verify-all-then-subtract-and-write → Task 1 Step 3 `deductJsonVariantStock`. ✓
- 409 + reused "<Size> is sold out for <Name>" copy → `deductionSoldOutError`. ✓
- Deduct as gate before `saveOrder` → Task 3 Step 3. ✓
- Deduct by slug+size, productName for message → item shape `{slug,size,quantity,productName}`. ✓
- No schema / no admin.js change → none in any task. ✓
- Test isolation for all seven order-creating files → Task 2. ✓
- New behavior tests (deduct, oversell-blocked) → Task 1 + Task 3. ✓
- PG wiring assertion → Task 1 Step 5. ✓
- Real-Postgres concurrency smoke → Task 4 Step 2. ✓
- Restock-on-cancel / ledger out of scope → not present. ✓

**Placeholder scan:** No TBD/TODO/"handle errors". Every code step shows complete code. ✓

**Type/name consistency:** `deductVariantStock`, `deductJsonVariantStock`,
`deductPostgresVariantStock`, `deductionSoldOutError`, `loadEditableProducts`,
`writeEditableProducts`, `usePostgresProducts`, `transaction` all defined/used consistently.
Item shape `{ slug, size, quantity, productName }` identical in repo, route, and tests. ✓
