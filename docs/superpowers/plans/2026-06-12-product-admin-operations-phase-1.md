# Product Admin Operations Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the admin Product section with a Products dropdown, richer product list filters/sort, and editor controls for organization, publishing metadata, variant pricing, and total inventory.

**Architecture:** Keep the existing React admin and Express admin product APIs. Extend the existing product list query params already supported by the API, expose existing product fields in the editor, and add lightweight source/API tests around the first phase behavior. Do not implement automatic order-based inventory deduction in this phase.

**Tech Stack:** React, React Router, Express, Node test runner, JSON/PostgreSQL product repository.

---

### Task 1: Product Sidebar Dropdown

**Files:**
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Modify: `apps/web/test/adminNavigationSource.test.js`

- [ ] Add failing source assertions for a Products dropdown with Products, Collections, and Inventory links.
- [ ] Run `node --test apps/web/test/adminNavigationSource.test.js` and verify it fails.
- [ ] Add a `PRODUCT_SUBNAV` list and a collapsed-by-default Products dropdown in the desktop sidebar.
- [ ] Run `node --test apps/web/test/adminNavigationSource.test.js` and verify it passes.

### Task 2: Product List Filters And Sort

**Files:**
- Modify: `apps/web/src/admin/Products.jsx`
- Create: `apps/web/test/adminProductsSource.test.js`
- Modify: `apps/api/test/adminProducts.test.js`

- [ ] Add failing source assertions for collection/category/vendor filters and sort controls in `Products.jsx`.
- [ ] Add failing API assertions that `/api/admin/products` supports category and vendor filters.
- [ ] Run focused tests and verify they fail for the missing UI/API behavior.
- [ ] Add `collection`, `category`, `vendor`, and `sort` state/query params in the Products page.
- [ ] Extend `/api/admin/products` filtering to include category and vendor.
- [ ] Run focused tests and verify they pass.

### Task 3: Product Editor Organization And Variant Pricing

**Files:**
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/test/adminProductsSource.test.js`

- [ ] Add failing source assertions for category, product type, vendor, tags, theme template, variant price, and total inventory display.
- [ ] Run the focused web source test and verify it fails.
- [ ] Add editor fields for existing product organization data.
- [ ] Add per-variant price input using existing `variant.priceCents` API support.
- [ ] Add computed total inventory display.
- [ ] Run focused tests and verify they pass.

### Task 4: Roadmap And Verification

**Files:**
- Modify: `docs/enhancementdata.md`

- [ ] Mark Product Admin Operations Phase 1 as finished in the Finished Work Log.
- [ ] Run `node --test apps/web/test/*.test.js`.
- [ ] Run `node --test apps/api/test/adminProducts.test.js`.
- [ ] Run `npm run build:web`.
- [ ] Rebuild Docker with `docker compose up --build -d web`.
- [ ] Confirm `http://localhost:8081/admin` returns 200.

