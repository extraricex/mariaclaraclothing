# Phase 7A Flow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the completed promo/cart/checkout/admin work with one connected regression and clean up roadmap status wording.

**Architecture:** Add an API-level full-flow test that runs an isolated Express app with temporary product, order, and discount files. Keep the test at the API boundary so it verifies real routes without browser flakiness.

**Tech Stack:** Node test runner, Express API, file-backed test repositories, roadmap markdown.

---

### Task 1: Full Flow Regression

**Files:**
- Create: `apps/api/test/promoFullFlow.test.js`

- [x] **Step 1: Add connected API flow test**

Cover active promo notification, backend quote, checkout order creation, public confirmation, admin order list/detail promo display, and status patch.

- [x] **Step 2: Run focused test**

Run: `node --test apps/api/test/promoFullFlow.test.js`

### Task 2: Roadmap Cleanup

**Files:**
- Create: `apps/web/test/phase7RoadmapSource.test.js`
- Modify: `docs/enhancementdata2.md`

- [x] **Step 1: Add failing roadmap source test**

Assert that the roadmap header says Phases 1-6 are finished and the status wording uses `packed` rather than conflicting “Packing” language.

- [x] **Step 2: Patch roadmap wording**

Update the header and manual QA status line.

- [x] **Step 3: Run roadmap source test**

Run: `node --test apps/web/test/phase7RoadmapSource.test.js`

### Task 3: Verification

**Files:**
- Modify: generated web dist assets after build

- [x] **Step 1: Run focused/adjacent tests**

Run the Phase 7 tests plus promo/admin/order regressions.

- [x] **Step 2: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl -s http://127.0.0.1:3000/api/health`.
