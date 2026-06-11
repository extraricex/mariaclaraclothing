# Checkout Shipping Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add region-based shipping fees, free shipping for 2+ items, and related product offers to checkout.

**Architecture:** Keep checkout behavior in `public/js/checkout.js`, markup in `public/checkout.html`, styling in `public/styles.css`, and contract coverage in existing Node tests. The checkout payload remains admin-ready by carrying selected shipping region, shipping fee, discount total, and cart snapshot.

**Tech Stack:** Static HTML, CSS, browser ES modules, Node built-in test runner.

---

### Task 1: Checkout Shipping Rules And Offer Shell

**Files:**
- Modify: `test/frontendBehavior.test.js`
- Modify: `public/checkout.html`
- Modify: `public/js/checkout.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Write failing test**

Add assertions that checkout includes region shipping options, free-shipping messaging, related products, shipping fee calculation constants, and selected shipping metadata in the payload.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test`

Expected: checkout behavior test fails because the new markup and JavaScript do not exist yet.

- [ ] **Step 3: Implement checkout markup**

Add shipping region radio controls with prices and a related-product offer container under the checkout summary.

- [ ] **Step 4: Implement checkout JavaScript**

Calculate shipping by selected region, make shipping free for cart quantity >= 2, rerender totals on region changes, render suggested products from catalog, and include `shippingRegion` plus `freeShippingUnlocked` in admin fields.

- [ ] **Step 5: Implement responsive styles**

Style the region choices, free-shipping hint, and product offer cards so they work on mobile and desktop checkout layouts.

- [ ] **Step 6: Verify**

Run: `npm test`, `node --check public/js/checkout.js`, and `curl -I http://localhost:3112/checkout.html`.

Expected: all tests pass, syntax check exits 0, checkout page returns HTTP 200.
