# Collection Product Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modern collection-controlled marketing countdown to product pages, with authenticated admin editing and persistent per-visitor deadlines that never affect commerce data.

**Architecture:** Persist normalized countdown configurations inside the existing `storeSettings` JSONB/JSON record and update one collection through a dedicated authenticated route that increments a server-owned revision. A pure browser utility resolves a product's first collection and a visitor deadline in `localStorage`; a focused React component renders the approved Tailwind UI and hides at zero.

**Tech Stack:** Node.js 22, Express 4, PostgreSQL 16 JSONB settings, React 18, Tailwind CSS 4, Vite 6, Node test runner.

---

## Scope and Contracts

- Storefront collections remain `New Arrivals` and `Freedom of Mind`.
- Settings shape is `collectionCountdowns[collectionName] = { enabled, message, durationSeconds, revision }`.
- Admin endpoint is `PUT /api/admin/settings/collection-countdowns/:collectionName`.
- Public `/api/storefront-settings` includes `collectionCountdowns`.
- A product uses only `product.collections[0]`; no fallback to another collection.
- Visitor storage key is `maria-clara-collection-countdown:<encoded-collection-name>`.
- The stored visitor record is `{ revision, deadlineMs }`.
- Expired records remain stored so the same revision cannot restart after refresh.
- Countdown data is never added to cart, quote, order, pricing, discount, shipping, inventory, Pixel, or Conversions API payloads.

## File Map

### API

- Modify `apps/api/src/settings/storeSettingsRepository.js`: defaults, normalization, validation, revisioned collection update, JSON/PostgreSQL persistence.
- Modify `apps/api/src/routes/admin.js`: authenticated collection-countdown update route.
- Modify `apps/api/src/routes/storeSettings.js`: safe public countdown settings.
- Modify `apps/api/test/storeSettingsRepository.test.js`: repository defaults, validation, revision, and persistence.
- Modify `apps/api/test/adminSettings.test.js`: admin/public HTTP contracts and authentication.

### Web

- Create `apps/web/src/lib/collectionCountdown.js`: pure collection selection, duration, storage, and time formatting helpers.
- Create `apps/web/src/components/CollectionCountdown.jsx`: timer lifecycle and approved Tailwind markup.
- Modify `apps/web/src/lib/storeSettings.js`: public fallback settings.
- Modify `apps/web/src/pages/Product.jsx`: first-collection selection and countdown placement.
- Modify `apps/web/src/admin/Collections.jsx`: collection-level editor and live preview.
- Create `apps/web/test/collectionCountdown.test.js`: executable helper tests and UI source assertions.

## Task 1: Normalize and Persist Collection Countdown Settings

**Files:**
- Modify: `apps/api/src/settings/storeSettingsRepository.js`
- Modify: `apps/api/test/storeSettingsRepository.test.js`

- [ ] **Step 1: Write failing repository tests**

Append a test using the existing temporary settings-file pattern:

```js
test('collection countdown settings validate and increment server revisions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-countdowns-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();
    const defaults = repository.getStoreSettings();
    assert.deepEqual(defaults.collectionCountdowns['New Arrivals'], {
      enabled: false,
      message: 'Hurry! Limited time left',
      durationSeconds: 7200,
      revision: 0
    });

    const first = repository.updateCollectionCountdown('New Arrivals', {
      enabled: true,
      message: '  Drop ends soon  ',
      durationSeconds: 3661,
      revision: 999
    });
    assert.deepEqual(first.collectionCountdowns['New Arrivals'], {
      enabled: true,
      message: 'Drop ends soon',
      durationSeconds: 3661,
      revision: 1
    });

    const second = repository.updateCollectionCountdown('New Arrivals', {
      enabled: false,
      message: 'Drop ends soon',
      durationSeconds: 3661
    });
    assert.equal(second.collectionCountdowns['New Arrivals'].revision, 2);
    assert.equal(repository.getStoreSettings().collectionCountdowns['New Arrivals'].revision, 2);

    assert.throws(() => repository.updateCollectionCountdown('Unknown', {
      enabled: true, message: 'Soon', durationSeconds: 60
    }), /Collection is invalid/);
    assert.throws(() => repository.updateCollectionCountdown('New Arrivals', {
      enabled: true, message: '', durationSeconds: 60
    }), /message is required/);
    assert.throws(() => repository.updateCollectionCountdown('New Arrivals', {
      enabled: true, message: 'Soon', durationSeconds: 0
    }), /between 1 and 359999 seconds/);
    assert.throws(() => repository.updateCollectionCountdown('New Arrivals', {
      enabled: true, message: 'Soon', durationSeconds: 360000
    }), /between 1 and 359999 seconds/);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the repository test and verify RED**

Run: `node --test apps/api/test/storeSettingsRepository.test.js`

Expected: FAIL because `collectionCountdowns` and `updateCollectionCountdown` do not exist.

- [ ] **Step 3: Add defaults and normalization**

In `storeSettingsRepository.js`, add:

```js
const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
const DEFAULT_COUNTDOWN_MESSAGE = 'Hurry! Limited time left';

function defaultCollectionCountdowns() {
  return Object.fromEntries(STOREFRONT_COLLECTIONS.map((name) => [name, {
    enabled: false,
    message: DEFAULT_COUNTDOWN_MESSAGE,
    durationSeconds: 2 * 60 * 60,
    revision: 0
  }]));
}

function normalizeCollectionCountdown(value, fallback) {
  const input = value && typeof value === 'object' ? value : {};
  const enabled = input.enabled === undefined ? fallback.enabled : Boolean(input.enabled);
  const message = String(input.message === undefined ? fallback.message : input.message).trim();
  const durationSeconds = Number(input.durationSeconds === undefined
    ? fallback.durationSeconds
    : input.durationSeconds);
  const revision = Number(input.revision === undefined ? fallback.revision : input.revision);

  if (message.length > 120) throw badRequest('Countdown message must be 120 characters or fewer.');
  if (enabled && !message) throw badRequest('Countdown message is required when enabled.');
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 359999) {
    throw badRequest('Countdown duration must be an integer between 1 and 359999 seconds.');
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw badRequest('Countdown revision is invalid.');
  }
  return { enabled, message, durationSeconds, revision };
}

function normalizeCollectionCountdowns(value) {
  const input = value && typeof value === 'object' ? value : {};
  const defaults = defaultCollectionCountdowns();
  return Object.fromEntries(STOREFRONT_COLLECTIONS.map((name) => [
    name,
    normalizeCollectionCountdown(input[name], defaults[name])
  ]));
}
```

Add `collectionCountdowns: defaultCollectionCountdowns()` to `defaultStoreSettings()` and `collectionCountdowns: normalizeCollectionCountdowns(value.collectionCountdowns)` to `normalizeStoreSettings()`.

- [ ] **Step 4: Add the revisioned update operation**

Add a single operation used by JSON and PostgreSQL modes:

```js
function nextCollectionCountdown(current, collectionName, input) {
  if (!STOREFRONT_COLLECTIONS.includes(collectionName)) {
    throw badRequest('Collection is invalid.');
  }
  const previous = current.collectionCountdowns[collectionName];
  const normalized = normalizeCollectionCountdown({
    ...input,
    revision: previous.revision
  }, previous);
  return {
    ...current,
    collectionCountdowns: {
      ...current.collectionCountdowns,
      [collectionName]: { ...normalized, revision: previous.revision + 1 }
    }
  };
}

function updateCollectionCountdown(collectionName, input) {
  if (usePostgresSettings()) {
    return transaction(async (client) => {
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO NOTHING`,
        [SETTINGS_KEY, JSON.stringify(defaultStoreSettings())]
      );
      const result = await client.query(
        'SELECT value FROM store_settings WHERE key = $1 FOR UPDATE',
        [SETTINGS_KEY]
      );
      const current = normalizeStoreSettings(result.rows[0]?.value || {});
      const next = nextCollectionCountdown(current, collectionName, input);
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [SETTINGS_KEY, JSON.stringify(next)]
      );
      return next;
    });
  }

  const current = normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
  const next = nextCollectionCountdown(current, collectionName, input);
  writeJsonFile(settingsDataFile(), next);
  return next;
}
```

Import `transaction` from `../db/postgres`, export `updateCollectionCountdown`, and do not add `collectionCountdowns` to the generic `SETTINGS_SECTIONS` list. The dedicated operation is required so the browser cannot set its own revision.

- [ ] **Step 5: Run tests and commit**

Run: `node --test apps/api/test/storeSettingsRepository.test.js`

Expected: all repository tests PASS.

```bash
git add apps/api/src/settings/storeSettingsRepository.js apps/api/test/storeSettingsRepository.test.js
git commit -m "feat: persist collection countdown settings"
```

## Task 2: Expose Authenticated Admin and Safe Public APIs

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/src/routes/storeSettings.js`
- Modify: `apps/api/test/adminSettings.test.js`

- [ ] **Step 1: Write failing HTTP contract tests**

Add inside `adminSettings.test.js`:

```js
test('admin saves revisioned collection countdowns and public settings expose them', async () => {
  await withSettingsServer(async (port) => {
    const path = '/api/admin/settings/collection-countdowns/New%20Arrivals';
    assert.equal((await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, message: 'Soon', durationSeconds: 60 })
    })).status, 401);

    const firstResponse = await fetch(`http://127.0.0.1:${port}${path}`, adminRequest('PUT', {
      enabled: true,
      message: 'Collection closes soon',
      durationSeconds: 7200,
      revision: 500
    }));
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.deepEqual(first.countdown, {
      enabled: true,
      message: 'Collection closes soon',
      durationSeconds: 7200,
      revision: 1
    });

    const second = await fetch(`http://127.0.0.1:${port}${path}`, adminRequest('PUT', {
      enabled: true, message: 'Collection closes soon', durationSeconds: 7200
    }));
    assert.equal((await second.json()).countdown.revision, 2);

    const publicBody = await (await fetch(
      `http://127.0.0.1:${port}/api/storefront-settings`
    )).json();
    assert.equal(publicBody.settings.collectionCountdowns['New Arrivals'].revision, 2);

    const unknown = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/collection-countdowns/Unknown`,
      adminRequest('PUT', { enabled: true, message: 'Soon', durationSeconds: 60 })
    );
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error, 'Collection is invalid.');
  });
});
```

- [ ] **Step 2: Run the HTTP tests and verify RED**

Run: `node --test apps/api/test/adminSettings.test.js`

Expected: FAIL because the dedicated route and public field do not exist.

- [ ] **Step 3: Add the dedicated route before the generic settings route**

Import `updateCollectionCountdown` and place this route before `router.put('/settings/:section', ...)`:

```js
router.put('/settings/collection-countdowns/:collectionName', async (req, res, next) => {
  try {
    const settings = await updateCollectionCountdown(
      String(req.params.collectionName || '').trim(),
      req.body || {}
    );
    return res.json({
      countdown: settings.collectionCountdowns[String(req.params.collectionName || '').trim()]
    });
  } catch (error) {
    return next(error);
  }
});
```

The existing `router.use(requireAdmin)` protects this route. Do not accept a revision from the request as authoritative; the repository ignores it.

- [ ] **Step 4: Add the safe public field**

In `routes/storeSettings.js`, include:

```js
collectionCountdowns: settings.collectionCountdowns,
```

No admin credentials, internal timestamps, or visitor deadlines are exposed.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
node --test apps/api/test/storeSettingsRepository.test.js apps/api/test/adminSettings.test.js
```

Expected: all settings tests PASS.

```bash
git add apps/api/src/routes/admin.js apps/api/src/routes/storeSettings.js apps/api/test/adminSettings.test.js
git commit -m "feat: expose collection countdown settings"
```

## Task 3: Build the Pure Visitor Countdown Utility

**Files:**
- Create: `apps/web/src/lib/collectionCountdown.js`
- Create: `apps/web/test/collectionCountdown.test.js`

- [ ] **Step 1: Write failing executable helper tests**

Create `collectionCountdown.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countdownStorageKey,
  durationPartsToSeconds,
  formatRemainingTime,
  resolveVisitorCountdown,
  selectProductCountdown
} from '../src/lib/collectionCountdown.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key) ?? null
  };
}

const enabled = {
  enabled: true,
  message: 'Hurry! Limited time left',
  durationSeconds: 7200,
  revision: 4
};

test('duration fields validate and format through 99:59:59', () => {
  assert.equal(durationPartsToSeconds('02', '03', '04'), 7384);
  assert.equal(durationPartsToSeconds('99', '59', '59'), 359999);
  assert.throws(() => durationPartsToSeconds('00', '00', '00'), /at least one second/);
  assert.throws(() => durationPartsToSeconds('100', '00', '00'), /99:59:59/);
  assert.equal(formatRemainingTime(7384), '02:03:04');
});

test('only the first product collection selects a countdown', () => {
  const settings = {
    collectionCountdowns: {
      'New Arrivals': { ...enabled, enabled: false },
      'Freedom of Mind': enabled
    }
  };
  assert.equal(selectProductCountdown({ collections: ['New Arrivals', 'Freedom of Mind'] }, settings), null);
  assert.deepEqual(
    selectProductCountdown({ collections: ['Freedom of Mind', 'New Arrivals'] }, settings),
    { collectionName: 'Freedom of Mind', config: enabled }
  );
  assert.equal(selectProductCountdown(
    { collections: ['Freedom of Mind'] },
    { collectionCountdowns: { 'Freedom of Mind': { ...enabled, durationSeconds: 360000 } } }
  ), null);
});

test('visitor deadline persists, expires, and restarts only for a new revision', () => {
  const storage = memoryStorage();
  const key = countdownStorageKey('New Arrivals');
  const first = resolveVisitorCountdown('New Arrivals', enabled, storage, 1000);
  assert.equal(first.deadlineMs, 7201000);
  assert.equal(JSON.parse(storage.value(key)).revision, 4);

  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, storage, 2000).deadlineMs, 7201000);
  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, storage, 7201000), null);
  assert.equal(JSON.parse(storage.value(key)).deadlineMs, 7201000);

  const restarted = resolveVisitorCountdown(
    'New Arrivals', { ...enabled, revision: 5 }, storage, 8000000
  );
  assert.equal(restarted.deadlineMs, 15200000);
});

test('malformed or unavailable storage does not block a timer', () => {
  const malformed = memoryStorage({ [countdownStorageKey('New Arrivals')]: '{bad' });
  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, malformed, 100).deadlineMs, 7200100);
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, unavailable, 100).deadlineMs, 7200100);
});
```

- [ ] **Step 2: Run utility tests and verify RED**

Run: `node --test apps/web/test/collectionCountdown.test.js`

Expected: FAIL because `collectionCountdown.js` does not exist.

- [ ] **Step 3: Implement duration, selection, and storage helpers**

Create `collectionCountdown.js` with these public contracts:

```js
const STORAGE_PREFIX = 'maria-clara-collection-countdown:';

export function countdownStorageKey(collectionName) {
  return `${STORAGE_PREFIX}${encodeURIComponent(String(collectionName || '').trim().toLowerCase())}`;
}

export function durationPartsToSeconds(hours, minutes, seconds) {
  const parts = [hours, minutes, seconds].map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error('Countdown values must be non-negative whole numbers.');
  }
  const [h, m, s] = parts;
  if (h > 99 || m > 59 || s > 59) throw new Error('Countdown cannot exceed 99:59:59.');
  const total = h * 3600 + m * 60 + s;
  if (total < 1) throw new Error('Countdown must be at least one second.');
  return total;
}

export function formatRemainingTime(totalSeconds) {
  const total = Math.max(0, Math.min(359999, Math.ceil(Number(totalSeconds) || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function selectProductCountdown(product, settings) {
  const collectionName = Array.isArray(product?.collections) ? product.collections[0] : '';
  const config = settings?.collectionCountdowns?.[collectionName];
  if (!collectionName || !config?.enabled || !String(config.message || '').trim()) return null;
  if (!Number.isInteger(config.durationSeconds) || config.durationSeconds < 1 || config.durationSeconds > 359999) return null;
  if (!Number.isInteger(config.revision) || config.revision < 0) return null;
  return { collectionName, config };
}

export function resolveVisitorCountdown(collectionName, config, storage, nowMs = Date.now()) {
  const key = countdownStorageKey(collectionName);
  let stored = null;
  try { stored = JSON.parse(storage?.getItem(key) || 'null'); } catch (_error) { stored = null; }
  let deadlineMs = Number(stored?.deadlineMs);
  if (stored?.revision !== config.revision || !Number.isFinite(deadlineMs)) {
    deadlineMs = nowMs + config.durationSeconds * 1000;
    try { storage?.setItem(key, JSON.stringify({ revision: config.revision, deadlineMs })); } catch (_error) {}
  }
  if (deadlineMs <= nowMs) return null;
  return { deadlineMs, remainingSeconds: Math.ceil((deadlineMs - nowMs) / 1000) };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `node --test apps/web/test/collectionCountdown.test.js`

Expected: all helper tests PASS.

```bash
git add apps/web/src/lib/collectionCountdown.js apps/web/test/collectionCountdown.test.js
git commit -m "feat: add persistent countdown utility"
```

## Task 4: Render the Approved Tailwind Countdown on Product Pages

**Files:**
- Create: `apps/web/src/components/CollectionCountdown.jsx`
- Modify: `apps/web/src/lib/storeSettings.js`
- Modify: `apps/web/src/pages/Product.jsx`
- Modify: `apps/web/test/collectionCountdown.test.js`

- [ ] **Step 1: Add failing source integration assertions**

Append:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('product page renders the collection countdown between price and size', async () => {
  const component = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'components', 'CollectionCountdown.jsx'),
    'utf8'
  );
  const product = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'pages', 'Product.jsx'),
    'utf8'
  );
  const settings = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'lib', 'storeSettings.js'),
    'utf8'
  );

  assert.match(component, /role="timer"/);
  assert.match(component, /resolveVisitorCountdown/);
  assert.match(component, /setInterval/);
  assert.match(component, /rounded-2xl/);
  assert.match(component, /text-accent/);
  assert.match(product, /selectProductCountdown/);
  assert.match(product, /<CollectionCountdown/);
  assert.ok(product.indexOf('<CollectionCountdown') < product.indexOf('>Size</p>'));
  assert.match(settings, /collectionCountdowns:\s*\{\}/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/web/test/collectionCountdown.test.js`

Expected: FAIL because the component and integrations do not exist.

- [ ] **Step 3: Add storefront fallback settings**

Add to `DEFAULT_STOREFRONT_SETTINGS`:

```js
collectionCountdowns: {},
```

This keeps product pages functional when public settings cannot be loaded.

- [ ] **Step 4: Implement the focused React component**

Create `CollectionCountdown.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { formatRemainingTime, resolveVisitorCountdown } from '../lib/collectionCountdown.js';

export default function CollectionCountdown({ collectionName, config }) {
  const [deadlineMs, setDeadlineMs] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let storage;
    try { storage = window.localStorage; } catch (_error) { storage = null; }
    const resolved = resolveVisitorCountdown(collectionName, config, storage, Date.now());
    setDeadlineMs(resolved?.deadlineMs || null);
    setNowMs(Date.now());
  }, [collectionName, config.revision, config.durationSeconds]);

  useEffect(() => {
    if (!deadlineMs) return undefined;
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      if (nextNow >= deadlineMs) setDeadlineMs(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineMs]);

  const remainingSeconds = deadlineMs ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000)) : 0;
  if (!remainingSeconds) return null;
  const [hours, minutes, seconds] = formatRemainingTime(remainingSeconds).split(':');

  return (
    <section
      role="timer"
      aria-label={`${config.message}: ${hours} hours, ${minutes} minutes, ${seconds} seconds`}
      className="relative mt-5 overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-[0_10px_30px_rgba(240,90,40,0.10)]"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-paper">◷</span>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent-deep">{config.message}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {[[hours, 'Hours'], [minutes, 'Minutes'], [seconds, 'Seconds']].map(([value, label], index) => (
          <div key={label} className="contents">
            {index > 0 && <span aria-hidden="true" className="font-bold text-accent">:</span>}
            <div className="min-w-14 rounded-xl border border-orange-100 bg-white/90 px-2 py-2 text-center shadow-sm">
              <strong className="block font-mono text-xl text-ink">{value}</strong>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-accent-deep">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Place the component on the product page**

Import `selectProductCountdown` and `CollectionCountdown`. After `onSale` is calculated, add:

```js
const countdown = selectProductCountdown(product, settings);
```

Immediately after the price block and before the size container, render:

```jsx
{countdown && (
  <CollectionCountdown collectionName={countdown.collectionName} config={countdown.config} />
)}
```

Do not pass countdown data to `handleAdd`, cart items, or Meta events.

- [ ] **Step 6: Run tests, build, and commit**

Run:

```bash
node --test apps/web/test/collectionCountdown.test.js apps/web/test/productPageSource.test.js apps/web/test/metaPixel.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: tests and production build PASS.

```bash
git add apps/web/src/components/CollectionCountdown.jsx apps/web/src/lib/storeSettings.js apps/web/src/pages/Product.jsx apps/web/test/collectionCountdown.test.js apps/web/dist
git commit -m "feat: show collection countdown on products"
```

## Task 5: Add the Modern Countdown Editor to Admin Collections

**Files:**
- Modify: `apps/web/src/admin/Collections.jsx`
- Modify: `apps/web/test/collectionCountdown.test.js`

- [ ] **Step 1: Write failing admin source assertions**

Append:

```js
test('collections admin edits and restarts one collection countdown', async () => {
  const source = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'Collections.jsx'),
    'utf8'
  );
  assert.match(source, /Product page countdown/);
  assert.match(source, /Show countdown/);
  assert.match(source, /Marketing message/);
  assert.match(source, /Hours/);
  assert.match(source, /Minutes/);
  assert.match(source, /Seconds/);
  assert.match(source, /Save and restart countdown/);
  assert.match(source, /durationPartsToSeconds/);
  assert.match(source, /settings\/collection-countdowns/);
  assert.match(source, /Live preview/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/web/test/collectionCountdown.test.js`

Expected: FAIL because Collections has no countdown editor.

- [ ] **Step 3: Load and select countdown settings**

Import `durationPartsToSeconds` and `formatRemainingTime`. Add state:

```js
const [countdowns, setCountdowns] = useState({});
const [countdownForm, setCountdownForm] = useState({
  enabled: false, message: 'Hurry! Limited time left', hours: '02', minutes: '00', seconds: '00'
});
```

Extend `load()` to fetch products and admin settings together:

```js
Promise.all([
  adminJson('/api/admin/products?sort=name_asc'),
  adminJson('/api/admin/settings')
]).then(([productBody, settingsBody]) => {
  setProducts(productBody.products);
  setCountdowns(settingsBody.settings.collectionCountdowns || {});
}).catch((err) => setStatus(err.message));
```

Add an effect keyed by `active` and `countdowns` that converts `durationSeconds` to zero-padded fields without altering the saved revision:

```js
useEffect(() => {
  const config = countdowns[active] || {
    enabled: false,
    message: 'Hurry! Limited time left',
    durationSeconds: 7200
  };
  const [hours, minutes, seconds] = formatRemainingTime(config.durationSeconds).split(':');
  setCountdownForm({
    enabled: Boolean(config.enabled),
    message: config.message || 'Hurry! Limited time left',
    hours,
    minutes,
    seconds
  });
}, [active, countdowns]);
```

- [ ] **Step 4: Add validated save behavior**

```js
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
```

Do not call `load()` after saving; updating local state avoids resetting unrelated product-list state.

- [ ] **Step 5: Add the approved Tailwind editor card**

Below the collection tabs and before the product selector, add a rounded white card containing:

```jsx
<section className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
  <div className="flex items-start justify-between gap-4">
    <div>
      <h2 className="text-base font-semibold">Product page countdown</h2>
      <p className="mt-1 text-xs text-clay">Applied when {active} is the product's first collection.</p>
    </div>
    <label className="flex items-center gap-2 text-xs font-semibold">
      <input
        type="checkbox"
        checked={countdownForm.enabled}
        onChange={(event) => setCountdownForm((value) => ({ ...value, enabled: event.target.checked }))}
      />
      Show countdown
    </label>
  </div>
  <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.1em] text-clay">
    Marketing message
    <input
      className="field mt-2"
      maxLength="120"
      value={countdownForm.message}
      onChange={(event) => setCountdownForm((value) => ({ ...value, message: event.target.value }))}
    />
  </label>
  <div className="mt-4 grid grid-cols-3 gap-3">
    {['hours', 'minutes', 'seconds'].map((field) => (
      <label key={field} className="text-center text-xs font-semibold capitalize text-clay">
        {field[0].toUpperCase() + field.slice(1)}
        <input
          className="field mt-2 text-center font-mono text-lg"
          inputMode="numeric"
          value={countdownForm[field]}
          onChange={(event) => setCountdownForm((value) => ({ ...value, [field]: event.target.value }))}
        />
      </label>
    ))}
  </div>
  <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-3">
    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-deep">Live preview</span>
    <strong className="mt-1 block font-mono text-lg text-ink">
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
```

Keep the existing collection membership controls unchanged.

- [ ] **Step 6: Run tests, build, and commit**

Run:

```bash
node --test apps/web/test/collectionCountdown.test.js apps/web/test/adminProductsSource.test.js apps/web/test/storefrontSettingsSource.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: tests and production build PASS.

```bash
git add apps/web/src/admin/Collections.jsx apps/web/test/collectionCountdown.test.js apps/web/dist
git commit -m "feat: manage collection countdowns"
```

## Task 6: Full Regression and Docker Verification

**Files:**
- Verify all files changed in Tasks 1-5.

- [ ] **Step 1: Run the complete automated matrix**

```bash
npm test
node --test apps/web/test/*.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
git diff --check
```

Expected:

- API suite reports zero failures; the PostgreSQL-only Meta test may remain skipped when `TEST_POSTGRES_URL` is absent.
- Web suite reports zero failures.
- Vite production build exits `0`.
- `git diff --check` emits no output.

- [ ] **Step 2: Verify settings persistence in Docker**

Set a non-empty checkout secret because Task 1 already introduced the compatibility environment variable, then rebuild:

```bash
ORDER_CONFIRMATION_SECRET=local-checkout-confirmation-secret-32chars docker compose up -d --build
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/storefront-settings
curl -fsSI http://localhost:8081/
docker compose ps
```

Expected: API health returns `ok: true`, public settings include `collectionCountdowns`, web returns HTTP 200, and services are running.

- [ ] **Step 3: Perform the manual acceptance pass**

1. Log in to `/admin/collections`.
2. Select `New Arrivals`, enable a `00:02:00` timer, edit the message, and save.
3. Open a product whose first collection is `New Arrivals`; confirm the modern countdown appears below price.
4. Refresh after at least five seconds; confirm it continues instead of restarting.
5. Save the admin timer again; confirm the product receives a fresh duration after settings reload.
6. Set a `00:00:05` duration; confirm it disappears at zero and stays hidden after refresh.
7. Disable and save; confirm it is absent on all matching product pages.
8. Confirm price, add-to-cart, checkout quote, and Meta Purchase behavior are unchanged.

- [ ] **Step 4: Record final evidence and commit any generated web build**

```bash
git add apps/web/dist
git commit -m "build: publish collection countdown assets"
```

If `apps/web/dist` is unchanged because it was already committed in Tasks 4 and 5, do not create an empty commit.

## Definition of Done

- [ ] Admin can configure visibility, message, and `HH:MM:SS` duration independently for both storefront collections.
- [ ] Every successful admin save increments a server-owned revision.
- [ ] Public settings expose only normalized countdown configuration.
- [ ] Product pages use only the first assigned collection.
- [ ] Visitor timers persist across refresh and browser restart.
- [ ] Expired timers remain hidden for the same revision.
- [ ] A new revision gives visitors a fresh duration.
- [ ] Unavailable or malformed local storage never breaks the product page.
- [ ] The approved modern Tailwind countdown and editor work on mobile and desktop.
- [ ] Countdown values do not enter commerce or Meta payloads.
- [ ] API tests, web tests, production build, Docker health, and diff checks pass.
