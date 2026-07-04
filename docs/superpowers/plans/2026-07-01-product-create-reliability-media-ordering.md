# Product Creation Reliability and Media Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new products reliably appear in the admin and customer storefront while supporting batch photo selection and deterministic photo ordering.

**Architecture:** Add pure validation and reorder helpers to the existing media module, render queued photos through a focused sortable component, and keep submission ownership in `ProductEditor`. Existing multipart API ordering remains authoritative: queued file order becomes image `sortOrder`.

**Tech Stack:** React 18, browser drag/drop and `FormData`, Node test runner, Playwright, Vite, Docker Compose.

**Git constraint:** The user explicitly prohibited Git operations. No staging, commits, stashes, restores, branch inspection, or integration commands are part of this execution.

---

### Task 1: Pure Validation and Ordering

**Files:**
- Modify: `apps/web/test/newProductMedia.test.js`
- Modify: `apps/web/src/admin/newProductMedia.js`

- [ ] Add failing unit tests for `moveQueuedProductImage`, `reorderQueuedProductImages`, and `validateNewProduct`.
- [ ] Verify RED with `node --test apps/web/test/newProductMedia.test.js`.
- [ ] Implement helpers:

```js
export function reorderQueuedProductImages(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveQueuedProductImage(items, index, destination) {
  const targets = { first: 0, left: index - 1, right: index + 1, last: items.length - 1 };
  return reorderQueuedProductImages(items, index, targets[destination]);
}

export function validateNewProduct({ product, priceCents, files }) {
  const errors = {};
  if (!String(product.name || '').trim()) errors.details = 'Enter a product title.';
  if (!Number.isInteger(priceCents) || priceCents <= 0) errors.pricing = 'Enter a price greater than zero.';
  if (!Array.isArray(product.collections) || !product.collections.length) errors.collections = 'Select at least one storefront collection.';
  if (!files.length) errors.media = 'Add at least one product photo.';
  const stock = (product.variants || []).reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
  if (product.status === 'active' && stock <= 0) errors.inventory = 'Enter inventory before publishing an active product.';
  return errors;
}
```

- [ ] Verify GREEN with the focused test.

### Task 2: Sortable Batch Media Component

**Files:**
- Create: `apps/web/src/admin/QueuedProductMedia.jsx`
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/test/adminProductsSource.test.js`
- Modify: `apps/web/e2e/new-product-media.spec.js`

- [ ] Add failing source and browser tests for two files in one selection, two previews, batch drop guidance, drag reordering, Move first/left/right/last actions, and cover-label movement.
- [ ] Verify RED against source and the current live container.
- [ ] Create `QueuedProductMedia` with these public props:

```jsx
<QueuedProductMedia
  images={queuedImages}
  error={fieldErrors.media}
  onAdd={(files) => queueNewProductImages(files)}
  onRemove={removeQueuedImage}
  onReorder={(from, to) => setQueuedImages((items) => reorderQueuedProductImages(items, from, to))}
  onMove={(index, destination) => setQueuedImages((items) => moveQueuedProductImage(items, index, destination))}
/>
```

- [ ] Implement a visible batch drop zone with `onDragOver`, `onDrop`, a hidden `multiple` image input, and guidance text “Select up to 8 photos at once”.
- [ ] Make preview figures `draggable`, store the source index in `dataTransfer`, and call `onReorder(source, target)` on drop.
- [ ] Render Storefront cover on index zero, Photo N on remaining previews, plus Move first/left/right/last and Remove photo actions with correct boundary disabling.
- [ ] Replace only the queued-new-product media markup; keep existing-product media markup and the surrounding Media section layout unchanged.
- [ ] Verify GREEN in source, unit, and browser tests.

### Task 3: Reliable Active Product Creation

**Files:**
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/test/adminProductsSource.test.js`
- Modify: `apps/web/e2e/new-product-media.spec.js`

- [ ] Add failing tests proving new products default Active, invalid fields prevent POST, Draft allows zero stock, and a valid Active product appears in admin plus customer APIs.
- [ ] Verify RED.
- [ ] Change `EMPTY_PRODUCT.status` to `active`.
- [ ] Before multipart construction, call `validateNewProduct` with `priceCents: pesoToCents(pricePeso)` and queued files; store the returned `fieldErrors`, show the first error in the existing page status area, and return before POST when errors exist.
- [ ] Render section-level error text under Details, Media, Pricing, Inventory, and Collections using `role="alert"`.
- [ ] Clear a section error when its related title, price, collection, photo queue, status, or stock field changes.
- [ ] Keep queued data after validation/API errors and clear errors only after correction or successful navigation.
- [ ] In the browser creation test, select two photos in one action, reorder the second to cover, choose New Arrivals, fill positive price and stock, save without changing status, then assert:

```js
expect(createResponse.status()).toBe(201);
expect(created.status).toBe('active');
expect(created.collections).toContain('New Arrivals');
expect(created.images[0].altText).toBe(productName);
expect(adminList.products.some((product) => product.slug === created.slug)).toBe(true);
expect(storefrontResponse.status()).toBe(200);
```

- [ ] Delete the diagnostic product in `finally` so the live catalog remains clean.
- [ ] Verify GREEN.

### Task 4: Verification and Deployment

**Files:**
- No additional production files.

- [ ] Run `npm test` and confirm the complete API suite passes.
- [ ] Run `node --test apps/web/test/*.test.js` and confirm the complete web suite passes.
- [ ] Run `npm run build:web` and confirm Vite succeeds.
- [ ] Rebuild with `docker compose build web api` and restart with `docker compose up -d web api`.
- [ ] Verify `docker compose ps`, storefront HTTP 200, and `/api/health` success.
- [ ] Run feature, cursor, accessibility, and responsive Playwright suites against Docker.
- [ ] Remove only test-generated API data artifacts and leave build artifacts in place because Git cleanup is prohibited.
