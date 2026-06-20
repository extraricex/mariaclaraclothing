# Phase 8B Inventory Movement History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist an audit trail for stock deductions created by successful customer orders.

**Architecture:** Add a small inventory movement repository with JSON-file and Postgres persistence. The order creation route will record one movement per ordered item after stock deduction and successful order save. This phase only records backend data; admin UI history can be added later once movement data is reliable.

**Tech Stack:** Express order route, Node repositories, Postgres schema with JSON-file fallback, Node test runner.

---

### Task 1: Inventory Movement Persistence

**Files:**
- Create: `apps/api/src/inventory/inventoryMovementRepository.js`
- Modify: `apps/api/db/schema.sql`
- Create: `apps/api/test/inventoryMovements.test.js`

- [x] **Step 1: Add failing movement test**

Create a backend test that places an order and asserts `listInventoryMovements({ orderNumber })` returns one negative movement per ordered item.

- [x] **Step 2: Add JSON fallback repository support**

Store movements in a JSON file controlled by `INVENTORY_MOVEMENTS_DATA_FILE`, defaulting to `apps/api/data/inventory-movements.json`.

- [x] **Step 3: Add Postgres repository support**

Add `inventory_movements` to `apps/api/db/schema.sql` and implement insert/list functions using the shared `query()` helper.

### Task 2: Order Creation Recording

**Files:**
- Modify: `apps/api/src/routes/orders.js`
- Modify: `apps/api/test/inventoryMovements.test.js`

- [x] **Step 1: Record movements after successful order save**

After `saveOrder(persistedOrder)`, append one movement per order item with `quantityChange: -quantity`, reason `order_created`, order number, product slug, SKU, size, and product name.

- [x] **Step 2: Avoid movements on failed checkout**

Assert failed or invalid checkout attempts do not create inventory movements.

### Task 3: Roadmap and Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] **Step 1: Update roadmap**

Add Phase 8B with status and deliverables.

- [x] **Step 2: Run focused tests**

Run `node --test apps/api/test/inventoryMovements.test.js apps/api/test/promoFullFlow.test.js`.

- [x] **Step 3: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl http://127.0.0.1:8081/api/health`.
