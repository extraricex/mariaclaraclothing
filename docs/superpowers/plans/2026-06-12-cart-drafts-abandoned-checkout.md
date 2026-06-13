# Cart Drafts And Abandoned Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track customer cart sessions server-side so admin Draft shows active carts and Abandoned Checkout shows carts where checkout was started but no order was placed.

**Architecture:** Add a `cart_sessions` persistence layer with JSON fallback and PostgreSQL support. The storefront syncs cart changes as anonymous Draft sessions and syncs checkout contact/address progress as Abandoned Checkout sessions; successful order creation marks the session converted. The admin sidebar links to real Draft and Abandoned Checkout pages backed by authenticated API endpoints.

**Tech Stack:** Express, PostgreSQL/JSON repository fallback, React 18, React Router, Node test runner.

---

### Task 1: Backend Cart Session Persistence

**Files:**
- Modify: `apps/api/db/schema.sql`
- Create: `apps/api/src/cartSessions/cartSessionRepository.js`
- Modify: `apps/api/src/routes/orders.js`
- Modify: `apps/api/src/routes/admin.js`
- Test: `apps/api/test/adminCartSessions.test.js`

- [ ] Add `cart_sessions` table.
- [ ] Add JSON/Postgres repository functions: `upsertCartSession`, `listCartSessions`, `markCartSessionConverted`.
- [ ] Add public `PUT /api/cart-sessions/:sessionId`.
- [ ] Add admin `GET /api/admin/cart-sessions?status=draft|abandoned_checkout`.
- [ ] Mark sessions converted when an order is placed with `cartSessionId`.

### Task 2: Storefront Tracking

**Files:**
- Modify: `apps/web/src/lib/cart.js`
- Modify: `apps/web/src/pages/Checkout.jsx`

- [ ] Generate or reuse a browser cart session ID.
- [ ] Sync non-empty cart items as Draft.
- [ ] Sync checkout contact/address state as Abandoned Checkout.
- [ ] Include `cartSessionId` in order payload.

### Task 3: Admin Pages

**Files:**
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Create: `apps/web/src/admin/CartSessions.jsx`
- Modify: `apps/web/src/App.jsx`
- Test: `apps/web/test/adminCartSessionsSource.test.js`

- [ ] Turn Draft and Abandoned Checkout into real sidebar links.
- [ ] Add `/admin/orders/draft` and `/admin/orders/abandoned-checkout` routes.
- [ ] Render session tables with anonymous fallback, item count, subtotal, contact, and last activity.

### Task 4: Verification

- [ ] Run `node --test apps/api/test/adminCartSessions.test.js`.
- [ ] Run `node --test apps/web/test/*.test.js`.
- [ ] Run `npm run build:web`.
- [ ] Run `npm run db:migrate`.
- [ ] Rebuild Docker with `docker compose up --build -d web`.
