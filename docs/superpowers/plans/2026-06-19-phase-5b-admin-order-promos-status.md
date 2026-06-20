# Phase 5B Admin Order Promos and Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show saved promo information in admin orders and allow inline order status updates from the order list.

**Architecture:** Keep order persistence and status updates on the existing admin order API. Extend `orderSummary()` with promo fields for the list view, then render those fields in `Orders.jsx` and the full `discountSnapshot` in `OrderDetail.jsx`.

**Tech Stack:** Node test runner, Express admin API, React admin app, Vite build.

---

### Task 1: Regression Coverage

**Files:**
- Create: `apps/web/test/phase5bAdminOrdersSource.test.js`

- [x] **Step 1: Write the failing source test**

Check that the admin route summary exposes promo fields, `Orders.jsx` has an inline status save path, and `OrderDetail.jsx` displays promo snapshot/totals.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/test/phase5bAdminOrdersSource.test.js`

### Task 2: API Summary Promo Fields

**Files:**
- Modify: `apps/api/src/routes/admin.js`

- [x] **Step 1: Extend `orderSummary()`**

Add `discountCode`, `discountTotalCents`, and `discountSnapshot` to the returned summary object.

- [x] **Step 2: Run focused source test**

Run: `node --test apps/web/test/phase5bAdminOrdersSource.test.js`

### Task 3: Admin Order List Status and Promo

**Files:**
- Modify: `apps/web/src/admin/Orders.jsx`

- [x] **Step 1: Import `adminSend`**

Use the existing admin API helper for `PATCH /api/admin/orders/:orderNumber`.

- [x] **Step 2: Add inline status update**

Add a row-level status `<select>` that calls `adminSend('PATCH', ...)`, updates local `orders`, and shows success/error messages.

- [x] **Step 3: Add promo display column**

Show promo name/code and discount amount when present, otherwise show `No promo`.

### Task 4: Admin Order Detail Promo Snapshot

**Files:**
- Modify: `apps/web/src/admin/OrderDetail.jsx`

- [x] **Step 1: Calculate totals with saved discount**

Use `discountTotalCents` when calculating admin detail total and balance.

- [x] **Step 2: Render promo snapshot**

Show promo name, code, type, discount amount, free shipping, savings, and applied rule when available.

### Task 5: Docs and Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] **Step 1: Mark Phase 5B finished**

Update Phase 5 status and deliverables.

- [x] **Step 2: Run verification**

Run focused web tests, admin order API tests, `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl -s http://127.0.0.1:3000/api/health`.
