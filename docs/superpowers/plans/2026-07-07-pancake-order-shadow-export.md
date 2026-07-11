# Pancake Order Shadow Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pancake order shadow export so website orders produce reviewable Pancake order payloads without creating Pancake orders.

**Architecture:** A new Pancake order export repository owns readiness checks, payload audit rows, status counts, and recent export rows. A service builds Pancake-compatible payloads from local orders plus verified Pancake variation mappings. Checkout enqueues one export row inside the existing transaction, and Admin can build pending shadows.

**Tech Stack:** Node.js CommonJS, Express, PostgreSQL migrations, React admin UI, `node:test`.

---

### Task 1: Schema And Migration

**Files:**
- Create: `apps/api/db/migrations/20260707_pancake_order_shadow_export.sql`
- Modify: `apps/api/db/schema.sql`
- Test: `apps/api/test/pancakeOrderExportMigration.test.js`

- [ ] Add `pancake_order_exports` with one unique row per `order_number`, status constraints, redacted request/response JSON, safe error code, Pancake reference IDs, timestamps, and an index by status/updated time.
- [ ] Write a migration test asserting the table, unique constraint, check constraint, and no secret columns.
- [ ] Run `node --test apps/api/test/pancakeOrderExportMigration.test.js` and confirm the test fails before the migration is applied.
- [ ] Apply the migration/schema edit and rerun the test until it passes.

### Task 2: Shadow Payload Builder

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeOrderExportService.js`
- Test: `apps/api/test/pancakeOrderExportService.test.js`

- [ ] Write failing tests for a mapped COD order producing `shop_id`, `warehouse_id`, `custom_id`, customer fields, shipping address, items with `variation_id`, quantity, product ID, `variation_info.retail_price`, shipping fee, discount, free shipping, note, and `received_at_shop: false`.
- [ ] Write failing tests for blocked states: unconfirmed price unit, missing item mapping, missing selected references, and catalog conflicts.
- [ ] Implement centavos-to-pesos conversion only for `confirmed_pesos`.
- [ ] Redact stored review payload fields by masking phone and email.
- [ ] Run the focused service tests until they pass.

### Task 3: Repository And Checkout Enqueue

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeOrderExportRepository.js`
- Modify: `apps/api/src/checkout/authoritativeCheckoutService.js`
- Modify: `apps/api/src/routes/orders.js`
- Test: `apps/api/test/checkoutService.test.js`
- Test: `apps/api/test/pancakeOrderExportRepository.test.js`

- [ ] Write failing repository tests for idempotent `enqueueOrderExport`, readiness loading, blocked completion, shadow completion, and status summary.
- [ ] Add `enqueueOrderExport(order, { client })` and call it after local order persistence in authoritative checkout when PostgreSQL is active.
- [ ] Wire the dependency so tests can inject a fake enqueue function.
- [ ] For the legacy PostgreSQL checkout path, enqueue after `saveOrder` inside `persistPostgresCheckout` dependencies.
- [ ] Run focused checkout/repository tests until they pass.

### Task 4: Admin API

**Files:**
- Modify: `apps/api/src/routes/adminPancake.js`
- Test: `apps/api/test/adminPancake.test.js`

- [ ] Add `GET /orders/status` returning summary and recent shadow rows.
- [ ] Add `POST /orders/shadow-build` to process queued or blocked local exports in shadow mode.
- [ ] Return `409` only for concurrent processing; normal blocked rows return `200` with counts.
- [ ] Extend admin route tests for injected order service dependencies and CSRF inheritance.

### Task 5: Admin UI

**Files:**
- Modify: `apps/web/src/admin/PancakePos.jsx`
- Test: `apps/web/test/adminPancakeSource.test.js`

- [ ] Fetch `/orders/status` in `loadAll`.
- [ ] Add a shadow order export section below inventory sync.
- [ ] Add a “Build shadow orders” button that calls `/orders/shadow-build`.
- [ ] Display status counts, latest timestamp, and recent rows.
- [ ] Add source tests for endpoints, button text, and safety copy.

### Task 6: Verification And Docker

**Files:**
- No additional source files unless tests reveal issues.

- [ ] Run focused API tests for migration, service, repository, admin route, and checkout integration.
- [ ] Run full `npm test` in `apps/api`.
- [ ] Run `node --test test/*.test.js` in `apps/web`.
- [ ] Run `npm run build` in `apps/web`.
- [ ] Run Docker migration.
- [ ] Rebuild/recreate API and web containers if source or bundled assets changed.
- [ ] Run `docker compose ps`, `curl -fsS http://127.0.0.1:8081/api/health`, `git diff --check`, and the Pancake secret scan.
