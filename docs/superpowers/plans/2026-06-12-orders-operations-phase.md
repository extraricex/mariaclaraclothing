# Orders Operations Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the React admin Orders page with date filtering, operational summaries, a richer table, and filtered/selected J&T export behavior.

**Architecture:** Keep the existing React admin and Express admin API. Add server-side date filters to `/api/admin/orders`, then have the Orders UI send date/status/search params and export selected rows or currently filtered J&T-ready rows by order number. Drafts and Abandoned Checkout remain disabled sidebar items because their data models do not exist yet.

**Tech Stack:** React 18, React Router, Express, Node test runner, existing `adminJson`/`adminDownload` helpers.

---

### Task 1: Admin Orders API Date Filtering

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Test: `apps/api/test/adminOrders.test.js`

- [ ] Add `dateRange`, `dateFrom`, and `dateTo` query handling to `GET /api/admin/orders`.
- [ ] Filter by `placedAt` for `today`, `yesterday`, `last_7_days`, `last_30_days`, and custom ISO date boundaries.
- [ ] Add tests that create orders on different `placedAt` dates and assert the API returns only matching summaries.
- [ ] Run `node --test apps/api/test/adminOrders.test.js`.

### Task 2: React Orders Source Coverage

**Files:**
- Modify: `apps/web/test/adminOrdersSource.test.js`
- Modify: `apps/web/src/admin/Orders.jsx`

- [ ] Add source assertions for date range controls, summary card labels, filtered export payload generation, item/shipping/payment columns, and status label helpers.
- [ ] Run `node --test apps/web/test/adminOrdersSource.test.js` and confirm it fails before implementation.

### Task 3: React Orders UI

**Files:**
- Modify: `apps/web/src/admin/Orders.jsx`

- [ ] Add date range state and controls.
- [ ] Send `dateRange`, `dateFrom`, and `dateTo` query params to `/api/admin/orders`.
- [ ] Add summary cards for total filtered orders, COD confirmation, J&T ready, total sales, item quantity, and delivered/fulfilled orders.
- [ ] Expand the table with payment, fulfillment, shipping, item count, and J&T status.
- [ ] Change export behavior: selected orders win; otherwise export all currently filtered rows with `jntExportStatus === 'ready'`.
- [ ] Run `node --test apps/web/test/*.test.js`.
- [ ] Run `npm run build:web`.

### Task 4: Docker Runtime

**Files:**
- Generated: `apps/web/dist/*`

- [ ] Rebuild and restart Docker web service with `docker compose up --build -d web`.
- [ ] Verify `http://localhost:8081/admin` returns HTTP 200.
- [ ] Run final `node --test apps/web/test/*.test.js`, `node --test apps/api/test/adminOrders.test.js`, and `npm run build:web`.
