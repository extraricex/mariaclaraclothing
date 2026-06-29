# Confirmed Order Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly placed customer order start with business status `confirmed`.

**Architecture:** Update the initial status at both order-construction boundaries and align the
PostgreSQL default plus repository fallback. Preserve `received` as a valid historical/admin
status and leave all fulfillment, payment, COD, and delivery states unchanged.

**Tech Stack:** Node.js, Express, PostgreSQL, `node:test`, Docker Compose

---

### Task 1: Lock The New Initial Status With Tests

**Files:**
- Modify: `apps/api/test/health.test.js`
- Modify: `apps/api/test/authoritativeCheckoutService.test.js`
- Modify: `apps/api/test/adminOrders.test.js`
- Modify: `apps/api/test/adminJntExport.test.js`

- [ ] **Step 1: Change initial-status assertions to the required state**

Assert that newly placed orders and their first later status transition begin at `confirmed`:

```js
assert.equal(orderBody.status, 'confirmed');
assert.equal(listBody.orders[0].status, 'confirmed');
assert.equal(updateBody.order.statusEvents[0].changes.status, undefined);
assert.equal(exportedOrder.statusEvents[0].changes.status.from, 'confirmed');
```

Assert the successful Checkout V2 service response uses `status: 'confirmed'`. Keep manually
constructed historical-order fixtures unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test test/health.test.js test/authoritativeCheckoutService.test.js test/adminOrders.test.js test/adminJntExport.test.js
```

Expected: FAIL because production order builders still return `received`.

### Task 2: Change The Authoritative Initial State

**Files:**
- Modify: `apps/api/src/checkout/authoritativeCheckoutService.js`
- Modify: `apps/api/src/routes/orders.js`
- Modify: `apps/api/src/orders/orderRepository.js`
- Modify: `apps/api/db/schema.sql`

- [ ] **Step 1: Change both order builders**

Use the same initial business state in Checkout V2 and the legacy route:

```js
status: 'confirmed',
fulfillmentStatus: 'unfulfilled',
paymentStatus: 'cod_pending',
```

- [ ] **Step 2: Align persistence defaults**

Use `confirmed` for the repository fallback and PostgreSQL column default:

```js
order.status || 'confirmed'
```

```sql
status text NOT NULL DEFAULT 'confirmed'
```

Add an idempotent `ALTER TABLE` statement so existing deployments change only the default and
do not rewrite existing rows:

```sql
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'confirmed';
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run the Task 1 command. Expected: all focused tests pass.

- [ ] **Step 4: Commit the behavior change**

```bash
git add apps/api/src apps/api/db/schema.sql apps/api/test
git commit -m "feat: confirm newly placed orders"
```

### Task 3: Full Verification And Deployment

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run all API tests**

Run `npm test`. Expected: zero failures; PostgreSQL-only tests may skip without
`TEST_POSTGRES_URL`.

- [ ] **Step 2: Run web tests and build**

Run `node --test test/*.test.js && npm run build` from `apps/web`. Expected: zero failures and a
successful Vite production build.

- [ ] **Step 3: Rebuild and restart Docker**

Run `docker compose up -d --build --force-recreate`. Expected: PostgreSQL healthy, API and web up.

- [ ] **Step 4: Verify deployed behavior and repository state**

Check `/api/health`, the admin page, the PostgreSQL default, and `git status --short`. Expected:
HTTP 200, database default `confirmed`, and no uncommitted files.
