# Phase 3 Cart Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a customer cart drawer after add-to-cart and show backend quote totals in the drawer.

**Architecture:** `apps/web/src/lib/cart.js` exposes a cart drawer event helper. `Product.jsx` calls that helper after `addToCart()`. `Shell.jsx` listens for the event, owns drawer state, renders cart items, and calls `quoteCart()` so drawer totals match cart and checkout.

**Tech Stack:** React 18, React Router, existing localStorage cart helper, existing backend quote API, Node source tests.

---

### Task 1: Cart Drawer Event Contract

**Files:**
- Modify: `apps/web/src/lib/cart.js`
- Test: `apps/web/test/phase3CartDrawerSource.test.js`

- [x] Add a source test requiring `CART_DRAWER_EVENT` and `openCartDrawer()`.
- [x] Run the test and verify it fails before implementation.
- [x] Export `CART_DRAWER_EVENT` and `openCartDrawer()` from `cart.js`.
- [x] Run the test and verify it passes.

### Task 2: Product Add-To-Cart Opens Drawer

**Files:**
- Modify: `apps/web/src/pages/Product.jsx`
- Test: `apps/web/test/phase3CartDrawerSource.test.js`

- [x] Add a source test requiring `openCartDrawer` import and call after `addToCart()`.
- [x] Run the test and verify it fails before implementation.
- [x] Call `openCartDrawer()` after successful product add-to-cart.
- [x] Run the test and verify it passes.

### Task 3: Shell Cart Drawer UI

**Files:**
- Modify: `apps/web/src/components/Shell.jsx`
- Test: `apps/web/test/phase3CartDrawerSource.test.js`

- [x] Add a source test requiring Shell to listen for `CART_DRAWER_EVENT`, use `quoteCart`, render drawer labels, quantity controls, remove actions, totals, and cart/checkout links.
- [x] Run the test and verify it fails before implementation.
- [x] Add drawer state, event listener, quote refresh, overlay, item list, quantity/remove actions, and totals.
- [x] Run the test and verify it passes.

### Task 4: Roadmap And Docker Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] Mark Phase 3 finished only after focused tests and build pass.
- [x] Run focused web tests, `npm run build:web`, and `git diff --check`.
- [x] Run `docker compose up --build -d`.
- [x] Verify `docker compose ps`, `http://127.0.0.1:8081`, and `/api/health`.
