# Phase 8D Tracking Notification Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins record a send/resend tracking notification action after an order has been exported to J&T or marked shipped.

**Architecture:** Add order-level tracking notification audit records beside existing order status events. The admin API will create a notification record only for shipped or J&T-exported orders, and admin order detail will show the latest notification log plus a manual send/resend action.

**Tech Stack:** Express admin routes, order repository JSON/Postgres persistence, React admin order detail, Node test runner, Vite.

---

### Task 1: Tracking Notification Persistence and API

**Files:**
- Modify: `apps/api/test/adminJntExport.test.js`
- Modify: `apps/api/src/orders/orderRepository.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/db/schema.sql`

- [x] **Step 1: Add failing API test**

Add a test that creates one unexported order and one exported/shipped order. Assert `POST /api/admin/orders/:orderNumber/tracking-notification` rejects the unexported order with `400`, then records a notification for the exported order and returns it in `GET /api/admin/orders/:orderNumber`.

- [x] **Step 2: Run test to verify it fails**

Run `node --test apps/api/test/adminJntExport.test.js`. Expected failure: the route does not exist or the returned order has no `trackingNotifications`.

- [x] **Step 3: Persist tracking notifications**

Extend the order repository JSON store with `trackingNotifications`, add Postgres table `order_tracking_notifications`, and export `appendOrderTrackingNotification()` plus `listOrderTrackingNotifications()`.

- [x] **Step 4: Add admin route**

Add `POST /api/admin/orders/:orderNumber/tracking-notification`. Require the order to be shipped or exported to J&T, create a normalized message using order number, delivery method, and tracking number when present, and return `{ order, notification }`.

- [x] **Step 5: Run test to verify it passes**

Run `node --test apps/api/test/adminJntExport.test.js`. Expected: all J&T/admin notification tests pass.

### Task 2: Admin Order Detail Control

**Files:**
- Modify: `apps/web/test/phase8aOrderStatusHistorySource.test.js`
- Modify: `apps/web/src/admin/OrderDetail.jsx`

- [x] **Step 1: Add failing source assertions**

Assert the admin order detail page contains `Tracking notifications`, calls `/tracking-notification`, renders `trackingNotifications`, and exposes `Send tracking notification`.

- [x] **Step 2: Run test to verify it fails**

Run `node --test apps/web/test/phase8aOrderStatusHistorySource.test.js`. Expected failure: the new strings and route call are missing.

- [x] **Step 3: Add UI action and log**

Add `sendTrackingNotification()`, show a button in the J&T readiness panel for exported/shipped orders, and render latest tracking notifications in a compact list.

- [x] **Step 4: Run test to verify it passes**

Run `node --test apps/web/test/phase8aOrderStatusHistorySource.test.js`. Expected: source assertions pass.

### Task 3: Roadmap and Runtime Verification

**Files:**
- Modify: `docs/enhancementdata2.md`
- Modify: `docs/superpowers/plans/2026-06-20-phase-8d-tracking-notification-action.md`

- [x] **Step 1: Update roadmap**

Add Phase 8D with finished deliverables after implementation and refresh next recommendations.

- [x] **Step 2: Run focused verification**

Run `node --test apps/api/test/adminJntExport.test.js apps/web/test/phase8aOrderStatusHistorySource.test.js`.

- [x] **Step 3: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl http://127.0.0.1:8081/api/health`.
