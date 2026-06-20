# Phase 8C Promo Notification Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins control which active promo notification appears when multiple promos are eligible.

**Architecture:** Add a numeric `priority` field to discount records, defaulting to `0`. The active notification endpoint will choose the eligible promo with the highest priority, using creation/update order as a fallback only when priorities tie. Admin create/detail forms will expose the field.

**Tech Stack:** Express discount/admin routes, discount repository with Postgres and JSON fallback, React admin discount pages, Node test runner, Vite.

---

### Task 1: Priority Persistence and Notification Selection

**Files:**
- Modify: `apps/api/test/activePromoNotification.test.js`
- Modify: `apps/api/src/discounts/discountRepository.js`
- Modify: `apps/api/src/routes/discounts.js`
- Modify: `apps/api/db/schema.sql`

- [x] **Step 1: Add failing priority notification test**

Assert multiple active eligible promos return the notification for the highest `priority`.

- [x] **Step 2: Persist priority**

Normalize `discount.priority`, include it in JSON records, Postgres reads/writes, and schema.

- [x] **Step 3: Select highest-priority active promo**

Sort eligible promos by descending priority before creating the notification payload.

### Task 2: Admin Priority Controls

**Files:**
- Modify: `apps/web/test/phase5aAdminPromoSource.test.js`
- Modify: `apps/web/src/admin/Discounts.jsx`
- Modify: `apps/web/src/admin/DiscountDetail.jsx`

- [x] **Step 1: Add failing admin source assertions**

Assert create and detail forms expose `Notification priority` and send `priority` in payloads.

- [x] **Step 2: Add create-form field**

Add priority to `EMPTY_FORM`, render the input, and include `priority: Number(form.priority || 0)` on create.

- [x] **Step 3: Add detail-form field**

Read, render, save, duplicate, and summarize priority from `DiscountDetail.jsx`.

### Task 3: Roadmap and Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] **Step 1: Update roadmap**

Add Phase 8C with status and deliverables.

- [x] **Step 2: Run focused tests**

Run `node --test apps/api/test/activePromoNotification.test.js apps/web/test/phase5aAdminPromoSource.test.js`.

- [x] **Step 3: Build and restart Docker**

Run `npm run build:web`, `git diff --check`, `docker compose up --build -d`, `docker compose ps`, `curl -I http://127.0.0.1:8081`, and `curl http://127.0.0.1:8081/api/health`.
