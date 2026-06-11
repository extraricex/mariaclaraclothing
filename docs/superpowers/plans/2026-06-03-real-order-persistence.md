# Real Order Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store checkout orders permanently so thank-you confirmations work after app restart and are no longer limited to an in-memory demo map.

**Architecture:** Add a small file-backed order repository under `src/orders/` that writes JSON to `data/orders.json` by default and supports a test path through `ORDERS_DATA_FILE`. Keep the existing public order API stable: `POST /api/orders` creates an order and `GET /api/orders/:orderNumber` returns the confirmation payload.

**Tech Stack:** Node.js, Express, built-in `node:fs/promises`, built-in `node:path`, node test runner.

---

### Task 1: Add Red Persistence Test

**Files:**
- Modify: `test/health.test.js`

- [x] **Step 1: Write the failing test**

Add a test that creates an order with one app instance, closes it, starts a new app instance using the same order data file, and fetches the same order number.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- test/health.test.js`

Expected: FAIL because the current order route stores confirmations only in an in-memory `Map`.

### Task 2: Add File-Backed Order Repository

**Files:**
- Create: `src/orders/orderRepository.js`
- Modify: `src/config/env.js`
- Modify: `src/routes/orders.js`

- [x] **Step 1: Implement repository**

Create `saveOrder(order)`, `findOrderByNumber(orderNumber)`, and `resetOrderRepositoryForTests()` using JSON file storage.

- [x] **Step 2: Wire route to repository**

Replace the in-memory `demoOrders` map with repository calls.

- [x] **Step 3: Keep response contract stable**

Keep `orderNumber`, `syncStatus`, `checkoutChannel`, `paymentMethod`, `shippingRegion`, `freeShippingUnlocked`, `status`, `fulfillmentStatus`, and `paymentStatus` in the `POST /api/orders` response.

### Task 3: Verify

**Files:**
- Test: `test/health.test.js`
- Test: full suite

- [x] **Step 1: Run focused tests**

Run: `npm test -- test/health.test.js`

Expected: PASS.

- [x] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

