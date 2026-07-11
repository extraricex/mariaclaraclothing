# Customer Storefront Hybrid UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Hybrid Recommended customer storefront polish using React, Tailwind CSS, and shadcn/ui-style local primitives without changing commerce behavior.

**Architecture:** Add lightweight presentational UI primitives under `apps/web/src/components/ui/`, then restyle customer pages around those primitives and shared CSS tokens. Existing data fetching, cart, checkout, analytics, Pancake sync, routes, and admin pages remain unchanged.

**Tech Stack:** React 18, React Router, Tailwind CSS v4, local shadcn/ui-inspired components, Node test runner, Playwright.

---

### Task 1: Add UI Source Coverage

**Files:**
- Create: `apps/web/test/customerHybridUiSource.test.js`

- [ ] **Step 1: Write the failing test**

Create a source test that checks the customer UI primitives and hybrid storefront markers:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('customer storefront defines shadcn-style local UI primitives', async () => {
  for (const file of [
    'components/ui/Button.jsx',
    'components/ui/Card.jsx',
    'components/ui/Badge.jsx',
    'components/ui/Input.jsx',
    'components/ui/Separator.jsx'
  ]) {
    const content = await source(file);
    assert.match(content, /cn\(/);
    assert.match(content, /className/);
  }
});

test('customer storefront applies the approved hybrid visual system only to customer pages', async () => {
  const [css, home, productCard, product, cart, checkout, shell] = await Promise.all([
    source('index.css'),
    source('pages/Home.jsx'),
    source('components/ProductCard.jsx'),
    source('pages/Product.jsx'),
    source('pages/Cart.jsx'),
    source('pages/Checkout.jsx'),
    source('components/Shell.jsx')
  ]);

  assert.match(css, /--customer-bg/);
  assert.match(css, /\.customer-card/);
  assert.match(css, /\.customer-input/);
  assert.match(home, /Pancake synced orders/);
  assert.match(home, /customer-hero/);
  assert.match(productCard, /CustomerBadge/);
  assert.match(product, /customer-buy-panel/);
  assert.match(cart, /customer-order-summary/);
  assert.match(checkout, /customer-checkout-shell/);
  assert.match(shell, /customer-cart-sheet/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test apps/web/test/customerHybridUiSource.test.js
```

Expected: fails because the UI primitive files and hybrid class markers do not exist yet.

### Task 2: Add Local shadcn/ui-Style Primitives

**Files:**
- Create: `apps/web/src/components/ui/cn.js`
- Create: `apps/web/src/components/ui/Button.jsx`
- Create: `apps/web/src/components/ui/Card.jsx`
- Create: `apps/web/src/components/ui/Badge.jsx`
- Create: `apps/web/src/components/ui/Input.jsx`
- Create: `apps/web/src/components/ui/Separator.jsx`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Implement presentational primitives**

Each primitive should accept `className`, preserve native props, and use `cn()` for class joining. Do not introduce state or business logic.

- [ ] **Step 2: Add customer CSS tokens**

Add customer-only tokens and utility classes in `index.css`: `--customer-bg`, `--customer-surface`, `--customer-border`, `--customer-muted`, `.customer-card`, `.customer-input`, `.customer-hero`, `.customer-cart-sheet`, `.customer-buy-panel`, `.customer-order-summary`, and `.customer-checkout-shell`.

- [ ] **Step 3: Run the source test**

Run:

```bash
node --test apps/web/test/customerHybridUiSource.test.js
```

Expected: still fails until page files adopt the markers.

### Task 3: Restyle Customer Shell And Homepage

**Files:**
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/src/pages/Home.jsx`
- Modify: `apps/web/src/components/ProductCard.jsx`

- [ ] **Step 1: Update Shell presentation**

Keep ticker, promo notification, privacy dialog, offer dock, messenger link, cart drawer behavior, and route outlet intact. Restyle the cart drawer with `.customer-cart-sheet`, `CustomerButton`, `CustomerCard`, and customer token classes.

- [ ] **Step 2: Update Homepage presentation**

Keep existing product/content fetching and collection-building. Restyle the hero with `.customer-hero`, add the visible trust phrase `Pancake synced orders`, and keep collection grids connected to existing products.

- [ ] **Step 3: Update ProductCard presentation**

Keep `Link`, stock calculations, badges, price, hover image behavior, and route behavior. Use `CustomerBadge`, `.customer-card`, and stable image surfaces.

- [ ] **Step 4: Run source tests**

Run:

```bash
node --test apps/web/test/customerHybridUiSource.test.js apps/web/test/productPhotoBlendSource.test.js apps/web/test/shellSource.test.js apps/web/test/phase3CartDrawerSource.test.js apps/web/test/phase1AccessibilitySource.test.js
```

Expected: pass.

### Task 4: Restyle Product, Cart, Checkout, And Support Pages

**Files:**
- Modify: `apps/web/src/pages/Product.jsx`
- Modify: `apps/web/src/pages/Cart.jsx`
- Modify: `apps/web/src/pages/Checkout.jsx`
- Modify if needed: `apps/web/src/pages/ThankYou.jsx`
- Modify if needed: `apps/web/src/pages/InfoPage.jsx`
- Modify if needed: `apps/web/src/pages/Account.jsx`
- Modify if needed: `apps/web/src/pages/AccountSettings.jsx`
- Modify if needed: `apps/web/src/pages/CustomerAuth.jsx`

- [ ] **Step 1: Product page**

Preserve gallery, variants, quantity, add-to-cart, countdown, details tabs, recommendations, and analytics calls. Restyle the buying panel with `.customer-buy-panel`.

- [ ] **Step 2: Cart page**

Preserve quote refresh, item quantity updates, removal, upsells, and checkout link. Restyle totals with `.customer-order-summary`.

- [ ] **Step 3: Checkout page**

Preserve details/review flow, all placeholders, button names, address selects, discount, quote refresh, idempotency, order submission, and thank-you navigation. Restyle the wrapper with `.customer-checkout-shell`.

- [ ] **Step 4: Support pages**

Apply matching card/button/input styles to thank-you, auth, account, and info pages only where safe.

- [ ] **Step 5: Run focused source tests**

Run:

```bash
node --test apps/web/test/customerHybridUiSource.test.js apps/web/test/productPageSource.test.js apps/web/test/phase1AccessibilitySource.test.js apps/web/test/responsiveCartCheckoutImages.test.js apps/web/test/phase2CheckoutQuoteSource.test.js apps/web/test/checkoutV2.test.js
```

Expected: pass.

### Task 5: Full Verification And Commit

**Files:**
- All changed customer UI files.

- [ ] **Step 1: Run full web tests**

Run:

```bash
node --test apps/web/test/*.test.js
```

Expected: all pass.

- [ ] **Step 2: Build web**

Run:

```bash
npm run build:web
```

Expected: Vite build succeeds.

- [ ] **Step 3: Run critical checkout E2E**

Run:

```bash
npm run test:e2e -w apps/web -- e2e/checkout-v2.spec.js
```

Expected: checkout test passes.

- [ ] **Step 4: Verify local health**

Run:

```bash
curl -fsS http://localhost:8081/api/health
```

Expected: `{"ok":true,"service":"maria-clara-clothing"}`.

- [ ] **Step 5: Commit**

Commit message:

```bash
git add apps/web/src apps/web/test docs/superpowers/plans/2026-07-08-customer-storefront-hybrid-ui-redesign.md
git commit -m "Polish customer storefront hybrid UI"
```
