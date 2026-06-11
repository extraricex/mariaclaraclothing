# Shopify Product Page Reference Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the customer product detail page to the approved Maria Clara Shopify product page reference.

**Architecture:** Keep the existing static product shell and `public/js/storefront.js` renderer, but change the rendered product section order and CSS to mirror the Shopify reference. Product data continues to come from the existing product API/database.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node test runner.

---

### Task 1: Product Page Shell

**Files:**
- Modify: `public/product.html`
- Test: `test/frontendBehavior.test.js`

- [ ] Set the announcement bar to `BUY 2 ITEMS TO GET FREE SHIPPING FEE`.
- [ ] Remove the separate `shopify-section size-guide compact-guide` table from `product.html`.
- [ ] Simplify the product footer to match the reference: minimal payment area and `© 2026, Maria Clara`.

### Task 2: Product Renderer

**Files:**
- Modify: `public/js/storefront.js`
- Test: `test/frontendBehavior.test.js`

- [ ] Render up to 5 product images.
- [ ] Use Shopify-style product section classes: `product product--large product--left product--stacked product--mobile-hide grid grid--1-col grid--2-col-tablet`.
- [ ] Place product description, size chart image, and share control inside the product info column.
- [ ] Remove the product upsell and mobile sticky buy bar from this reference-matched page.
- [ ] Keep cart drawer, quantity selector, variant dropdown, pickup status, and lightbox behavior.

### Task 3: Product CSS

**Files:**
- Modify: `public/styles.css`
- Test: `test/frontendBehavior.test.js`

- [ ] Tune desktop column widths to the reference: media around 65%, info around 35%.
- [ ] Make the info column sticky on desktop.
- [ ] Make mobile media a horizontal slider with `1 / 5` counter.
- [ ] Match simple Shopify price, badge, dropdown, quantity, add-to-cart, pickup, description, share, and footer spacing.
- [ ] Prevent horizontal scrolling on all breakpoints.

### Task 4: Verification

**Files:**
- Test: `test/frontendBehavior.test.js`
- Test: `test/pageShell.test.js`

- [ ] Run `node --check public/js/storefront.js`.
- [ ] Run `node --test test/frontendBehavior.test.js`.
- [ ] Run `node --test test/pageShell.test.js`.

