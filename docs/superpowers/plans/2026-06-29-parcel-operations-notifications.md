# Parcel Operations and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product parcel weight, bulk order selection, safe draft/abandoned deletion, delivered-order SMS/email outbox delivery, and a J&T Philippines dry-run parcel workflow.

**Architecture:** Extend existing product/order/cart persistence additively. Keep external provider calls behind server-only adapters and durable outbox records so status updates never depend on provider uptime. Keep J&T live mode locked until official Philippine API credentials and specifications exist.

**Tech Stack:** Node.js, Express, PostgreSQL/JSON repositories, React, Semaphore REST API, Resend REST API, Node test runner, Docker Compose.

---

### Task 1: Product and Order Parcel Weight

**Files:**
- Modify: `apps/api/db/schema.sql`
- Create: `apps/api/db/migrations/20260629_parcel_operations.sql`
- Modify: `apps/api/src/products/catalogRepository.js`
- Modify: `apps/api/src/products/catalogPresenter.js`
- Modify: `apps/api/src/checkout/checkoutQuoteService.js`
- Modify: `apps/api/src/checkout/authoritativeCheckoutService.js`
- Modify: `apps/api/src/orders/orderRepository.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Test: `apps/api/test/parcelWeight.test.js`
- Test: `apps/web/test/parcelOperationsSource.test.js`

- [ ] Write tests asserting default/validated `parcelWeightGrams`, quote line weight, order total weight, and admin override.
- [ ] Run `node --test apps/api/test/parcelWeight.test.js` and verify failure before implementation.
- [ ] Add `products.parcel_weight_grams`, `orders.parcel_weight_grams`, and `orders.parcel_weight_override_grams` with safe defaults.
- [ ] Normalize product weights as positive integers from 1 through 100000 grams.
- [ ] Snapshot `unitWeightGrams`/`lineWeightGrams` in authoritative quote lines and persist summed order weight.
- [ ] Add product editor and order parcel override controls, with API validation.
- [ ] Run focused API/web tests and commit `feat: add parcel weight management`.

### Task 2: Select All Filtered Orders

**Files:**
- Modify: `apps/web/src/admin/Orders.jsx`
- Test: `apps/web/test/parcelOperationsSource.test.js`

- [ ] Add a failing source test for a header checkbox, visible-order selection, clearing, and indeterminate state.
- [ ] Run the source test and verify failure.
- [ ] Add `allVisibleSelected`, `someVisibleSelected`, a checkbox ref, and `toggleAllVisibleOrders`.
- [ ] Remove hidden selections whenever the filtered API result changes.
- [ ] Run the focused test and commit `feat: select all filtered orders`.

### Task 3: Delete Draft and Abandoned Cart Sessions

**Files:**
- Modify: `apps/api/src/cartSessions/cartSessionRepository.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/web/src/admin/CartSessions.jsx`
- Test: `apps/api/test/adminCartSessions.test.js`
- Test: `apps/web/test/adminCartSessionsSource.test.js`

- [ ] Add failing tests for authenticated deletion, converted-session conflict, unknown session, and UI confirmation.
- [ ] Run focused tests and verify failure.
- [ ] Implement `deleteCartSession(sessionId, allowedStatuses)` with a conditional PostgreSQL delete and equivalent JSON guard.
- [ ] Add `DELETE /api/admin/cart-sessions/:sessionId` and return a redacted deletion result.
- [ ] Add row Delete actions with browser confirmation and immediate list removal.
- [ ] Run focused tests and commit `feat: delete inactive cart sessions`.

### Task 4: Durable Delivered-Order Notifications

**Files:**
- Modify: `apps/api/db/schema.sql`
- Modify: `apps/api/db/migrations/20260629_parcel_operations.sql`
- Create: `apps/api/src/notifications/orderNotificationOutboxRepository.js`
- Create: `apps/api/src/notifications/semaphoreClient.js`
- Create: `apps/api/src/notifications/resendClient.js`
- Create: `apps/api/src/notifications/orderNotificationWorker.js`
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/orders/orderPresenter.js`
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Test: `apps/api/test/orderNotifications.test.js`
- Test: `apps/web/test/parcelOperationsSource.test.js`

- [ ] Add failing tests for delivered-only enqueueing, unique per-channel events, provider payloads, disabled/skipped channels, retry, and permanent failure.
- [ ] Run focused tests and verify failure.
- [ ] Add `order_notification_outbox` with unique `(order_number, event_name, channel)` and delivery metadata.
- [ ] Implement Semaphore `POST https://api.semaphore.co/api/v4/messages` and Resend `POST https://api.resend.com/emails` adapters with timeouts and secret-safe errors.
- [ ] Enqueue SMS/email only on the first transition to `delivered`; omit email when absent and record disabled channels as skipped.
- [ ] Start/stop a bounded retry worker with the API server and expose notification state in admin order detail.
- [ ] Run focused tests and commit `feat: notify customers after delivery`.

### Task 5: J&T Philippines Dry-Run Parcel Workflow

**Files:**
- Create: `apps/api/src/jnt/jntParcelService.js`
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Test: `apps/api/test/jntParcelService.test.js`
- Test: `apps/web/test/parcelOperationsSource.test.js`
- Modify: `apps/api/.env.example`

- [ ] Add failing tests for parcel draft totals, field-level readiness errors, redacted dry-run preview, and refusal of unconfigured live mode.
- [ ] Run focused tests and verify failure.
- [ ] Build a provider-neutral parcel draft from persisted order data and effective weight.
- [ ] Add `POST /api/admin/orders/:orderNumber/jnt/preview` with admin auth and no state transition.
- [ ] Add an order-detail Parcel card showing calculated/override weight, count, COD, readiness, and preview.
- [ ] Document disabled/dry-run provider configuration and commit `feat: prepare J&T parcel integration`.

### Task 6: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/jnt-integration-recommendation.md`
- Create: `docs/parcel-notification-operations.md`
- Modify: `docker-compose.yml`

- [ ] Document how to request J&T Philippines API enablement and why dashboard automation is prohibited.
- [ ] Document Semaphore/Resend keys, sender identity, disabled behavior, retry monitoring, and test procedure.
- [ ] Add server-only environment wiring to Compose without client exposure.
- [ ] Run `npm test`, all web tests, production build, PostgreSQL integration tests, `npm audit --omit=dev`, and `git diff --check`.
- [ ] Rebuild/recreate Docker, verify API/web health, and smoke-test parcel preview and disabled notifications.
- [ ] Commit `docs: document parcel and notification operations`.
