# Phase 8A Order Status History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and display an audit trail for admin order status changes and J&T export transitions.

**Architecture:** Add order status events to the order repository so JSON-file and Postgres modes use the same public functions. Admin status updates and J&T export updates will record events after successful order updates. Admin order detail will render `order.statusEvents` from the existing order detail response.

**Tech Stack:** Express admin routes, Node order repository, Postgres schema with JSON-file fallback, React admin UI, Node test runner, Vite.

---

### Task 1: Backend Status Event Persistence

**Files:**
- Modify: `apps/api/test/adminOrders.test.js`
- Modify: `apps/api/src/orders/orderRepository.js`
- Modify: `apps/api/db/schema.sql`

- [x] **Step 1: Add failing admin status history assertions**

Extend the admin order PATCH test to assert that changing status records a status event with `source: 'admin'`, changed fields, old values, new values, and a timestamp.

- [x] **Step 2: Add repository event functions**

Add `appendOrderStatusEvent(orderNumber, event)` and `listOrderStatusEvents(orderNumber)` to `apps/api/src/orders/orderRepository.js`.

- [x] **Step 3: Support JSON fallback persistence**

Store events in the JSON order file under a top-level `statusEvents` array and keep existing `{ orders }` files compatible.

- [x] **Step 4: Support Postgres persistence**

Add `order_status_events` to `apps/api/db/schema.sql` and implement insert/select using the shared `query()` helper.

- [x] **Step 5: Attach events to order detail reads**

Include `statusEvents` on `findOrderByNumber()` results so the admin detail endpoint can return history without a new endpoint.

### Task 2: Admin Route Event Recording

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/test/adminJntExport.test.js`
- Modify: `apps/api/test/adminOrders.test.js`

- [x] **Step 1: Record admin PATCH transitions**

After a successful `PATCH /api/admin/orders/:orderNumber`, compare status-like fields and append one event when at least one changed.

- [x] **Step 2: Record J&T export transitions**

After selected orders are exported through `POST /api/admin/orders/export/jnt`, append one event per exported order with `source: 'jnt_export'`.

- [x] **Step 3: Keep validation failures clean**

Ensure invalid status updates and failed J&T validation do not append events.

### Task 3: Admin UI Timeline

**Files:**
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Modify: `apps/web/test/phase8aOrderStatusHistorySource.test.js`

- [x] **Step 1: Add source test for timeline rendering**

Assert the order detail page renders `Status history`, `statusEvents`, changed fields, old values, new values, source, and timestamp.

- [x] **Step 2: Render status history**

Add a `Status history` section to admin order detail. Show newest events first, with source, timestamp, and each changed field from old to new.

- [x] **Step 3: Add empty state**

Show `No status changes recorded yet.` when an order has no events.

### Task 4: Roadmap and Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] **Step 1: Update roadmap**

Add Phase 8A with status and deliverables.

- [x] **Step 2: Run focused tests**

Run `node --test apps/api/test/adminOrders.test.js apps/api/test/adminJntExport.test.js apps/web/test/phase8aOrderStatusHistorySource.test.js`.

- [x] **Step 3: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl http://127.0.0.1:8081/api/health`.
