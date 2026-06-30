# Phase 1 Accessibility and Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve storefront keyboard access, contrast, carousel motion, and touch targets without changing the approved layout or adding a pause button.

**Architecture:** Add a focused modal-accessibility hook for the cart drawer, keep mobile-menu keyboard handling in the shell, and keep carousel ownership in the home page while removing its timer. Shared contrast, reduced-motion, and touch-target rules remain in the component CSS layer, with source tests and browser tests covering behavior.

**Tech Stack:** React 18, React Router, Tailwind CSS v4, Node test runner, Playwright, Vite, Docker Compose

---

## File Structure

- Create `apps/web/src/hooks/useModalFocus.js`: focus trap, Escape close, body-scroll lock, and focus restoration for modal UI.
- Create `apps/web/test/phase1AccessibilitySource.test.js`: source contracts for dialog semantics, manual carousel behavior, mobile menu behavior, and touch targets.
- Create `apps/web/e2e/accessibility-interactions.spec.js`: rendered keyboard, carousel, and hit-area checks.
- Modify `apps/web/src/components/Shell.jsx`: accessible cart drawer and mobile-menu behavior; apply touch-target utility.
- Modify `apps/web/src/pages/Home.jsx`: remove autoplay and keep manual dots only.
- Modify `apps/web/src/pages/Checkout.jsx`: apply the touch-target utility to quantity controls.
- Modify `apps/web/src/index.css`: contrast token, reusable touch-target rule, carousel-dot rendering, and reduced-motion handling.
- Modify `apps/web/test/responsiveThemeSource.test.js`: update the approved clay mix expectation.

### Task 1: Contrast and Touch-Target Foundation

**Files:**
- Create: `apps/web/test/phase1AccessibilitySource.test.js`
- Modify: `apps/web/test/responsiveThemeSource.test.js`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Write failing source contracts**

Create `apps/web/test/phase1AccessibilitySource.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', file), 'utf8');

test('phase one provides accessible contrast and touch targets', async () => {
  const css = await source('src/index.css');

  assert.match(css, /--color-clay:\s*color-mix\(in srgb, #202020 65%, #f1f1f1\);/i);
  assert.match(css, /\.touch-target\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.carousel-dot\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
  assert.match(css, /\.carousel-dot::after\s*{[^}]*width:\s*0\.625rem;[^}]*height:\s*0\.625rem;/s);
  assert.match(css, /\.carousel-dot\[aria-current="true"\]::after\s*{[^}]*background:\s*currentColor;/s);
});
```

In `apps/web/test/responsiveThemeSource.test.js`, change the expected clay percentage:

```js
const neutralTokens = {
  'ink-soft': 78,
  clay: 65,
  line: 22,
};
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js apps/web/test/responsiveThemeSource.test.js
```

Expected: FAIL because clay is still 58% and the new utilities do not exist.

- [ ] **Step 3: Add the minimal shared CSS**

In `apps/web/src/index.css`, update the token and add component rules:

```css
--color-clay: color-mix(in srgb, #202020 65%, #f1f1f1);
```

```css
.touch-target {
  min-width: 44px;
  min-height: 44px;
}

.carousel-dot {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: var(--color-paper);
}

.carousel-dot::after {
  width: 0.625rem;
  height: 0.625rem;
  content: "";
  border: 1px solid currentColor;
  border-radius: 9999px;
  background: transparent;
  transition: background-color 200ms ease;
}

.carousel-dot[aria-current="true"]::after {
  background: currentColor;
}
```

Extend the existing reduced-motion query:

```css
.carousel-dot::after,
.hero-slide {
  transition: none !important;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js apps/web/test/responsiveThemeSource.test.js
```

Expected: both test files pass.

- [ ] **Step 5: Commit the foundation**

```bash
git add apps/web/src/index.css apps/web/test/phase1AccessibilitySource.test.js apps/web/test/responsiveThemeSource.test.js
git commit -m "style: improve storefront contrast and touch targets"
```

### Task 2: Manual Carousel Without a Pause Button

**Files:**
- Modify: `apps/web/test/phase1AccessibilitySource.test.js`
- Modify: `apps/web/src/pages/Home.jsx`

- [ ] **Step 1: Add a failing manual-carousel contract**

Append:

```js
test('homepage carousel is manual and adds no pause control', async () => {
  const home = await source('src/pages/Home.jsx');

  assert.doesNotMatch(home, /setInterval|clearInterval/);
  assert.doesNotMatch(home, />\s*(Pause|Play)\s*</i);
  assert.match(home, /className="mt-10 flex items-center justify-center"/);
  assert.match(home, /className="carousel-dot"/);
  assert.match(home, /aria-label={`Show banner \$\{index \+ 1\}`}/);
  assert.match(home, /onClick=\{\(\) => setActiveHeroIndex\(index\)\}/);
  assert.match(home, /hero-slide absolute inset-0/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js
```

Expected: FAIL because `Home.jsx` still uses `setInterval` and old dot classes.

- [ ] **Step 3: Remove autoplay and retain only manual dots**

Delete the carousel timer effect from `Home.jsx`. Update the slide class and dot markup:

```jsx
className={`hero-slide absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeHeroIndex ? 'opacity-100' : 'opacity-0'}`}
```

```jsx
<div className="mt-10 flex items-center justify-center" aria-label="Homepage banner slides">
  {banners.map((banner, index) => (
    <button
      key={`${banner.url}-dot-${index}`}
      type="button"
      className="carousel-dot"
      aria-label={`Show banner ${index + 1}`}
      aria-current={index === activeHeroIndex ? 'true' : undefined}
      onClick={() => setActiveHeroIndex(index)}
    />
  ))}
</div>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js
```

Expected: both Phase 1 source tests pass.

- [ ] **Step 5: Commit carousel behavior**

```bash
git add apps/web/src/pages/Home.jsx apps/web/test/phase1AccessibilitySource.test.js
git commit -m "fix: make homepage carousel manual"
```

### Task 3: Accessible Cart Drawer

**Files:**
- Create: `apps/web/src/hooks/useModalFocus.js`
- Modify: `apps/web/test/phase1AccessibilitySource.test.js`
- Modify: `apps/web/src/components/Shell.jsx`

- [ ] **Step 1: Add a failing drawer contract**

Append:

```js
test('cart drawer exposes modal keyboard behavior', async () => {
  const shell = await source('src/components/Shell.jsx');

  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /aria-labelledby="cart-drawer-title"/);
  assert.match(shell, /id="cart-drawer-title"/);
  assert.match(shell, /inert=\{open \? undefined : ''\}/);
  assert.match(shell, /useModalFocus/);
  assert.match(shell, /closeCartDrawer/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js
```

Expected: FAIL because the hook and dialog attributes do not exist.

- [ ] **Step 3: Implement the focus-management hook**

Create `apps/web/src/hooks/useModalFocus.js`:

```js
import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function useModalFocus({ open, containerRef, initialFocusRef, onClose }) {
  useEffect(() => {
    if (!open || !containerRef.current) return undefined;

    const container = containerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = () => [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter((element) => element.getAttribute('aria-hidden') !== 'true');

    (initialFocusRef.current || focusable()[0] || container).focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [containerRef, initialFocusRef, onClose, open]);
}
```

- [ ] **Step 4: Wire dialog semantics and stable refs**

In `Shell.jsx`:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import useModalFocus from '../hooks/useModalFocus.js';
```

Inside `CartDrawer`:

```jsx
const dialogRef = useRef(null);
const closeButtonRef = useRef(null);
useModalFocus({ open, containerRef: dialogRef, initialFocusRef: closeButtonRef, onClose });
```

Update the dialog markup:

```jsx
<button
  type="button"
  tabIndex={-1}
  className={`absolute inset-0 bg-ink/35 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
  aria-label="Close cart drawer"
  onClick={onClose}
/>
<aside
  ref={dialogRef}
  role="dialog"
  aria-modal="true"
  aria-labelledby="cart-drawer-title"
  inert={open ? undefined : ''}
  tabIndex={-1}
  className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
>
```

Update the title and close button:

```jsx
<h2 id="cart-drawer-title" className="display text-3xl">Your cart</h2>
<button ref={closeButtonRef} type="button" className="touch-target inline-flex items-center text-sm font-semibold uppercase tracking-[0.14em] text-clay hover:text-ink" onClick={onClose}>
  Close
</button>
```

In `Shell`, make the close callback stable:

```js
const closeCartDrawer = useCallback(() => setCartDrawerOpen(false), []);
```

Pass `closeCartDrawer` to `CartDrawer`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js
```

Expected: all Phase 1 source tests pass.

- [ ] **Step 6: Commit drawer behavior**

```bash
git add apps/web/src/hooks/useModalFocus.js apps/web/src/components/Shell.jsx apps/web/test/phase1AccessibilitySource.test.js
git commit -m "fix: make cart drawer keyboard accessible"
```

### Task 4: Mobile Menu and Storefront Touch Targets

**Files:**
- Modify: `apps/web/test/phase1AccessibilitySource.test.js`
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/src/pages/Checkout.jsx`

- [ ] **Step 1: Add failing menu and usage contracts**

Append:

```js
test('mobile menu and compact storefront controls use phase one behavior', async () => {
  const [shell, checkout] = await Promise.all([
    source('src/components/Shell.jsx'),
    source('src/pages/Checkout.jsx'),
  ]);

  assert.match(shell, /menuButtonRef/);
  assert.match(shell, /event\.key === 'Escape'[\s\S]*setMenuOpen\(false\)/);
  assert.match(shell, /aria-controls="storefront-mobile-menu"/);
  assert.match(shell, /aria-label=\{menuOpen \? 'Close navigation menu' : 'Open navigation menu'\}/);
  assert.match(shell, /id="storefront-mobile-menu"/);
  assert.match(shell, /className="touch-target px-3 py-1\.5" aria-label="Decrease quantity"/);
  assert.match(shell, /className="touch-target px-3 py-1\.5" aria-label="Increase quantity"/);
  assert.match(checkout, /className="touch-target border border-line px-2 py-0\.5"[^>]*aria-label="Decrease quantity"/);
  assert.match(checkout, /className="touch-target border border-line px-2 py-0\.5"[^>]*aria-label="Increase quantity"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js
```

Expected: FAIL because menu keyboard behavior and touch-target usages are absent.

- [ ] **Step 3: Add mobile-menu Escape and focus restoration**

Inside `Shell`:

```js
const menuButtonRef = useRef(null);

useEffect(() => {
  if (!menuOpen) return undefined;
  function handleMenuKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setMenuOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }
  document.addEventListener('keydown', handleMenuKeyDown);
  return () => document.removeEventListener('keydown', handleMenuKeyDown);
}, [menuOpen]);
```

Update the trigger:

```jsx
<button
  ref={menuButtonRef}
  type="button"
  className="text-action touch-target text-[12px] font-semibold uppercase tracking-[0.18em] lg:hidden"
  onClick={() => setMenuOpen((open) => !open)}
  aria-expanded={menuOpen}
  aria-controls="storefront-mobile-menu"
  aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
>
```

Add `id="storefront-mobile-menu"` to the conditional mobile `<nav>`.

- [ ] **Step 4: Apply touch targets without changing labels or icons**

Add `touch-target` to:

- Promo Close.
- Cart-drawer Close.
- Header Menu.
- Cart drawer quantity minus and plus.
- Checkout quantity minus and plus.

Example quantity control:

```jsx
<button type="button" className="touch-target px-3 py-1.5" aria-label="Decrease quantity" ...>−</button>
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test apps/web/test/phase1AccessibilitySource.test.js
```

Expected: all Phase 1 source tests pass.

- [ ] **Step 6: Commit mobile interactions**

```bash
git add apps/web/src/components/Shell.jsx apps/web/src/pages/Checkout.jsx apps/web/test/phase1AccessibilitySource.test.js
git commit -m "fix: improve mobile keyboard and touch controls"
```

### Task 5: Rendered Browser Regression Coverage

**Files:**
- Create: `apps/web/e2e/accessibility-interactions.spec.js`

- [ ] **Step 1: Add rendered regression coverage after the source-level RED/GREEN cycles**

Create the file before implementing Tasks 2–4 when executing the plan, and run the relevant test after each behavior is introduced:

```js
import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('cart drawer traps focus, closes with Escape, and restores focus', async ({ page }) => {
  await page.goto(`/product/${PRODUCT_SLUG}`);
  const addButton = page.getByRole('button', { name: /add to cart/i });
  await addButton.click();

  const dialog = page.getByRole('dialog', { name: /your cart/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: /^close$/i })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: /view cart/i })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(addButton).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('mobile menu closes with Escape and restores trigger focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: /open navigation menu/i });
  await menuButton.click();
  await expect(page.getByRole('navigation').filter({ has: page.getByRole('link', { name: /shipping/i }) })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
});

test('homepage slides remain manual and dots meet touch size', async ({ page }) => {
  await page.goto('/');
  const dots = page.getByRole('button', { name: /show banner/i });
  expect(await dots.count()).toBeGreaterThan(1);

  const first = dots.nth(0);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(5500);
  await expect(first).toHaveAttribute('aria-current', 'true');

  const box = await dots.nth(1).boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
});
```

- [ ] **Step 2: Rebuild Docker after Tasks 1–4 and verify rendered behavior**

Run:

```bash
docker compose build web
docker compose up -d web
npx playwright test apps/web/e2e/accessibility-interactions.spec.js -c apps/web/playwright.config.js
```

Expected: 3 browser tests pass. The source-level tests in Tasks 1–4 supplied the required failing tests before production changes; these browser tests verify the integrated result.

- [ ] **Step 3: Commit browser coverage**

```bash
git add apps/web/e2e/accessibility-interactions.spec.js
git commit -m "test: cover storefront accessibility interactions"
```

### Task 6: Full Verification and Deployment

**Files:**
- Generated only: Docker images and containers

- [ ] **Step 1: Run all web source tests**

Run:

```bash
node --test apps/web/test/*.test.js
```

Expected: all web tests pass with zero failures.

- [ ] **Step 2: Run Phase 1 browser tests**

Run:

```bash
npx playwright test apps/web/e2e/accessibility-interactions.spec.js -c apps/web/playwright.config.js
```

Expected: all Phase 1 browser tests pass.

- [ ] **Step 3: Build the production bundle**

Run:

```bash
npm run build:web
```

Expected: Vite exits zero and writes the production bundle.

- [ ] **Step 4: Rebuild and restart Docker**

Run:

```bash
docker compose build web
docker compose up -d web
```

Expected: the web container is recreated and reports `Up`.

- [ ] **Step 5: Verify live services**

Run:

```bash
curl -sS -I http://127.0.0.1:8081/
curl -sS http://127.0.0.1:3000/api/health
docker compose ps
```

Expected: storefront HTTP 200, API returns `{"ok":true,"service":"maria-clara-clothing"}`, and all containers are running with PostgreSQL healthy.

- [ ] **Step 6: Review deployed UI**

Open `http://127.0.0.1:8081` and confirm:

- No pause or play control is present.
- Existing dots remain the only visible carousel controls.
- Secondary text is only slightly darker.
- Cart drawer, mobile menu, and product layout remain visually unchanged.
