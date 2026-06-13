# Order Editor Contact Address Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin order editor support editable customer contact details, separated J&T address fields, and editable ordered items with recalculated totals.

**Architecture:** Keep the current React order detail page and Express admin order PATCH endpoint. The editor sends `customer`, structured `address`, and `items`; the API validates and normalizes them, then recalculates order subtotal and total before persistence. J&T export continues to read `address.houseAddress`, `address.province`, `address.city`, and `address.barangay`.

**Tech Stack:** React, Express, Node test runner, JSON/PostgreSQL order repository, J&T Excel export helpers.

---

### Task 1: API Order Item Updates

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Test: `apps/api/test/adminOrders.test.js`

- [ ] Add a failing API test that patches an order with edited `customer`, `address`, and `items`, then asserts separated address fields and recalculated totals are persisted.
- [ ] Run `node --test apps/api/test/adminOrders.test.js` and verify the new test fails because item updates are ignored.
- [ ] Update `PATCH /api/admin/orders/:orderNumber` to load the existing order before normalization.
- [ ] Add item normalization to `normalizeOrderUpdate(body, existingOrder)`.
- [ ] Recalculate `subtotalCents`, `totalCents`, `cartSnapshot`, and `adminEditableTotals` whenever `items` are patched.
- [ ] Run `node --test apps/api/test/adminOrders.test.js` and verify it passes.

### Task 2: React Order Detail Editor

**Files:**
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Test: `apps/web/test/adminOrderDetailSource.test.js`

- [ ] Add a failing source test that requires editable contact fields, separated address labels, editable item fields, and PATCH payloads containing `customer` and `items`.
- [ ] Run `node --test apps/web/test/adminOrderDetailSource.test.js` and verify it fails.
- [ ] Extend the order detail form state with `customer` and `items`.
- [ ] Display separated `House / Street`, `Barangay`, `City / Municipality`, and `Province` values when not editing the address.
- [ ] Keep address editing on cascading J&T guide dropdowns and rebuild `addressLine` on save.
- [ ] Add item-row inputs for product name, size, quantity, and unit price.
- [ ] Send `customer` and normalized `items` in the PATCH request.
- [ ] Run `node --test apps/web/test/adminOrderDetailSource.test.js` and verify it passes.

### Task 3: Verification

**Files:**
- Verify changed API, web tests, build, Docker runtime.

- [ ] Run `node --test apps/web/test/*.test.js`.
- [ ] Run `node --test apps/api/test/adminOrders.test.js`.
- [ ] Run `node --test apps/api/test/adminJntExport.test.js`.
- [ ] Run `npm run build:web`.
- [ ] Rebuild Docker with `docker compose up --build -d web`.
- [ ] Run `docker compose exec -T api npm run db:migrate`.

