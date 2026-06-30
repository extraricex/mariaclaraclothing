# Text-Link Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make menu and navigation text visibly clickable with the approved pointer and underline-reveal interaction.

**Architecture:** Add one explicit `text-action` component class in the shared Tailwind CSS layer, then opt eligible storefront and admin controls into it. Keep semantic links and buttons unchanged; CSS handles hover, focus, active-route, disabled, and reduced-motion states.

**Tech Stack:** React, React Router, Tailwind CSS v4, Node test runner, Vite, Docker Compose

---

## File Structure

- Create `apps/web/test/textActionSource.test.js`: source-level interaction and usage regression tests.
- Modify `apps/web/src/index.css`: reusable `text-action` interaction states.
- Modify `apps/web/src/components/Shell.jsx`: apply the class to eligible storefront header, mobile-menu, and footer controls.
- Modify `apps/web/src/admin/AdminLayout.jsx`: apply the class to eligible desktop and mobile admin navigation controls.

### Task 1: Add the Shared Text-Action Contract

**Files:**
- Create: `apps/web/test/textActionSource.test.js`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Write the failing CSS contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (relativePath) =>
  readFile(path.join(import.meta.dirname, '..', relativePath), 'utf8');

test('text actions reveal an underline without layout movement', async () => {
  const css = await source('src/index.css');

  assert.match(css, /\.text-action\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(css, /\.text-action\s*\{[\s\S]*background-size:\s*0 2px/);
  assert.match(css, /\.text-action:hover[\s\S]*background-size:\s*100% 2px/);
  assert.match(css, /\.text-action:focus-visible[\s\S]*background-size:\s*100% 2px/);
  assert.match(css, /\.text-action\[aria-current="page"\][\s\S]*background-size:\s*100% 2px/);
  assert.match(css, /\.text-action:disabled[\s\S]*cursor:\s*not-allowed[\s\S]*background-size:\s*0 2px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.text-action[\s\S]*transition:\s*none/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test apps/web/test/textActionSource.test.js`

Expected: FAIL because `.text-action` does not exist.

- [ ] **Step 3: Add the minimal shared style**

Add inside `@layer components` in `apps/web/src/index.css`:

```css
  .text-action {
    cursor: pointer;
    background-image: linear-gradient(currentColor, currentColor);
    background-position: left calc(100% - 0.05em);
    background-repeat: no-repeat;
    background-size: 0 2px;
    transition: background-size 180ms ease, color 200ms ease;
  }
  .text-action:hover,
  .text-action:focus-visible,
  .text-action[aria-current="page"] {
    background-size: 100% 2px;
  }
  .text-action:disabled,
  .text-action[aria-disabled="true"] {
    cursor: not-allowed;
    background-size: 0 2px;
  }
```

Add to the existing reduced-motion media query:

```css
  .text-action {
    transition: none !important;
  }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test apps/web/test/textActionSource.test.js`

Expected: 1 test passes, 0 fail.

### Task 2: Apply the Interaction to Storefront and Admin Text Controls

**Files:**
- Modify: `apps/web/test/textActionSource.test.js`
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/src/admin/AdminLayout.jsx`

- [ ] **Step 1: Add failing usage tests**

Append to `apps/web/test/textActionSource.test.js`:

```js
test('storefront navigation and footer opt into text actions', async () => {
  const shell = await source('src/components/Shell.jsx');

  assert.match(shell, /className="text-action text-\[12px\][\s\S]*lg:hidden"/);
  assert.match(shell, /transition-colors text-action hover:text-accent/);
  assert.match(shell, /text-action hidden text-\[12px\]/);
  assert.match(shell, /className="text-action border-b border-line px-5 py-4/);
  assert.match(shell, /className="text-action hover:text-accent"/);
});

test('admin desktop and mobile navigation opt into text actions', async () => {
  const admin = await source('src/admin/AdminLayout.jsx');

  assert.match(admin, /`text-action rounded-\[var\(--radius-admin\)\]/);
  assert.match(admin, /`text-action block cursor-pointer/);
  assert.match(admin, /className={`text-action flex w-full items-center/);
  assert.match(admin, /`text-action whitespace-nowrap text-\[11px\]/);
  assert.match(admin, /className="text-action block text-xs uppercase/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test apps/web/test/textActionSource.test.js`

Expected: the CSS test passes; the storefront and admin usage tests fail because the class is not applied.

- [ ] **Step 3: Apply `text-action` explicitly**

In `apps/web/src/components/Shell.jsx`, add `text-action` to:

- Promo notification Close.
- Header Menu/Close.
- Desktop `NAV_LINKS` links.
- Account/Log in.
- Mobile `NAV_LINKS` and account links.
- Footer shop/help links, contact email, and social links.

Do not apply it to logo links, cart icon, product-image links, or existing filled/outlined buttons.

In `apps/web/src/admin/AdminLayout.jsx`:

```js
const topLinkClass = (active) =>
  `text-action rounded-[var(--radius-admin)] ...`;

const subLinkClass = (isActive) =>
  `text-action block cursor-pointer ...`;
```

Also add `text-action` to the Orders and Products collapsible buttons, mobile `NavLink` class, View store, and Sign out.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test apps/web/test/textActionSource.test.js`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Run the complete web source suite**

Run: `node --test apps/web/test/*.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit implementation**

```bash
git add apps/web/test/textActionSource.test.js apps/web/src/index.css apps/web/src/components/Shell.jsx apps/web/src/admin/AdminLayout.jsx
git commit -m "style: clarify text-link interactions"
```

### Task 3: Build and Deploy the Web Service

**Files:**
- Generated: `apps/web/dist/**`

- [ ] **Step 1: Build the production bundle**

Run: `npm run build:web`

Expected: Vite exits 0 and writes the production bundle to `apps/web/dist`.

- [ ] **Step 2: Rebuild and restart Docker web**

Run: `docker compose build web`

Run: `docker compose up -d web`

Expected: the web container is recreated and reports `Up`.

- [ ] **Step 3: Verify the deployed site**

Run: `curl -sS -I http://127.0.0.1:8081/`

Expected: `HTTP/1.1 200 OK`.

Fetch the hashed deployed stylesheet referenced by the HTML and verify it contains `background-size:0 2px`, `background-size:100% 2px`, and `.text-action`, then open `http://127.0.0.1:8081` in Chrome for visual confirmation.
