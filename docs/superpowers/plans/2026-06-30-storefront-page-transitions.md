# Storefront Page Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible 320ms fade-and-rise entry transition to customer storefront pages while keeping shared storefront chrome stable and leaving admin routes unchanged.

**Architecture:** A focused `PageTransition` component reads React Router location, resets scroll before paint when the pathname changes, and keys a CSS-animated content wrapper by pathname. `Shell` places the wrapper around its `Outlet`, while the standalone checkout route uses the same component directly; CSS owns the motion and reduced-motion fallback.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, Vite 6, Node test runner, Playwright, Docker Compose

---

## File Map

- Create `apps/web/src/components/PageTransition.jsx`: route-keyed content wrapper and pathname scroll reset.
- Modify `apps/web/src/components/Shell.jsx`: animate only the routed storefront content inside the persistent shell.
- Modify `apps/web/src/App.jsx`: apply the same wrapper to standalone checkout without touching admin routes.
- Modify `apps/web/src/index.css`: approved keyframes, duration, easing, and reduced-motion override.
- Create `apps/web/test/pageTransitionSource.test.js`: fast source-level contract tests for motion and route integration.
- Create `apps/web/e2e/page-transitions.spec.js`: browser coverage for animation, stable chrome, scroll reset, interaction, and reduced motion.

### Task 1: Build the Reusable Motion Primitive

**Files:**
- Create: `apps/web/src/components/PageTransition.jsx`
- Modify: `apps/web/src/index.css:190-215`
- Create: `apps/web/test/pageTransitionSource.test.js`

- [ ] **Step 1: Write the failing component and CSS contract test**

Create `apps/web/test/pageTransitionSource.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (relativePath) =>
  readFile(path.join(import.meta.dirname, '..', relativePath), 'utf8');

test('page transition uses the approved route motion and scroll reset', async () => {
  const component = await source('src/components/PageTransition.jsx');
  const css = await source('src/index.css');

  assert.match(component, /useLayoutEffect/);
  assert.match(component, /useLocation/);
  assert.match(component, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(component, /\[location\.pathname\]/);
  assert.match(component, /key=\{location\.pathname\}/);
  assert.match(component, /className="page-transition"/);

  assert.match(css, /@keyframes page-enter/);
  assert.match(css, /opacity:\s*0[\s\S]*translateY\(10px\)/);
  assert.match(css, /\.page-transition\s*\{[\s\S]*animation:\s*page-enter 320ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.page-transition[\s\S]*animation:\s*none !important[\s\S]*transform:\s*none !important/);
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js
```

Expected: FAIL because `src/components/PageTransition.jsx` does not exist.

- [ ] **Step 3: Add the minimal route-aware transition component**

Create `apps/web/src/components/PageTransition.jsx`:

```jsx
import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const location = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div key={location.pathname} className="page-transition">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Add the approved animation and reduced-motion fallback**

Add before the existing `@media (prefers-reduced-motion: reduce)` block in `apps/web/src/index.css`:

```css
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-transition {
  animation: page-enter 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
```

Add inside the existing reduced-motion media query:

```css
  .page-transition {
    animation: none !important;
    transform: none !important;
  }
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js
```

Expected: 1 test passes, 0 fail.

- [ ] **Step 6: Commit the motion primitive**

```bash
git add apps/web/src/components/PageTransition.jsx apps/web/src/index.css apps/web/test/pageTransitionSource.test.js
git commit -m "feat: add accessible storefront page motion"
```

### Task 2: Integrate Motion Without Remounting Storefront Chrome

**Files:**
- Modify: `apps/web/src/components/Shell.jsx:1-4,392-395`
- Modify: `apps/web/src/App.jsx:1-48`
- Modify: `apps/web/test/pageTransitionSource.test.js`

- [ ] **Step 1: Add the failing route-boundary contract test**

Append to `apps/web/test/pageTransitionSource.test.js`:

```js
test('storefront content transitions while shell chrome and admin stay stable', async () => {
  const shell = await source('src/components/Shell.jsx');
  const app = await source('src/App.jsx');
  const admin = await source('src/admin/AdminLayout.jsx');

  assert.match(shell, /import PageTransition from '\.\/PageTransition\.jsx'/);
  assert.match(shell, /<main className="flex-1">\s*<PageTransition>\s*<Outlet \/>\s*<\/PageTransition>\s*<\/main>/);
  assert.match(app, /import PageTransition from '\.\/components\/PageTransition\.jsx'/);
  assert.match(app, /path="\/checkout" element=\{<MaintenanceGate><PageTransition><Checkout \/><\/PageTransition><\/MaintenanceGate>\}/);
  assert.match(app, /<Route path="\/admin" element=\{<AdminLayout \/>\}>/);
  assert.doesNotMatch(admin, /PageTransition/);
});
```

- [ ] **Step 2: Run the test and verify the integration assertion fails**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js
```

Expected: the first test passes and the new integration test fails because `Shell.jsx` and `App.jsx` do not import or render `PageTransition`.

- [ ] **Step 3: Wrap only the shell route outlet**

Add to the imports in `apps/web/src/components/Shell.jsx`:

```jsx
import PageTransition from './PageTransition.jsx';
```

Replace the current main outlet block with:

```jsx
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
```

Keep `Ticker`, `PromoNotification`, `header`, `CartDrawer`, and `footer` outside `PageTransition`.

- [ ] **Step 4: Wrap standalone checkout and leave admin untouched**

Add to `apps/web/src/App.jsx`:

```jsx
import PageTransition from './components/PageTransition.jsx';
```

Replace only the checkout route with:

```jsx
      <Route path="/checkout" element={<MaintenanceGate><PageTransition><Checkout /></PageTransition></MaintenanceGate>} />
```

Do not modify the `/admin/login` or `/admin` route elements.

- [ ] **Step 5: Run focused and full source suites**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js
node --test apps/web/test/*.test.js
```

Expected: 2 focused tests pass, then the complete web source suite passes with 0 failures.

- [ ] **Step 6: Commit route integration**

```bash
git add apps/web/src/components/Shell.jsx apps/web/src/App.jsx apps/web/test/pageTransitionSource.test.js
git commit -m "feat: transition storefront route content"
```

### Task 3: Verify the Experience in a Real Browser

**Files:**
- Create: `apps/web/e2e/page-transitions.spec.js`

- [ ] **Step 1: Write browser tests for normal and reduced motion**

Create `apps/web/e2e/page-transitions.spec.js`:

```js
import { test, expect } from '@playwright/test';

test('storefront navigation animates content, preserves chrome, and resets scroll', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header');
  await header.evaluate((element) => { window.__storefrontHeader = element; });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('footer').getByRole('link', { name: 'FAQ' }).click();

  await expect(page).toHaveURL(/\/faq$/);
  const transition = page.locator('.page-transition');
  await expect(transition).toHaveCSS('animation-name', 'page-enter');
  await expect(transition).toHaveCSS('animation-duration', '0.32s');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(header).toBeVisible();
  expect(await header.evaluate((element) => element === window.__storefrontHeader)).toBe(true);

  const firstSection = page.locator('details').first();
  await firstSection.locator('summary').click();
  await expect(firstSection).not.toHaveAttribute('open', '');
});

test('reduced motion shows routed content immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/faq');

  const transition = page.locator('.page-transition');
  await expect(transition).toHaveCSS('animation-name', 'none');
  await expect(transition).toHaveCSS('transform', 'none');
  await expect(page.getByRole('heading', { name: /frequently asked questions/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the browser test against the current deployment to prove it fails**

Run:

```bash
npx playwright test page-transitions.spec.js -c apps/web/playwright.config.js
```

Expected: FAIL because the currently deployed build does not yet contain `.page-transition`.

- [ ] **Step 3: Build and restart the web container with the implementation**

Run:

```bash
docker compose build web
docker compose up -d web
```

Expected: the web image builds successfully and the `web`, `api`, and `postgres` services are running.

- [ ] **Step 4: Run the browser test against the rebuilt deployment**

Run:

```bash
npx playwright test page-transitions.spec.js -c apps/web/playwright.config.js
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Commit browser coverage**

```bash
git add apps/web/e2e/page-transitions.spec.js
git commit -m "test: cover storefront page transitions"
```

### Task 4: Final Verification and Deployment Check

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: Run the complete API and web source suites**

Run:

```bash
npm test
node --test apps/web/test/*.test.js
```

Expected: both commands exit 0; PostgreSQL-only tests may remain skipped when `TEST_POSTGRES_URL` is unset.

- [ ] **Step 2: Run all storefront interaction browser tests**

Run:

```bash
npx playwright test accessibility-interactions.spec.js page-transitions.spec.js -c apps/web/playwright.config.js
```

Expected: 5 tests pass, 0 fail.

- [ ] **Step 3: Verify a clean production build**

Run:

```bash
npm run build:web
git diff --check
```

Expected: Vite completes successfully and Git reports no whitespace errors.

- [ ] **Step 4: Verify the live containers and endpoints**

Run:

```bash
docker compose ps
curl -fsSI http://127.0.0.1:8081/
curl -fsS http://127.0.0.1:3000/api/health
```

Expected: all three services are running, the storefront returns HTTP 200, and the API returns `{"ok":true,"service":"maria-clara-clothing"}`.

- [ ] **Step 5: Preserve generated verification artifacts and confirm branch state**

The test suite and Vite build modify tracked fixture/build files. Preserve those generated files without committing them:

```bash
git stash push -u -m "preserve page transition verification artifacts"
git status --short
git branch --show-current
```

Expected: the working tree is clean and the active branch is `codex-edits`.
