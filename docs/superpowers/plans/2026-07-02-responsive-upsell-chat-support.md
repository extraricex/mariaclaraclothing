# Responsive Upsell and Chat Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive random New Arrivals recommendation and a labeled Messenger control without blocking storefront content.

**Architecture:** Put pure recommendation filtering/selection in `storefrontSupport.js`, while `Shell.jsx` owns catalog loading and UI state. A single responsive offer dock renders expanded on larger screens and as an accessible disclosure on phones.

**Tech Stack:** React, React Router, Tailwind CSS, Node test runner, Playwright, Docker Compose

---

### Task 1: Recommendation selection

**Files:**
- Modify: `apps/web/src/lib/storefrontSupport.js`
- Test: `apps/web/test/storefrontSupport.test.js`

- [ ] Add failing tests proving only imaged New Arrivals products are eligible and injected random values select stable bounds.
- [ ] Run `node --test test/storefrontSupport.test.js`; expect failures for the missing selector.
- [ ] Add `selectNewArrivalRecommendation(products, randomValue)` that filters by collection, slug, and image, clamps the random input below one, and returns one product or `null`.
- [ ] Re-run the focused test; expect all cases to pass.

### Task 2: Responsive offer dock

**Files:**
- Modify: `apps/web/src/components/Shell.jsx`
- Test: `apps/web/test/storefrontEnhancements.test.js`

- [ ] Add failing source assertions for the recommendation component, catalog request, `Offers` disclosure, responsive expanded state, dismissal, and visible Chat Support label.
- [ ] Run `node --test test/storefrontEnhancements.test.js`; expect the new assertions to fail.
- [ ] Import `fetchProducts` and the selector, load one recommendation at shell mount, and preserve it in state.
- [ ] Replace the standalone free-shipping aside with a pointer-safe offer dock. Show a compact `Offers · N` disclosure below `sm`; show the stack from `sm` upward; handle Escape and outside clicks while mobile is expanded.
- [ ] Add the recommendation card with image, name, price, product link, and independent session dismissal.
- [ ] Convert Messenger from a circle to a responsive pill showing `Chat Support` from `sm` upward and `Chat` below `sm`.
- [ ] Re-run focused tests; expect them to pass.

### Task 3: Verification and deployment

**Files:**
- Test: `apps/web/test/*.test.js`
- Test: `apps/api/test/*.test.js`

- [ ] Run all web tests and the serial API suite; expect zero failures.
- [ ] Run `npm run build:web`; expect Vite production build success.
- [ ] Run `npx playwright test -c playwright.config.js`; expect all available tests to pass.
- [ ] Run `docker compose build` and `docker compose up -d --force-recreate`.
- [ ] Verify `docker compose ps`, `/api/health`, desktop and phone disclosure behavior, product link, and zero browser console errors.
- [ ] Do not stage, commit, merge, pull, or push any files.
