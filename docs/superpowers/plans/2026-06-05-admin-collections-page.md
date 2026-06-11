# Admin Collections Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple admin Collections page for organizing which products appear in the customer homepage's New Arrivals and Freedom of Mind sections.

**Architecture:** Reuse the existing product `collections` array as the source of truth. The admin Collections page reads all products from `/api/admin/products`, filters membership client-side for the two storefront collections, and updates membership by sending the full product record back through the existing `/api/admin/products/:slug` update endpoint. The customer storefront already filters by product collection names, so no customer page rendering changes are needed.

**Tech Stack:** Express admin routes, static admin HTML, vanilla JavaScript admin UI, Node test runner.

---

### Files

- Modify: `public/admin.html`
  - Add a `Collections` sidebar link.
  - Add a `data-admin-page="collections"` section with tabs, product picker, current collection list, and status text.
- Modify: `public/js/admin.js`
  - Add collection page state and DOM references.
  - Load products for collection management.
  - Add/remove a selected product from `New Arrivals` or `Freedom of Mind`.
  - Reuse `loadProductDetail(slug)` for full product editing.
- Modify: `public/styles.css`
  - Add compact admin collection layout styles.
- Modify: `test/adminProducts.test.js`
  - Add tests for collection page markup, JS hooks, and API membership persistence.
- Create: `docs/superpowers/plans/2026-06-05-admin-collections-page.md`

### Task 1: Admin Collections Test

- [ ] **Step 1: Write the failing test**

Add assertions in `test/adminProducts.test.js` that require:

```js
assert.match(adminHtml, /data-admin-nav-link="collections"/);
assert.match(adminHtml, /data-admin-page="collections"/);
assert.match(adminHtml, /data-admin-collection-tabs/);
assert.match(adminHtml, /data-admin-collection-products/);
assert.match(adminHtml, /data-admin-collection-add-product/);
assert.match(adminJs, /STOREFRONT_COLLECTIONS/);
assert.match(adminJs, /loadCollectionsPage/);
assert.match(adminJs, /addProductToActiveCollection/);
assert.match(adminJs, /removeProductFromActiveCollection/);
assert.match(styles, /\.admin-collections-page\s*{/);
```

Also extend the existing admin product API test to:

```js
const collectionUpdateResponse = await fetch(
  `http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`,
  jsonAdminRequest('PUT', {
    ...editedProduct,
    collections: ['Freedom of Mind']
  })
);
const collectionUpdateBody = await collectionUpdateResponse.json();
assert.equal(collectionUpdateResponse.status, 200);
assert.deepEqual(collectionUpdateBody.product.collections, ['Freedom of Mind']);

const collectionListResponse = await fetch(
  `http://127.0.0.1:${port}/api/admin/products?collection=${encodeURIComponent('Freedom of Mind')}`,
  adminRequest()
);
const collectionListBody = await collectionListResponse.json();
assert.ok(collectionListBody.products.some((product) => product.slug === 'admin-test-shirt'));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/adminProducts.test.js
```

Expected: fail because the Collections page and JS hooks do not exist.

### Task 2: Admin Page Shell

- [ ] **Step 1: Add sidebar and page markup**

In `public/admin.html`, add:

```html
<a href="#collections" data-admin-nav-link="collections">Collections</a>
```

Add a page section:

```html
<section class="admin-page-section admin-collections-page" data-admin-page="collections" hidden>
  <header class="admin-page-heading">
    <div>
      <h1>Collections</h1>
      <p>Choose which products appear in New Arrivals and Freedom of Mind on the customer homepage.</p>
    </div>
    <div class="admin-page-actions">
      <a class="btn btn-outline-secondary" href="/" target="_blank" rel="noreferrer">View store</a>
    </div>
  </header>
  <section class="admin-card card admin-collection-manager">
    <div class="admin-collection-tabs" data-admin-collection-tabs></div>
    <div class="admin-collection-toolbar">
      <label class="checkout-field">
        <span>Add product</span>
        <select data-admin-collection-add-product></select>
      </label>
      <p class="form-status" data-admin-collection-status aria-live="polite"></p>
    </div>
    <section class="admin-collection-products" data-admin-collection-products aria-label="Collection products"></section>
  </section>
</section>
```

- [ ] **Step 2: Run admin products test**

Run:

```bash
node --test test/adminProducts.test.js
```

Expected: still fails on missing JS hooks/styles.

### Task 3: Collection UI Logic

- [ ] **Step 1: Add state and render functions**

In `public/js/admin.js`, add:

```js
const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
let activeCollectionName = STOREFRONT_COLLECTIONS[0];
let collectionProducts = [];
```

Add DOM references:

```js
const collectionTabsRoot = document.querySelector('[data-admin-collection-tabs]');
const collectionProductsRoot = document.querySelector('[data-admin-collection-products]');
const collectionAddProductInput = document.querySelector('[data-admin-collection-add-product]');
const collectionStatusRoot = document.querySelector('[data-admin-collection-status]');
```

Implement `loadCollectionsPage`, `renderCollectionTabs`, `renderCollectionProducts`, `renderCollectionProductPicker`, `addProductToActiveCollection`, `removeProductFromActiveCollection`, and `saveProductCollections`.

- [ ] **Step 2: Hook navigation and input events**

Update `renderAdminPage(page)`:

```js
if (normalizedPage === 'collections') {
  loadCollectionsPage();
}
```

Add a change listener:

```js
collectionAddProductInput?.addEventListener('change', () => addProductToActiveCollection(collectionAddProductInput.value));
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test test/adminProducts.test.js
```

Expected: fails only on missing styles if logic is correct.

### Task 4: Styles

- [ ] **Step 1: Add admin collection styles**

Add responsive styles in `public/styles.css` for:

```css
.admin-collections-page { overflow-x: hidden; }
.admin-collection-manager { gap: 16px; padding: 18px; }
.admin-collection-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.admin-collection-tab { border-radius: 8px; }
.admin-collection-toolbar { display: grid; grid-template-columns: minmax(220px, 420px) 1fr; gap: 12px; align-items: end; }
.admin-collection-products { display: grid; gap: 10px; }
.admin-collection-product-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 12px; align-items: center; }
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
node --test test/adminProducts.test.js
node --check public/js/admin.js
```

Expected: pass.

### Task 5: Final Verification

- [ ] **Step 1: Run relevant admin tests**

Run:

```bash
node --test test/adminProducts.test.js test/adminOrders.test.js
node --check public/js/admin.js
```

Expected: pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: the new Collections tests pass. Existing unrelated catalog/product-name failures may remain and should be reported separately if still present.
