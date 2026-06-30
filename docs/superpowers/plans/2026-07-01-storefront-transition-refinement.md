# Storefront Transition Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storefront page transitions clearly visible while preventing product-photo background flashes throughout the animation.

**Architecture:** Keep the existing `PageTransition` component and route boundaries. Refine only its shared CSS motion and paper backdrop, then extend the existing source and Playwright contracts to prove the backdrop remains stable during the active animation and the transform is released afterward.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, Node test runner, Playwright, Vite, Docker Compose

---

### Task 1: Refine the Transition Contract and CSS

**Files:**
- Modify: `apps/web/test/pageTransitionSource.test.js`
- Modify: `apps/web/src/index.css:195-215`

- [ ] **Step 1: Update the source contract before production CSS**

Replace the current keyframe and `.page-transition` assertions in `apps/web/test/pageTransitionSource.test.js` with:

```js
  assert.match(css, /@keyframes page-enter/);
  assert.match(css, /opacity:\s*0\.06[\s\S]*translateY\(18px\)/);
  assert.match(css, /\.page-transition\s*\{[\s\S]*background-color:\s*var\(--color-paper\)/);
  assert.match(css, /\.page-transition\s*\{[\s\S]*animation:\s*page-enter 480ms cubic-bezier\(0\.22, 1, 0\.36, 1\) backwards/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.page-transition[\s\S]*animation:\s*none !important[\s\S]*transform:\s*none !important/);
```

- [ ] **Step 2: Run the source contract and verify it fails**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js
```

Expected: FAIL because the CSS still uses zero opacity, 10 pixels, 320 milliseconds, and no transition-wrapper background.

- [ ] **Step 3: Implement the approved CSS treatment**

Change the route motion in `apps/web/src/index.css` to:

```css
@keyframes page-enter {
  from {
    opacity: 0.06;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-transition {
  background-color: var(--color-paper);
  animation: page-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
```

Do not change the existing reduced-motion block.

- [ ] **Step 4: Run focused and complete source tests**

Run:

```bash
node --test apps/web/test/pageTransitionSource.test.js apps/web/test/productPhotoBlendSource.test.js apps/web/test/responsiveThemeSource.test.js
node --test apps/web/test/*.test.js
```

Expected: 7 focused tests pass, then all web source tests pass with zero failures.

- [ ] **Step 5: Commit the CSS refinement**

```bash
git add apps/web/src/index.css apps/web/test/pageTransitionSource.test.js
git commit -m "fix: stabilize stronger storefront transitions"
```

### Task 2: Prove Active-Frame Stability and Deploy

**Files:**
- Modify: `apps/web/e2e/page-transitions.spec.js`

- [ ] **Step 1: Update the browser contract before rebuilding Docker**

In the first test in `apps/web/e2e/page-transitions.spec.js`, change the duration expectation and add an active-frame background assertion:

```js
  await expect(transition).toHaveCSS('animation-duration', '0.48s');
  await expect(transition).toHaveCSS('background-color', 'rgb(241, 241, 241)');
```

In the mobile product test, keep the existing viewport, transform, theme background, and blend-mode assertions unchanged.

- [ ] **Step 2: Run the browser test against the old deployment and verify it fails**

Run:

```bash
npx playwright test page-transitions.spec.js -c apps/web/playwright.config.js
```

Expected: FAIL because Docker still serves a 0.32-second transition with a transparent wrapper.

- [ ] **Step 3: Build and restart the web container**

Run:

```bash
docker compose build web
docker compose up -d web
```

Expected: the image builds and all three services run.

- [ ] **Step 4: Run the complete browser regression set**

Run:

```bash
npx playwright test accessibility-interactions.spec.js page-transitions.spec.js -c apps/web/playwright.config.js
```

Expected: all accessibility and transition browser tests pass.

- [ ] **Step 5: Verify build, live endpoints, and branch state**

Run:

```bash
npm run build:web
git diff --check
docker compose ps
curl -fsSI http://127.0.0.1:8081/
curl -fsS http://127.0.0.1:3000/api/health
```

Expected: production build succeeds, no whitespace errors are reported, all services run, storefront returns HTTP 200, and API reports healthy.

- [ ] **Step 6: Commit browser coverage and preserve generated artifacts**

```bash
git add apps/web/e2e/page-transitions.spec.js
git commit -m "test: prevent transition photo flashes"
git stash push -u -m "preserve refined transition verification artifacts"
git status --short
```

Expected: browser coverage is committed and `codex-edits` is clean.
