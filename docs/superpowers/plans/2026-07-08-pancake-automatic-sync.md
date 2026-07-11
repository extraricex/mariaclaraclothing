# Pancake Automatic Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a safe Pancake background worker that automatically runs catalog import, inventory reconciliation, and order shadow builds without live Pancake order creation.

**Architecture:** Add a focused worker module under `apps/api/src/integrations/pancake/`. The server lifecycle starts/stops it like the existing Meta and notification workers. Pancake config owns auto-sync enablement and interval bounds.

**Tech Stack:** Node.js CommonJS, Express server lifecycle, existing Pancake services/repositories, `node:test`.

---

### Task 1: Config

**Files:**
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/test/pancakeConfig.test.js`

- [ ] Write tests that default auto-sync on for `read_only`, off for `disabled`, and validate interval bounds.
- [ ] Add `autoSyncEnabled`, `autoSyncIntervalMs`, and `autoSyncStartupDelayMs` to `pancakeConfig`.
- [ ] Run `node --test apps/api/test/pancakeConfig.test.js`.

### Task 2: Worker

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js`
- Create: `apps/api/test/pancakeAutoSyncWorker.test.js`

- [ ] Write tests that `runOnce()` calls catalog import, inventory reconciliation, and order shadow build in order.
- [ ] Write tests that disabled/missing-credential config skips external work.
- [ ] Write tests that `start()` waits for startup delay and `stop()` clears the interval.
- [ ] Implement the worker with safe logging and failure isolation.
- [ ] Run `node --test apps/api/test/pancakeAutoSyncWorker.test.js`.

### Task 3: Server Lifecycle

**Files:**
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/test/serverLifecycle.test.js`

- [ ] Write server lifecycle tests proving the Pancake worker starts/stops when enabled and stays stopped when disabled.
- [ ] Wire `createPancakeAutoSyncWorker` into `startServer`.
- [ ] Run `node --test apps/api/test/serverLifecycle.test.js`.

### Task 4: Admin Copy

**Files:**
- Modify: `apps/web/src/admin/PancakePos.jsx`
- Modify: `apps/web/test/adminPancakeSource.test.js`

- [ ] Update copy so manual buttons are described as immediate run-now controls while automatic sync handles routine updates.
- [ ] Add a source test for automatic sync wording.
- [ ] Run `node --test apps/web/test/adminPancakeSource.test.js`.

### Task 5: Verification

**Files:**
- No new source files unless tests reveal issues.

- [ ] Run focused tests for Pancake config, worker, server lifecycle, and admin source.
- [ ] Run full `npm test` in `apps/api`.
- [ ] Run `node --test test/*.test.js` and `npm run build` in `apps/web`.
- [ ] Run Docker migration, rebuild/recreate API/web, health check, secret scan, and `git diff --check`.
