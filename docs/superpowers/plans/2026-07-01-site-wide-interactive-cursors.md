# Site-Wide Interactive Cursors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the hand pointer consistent across every enabled interactive control and its nested content while retaining a not-allowed cursor for disabled controls.

**Architecture:** Define one shared enabled cursor contract and one disabled cursor contract in `index.css`, with descendants forced to inherit the parent cursor. Extend existing source coverage and add a browser regression that deliberately gives nested button content a conflicting cursor to prove the global rule wins.

**Tech Stack:** React 19, Tailwind CSS 4, Node test runner, Playwright, Vite, Docker Compose

---

### Task 1: Enforce the Shared Cursor Contract

**Files:**
- Modify: `apps/web/test/buttonInteractionSource.test.js`
- Modify: `apps/web/src/index.css:97-145`
- Create: `apps/web/e2e/cursor-interactions.spec.js`

- [ ] **Step 1: Add failing source assertions**

Append assertions requiring `.interactive-control`-equivalent enabled and disabled selector groups, `!important`, and descendant inheritance to `apps/web/test/buttonInteractionSource.test.js`:

```js
  assert.match(css, /:is\(a\[href\][\s\S]*summary[\s\S]*label:has/);
  assert.match(css, /cursor:\s*pointer !important/);
  assert.match(css, /:is\(button:disabled[\s\S]*\[aria-disabled="true"\]/);
  assert.match(css, /cursor:\s*not-allowed !important/);
  assert.match(css, /\)\s*\*\s*\{[\s\S]*cursor:\s*inherit !important/);
```

- [ ] **Step 2: Run the source test and verify it fails**

Run `node --test apps/web/test/buttonInteractionSource.test.js`.

Expected: FAIL because the existing cursor declarations are not important and do not enforce descendant inheritance.

- [ ] **Step 3: Add the enabled and disabled cursor selectors**

Add shared selector groups in `apps/web/src/index.css`:

```css
  :is(
    a[href]:not([aria-disabled="true"]),
    button:not(:disabled):not([aria-disabled="true"]),
    [role="button"]:not([aria-disabled="true"]),
    summary,
    label[for],
    label:has(:is(input, select, textarea):not(:disabled)),
    .text-action:not([aria-disabled="true"])
  ) {
    cursor: pointer !important;
  }
  :is(
    a[href]:not([aria-disabled="true"]),
    button:not(:disabled):not([aria-disabled="true"]),
    [role="button"]:not([aria-disabled="true"]),
    summary,
    label[for],
    label:has(:is(input, select, textarea):not(:disabled)),
    .text-action:not([aria-disabled="true"])
  ) * {
    cursor: inherit !important;
  }
  :is(button:disabled, [role="button"][aria-disabled="true"], a[aria-disabled="true"]) {
    cursor: not-allowed !important;
  }
  :is(button:disabled, [role="button"][aria-disabled="true"], a[aria-disabled="true"]) * {
    cursor: inherit !important;
  }
```

- [ ] **Step 4: Run focused and complete source suites**

Run `node --test apps/web/test/buttonInteractionSource.test.js apps/web/test/textActionSource.test.js`, then `node --test apps/web/test/*.test.js`.

Expected: focused and complete web suites pass.

- [ ] **Step 5: Add browser regression coverage**

Create `apps/web/e2e/cursor-interactions.spec.js` that verifies enabled links, buttons, and injected nested spans compute to `pointer`, while a disabled product-size button computes to `not-allowed`.

```js
import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('enabled controls and nested content keep the hand pointer', async ({ page }) => {
  await page.goto('/');
  const menuLink = page.getByRole('link', { name: 'FAQ' }).first();
  await expect(menuLink).toHaveCSS('cursor', 'pointer');

  const menuChild = menuLink.locator('span[data-cursor-probe]');
  await menuLink.evaluate((element) => {
    const span = document.createElement('span');
    span.dataset.cursorProbe = 'true';
    span.style.cursor = 'default';
    span.textContent = ' probe';
    element.append(span);
  });
  await expect(menuChild).toHaveCSS('cursor', 'pointer');
});

test('disabled controls keep a not-allowed cursor', async ({ page }) => {
  await page.goto(`/product/${PRODUCT_SLUG}`);
  const disabledSize = page.locator('button:disabled').filter({ hasText: /xxxl/i }).first();
  await expect(disabledSize).toHaveCSS('cursor', 'not-allowed');
});
```

- [ ] **Step 6: Prove the browser test fails before deployment**

Run `npx playwright test cursor-interactions.spec.js -c apps/web/playwright.config.js` against the current container.

Expected: FAIL when an injected nested span uses `cursor: default` inside an enabled button.

- [ ] **Step 7: Rebuild Docker and run full verification**

Run `docker compose build web`, `docker compose up -d web`, all storefront browser interaction tests, `npm run build:web`, `git diff --check`, Docker status, and storefront/API health checks.

Expected: all checks pass and live enabled nested content remains pointer.

- [ ] **Step 8: Commit and preserve generated artifacts**

Commit the CSS and tests with `git commit -m "fix: enforce interactive cursors site-wide"`, then stash generated build/test artifacts and confirm `codex-edits` is clean.
