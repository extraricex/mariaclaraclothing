# Phase 5A Admin Promo Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing admin Discounts section into admin promo management without creating a separate Promos section.

**Architecture:** The backend discount repository already supports promo fields. The admin list/create page and detail editor will expose those fields and keep using `POST /api/admin/discounts` and `PATCH /api/admin/discounts/:code`.

**Tech Stack:** React 18, existing admin API helpers, existing Node source tests, Express admin discount routes.

---

### Task 1: Admin Promo Source Tests

**Files:**
- Create: `apps/web/test/phase5aAdminPromoSource.test.js`

- [x] Add source tests requiring create/edit UI fields for promo name, method, type, banner text, terms, starts/ends, minimum quantity/subtotal, and Buy More Save More rules.
- [x] Run the test and verify it fails before implementation.

### Task 2: Discounts Create Promo Form

**Files:**
- Modify: `apps/web/src/admin/Discounts.jsx`
- Test: `apps/web/test/phase5aAdminPromoSource.test.js`

- [x] Extend `EMPTY_FORM` with promo metadata and rule fields.
- [x] Update create payload to include Phase 1 promo model fields.
- [x] Update list table labels/search/export/value display to show promo name, method, type, banner readiness, and schedule.
- [x] Run focused source tests.

### Task 3: Discount Detail Promo Editor

**Files:**
- Modify: `apps/web/src/admin/DiscountDetail.jsx`
- Test: `apps/web/test/phase5aAdminPromoSource.test.js`

- [x] Extend `formFromDiscount()` and save payload with promo metadata and Buy More Save More rules.
- [x] Add editor cards for promo identity, method, banner text, terms, schedule, eligibility, and tier rules.
- [x] Run focused source tests.

### Task 4: Roadmap, Build, Docker

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] Mark Phase 5A finished while keeping Phase 5B pending.
- [x] Run focused web tests, backend discount tests, `npm run build:web`, and `git diff --check`.
- [x] Run `docker compose up --build -d`.
- [x] Verify `docker compose ps`, `http://127.0.0.1:8081`, and `/api/health`.
