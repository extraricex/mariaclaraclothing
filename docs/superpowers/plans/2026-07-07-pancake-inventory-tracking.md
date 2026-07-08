# Pancake POS Inventory Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual Pancake-to-website inventory reconciliation after clean catalog mapping.

**Architecture:** Add a focused inventory repository/service under `apps/api/src/integrations/pancake`, backed by PostgreSQL audit tables and existing `inventory_movements`. The service reuses the read-only Pancake client, applies selected-warehouse `remain_quantity` as absolute stock snapshots, and exposes authenticated admin routes plus a compact admin UI control.

**Tech Stack:** Node.js 22, Express, PostgreSQL 16, React/Vite, Docker Compose, Node test runner.

---

## File Map

- Modify `apps/api/db/schema.sql`: add inventory reconciliation audit table and allow `pancake_reconcile` inventory movement reason.
- Create `apps/api/db/migrations/20260707_pancake_inventory_tracking.sql`: migration equivalent of schema changes.
- Modify `apps/api/src/inventory/inventoryMovementRepository.js`: accept `pancake_reconcile`.
- Create `apps/api/src/integrations/pancake/pancakeInventoryRepository.js`: readiness, audit, and transactional stock snapshot persistence.
- Create `apps/api/src/integrations/pancake/pancakeInventoryService.js`: read-only reconciliation orchestration.
- Modify `apps/api/src/routes/adminPancake.js`: add inventory status and reconcile routes.
- Modify `apps/web/src/admin/PancakePos.jsx`: add inventory status and sync button.
- Add tests: `apps/api/test/pancakeInventoryMigration.test.js`, `apps/api/test/pancakeInventoryService.test.js`, update `apps/api/test/adminPancake.test.js`, update `apps/web/test/adminPancakeSource.test.js`.

## Tasks

### Task 1: Schema and Movement Reason

- [ ] Add failing migration/schema tests for `pancake_inventory_reconciliations` and `pancake_reconcile`.
- [ ] Run focused tests and verify failure.
- [ ] Add migration, schema table, and movement reason support.
- [ ] Run focused tests and verify pass.

### Task 2: Inventory Repository and Service

- [ ] Add failing service tests for blocked readiness, complete reconciliation, skipped invalid quantities, and no partial writes on provider failure.
- [ ] Run tests and verify failure.
- [ ] Implement repository/service with one transactional stock apply.
- [ ] Run service tests and verify pass.

### Task 3: Admin API

- [ ] Add failing route tests for `GET /inventory/status` and `POST /inventory/reconcile`.
- [ ] Run route tests and verify failure.
- [ ] Add routes with admin auth/CSRF inherited from existing router.
- [ ] Run route/security tests and verify pass.

### Task 4: Admin UI

- [ ] Add failing source test assertions for inventory sync controls and endpoints.
- [ ] Run web source test and verify failure.
- [ ] Add compact inventory status panel and read-only sync button.
- [ ] Run web tests and build.

### Task 5: Local Verification

- [ ] Run migration.
- [ ] Run manual read-only inventory reconciliation.
- [ ] Verify stock counts, audit counts, Docker health, and no tracked secrets.

