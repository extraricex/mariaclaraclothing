# Admin Product Page Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit product detail text, shipping text, and size chart measurements from the product editor.

**Architecture:** Store structured storefront content in `product.productPage` using `detailsText`, `shippingText`, and `sizeChart` rows. The admin editor writes those fields through the existing product save API, and the storefront product page renders the fields in its existing detail tabs.

**Tech Stack:** React admin/storefront app, Express admin product API, file/Postgres product repository, Node test runner, Vite.

---

### Task 1: Regression Tests

**Files:**
- Modify: `apps/web/test/adminProductsSource.test.js`
- Modify: `apps/api/test/adminProducts.test.js`

- [x] **Step 1: Add failing source assertions**

Assert the admin product editor exposes Product page content, Product details, Shipping, Size Chart, width, length, sleeve length, and shoulder drop length fields. Assert the storefront product page renders `productPage.sizeChart`, `detailsText`, and `shippingText`.

- [x] **Step 2: Add failing API persistence assertions**

Extend the existing admin product edit test to save `productPage.detailsText`, `productPage.shippingText`, and one `sizeChart` row, then assert the storefront API returns them.

### Task 2: Admin Editor Fields

**Files:**
- Modify: `apps/web/src/admin/ProductEditor.jsx`

- [x] **Step 1: Add product page helpers**

Add helpers to normalize and update `product.productPage`, including size chart row add/remove/update.

- [x] **Step 2: Add Product page content section**

Add editable fields for Product details, Shipping, and Size Chart measurements.

### Task 3: Storefront Rendering

**Files:**
- Modify: `apps/web/src/pages/Product.jsx`
- Modify: `apps/api/src/products/catalogRepository.js`

- [x] **Step 1: Render details/shipping text**

Use product-specific text when present, with current fallback copy preserved.

- [x] **Step 2: Render size chart table**

Render `productPage.sizeChart` rows before falling back to size chart image or default text.

- [x] **Step 3: Validate size chart rows**

Allow optional `productPage.sizeChart` rows with non-empty measurement strings.

### Task 4: Verification

- [x] **Step 1: Run focused tests**

Run admin product API/source tests.

- [x] **Step 2: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, and endpoint checks.
