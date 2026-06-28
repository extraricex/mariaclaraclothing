# Responsive Cart And Checkout Product Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show complete, uncropped product photos in stable responsive thumbnail frames in the cart drawer and checkout order summary.

**Architecture:** Follow the working cart-page image pattern by replacing the two `object-cover` item images with `object-contain`. Give both wrappers a responsive `4:5` aspect-ratio contract so image size changes by viewport without affecting commerce state or surrounding controls.

**Tech Stack:** React 18, Tailwind CSS 4, Vite 6, Node test runner, Playwright Chromium, Docker Compose.

---

## Constraints

- Do not change product image sources, uploads, cart data, checkout data, pricing, inventory, orders, Meta tracking, or API behavior.
- Do not modify the working cart-page product thumbnail.
- Do not attempt to remove `data-new-gr-c-s-check-loaded`; Grammarly injects it outside the application.
- Do not stage, commit, merge, push, restore, reset, clean, or otherwise modify Git state.
- Preserve all existing uncommitted work.

## Task 1: Lock Responsive Full-Photo Rendering

**Files:**
- Create: `apps/web/test/responsiveCartCheckoutImages.test.js`
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/src/pages/Checkout.jsx`

- [ ] **Step 1: Write the failing regression test**

Create `apps/web/test/responsiveCartCheckoutImages.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('cart drawer and checkout keep complete product photos in responsive frames', async () => {
  const shell = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'),
    'utf8'
  );
  const checkout = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'pages', 'Checkout.jsx'),
    'utf8'
  );

  assert.match(
    shell,
    /className="aspect-\[4\/5\] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20"/
  );
  assert.match(
    shell,
    /alt=\{item\.productName\}\s+className="block h-full w-full object-contain"/
  );
  assert.doesNotMatch(
    shell,
    /alt=\{item\.productName\} className="[^"]*object-cover[^"]*"/
  );

  assert.match(
    checkout,
    /className="relative aspect-\[4\/5\] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20"/
  );
  assert.match(
    checkout,
    /alt=\{item\.productName\}\s+className="block h-full w-full object-contain"/
  );
  assert.doesNotMatch(
    checkout,
    /alt=\{item\.productName\} className="[^"]*object-cover[^"]*"/
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test apps/web/test/responsiveCartCheckoutImages.test.js
```

Expected: FAIL because `Shell.jsx` and `Checkout.jsx` still use fixed height/width wrappers and `object-cover`.

- [ ] **Step 3: Update the cart drawer thumbnail**

In `apps/web/src/components/Shell.jsx`, replace the current cart-drawer thumbnail wrapper and image with:

```jsx
<Link
  to={`/product/${encodeURIComponent(item.slug || String(item.productId).replace(/^catalog-/, ''))}`}
  className="aspect-[4/5] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20"
  onClick={onClose}
>
  {item.imageUrl && (
    <img
      src={item.imageUrl}
      alt={item.productName}
      className="block h-full w-full object-contain"
      loading="lazy"
    />
  )}
</Link>
```

- [ ] **Step 4: Update the checkout summary thumbnail**

In `apps/web/src/pages/Checkout.jsx`, replace the current order-summary thumbnail wrapper and image with:

```jsx
<div className="relative aspect-[4/5] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20">
  {item.imageUrl && (
    <img
      src={item.imageUrl}
      alt={item.productName}
      className="block h-full w-full object-contain"
      loading="lazy"
    />
  )}
  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-paper">
    {item.quantity}
  </span>
</div>
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test apps/web/test/responsiveCartCheckoutImages.test.js apps/web/test/cartUpsellSource.test.js apps/web/test/phase2CheckoutQuoteSource.test.js
```

Expected: all focused tests PASS.

## Task 2: Production And Browser Verification

**Files:**
- Verify: `apps/web/src/components/Shell.jsx`
- Verify: `apps/web/src/pages/Checkout.jsx`
- Verify: `apps/web/test/responsiveCartCheckoutImages.test.js`

- [ ] **Step 1: Run the complete web test suite**

Run:

```bash
node --test apps/web/test/*.test.js
```

Expected: zero failures.

- [ ] **Step 2: Run the production build**

Run:

```bash
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: Vite exits `0` with no build errors.

- [ ] **Step 3: Rebuild and restart Docker**

Run:

```bash
docker compose up -d --build --force-recreate
```

Expected: PostgreSQL becomes healthy and API/web containers start from the rebuilt images.

- [ ] **Step 4: Verify the live services**

Run:

```bash
docker compose ps
curl -fsS http://localhost:3000/api/health
curl -fsSI http://localhost:8081/checkout
```

Expected: all containers are up, PostgreSQL is healthy, API returns `{ "ok": true }`, and checkout returns HTTP `200`.

- [ ] **Step 5: Verify cart drawer and checkout at mobile and desktop widths**

Using installed Playwright Chromium:

1. Seed `localStorage['maria-clara-cart']` with one real catalog item and a valid image URL.
2. At a `390x844` viewport, open the cart drawer and assert its image uses `object-fit: contain`, has a `4:5` frame, fits inside the viewport, and causes no horizontal document overflow.
3. Open `/checkout` and assert the summary image uses `object-fit: contain`, has a `4:5` frame, keeps the quantity badge visible, and causes no horizontal document overflow.
4. Repeat at a `1440x1000` viewport.
5. Assert there are no browser page errors.

Expected: complete product photos remain visible in responsive frames at both viewports, with no cropping or overflow.

## Definition Of Done

- [ ] Cart drawer item photos use `object-contain` in responsive `4:5` frames.
- [ ] Checkout summary item photos use `object-contain` in responsive `4:5` frames.
- [ ] Cart-page behavior remains unchanged.
- [ ] Checkout quantity badge and controls remain visible.
- [ ] Focused tests, complete web tests, production build, Docker rebuild, service checks, and browser acceptance pass.
- [ ] No Git operations are performed.
