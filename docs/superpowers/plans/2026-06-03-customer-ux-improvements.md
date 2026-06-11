# Customer UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved customer UX audit recommendations for product confidence, checkout clarity, support visibility, order confirmation, search usefulness, and basic funnel analytics.

**Architecture:** Keep the existing static/Express storefront architecture. Frontend behavior remains in `public/js/*.js`, server order behavior remains in `src/routes/orders.js`, and tests stay in the existing Node test files.

**Tech Stack:** Vanilla HTML/CSS/JS, Express, Node test runner.

---

### Task 1: Product Confidence Improvements

**Files:**
- Modify: `public/js/storefront.js`
- Modify: `public/styles.css`
- Test: `test/frontendBehavior.test.js`

- [ ] Add tests for a size-guide anchor/helper, fit/material/care details, selected-size limited-stock text, and delivery estimate copy.
- [ ] Update product rendering to show the helper and detail rows near size selection.
- [ ] Update limited-stock label from `Limited pieces` to `Limited pieces in {size}`.
- [ ] Add styles for the helper/detail rows.
- [ ] Run `npm test -- test/frontendBehavior.test.js`.

### Task 2: Checkout Clarity And Support

**Files:**
- Modify: `public/checkout.html`
- Modify: `public/js/checkout.js`
- Modify: `public/styles.css`
- Test: `test/frontendBehavior.test.js`

- [ ] Add tests that discount UI is removed, contact label is mobile-first, COD reassurance is visible, delivery estimate updates from address, and support contact exists.
- [ ] Remove inactive discount-code row.
- [ ] Add checkout help copy for mobile number, COD, delivery timing, and customer support.
- [ ] Update checkout summary behavior to render an estimated delivery window after address completion.
- [ ] Run `npm test -- test/frontendBehavior.test.js`.

### Task 3: Search And Navigation Improvements

**Files:**
- Modify: `public/js/shell.js`
- Modify: `public/index.html`
- Modify: `public/product.html`
- Modify: `public/cart.html`
- Modify: `public/checkout.html`
- Modify: `public/thank-you.html`
- Test: `test/pageShell.test.js`

- [ ] Add tests for consistent `Shipping & Returns` drawer label and broader search matching.
- [ ] Search product name, description, collection, and available sizes.
- [ ] Show available sizes in search results.
- [ ] Improve empty search guidance.
- [ ] Rename mobile drawer `SHIPPING` to `SHIPPING & RETURNS`.
- [ ] Run `npm test -- test/pageShell.test.js`.

### Task 4: Backend Order Confirmation Lookup

**Files:**
- Modify: `src/routes/orders.js`
- Modify: `public/js/api.js`
- Modify: `public/js/thank-you.js`
- Test: `test/health.test.js`
- Test: `test/frontendBehavior.test.js`

- [ ] Add tests for `GET /api/orders/:orderNumber`.
- [ ] Store demo orders in memory after `POST /api/orders`.
- [ ] Return order details by order number.
- [ ] Update thank-you page to fetch by `?order=` and fall back to session storage.
- [ ] Redirect checkout to `/thank-you.html?order={orderNumber}`.
- [ ] Run server and frontend focused tests.

### Task 5: Analytics Hooks

**Files:**
- Modify: `public/js/shell.js`
- Modify: `public/js/storefront.js`
- Modify: `public/js/cart.js`
- Modify: `public/js/checkout.js`
- Test: `test/frontendBehavior.test.js`

- [ ] Add a lightweight `trackStorefrontEvent` helper that pushes to `window.dataLayer`.
- [ ] Track product view, size select, add to cart, cart checkout click, checkout address completion, and order placed.
- [ ] Add tests for the event names in relevant JS files.
- [ ] Run `npm test -- test/frontendBehavior.test.js`.

### Task 6: Full Verification

**Files:**
- Verify all modified files.

- [ ] Run `node --check public/js/storefront.js`.
- [ ] Run `node --check public/js/shell.js`.
- [ ] Run `node --check public/js/cart.js`.
- [ ] Run `node --check public/js/checkout.js`.
- [ ] Run `node --check public/js/thank-you.js`.
- [ ] Run `npm test`.
- [ ] Check key pages with `curl -I` on the local server.
