# Phase 8E Inventory Restock and Correction Movements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record inventory movement audit rows when cancelled orders restore stock and when admins manually correct product variant stock.

**Architecture:** Reuse the existing `inventory_movements` persistence and add positive `quantityChange` rows for restocks plus signed delta rows for manual admin corrections. Order cancellation restores stock only on the first transition into `cancelled`; admin product updates compare old and new variant stock by SKU.

**Tech Stack:** Express admin routes, product catalog repository, inventory movement repository, Node test runner, Vite/Docker.

---

### Task 1: Cancelled Order Restock Movements

**Files:**
- Modify: `apps/api/test/adminOrders.test.js`
- Modify: `apps/api/src/products/catalogRepository.js`
- Modify: `apps/api/src/routes/admin.js`

- [x] **Step 1: Add failing cancellation restock test**

Create an order through checkout, cancel it through admin PATCH, and assert stock is restored plus an `order_cancelled` positive movement is recorded.

- [x] **Step 2: Run test to verify it fails**

Run `node --test apps/api/test/adminOrders.test.js`.

- [x] **Step 3: Add restock helper and cancellation hook**

Add `restockVariantStock()` in the catalog repository and call it from admin order update when the order first transitions to `cancelled`.

- [x] **Step 4: Run test to verify it passes**

Run `node --test apps/api/test/adminOrders.test.js`.

### Task 2: Admin Stock Correction Movements

**Files:**
- Modify: `apps/api/test/adminProducts.test.js`
- Modify: `apps/api/src/routes/admin.js`

- [x] **Step 1: Add failing stock correction test**

Update an existing product variant stock quantity through admin PUT and assert an `admin_stock_correction` movement records the signed stock delta.

- [x] **Step 2: Run test to verify it fails**

Run `node --test apps/api/test/adminProducts.test.js`.

- [x] **Step 3: Record product update stock deltas**

Compare `existingProduct.variants` to the saved product variants by SKU and append correction movements for non-zero stock deltas.

- [x] **Step 4: Run test to verify it passes**

Run `node --test apps/api/test/adminProducts.test.js`.

### Task 3: Roadmap and Runtime Verification

**Files:**
- Modify: `docs/enhancementdata2.md`
- Modify: `docs/superpowers/plans/2026-06-20-phase-8e-inventory-restock-corrections.md`

- [x] **Step 1: Update roadmap**

Add Phase 8E and move the next recommendation to real SMS/email provider integration.

- [x] **Step 2: Run focused verification**

Run `node --test apps/api/test/adminOrders.test.js apps/api/test/adminProducts.test.js apps/api/test/inventoryMovements.test.js`.

- [x] **Step 3: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl http://127.0.0.1:8081/api/health`.
