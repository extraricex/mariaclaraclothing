# Responsive React Website And Two-Tone Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active React storefront and admin route responsive from 320px through 2560px and apply the approved `#202020` / `#F1F1F1` theme without changing typography or application behavior.

**Architecture:** Keep the existing React component hierarchy and Tailwind v4 utility approach. Establish the palette through shared CSS theme tokens, then fix overflow at the smallest responsible component boundary. Source regression tests lock token and class contracts; Playwright verifies actual document overflow, local table scrolling, route actions, and representative viewport behavior against the running Docker stack.

**Tech Stack:** React 18, React Router 6, Tailwind CSS 4, Vite 6, Node `node:test`, Playwright, Docker Compose.

---

## File Map

- Create `apps/web/test/responsiveThemeSource.test.js`: exact palette, unchanged typography, route inventory, and shared responsive source contracts.
- Create `apps/web/e2e/responsive-layout.spec.js`: browser overflow and route smoke coverage across representative viewports.
- Modify `apps/web/src/index.css`: approved theme endpoints, derived neutral tokens, root shrink behavior, and shared table containment utility.
- Modify `apps/web/src/components/Shell.jsx`: narrow-header, drawer-item, and footer containment.
- Verify `apps/web/src/pages/Home.jsx`: existing section wrapping and responsive grids need no planned production change.
- Modify `apps/web/src/pages/Product.jsx`: purchase-row and detail-content containment.
- Modify `apps/web/src/pages/Cart.jsx`: cart-item, totals, and upsell containment.
- Modify `apps/web/src/pages/Checkout.jsx`: checkout header, summary-item, and discount-row containment.
- Modify `apps/web/src/pages/Account.jsx`: account header, order-card, and long-content wrapping.
- Verify `apps/web/src/pages/AccountSettings.jsx`: existing action wrapping and responsive form grid need no planned production change.
- Verify `apps/web/src/pages/CustomerAuth.jsx`: existing narrow-form containment needs no planned production change.
- Modify `apps/web/src/pages/InfoPage.jsx`: rich-content overflow containment.
- Modify `apps/web/src/pages/ThankYou.jsx`: long confirmation-value wrapping.
- Modify `apps/web/src/admin/AdminLayout.jsx`: mobile navigation and outlet containment contract.
- Modify `apps/web/src/admin/Dashboard.jsx`: metric, chart, and operational-card shrink boundaries.
- Modify `apps/web/src/admin/Orders.jsx`: header/filter wrapping and local table scroll contract.
- Modify `apps/web/src/admin/OrderDetail.jsx`: long identifiers, item rows, action groups, and detail grids.
- Modify `apps/web/src/admin/CartSessions.jsx`: header and local table scroll contract.
- Modify `apps/web/src/admin/Products.jsx`: header/filter wrapping and local table scroll contract.
- Modify `apps/web/src/admin/ProductEditor.jsx`: header actions, editor grids, media, and local variant-table scroll.
- Modify `apps/web/src/admin/ProductCountdown.jsx`: three-column settings grid collapse at narrow widths.
- Modify `apps/web/src/admin/Collections.jsx`: narrow-form and action containment.
- Modify `apps/web/src/admin/Inventory.jsx`: filter wrapping and local table scroll contract.
- Modify `apps/web/src/admin/Customers.jsx`: search and local table scroll contract.
- Modify `apps/web/src/admin/Discounts.jsx`: header actions, creation form, filters, and local table scroll contract.
- Modify `apps/web/src/admin/DiscountDetail.jsx`: long code, action groups, rule grids, and detail sidebar containment.
- Modify `apps/web/src/admin/Banners.jsx`: upload controls, previews, and actions at 320px.
- Modify `apps/web/src/admin/Settings.jsx`: settings grids, toggles, and action containment.

## Task 1: Lock The Approved Theme And Typography Contract

**Files:**
- Create: `apps/web/test/responsiveThemeSource.test.js`
- Modify: `apps/web/src/index.css`
- Test: `apps/web/test/responsiveThemeSource.test.js`

- [ ] **Step 1: Write the failing theme regression test**

Create the test with exact endpoint and font assertions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', file), 'utf8');

test('shared theme uses the approved two-tone endpoints and keeps typography unchanged', async () => {
  const css = await source('src/index.css');

  assert.match(css, /--color-paper:\s*#f1f1f1;/i);
  assert.match(css, /--color-cream:\s*#f1f1f1;/i);
  assert.match(css, /--color-white:\s*#f1f1f1;/i);
  assert.match(css, /--color-ink:\s*#202020;/i);
  assert.match(css, /--color-accent:\s*#202020;/i);
  assert.match(css, /--color-accent-deep:\s*#202020;/i);
  assert.match(css, /--font-display:\s*"Clash Display", "Archivo Black", sans-serif;/);
  assert.match(css, /--font-body:\s*"Switzer", "Helvetica Neue", sans-serif;/);
  assert.doesNotMatch(css, /Cloister|Old English|Unifraktur/i);
});

test('derived neutral interface tokens use only the approved endpoints', async () => {
  const css = await source('src/index.css');

  for (const token of ['ink-soft', 'clay', 'line']) {
    assert.match(
      css,
      new RegExp(`--color-${token}:\\s*color-mix\\(in srgb, #202020 \\d+%, #f1f1f1\\);`, 'i')
    );
  }
});
```

- [ ] **Step 2: Run the test and verify the intended RED state**

Run:

```bash
node --test apps/web/test/responsiveThemeSource.test.js
```

Expected: FAIL because the current tokens still contain `#ffffff`, `#171411`, and the orange accent values.

- [ ] **Step 3: Implement the minimal shared token change**

Replace only the color-token block in `apps/web/src/index.css`; retain the existing radius and font declarations:

```css
@theme {
  --color-paper: #f1f1f1;
  --color-cream: #f1f1f1;
  --color-white: #f1f1f1;
  --color-ink: #202020;
  --color-ink-soft: color-mix(in srgb, #202020 78%, #f1f1f1);
  --color-clay: color-mix(in srgb, #202020 58%, #f1f1f1);
  --color-line: color-mix(in srgb, #202020 22%, #f1f1f1);
  --color-accent: #202020;
  --color-accent-deep: #202020;
  --radius-admin: 6px;

  --font-display: "Clash Display", "Archivo Black", sans-serif;
  --font-body: "Switzer", "Helvetica Neue", sans-serif;
}
```

Keep hard-coded semantic success, warning, and error colors in route components unchanged.

- [ ] **Step 4: Run the focused and existing theme-adjacent tests**

Run:

```bash
node --test apps/web/test/responsiveThemeSource.test.js apps/web/test/adminResponsiveSource.test.js apps/web/test/shellSource.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the theme contract**

```bash
git add apps/web/src/index.css apps/web/test/responsiveThemeSource.test.js
git commit -m "style: apply approved two-tone theme"
```

## Task 2: Add Shared And Storefront Responsive Source Contracts

**Files:**
- Modify: `apps/web/test/responsiveThemeSource.test.js`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/components/Shell.jsx`
- Verify without a planned production change: `apps/web/src/pages/Home.jsx`
- Modify: `apps/web/src/pages/Product.jsx`
- Modify: `apps/web/src/pages/Cart.jsx`
- Modify: `apps/web/src/pages/Checkout.jsx`
- Modify: `apps/web/src/pages/Account.jsx`
- Verify without a planned production change: `apps/web/src/pages/AccountSettings.jsx`
- Verify without a planned production change: `apps/web/src/pages/CustomerAuth.jsx`
- Modify: `apps/web/src/pages/InfoPage.jsx`
- Modify: `apps/web/src/pages/ThankYou.jsx`
- Test: `apps/web/test/responsiveThemeSource.test.js`

- [ ] **Step 1: Add failing shared/storefront source assertions**

Append:

```js
test('shared roots and every active storefront route define shrink and overflow boundaries', async () => {
  const css = await source('src/index.css');
  const shell = await source('src/components/Shell.jsx');
  const cart = await source('src/pages/Cart.jsx');
  const checkout = await source('src/pages/Checkout.jsx');
  const account = await source('src/pages/Account.jsx');
  const product = await source('src/pages/Product.jsx');

  assert.match(css, /body,\s*#root[\s\S]*min-width:\s*0/);
  assert.match(css, /\.table-scroll[\s\S]*overflow-x:\s*auto/);
  assert.match(shell, /max-w-7xl min-w-0/);
  assert.match(shell, /min-w-0 flex-1/);
  assert.match(cart, /article key=\{item\.variantId\} className="flex min-w-0/);
  assert.match(checkout, /article key=\{item\.variantId\} className="flex min-w-0/);
  assert.match(account, /flex flex-wrap items-center gap-3/);
  assert.match(product, /mt-6 flex flex-wrap items-center gap-3/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test apps/web/test/responsiveThemeSource.test.js
```

Expected: FAIL on the missing root, shell, cart, checkout, account, and product containment markers.

- [ ] **Step 3: Add shared root and local-table utilities**

Add to `apps/web/src/index.css`:

```css
@layer base {
  body,
  #root {
    min-width: 0;
    max-width: 100%;
  }
}

@layer components {
  .table-scroll {
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    -webkit-overflow-scrolling: touch;
  }
}
```

Do not add document-level `overflow-x: hidden`; overflow must be fixed at the responsible component.

- [ ] **Step 4: Apply the storefront containment changes**

Make these exact class-level changes while preserving structure and behavior:

```jsx
// Shell.jsx header container and brand link
<div className="mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-5 lg:gap-6 lg:px-8">
<Link to="/" className="flex min-w-0 shrink items-center lg:shrink-0">

// Shell.jsx fallback logo
<span className="display truncate text-[32px] tracking-tight sm:text-[40px] lg:text-[49px]">

// Cart.jsx item and content column
<article key={item.variantId} className="flex min-w-0 gap-4 py-6 sm:gap-5">
<div className="flex min-w-0 flex-1 flex-col">
<div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
<h2 className="break-words text-sm font-semibold">{item.productName}</h2>

// Checkout.jsx summary item, text column, total, and discount row
<article key={item.variantId} className="flex min-w-0 gap-3 sm:gap-4">
<div className="min-w-0 flex-1">
<h3 className="break-words text-sm font-semibold leading-snug">{item.productName}</h3>
<strong className="shrink-0 text-sm">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</strong>
<div className="flex min-w-0 flex-col gap-2 sm:flex-row">

// Account.jsx action group
<div className="flex flex-wrap items-center gap-3">

// Product.jsx quantity/add row
<div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
<button type="button" className="btn-ink min-w-44 flex-1 !rounded" disabled={soldOut || !variant} onClick={handleAdd}>
  {soldOut ? (page.soldOutText || 'Sold out') : added ? 'Added ✓' : 'Add to cart'}
</button>
```

Do not change `Home.jsx`, `AccountSettings.jsx`, or `CustomerAuth.jsx` during this task: their existing `flex-wrap`, `max-w-*`, single-column form, and responsive-grid rules already express the approved behavior. The Playwright contract in Task 4 verifies them before any further change is considered.

Apply these long-content boundaries to the two remaining routes:

```jsx
// InfoPage.jsx
<summary className="flex min-w-0 cursor-pointer items-center justify-between gap-4 text-sm font-semibold uppercase tracking-[0.12em]">
<p className="mt-3 break-words text-sm leading-relaxed text-ink-soft">{section.body}</p>

// ThankYou.jsx
<strong className="break-all text-ink">{summary.orderNumber}</strong>
<dd className="min-w-0 break-words text-right font-semibold">{summary.orderNumber}</dd>
<dd className="min-w-0 break-words text-right">{summary.addressLine}</dd>
```

Keep their current breakpoints and typography unchanged.

- [ ] **Step 5: Run focused storefront tests**

Run:

```bash
node --test apps/web/test/responsiveThemeSource.test.js apps/web/test/shellSource.test.js apps/web/test/productPageSource.test.js apps/web/test/responsiveCartCheckoutImages.test.js apps/web/test/checkoutV2.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 6: Commit storefront containment**

```bash
git add apps/web/src/index.css apps/web/src/components/Shell.jsx apps/web/src/pages apps/web/test/responsiveThemeSource.test.js
git commit -m "fix: contain storefront layouts on narrow screens"
```

## Task 2A: Blend Product Photo Backgrounds Into The Website Surface

**Files:**
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/components/ProductCard.jsx`, `apps/web/src/components/Shell.jsx`, `apps/web/src/pages/Product.jsx`, `apps/web/src/pages/Cart.jsx`, `apps/web/src/pages/Checkout.jsx`, `apps/web/src/admin/Collections.jsx`, `apps/web/src/admin/Products.jsx`, `apps/web/src/admin/OrderDetail.jsx`, and `apps/web/src/admin/ProductEditor.jsx`
- Create: `apps/web/test/productPhotoBlendSource.test.js`

- [ ] **Step 1: Write the failing source regression test**

Assert that `index.css` defines `.product-photo-blend` with `mix-blend-mode: multiply`. Assert product image call sites in `ProductCard.jsx`, `Shell.jsx`, `Product.jsx`, `Cart.jsx`, `Checkout.jsx`, `Collections.jsx`, `Products.jsx`, `OrderDetail.jsx`, and `ProductEditor.jsx` use the class. Assert `Home.jsx`, `Banners.jsx`, `AdminLayout.jsx`, and `Login.jsx` do not use it so banners and logos remain unchanged.

- [ ] **Step 2: Run RED**

```bash
node --test apps/web/test/productPhotoBlendSource.test.js
```

Expected: FAIL because the shared class and call-site markers do not exist.

- [ ] **Step 3: Implement the shared display rule**

```css
.product-photo-blend {
  mix-blend-mode: multiply;
}
```

Append `product-photo-blend` to product `<img>` class names only. Preserve every existing sizing, aspect-ratio, `object-fit`, loading, alt-text, link, and interaction attribute.

- [ ] **Step 4: Run GREEN and the web suite**

```bash
node --test apps/web/test/productPhotoBlendSource.test.js
node --test apps/web/test/*.test.js
npm run build:web
```

Expected: all tests pass and the production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/test/productPhotoBlendSource.test.js
git commit -m "style: blend product photos with site background"
```

## Task 2B: Make Every Button Visibly Interactive

**Files:**
- Modify: `apps/web/src/index.css`
- Create: `apps/web/test/buttonInteractionSource.test.js`

- [ ] **Step 1: Write the failing interaction regression test**

Assert shared CSS rules cover enabled native buttons, `[role="button"]`, `.btn-ink`, `.btn-ghost`, and `.btn-secondary`; verify pointer, hover, active, focus-visible, disabled suppression, and `prefers-reduced-motion` behavior.

- [ ] **Step 2: Run RED**

```bash
node --test apps/web/test/buttonInteractionSource.test.js
```

Expected: FAIL because the shared interaction rules do not exist.

- [ ] **Step 3: Implement the shared interaction rules**

Use scoped `:not(:disabled):not([aria-disabled="true"])` selectors. Apply pointer and subtle filter/press feedback to native/role controls; apply the lift and shadow treatment to `.btn-ink`, `.btn-ghost`, and `.btn-secondary`; add a shared `:focus-visible` outline; explicitly suppress movement/filter/shadow for disabled controls; and disable transition/movement inside the existing reduced-motion media query.

- [ ] **Step 4: Run GREEN and the web suite**

```bash
node --test apps/web/test/buttonInteractionSource.test.js
node --test apps/web/test/*.test.js
npm run build:web
```

Expected: all tests pass and the production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css apps/web/test/buttonInteractionSource.test.js
git commit -m "style: add consistent button interaction feedback"
```

## Task 3: Add Admin Responsive Source Contracts

**Files:**
- Modify: `apps/web/test/responsiveThemeSource.test.js`
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Modify: `apps/web/src/admin/Dashboard.jsx`
- Modify: `apps/web/src/admin/Orders.jsx`
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Modify: `apps/web/src/admin/CartSessions.jsx`
- Modify: `apps/web/src/admin/Products.jsx`
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/src/admin/ProductCountdown.jsx`
- Modify: `apps/web/src/admin/Collections.jsx`
- Modify: `apps/web/src/admin/Inventory.jsx`
- Modify: `apps/web/src/admin/Customers.jsx`
- Modify: `apps/web/src/admin/Discounts.jsx`
- Modify: `apps/web/src/admin/DiscountDetail.jsx`
- Modify: `apps/web/src/admin/Banners.jsx`
- Modify: `apps/web/src/admin/Settings.jsx`
- Test: `apps/web/test/responsiveThemeSource.test.js`
- Test: `apps/web/test/adminResponsiveSource.test.js`

- [ ] **Step 1: Add the failing admin route inventory and containment test**

Append:

```js
test('every active admin screen participates in the responsive contract', async () => {
  const app = await source('src/App.jsx');
  const adminFiles = [
    'Dashboard.jsx', 'Orders.jsx', 'OrderDetail.jsx', 'CartSessions.jsx',
    'Products.jsx', 'ProductEditor.jsx', 'ProductCountdown.jsx', 'Collections.jsx',
    'Inventory.jsx', 'Customers.jsx', 'Discounts.jsx', 'DiscountDetail.jsx',
    'Banners.jsx', 'Settings.jsx'
  ];

  for (const file of adminFiles) {
    assert.match(app, new RegExp(`import \\w+ from './admin/${file.replace('.', '\\.')}'`));
    const adminSource = await source(`src/admin/${file}`);
    assert.match(adminSource, /min-w-0|flex-wrap|table-scroll|max-w-full/,
      `${file} needs an explicit responsive containment marker`);
  }
});

test('admin data tables use the shared local scroll container', async () => {
  for (const file of ['Orders.jsx', 'CartSessions.jsx', 'Products.jsx', 'ProductEditor.jsx', 'Inventory.jsx', 'Customers.jsx', 'Discounts.jsx']) {
    const adminSource = await source(`src/admin/${file}`);
    assert.match(adminSource, /table-scroll/);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test apps/web/test/responsiveThemeSource.test.js apps/web/test/adminResponsiveSource.test.js
```

Expected: FAIL because current table wrappers use ad hoc `overflow-x-auto` and several admin screens have no explicit shrink marker.

- [ ] **Step 3: Normalize admin containment without changing layouts**

Apply these rules consistently:

```jsx
// Orders.jsx example; use the same table-scroll class on every listed table wrapper
<div className="table-scroll mt-6 border border-line bg-paper">

// Page header/action rows
<div className="flex min-w-0 flex-wrap items-start justify-between gap-4">

// Text/header side of a row
<div className="min-w-0">
  <h1 className="display break-words text-2xl sm:text-3xl">{order.orderNumber}</h1>
</div>

// Action groups
<div className="flex max-w-full flex-wrap gap-2">

// Detail/editor grids retain existing xl columns and gain a shrink boundary
<div className="order-detail-grid mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
```

Specific narrow-grid changes:

```jsx
// ProductCountdown.jsx
<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">

// Dashboard.jsx chart label/value rows
<div className="grid min-w-0 grid-cols-[minmax(5.5rem,7.5rem)_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
```

Keep all existing table `min-width` values; the new `.table-scroll` parent contains them. Keep the desktop sidebar, mobile horizontal navigation, xl detail sidebars, and all actions unchanged.

- [ ] **Step 4: Run focused admin tests**

Run:

```bash
node --test apps/web/test/responsiveThemeSource.test.js apps/web/test/adminResponsiveSource.test.js apps/web/test/adminNavigationSource.test.js apps/web/test/adminProductsSource.test.js apps/web/test/adminOrdersSource.test.js apps/web/test/adminOrderDetailSource.test.js apps/web/test/adminDiscountsSource.test.js apps/web/test/adminSettingsSource.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 5: Commit admin containment**

```bash
git add apps/web/src/admin apps/web/test/responsiveThemeSource.test.js
git commit -m "fix: contain admin layouts across viewport sizes"
```

## Task 4: Add Browser-Level Responsive Route Coverage

**Files:**
- Create: `apps/web/e2e/responsive-layout.spec.js`
- Modify only if a browser assertion fails: the responsible file already listed in Tasks 2 or 3.
- Test: `apps/web/e2e/responsive-layout.spec.js`

- [ ] **Step 1: Write the Playwright overflow harness**

Create:

```js
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 800 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 2560, height: 1440 }
];

const PUBLIC_ROUTES = [
  '/',
  '/product/oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  '/cart', '/checkout', '/thank-you', '/login', '/register',
  '/faq', '/shipping-returns', '/terms'
];

const ACCOUNT_ROUTES = ['/account', '/account/settings'];

const CUSTOMER_FIXTURE = {
  id: 'responsive-customer',
  fullName: 'Responsive Customer With A Long Name',
  phone: '09171234567',
  email: 'responsive-customer-with-a-long-email@example.com',
  savedAddress: {
    houseAddress: '123 A Long Building And Street Name',
    barangay: 'Bucandala IV',
    city: 'Imus',
    province: 'Cavite'
  }
};

const ADMIN_ROUTES = [
  '/admin', '/admin/orders', '/admin/orders/draft',
  '/admin/orders/abandoned-checkout', '/admin/products',
  '/admin/products/countdown', '/admin/collections', '/admin/inventory',
  '/admin/customers', '/admin/discounts', '/admin/banners', '/admin/settings'
];

async function expectNoDocumentOverflow(page, route, viewport) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(metrics.scrollWidth, `${route} overflows at ${viewport.width}px`).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await expect(page.locator('body')).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport });

    test('storefront routes stay inside the document viewport', async ({ page }) => {
      for (const route of PUBLIC_ROUTES) {
        await expectNoDocumentOverflow(page, route, viewport);
      }
    });

    test('customer account routes stay inside the document viewport', async ({ page }) => {
      await page.route('**/api/customer/me', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ customer: CUSTOMER_FIXTURE })
      }));
      await page.route('**/api/customer/orders', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [] })
      }));
      await page.addInitScript(() => {
        localStorage.setItem('maria-clara-customer-token', 'responsive-test-token');
      });
      for (const route of ACCOUNT_ROUTES) {
        await expectNoDocumentOverflow(page, route, viewport);
      }
    });

    test('admin routes stay inside the document viewport', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
      for (const route of ADMIN_ROUTES) {
        await expectNoDocumentOverflow(page, route, viewport);
      }
    });
  });
}

test('mobile admin tables scroll locally instead of widening the document', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
  await page.goto('/admin/orders');
  const container = page.locator('.table-scroll').first();
  await expect(container).toBeVisible();
  const overflow = await container.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    overflowX: getComputedStyle(node).overflowX
  }));
  expect(['auto', 'scroll']).toContain(overflow.overflowX);
  expect(overflow.scrollWidth).toBeGreaterThanOrEqual(overflow.clientWidth);
});
```

- [ ] **Step 2: Build and restart the web container so the browser sees current source**

Run:

```bash
npm run build:web
docker compose build web
docker compose up -d web
```

Expected: Vite build exits 0; Docker rebuilds and starts the web service on port 8081.

- [ ] **Step 3: Run the new test and verify its first RED result**

Run:

```bash
npx playwright test -c apps/web/playwright.config.js apps/web/e2e/responsive-layout.spec.js
```

Expected: If any route still overflows, FAIL identifies the exact route and viewport. If all overflow assertions pass on the first run, add no speculative CSS; retain the test as evidence that the existing route already satisfies the contract.

- [ ] **Step 4: Fix each reported overflow one at a time**

For each failure:

1. Use browser evaluation to identify the widest visible element.
2. Add `min-w-0`, `max-w-full`, `break-words`, `flex-wrap`, a responsive grid breakpoint, or `.table-scroll` to that element's owning component.
3. Rebuild the web image.
4. Re-run only the failing Playwright project/test title.
5. Run the complete responsive layout spec after the focused assertion passes.

Do not use global clipping, hide content, reduce font families, or remove actions.

- [ ] **Step 5: Add detail-route instances and critical-action assertions**

Add this helper and test. It reads seeded records but does not mutate them:

```js
async function firstRecord(request, path, key) {
  const response = await request.get(path, {
    headers: { Authorization: 'Bearer local-admin-token' }
  });
  expect(response.ok(), `${path} must return seeded data`).toBeTruthy();
  const body = await response.json();
  return body[key]?.[0] || null;
}

test('seeded admin detail routes stay responsive and retain critical actions', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const [order, product, discount] = await Promise.all([
    firstRecord(request, '/api/admin/orders', 'orders'),
    firstRecord(request, '/api/admin/products', 'products'),
    firstRecord(request, '/api/admin/discounts', 'discounts')
  ]);
  expect(order?.orderNumber).toBeTruthy();
  expect(product?.slug).toBeTruthy();
  expect(discount?.code).toBeTruthy();

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
  for (const route of [
    `/admin/orders/${encodeURIComponent(order.orderNumber)}`,
    `/admin/products/${encodeURIComponent(product.slug)}`,
    `/admin/discounts/${encodeURIComponent(discount.code)}`
  ]) {
    await expectNoDocumentOverflow(page, route, { width: 320 });
    await expect(page.getByRole('button', { name: /save|update/i }).first()).toBeVisible();
  }
});
```

If a specific detail page names its existing save action differently, use that page's current accessible name; do not rename production buttons solely for this test.

- [ ] **Step 6: Commit browser coverage and final responsive fixes**

```bash
git add apps/web/e2e/responsive-layout.spec.js apps/web/src
git commit -m "test: cover responsive React routes"
```

## Task 5: Full Verification And Handoff

**Files:**
- Verify: all files changed in Tasks 1–4.

- [ ] **Step 1: Run all web source tests**

Run:

```bash
node --test apps/web/test/*.test.js
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build:web
```

Expected: Vite production build exits 0 with no compilation error.

- [ ] **Step 3: Rebuild the browser acceptance environment**

Run:

```bash
docker compose build web
docker compose up -d web
docker compose ps
```

Expected: `web`, `api`, and `postgres` are running; PostgreSQL is healthy.

- [ ] **Step 4: Run complete Playwright coverage**

Run:

```bash
npx playwright test -c apps/web/playwright.config.js
```

Expected: checkout and responsive layout tests pass with zero failures.

- [ ] **Step 5: Run backend regression tests**

Run:

```bash
npm test
```

Expected: all API tests pass with zero failures.

- [ ] **Step 6: Check repository hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; status contains only intentional implementation files and generated build artifacts are not staged.

- [ ] **Step 7: Commit any verification-only test adjustment**

Only if a test fixture required a non-production correction:

```bash
git add apps/web/test apps/web/e2e
git commit -m "test: finalize responsive acceptance coverage"
```

If no adjustment was required, do not create an empty commit.
