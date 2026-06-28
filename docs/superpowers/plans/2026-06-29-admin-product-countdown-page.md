# Admin Product Countdown Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the collection countdown editor to a dedicated admin page linked from the Products dropdown while leaving collection membership and customer countdown behavior unchanged.

**Architecture:** Extract the existing countdown state, settings request, validation, save handler, and approved Tailwind card into `ProductCountdown.jsx`. Keep `Collections.jsx` focused on product membership, then add a static `/admin/products/countdown` route and Products submenu entry.

**Tech Stack:** React 18, React Router 6, Tailwind CSS 4, Vite 6, Node test runner, Docker Compose.

---

## Constraints

- Do not change API, PostgreSQL, countdown storage, pricing, discounts, checkout, or Meta tracking.
- Preserve the two collection names: `New Arrivals` and `Freedom of Mind`.
- Preserve the existing countdown API path and server-owned revision behavior.
- Do not stage or commit files; the user will handle Git.
- Preserve existing uncommitted Nginx cache-control changes.

## Task 1: Extract the Dedicated Product Countdown Page

**Files:**
- Create: `apps/web/src/admin/ProductCountdown.jsx`
- Modify: `apps/web/src/admin/Collections.jsx`
- Modify: `apps/web/test/collectionCountdown.test.js`

- [ ] **Step 1: Replace the existing Collections ownership test with a failing separation test**

Replace `collections admin edits and restarts one collection countdown` with:

```js
test('dedicated product countdown page owns the editor and Collections stays focused', async () => {
  const countdownPage = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'ProductCountdown.jsx'),
    'utf8'
  );
  const collectionsPage = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'Collections.jsx'),
    'utf8'
  );

  assert.match(countdownPage, /Product page countdown/);
  assert.match(countdownPage, /Show countdown/);
  assert.match(countdownPage, /Marketing message/);
  assert.match(countdownPage, /Hours/);
  assert.match(countdownPage, /Minutes/);
  assert.match(countdownPage, /Seconds/);
  assert.match(countdownPage, /Save and restart countdown/);
  assert.match(countdownPage, /durationPartsToSeconds/);
  assert.match(countdownPage, /settings\/collection-countdowns/);
  assert.match(countdownPage, /Live preview/);
  assert.match(countdownPage, /absolute inset-0 z-10 cursor-pointer opacity-0/);

  assert.doesNotMatch(collectionsPage, /Product page countdown/);
  assert.doesNotMatch(collectionsPage, /durationPartsToSeconds/);
  assert.doesNotMatch(collectionsPage, /\/api\/admin\/settings/);
  assert.doesNotMatch(collectionsPage, /countdownForm/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/web/test/collectionCountdown.test.js`

Expected: FAIL with `ENOENT` for `ProductCountdown.jsx`.

- [ ] **Step 3: Create the dedicated page state and data flow**

Create `ProductCountdown.jsx` with these imports, constants, state, load, synchronization, and save contracts:

```jsx
import { useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { durationPartsToSeconds, formatRemainingTime } from '../lib/collectionCountdown.js';

const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
const COUNTDOWN_FIELDS = [
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' }
];
const DEFAULT_FORM = {
  enabled: false,
  message: 'Hurry! Limited time left',
  hours: '02',
  minutes: '00',
  seconds: '00'
};

export default function ProductCountdown() {
  const [active, setActive] = useState(STOREFRONT_COLLECTIONS[0]);
  const [status, setStatus] = useState('');
  const [countdowns, setCountdowns] = useState({});
  const [countdownForm, setCountdownForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    adminJson('/api/admin/settings')
      .then((body) => setCountdowns(body.settings.collectionCountdowns || {}))
      .catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const config = countdowns[active] || {
      enabled: false,
      message: DEFAULT_FORM.message,
      durationSeconds: 7200
    };
    const [hours, minutes, seconds] = formatRemainingTime(config.durationSeconds).split(':');
    setCountdownForm({
      enabled: Boolean(config.enabled),
      message: config.message || DEFAULT_FORM.message,
      hours,
      minutes,
      seconds
    });
  }, [active, countdowns]);

  async function saveCountdown() {
    setStatus('');
    try {
      const durationSeconds = durationPartsToSeconds(
        countdownForm.hours,
        countdownForm.minutes,
        countdownForm.seconds
      );
      const body = await adminSend(
        'PUT',
        `/api/admin/settings/collection-countdowns/${encodeURIComponent(active)}`,
        {
          enabled: countdownForm.enabled,
          message: countdownForm.message,
          durationSeconds
        }
      );
      setCountdowns((current) => ({ ...current, [active]: body.countdown }));
      setStatus('Countdown saved and restarted for visitors.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Products</p>
      <h1 className="display mt-1 text-3xl">Product page countdown</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Configure the marketing countdown shown when a collection is assigned first on a product.
      </p>
      {status && <p className="mt-3 text-sm text-accent-deep" role="status">{status}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {STOREFRONT_COLLECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setActive(name)}
            className={`rounded-xl border px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              name === active ? 'border-ink bg-ink text-paper' : 'border-line bg-paper hover:border-ink'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <section className="mt-5 rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Product page countdown</h2>
            <p className="mt-1 text-xs text-clay">
              Applied when {active} is the product&apos;s first collection.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-xs font-semibold">
            <span>Show countdown</span>
            <span className="relative inline-flex h-6 w-11 items-center">
              <input
                type="checkbox"
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
                checked={countdownForm.enabled}
                onChange={(event) => setCountdownForm((value) => ({
                  ...value,
                  enabled: event.target.checked
                }))}
              />
              <span className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-accent" />
              <span className="relative ml-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
            </span>
          </label>
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.1em] text-clay">
          Marketing message
          <input
            className="field mt-2"
            maxLength="120"
            value={countdownForm.message}
            onChange={(event) => setCountdownForm((value) => ({
              ...value,
              message: event.target.value
            }))}
          />
        </label>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {COUNTDOWN_FIELDS.map(({ key, label }) => (
            <label key={key} className="text-center text-xs font-semibold text-clay">
              {label}
              <input
                className="field mt-2 text-center font-mono text-lg"
                inputMode="numeric"
                value={countdownForm[key]}
                onChange={(event) => setCountdownForm((value) => ({
                  ...value,
                  [key]: event.target.value
                }))}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-deep">Live preview</span>
          <p className="mt-1 text-xs font-semibold text-accent-deep">
            {countdownForm.message || DEFAULT_FORM.message}
          </p>
          <strong className="mt-2 block font-mono text-lg text-ink">
            {countdownForm.hours.padStart(2, '0')} : {countdownForm.minutes.padStart(2, '0')} : {countdownForm.seconds.padStart(2, '0')}
          </strong>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-accent px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-paper shadow-sm transition-colors hover:bg-accent-deep"
          onClick={saveCountdown}
        >
          Save and restart countdown
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Remove countdown ownership from Collections**

Change `Collections.jsx` so its imports and initial load return to:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';

function load() {
  adminJson('/api/admin/products?sort=name_asc')
    .then((body) => setProducts(body.products))
    .catch((error) => setStatus(error.message));
}
```

Delete `COUNTDOWN_FIELDS`, `countdowns`, `countdownForm`, the countdown synchronization effect, `saveCountdown`, and the complete countdown `<section>`. Preserve `saveCollections`, collection tabs, product selector, and member list.

- [ ] **Step 5: Run the separation test**

Run: `node --test apps/web/test/collectionCountdown.test.js`

Expected: all countdown tests PASS.

## Task 2: Add the Products Submenu Link and Static Route

**Files:**
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/test/adminNavigationSource.test.js`

- [ ] **Step 1: Write the failing navigation and route assertions**

Append to `adminNavigationSource.test.js`:

```js
test('Products dropdown links to the dedicated product countdown route', async () => {
  const layout = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'),
    'utf8'
  );
  const app = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'App.jsx'),
    'utf8'
  );

  assert.match(layout, /to: '\/admin\/products\/countdown', label: 'Product page countdown'/);
  assert.ok(layout.indexOf("label: 'Collections'") < layout.indexOf("label: 'Product page countdown'"));
  assert.ok(layout.indexOf("label: 'Product page countdown'") < layout.indexOf("label: 'Inventory'"));
  assert.match(app, /import ProductCountdown from '\.\/admin\/ProductCountdown\.jsx'/);
  assert.match(app, /path="products\/countdown" element=\{<ProductCountdown \/>\}/);
  assert.ok(app.indexOf('path="products/countdown"') < app.indexOf('path="products/:slug"'));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/web/test/adminNavigationSource.test.js`

Expected: FAIL because the submenu item, import, and route do not exist.

- [ ] **Step 3: Add the Products submenu item**

Update `PRODUCT_SUBNAV`:

```js
const PRODUCT_SUBNAV = [
  { to: '/admin/products', label: 'All products', end: true },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/products/countdown', label: 'Product page countdown' },
  { to: '/admin/inventory', label: 'Inventory' }
];
```

No additional `productsActive` condition is needed because the new route starts with `/admin/products`.

- [ ] **Step 4: Add the static route before the slug route**

Add the import:

```js
import ProductCountdown from './admin/ProductCountdown.jsx';
```

Order the Products routes as:

```jsx
<Route path="products" element={<Products />} />
<Route path="products/countdown" element={<ProductCountdown />} />
<Route path="products/:slug" element={<ProductEditor />} />
```

- [ ] **Step 5: Run navigation, countdown, and build verification**

Run:

```bash
node --test apps/web/test/adminNavigationSource.test.js apps/web/test/collectionCountdown.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: all focused tests PASS and Vite exits `0`.

## Task 3: Verify Live Navigation and Docker

**Files:**
- Verify files changed in Tasks 1-2.
- Preserve: `apps/web/nginx.conf` no-store cache fix.

- [ ] **Step 1: Run the full web suite and production build**

```bash
node --test apps/web/test/*.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: zero web test failures and successful production build.

- [ ] **Step 2: Rebuild and restart the web service**

```bash
docker compose up -d --build --force-recreate web
```

Expected: PostgreSQL remains healthy and API/web containers start.

- [ ] **Step 3: Run browser acceptance without refresh**

Using installed Playwright Chromium:

1. Seed `maria-clara-admin-token` with the local admin token.
2. Open `/admin`.
3. Expand Products.
4. Click `Product page countdown`.
5. Assert URL is `/admin/products/countdown`.
6. Assert the heading and editor are visible without refresh.
7. Click `Collections` and assert the countdown editor is absent.
8. Return to the countdown page and switch between both collection tabs.
9. Confirm no page errors and settings request returns `200`.

- [ ] **Step 4: Inspect changed files without modifying Git state**

Run: `git status --short`

Expected: intended uncommitted source, test, spec, plan, and build changes are visible. Do not run `git add`, `git commit`, merge, reset, checkout, restore, or clean commands.

## Definition of Done

- [ ] Products dropdown contains `Product page countdown` between Collections and Inventory.
- [ ] `/admin/products/countdown` opens the dedicated editor without refresh.
- [ ] Collections contains only collection membership management.
- [ ] Both collection countdown settings remain editable and save through the existing API.
- [ ] Customer countdown behavior is unchanged.
- [ ] Focused tests, full web suite, production build, and live browser acceptance pass.
- [ ] No Git staging, commits, merges, resets, or cleanup operations are performed.
