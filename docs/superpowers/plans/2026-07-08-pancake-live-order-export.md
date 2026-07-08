# Pancake Live Order Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create live Pancake POS orders from website orders only when `PANCAKE_MODE=live`.

**Architecture:** Extend the current shadow export pipeline. The same payload builder creates order JSON, the Pancake client sends it to the official create-order endpoint, and the export repository records sent/failed/blocked state with the existing unique `order_number` guard.

**Tech Stack:** Node.js, Express, PostgreSQL, Pancake OpenAPI, native `node:test`.

---

### Task 1: Pancake Client Create Order

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeClient.js`
- Test: `apps/api/test/pancakeClient.test.js`

- [ ] Write failing tests for `createOrder(shopId, payload)` using a fake fetch. Assert method `POST`, JSON body, API key query, and order ID extraction.
- [ ] Run `node --test apps/api/test/pancakeClient.test.js` and confirm the create-order test fails because `createOrder` does not exist.
- [ ] Add `createOrder` to `pancakeClient`, using the existing request error classification.
- [ ] Re-run `node --test apps/api/test/pancakeClient.test.js` and confirm it passes.

### Task 2: Repository Sent/Failed State

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeOrderExportRepository.js`
- Test: `apps/api/test/pancakeOrderExportRepository.test.js`

- [ ] Write failing tests for `markOrderExportSent` and `markOrderExportFailed`.
- [ ] Confirm sent rows are not returned by `listQueuedOrderExports`.
- [ ] Implement memory and PostgreSQL versions of the new repository methods.
- [ ] Re-run `node --test apps/api/test/pancakeOrderExportRepository.test.js` and confirm it passes.

### Task 3: Live Export Service

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeOrderExportService.js`
- Test: `apps/api/test/pancakeOrderExportService.test.js`

- [ ] Write failing tests for `runOrderLiveExport` covering live success, non-live blocking, provider failure, and payload mapping blocks.
- [ ] Run `node --test apps/api/test/pancakeOrderExportService.test.js` and confirm the new tests fail.
- [ ] Implement `runOrderLiveExport` using `buildPancakeOrderPayload`, `client.createOrder`, `markOrderExportSent`, `markOrderExportFailed`, and `blockOrderExport`.
- [ ] Re-run `node --test apps/api/test/pancakeOrderExportService.test.js` and confirm it passes.

### Task 4: Automatic Worker Uses Live Mode

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js`
- Test: `apps/api/test/pancakeAutoSyncWorker.test.js`

- [ ] Write failing tests that live mode runs catalog, inventory, and live order export.
- [ ] Update `shouldRunPancakeAutoSync` to allow live mode only when auto-sync and API key are configured.
- [ ] Update the worker to call live export in live mode and shadow build otherwise.
- [ ] Re-run `node --test apps/api/test/pancakeAutoSyncWorker.test.js`.

### Task 5: Admin Copy

**Files:**
- Modify: `apps/web/src/admin/PancakePos.jsx`
- Test: `apps/web/test/adminPancakeSource.test.js`

- [ ] Write a failing source test that the Pancake admin page explains `sent` as live Pancake order created.
- [ ] Update the copy and keep secret-redaction assertions green.
- [ ] Re-run `node --test apps/web/test/adminPancakeSource.test.js`.

### Task 6: Verification and Restart

**Commands:**

- [ ] `node --test apps/api/test/pancakeClient.test.js apps/api/test/pancakeOrderExportRepository.test.js apps/api/test/pancakeOrderExportService.test.js apps/api/test/pancakeAutoSyncWorker.test.js`
- [ ] `npm test` in `apps/api`
- [ ] `node --test test/*.test.js` in `apps/web`
- [ ] `npm run build` in `apps/web`
- [ ] `docker compose run --rm api npm run db:migrate`
- [ ] `docker compose build api web`
- [ ] `docker compose up -d --force-recreate api web`
- [ ] `curl -fsS http://localhost:3000/api/health`
- [ ] `curl -fsS http://localhost:8081/`
- [ ] `docker compose logs --tail=120 api`

