# Phase 2 Checkout Quote Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move customer cart and checkout totals to the backend quote API and add a checkout review step before order placement.

**Architecture:** The storefront calls `POST /api/discounts/quote` through `apps/web/src/lib/api.js`. Cart and checkout render backend quote totals, while order creation remains authoritative in `POST /api/orders`.

**Tech Stack:** React 18, Vite, Node test source checks, existing Express API.

---

### Task 1: Quote API Helper

**Files:**
- Modify: `apps/web/src/lib/api.js`
- Test: `apps/web/test/phase2CheckoutQuoteSource.test.js`

- [x] Add a source test requiring `quoteCart()` to call `/api/discounts/quote`.
- [x] Run the test and verify it fails before implementation.
- [x] Add `quoteCart(payload)` using the existing `request()` helper.
- [x] Run the test and verify it passes.

### Task 2: Cart Quote Totals

**Files:**
- Modify: `apps/web/src/pages/Cart.jsx`
- Test: `apps/web/test/phase2CheckoutQuoteSource.test.js`

- [x] Add source tests requiring cart to import `quoteCart`, store quote state, render discount/shipping/total, and avoid hardcoded free shipping text.
- [x] Run the test and verify it fails before implementation.
- [x] Fetch quotes whenever cart items change and render backend totals with a local fallback while loading.
- [x] Run the test and verify it passes.

### Task 3: Checkout Details And Review

**Files:**
- Modify: `apps/web/src/pages/Checkout.jsx`
- Test: `apps/web/test/phase2CheckoutQuoteSource.test.js`

- [x] Add source tests requiring `step`, `reviewQuote`, `handleReview`, `quoteCart`, and no `/api/discounts/validate` usage.
- [x] Run the test and verify it fails before implementation.
- [x] Split checkout into Details and Review states. Fetch a fresh quote before review and before final submit.
- [x] Send the selected discount code to order creation while keeping backend totals authoritative.
- [x] Run the test and verify it passes.

### Task 4: Roadmap And Verification

**Files:**
- Modify: `docs/enhancementdata2.md`

- [x] Update Phase 2 status only after tests and build pass.
- [x] Run focused source tests, backend promo/order tests, and web build.
- [x] Summarize remaining recommendations for Phase 3 and Phase 5.
