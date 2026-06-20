# Phase 6A Active Promo Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a customer-facing promo notification only when a current active promo has banner text.

**Architecture:** Add a public `GET /api/discounts/active-notification` endpoint backed by the existing discount repository. Add a web API helper and render a compact dismissible banner in the global customer shell with session-scoped dismissal.

**Tech Stack:** Express routes, existing discount repository, React shell, Node test runner, Vite build.

---

### Task 1: Regression Tests

**Files:**
- Create: `apps/api/test/activePromoNotification.test.js`
- Create: `apps/web/test/phase6PromoNotificationSource.test.js`

- [x] **Step 1: Write failing API test**

Verify active banner promos return a notification, disabled/future/expired promos return `notification: null`, and fallback text is used when the active promo has no banner text.

- [x] **Step 2: Write failing web source test**

Verify the web helper fetches `/api/discounts/active-notification` and `Shell.jsx` renders a dismissible banner using `sessionStorage`.

- [x] **Step 3: Run tests to confirm RED**

Run: `node --test apps/api/test/activePromoNotification.test.js apps/web/test/phase6PromoNotificationSource.test.js`

### Task 2: Public Notification Endpoint

**Files:**
- Modify: `apps/api/src/routes/discounts.js`

- [x] **Step 1: Import `listDiscounts`**

Reuse the existing discount repository.

- [x] **Step 2: Add eligibility helpers**

Eligible means `status === 'active'`, `startsAt` is not in the future, `endsAt` is not in the past, and usage limit is not exhausted.

- [x] **Step 3: Add `GET /active-notification`**

Return `{ notification: null }` when there is no eligible promo. Return promo id, text, name, type, and method when eligible. Use `bannerText` first and fallback to `Buy More Save More Promo`.

### Task 3: Customer Shell Banner

**Files:**
- Modify: `apps/web/src/lib/api.js`
- Modify: `apps/web/src/components/Shell.jsx`

- [x] **Step 1: Add `fetchActivePromoNotification()`**

Call the new public endpoint.

- [x] **Step 2: Load notification in `Shell.jsx`**

Fetch once on shell mount and ignore errors.

- [x] **Step 3: Render dismissible banner**

Show a compact banner below the ticker, use a close button, and store `maria-clara-promo-notification-dismissed:<promoId>` in `sessionStorage`.

### Task 4: Docs and Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] **Step 1: Mark Phase 6A finished**

Update Phase 6 status and deliverables.

- [x] **Step 2: Run verification**

Run focused tests, `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl -s http://127.0.0.1:3000/api/health`.
