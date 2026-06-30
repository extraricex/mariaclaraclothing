# Storefront Transition 750ms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slow the existing Editorial Glide storefront route transition from 480 milliseconds to 750 milliseconds without changing any other motion or visual behavior.

**Architecture:** Update the existing source and browser duration contracts first, then make the single CSS timing change. Reuse the current route wrapper, stable paper backdrop, transform cleanup, responsive, product-blending, and reduced-motion behavior unchanged.

**Tech Stack:** React 19, Tailwind CSS 4, Node test runner, Playwright, Vite, Docker Compose

---

### Task 1: Change and Deploy the Transition Duration

**Files:**
- Modify: `apps/web/test/pageTransitionSource.test.js`
- Modify: `apps/web/e2e/page-transitions.spec.js`
- Modify: `apps/web/src/index.css:205-209`

- [ ] **Step 1: Change test expectations before production CSS**

In `apps/web/test/pageTransitionSource.test.js`, replace `480ms` with `750ms` in the `.page-transition` animation assertion:

```js
  assert.match(css, /\.page-transition\s*\{[\s\S]*animation:\s*page-enter 750ms cubic-bezier\(0\.22, 1, 0\.36, 1\) backwards/);
```

In `apps/web/e2e/page-transitions.spec.js`, replace the duration expectation with:

```js
  await expect(transition).toHaveCSS('animation-duration', '0.75s');
```

- [ ] **Step 2: Run source and browser tests to verify both fail**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js
npx playwright test page-transitions.spec.js -c apps/web/playwright.config.js
```

Expected: source expects 750ms but finds 480ms; live browser expects 0.75s but receives 0.48s.

- [ ] **Step 3: Make the single production timing change**

In `apps/web/src/index.css`, change only the duration:

```css
.page-transition {
  background-color: var(--color-paper);
  animation: page-enter 750ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
```

- [ ] **Step 4: Run complete source verification**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js apps/web/test/productPhotoBlendSource.test.js apps/web/test/responsiveThemeSource.test.js
node --test apps/web/test/*.test.js
```

Expected: focused and complete web source suites pass with zero failures.

- [ ] **Step 5: Build and restart Docker**

Run:

```bash
docker compose build web
docker compose up -d web
```

Expected: the web image builds and all services run.

- [ ] **Step 6: Verify browser behavior and live services**

Run:

```bash
npx playwright test accessibility-interactions.spec.js page-transitions.spec.js -c apps/web/playwright.config.js
npm run build:web
git diff --check
docker compose ps
curl -fsSI http://127.0.0.1:8081/
curl -fsS http://127.0.0.1:3000/api/health
```

Expected: all browser tests and production build pass, services run, storefront returns HTTP 200, and API reports healthy.

- [ ] **Step 7: Commit and clean generated artifacts**

```bash
git add apps/web/src/index.css apps/web/test/pageTransitionSource.test.js apps/web/e2e/page-transitions.spec.js
git commit -m "style: slow storefront page transitions"
git stash push -u -m "preserve 750ms transition verification artifacts"
git status --short
```

Expected: the timing change and tests are committed on `codex-edits`, and the working tree is clean.
