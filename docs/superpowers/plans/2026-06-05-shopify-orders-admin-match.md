# Shopify Orders Admin Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the visible Shopify Orders admin page structure on Maria Clara's existing admin Orders page.

**Architecture:** Keep the current admin app, API endpoints, and order detail behavior. Modify `public/admin.html` for Shopify-like navigation/actions, `public/js/admin.js` for the table and metrics markup, `public/styles.css` for the visual match, and `test/adminOrders.test.js` for focused structural assertions.

**Tech Stack:** Express static HTML, vanilla JavaScript, Bootstrap base CSS, custom CSS, Node test runner.

---

### Task 1: Lock The Target With Tests

**Files:**
- Modify: `test/adminOrders.test.js`

- [ ] Add assertions for Shopify-like Orders sidebar secondary links, action buttons, metric strip, table controls, dense table columns, and pagination footer.
- [ ] Run `node --test test/adminOrders.test.js` and confirm the new assertions fail before implementation.

### Task 2: Update Orders Shell

**Files:**
- Modify: `public/admin.html`

- [ ] Add Orders count badge and secondary nav links for Drafts and Abandoned checkouts.
- [ ] Replace the old Orders header copy with Shopify-style actions: `Export`, `More actions`, and `Create order`.
- [ ] Add a Shopify-style metric strip container and table toolbar controls while preserving existing filter `data-*` hooks.

### Task 3: Update Orders Rendering

**Files:**
- Modify: `public/js/admin.js`

- [ ] Render the metric strip from existing order data.
- [ ] Render table columns matching the Shopify reference: checkbox, Order, Date, Customer, Fulfill by, Channel, Total, Payment status, Fulfillment status, Items, Delivery status, Delivery method.
- [ ] Keep row click/key behavior and order detail loading.

### Task 4: Match Visual Treatment

**Files:**
- Modify: `public/styles.css`

- [ ] Tune the admin shell, sidebar, topbar, Orders metric strip, filters, table density, badges, horizontal scroll, and footer pagination.
- [ ] Preserve responsive behavior on smaller screens.

### Task 5: Verify

**Commands:**
- `node --test test/adminOrders.test.js test/adminProducts.test.js`
- `npm test`
- Playwright screenshot capture for `http://127.0.0.1:3113/admin.html#orders` at desktop and mobile widths.

