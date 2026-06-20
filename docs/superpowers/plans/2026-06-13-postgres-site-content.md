# Postgres-backed Site Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `siteContentRepository` persist to PostgreSQL (via the existing `store_settings` key/value table) when `DATABASE_URL` is set, while preserving today's JSON-file behavior for dev and tests, so homepage banners + logo survive Docker container rebuilds.

**Architecture:** Add a `usePostgresSiteContent()` switch mirroring `catalogRepository`/`orderRepository`/`storeSettingsRepository`. Repository functions return a plain value in JSON mode and a `Promise` in PostgreSQL mode; the four admin handlers and the public GET handler `await` the results. No schema change (reuses `store_settings` with key `siteContent`).

**Tech Stack:** Node.js (CommonJS), Express 4, `pg` (via `src/db/postgres.js`), `node:test`.

Spec: `docs/superpowers/specs/2026-06-13-postgres-site-content-design.md`

**Working directory for all commands:** `apps/api/` (the monorepo's API workspace).

**Always run tests with env overrides** so a local `.env` can't leak Postgres/token state:
`DATABASE_URL= ADMIN_TOKEN= npm test`

---

### Task 1: Make `siteContentRepository` dual-persistence

**Files:**
- Modify: `apps/api/src/siteContent/siteContentRepository.js`
- Test: `apps/api/test/postgresPersistence.test.js`

This task pins the PostgreSQL wiring with a source-regex assertion (the repo's
established way to verify PG persistence without a live database — see how the same test
checks `usePostgresProducts`/`usePostgresOrders`), then implements the dual-mode
repository.

- [ ] **Step 1: Add a failing wiring assertion to `postgresPersistence.test.js`**

In `apps/api/test/postgresPersistence.test.js`, inside the existing single test, add a
read of the site-content repository alongside the existing `productRepository` /
`orderRepository` reads:

```js
  const siteContentRepository = await fs.readFile(path.join(root, 'src', 'siteContent', 'siteContentRepository.js'), 'utf8');
```

Then add these two assertions next to the existing `usePostgresProducts` /
`usePostgresOrders` assertions:

```js
  assert.match(siteContentRepository, /usePostgresSiteContent/);
  assert.match(siteContentRepository, /store_settings/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/postgresPersistence.test.js`
Expected: FAIL — the assertion `assert.match(siteContentRepository, /usePostgresSiteContent/)` throws because the current repository has no such function.

- [ ] **Step 3: Rewrite `siteContentRepository.js` to be dual-mode**

Replace the entire contents of `apps/api/src/siteContent/siteContentRepository.js` with:

```js
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const siteContentPath = path.join(__dirname, '..', '..', 'data', 'site-content.json');
const SITE_CONTENT_KEY = 'siteContent';

function activeSiteContentPath() {
  return process.env.SITE_CONTENT_FILE || siteContentPath;
}

function usePostgresSiteContent() {
  return hasDatabaseUrl() && !process.env.SITE_CONTENT_FILE;
}

function isPromise(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function defaultSiteContent() {
  return {
    logo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing logo' },
    homepageBanners: [
      { url: '/brand/hero1v2.jpg', altText: 'Maria Clara campaign', sortOrder: 0 },
      { url: '/brand/hero2-web.jpg', altText: 'Maria Clara streetwear editorial', sortOrder: 1 }
    ]
  };
}

async function readPostgresValue(key) {
  const result = await query('SELECT value FROM store_settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function writePostgresValue(key, value) {
  await query(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

function readJsonSiteContent() {
  try {
    return normalizeSiteContent(JSON.parse(fs.readFileSync(activeSiteContentPath(), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return defaultSiteContent();
  }
}

function getSiteContent() {
  if (usePostgresSiteContent()) {
    return readPostgresValue(SITE_CONTENT_KEY).then((stored) =>
      (stored ? normalizeSiteContent(stored) : defaultSiteContent())
    );
  }
  return readJsonSiteContent();
}

function saveSiteContent(content) {
  const normalized = normalizeSiteContent(content);
  if (usePostgresSiteContent()) {
    return writePostgresValue(SITE_CONTENT_KEY, normalized).then(() => normalized);
  }
  const filePath = activeSiteContentPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function updateHomepageBanners(banners) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      saveSiteContent({ ...current, homepageBanners: normalizeBanners(banners) })
    );
  }
  return saveSiteContent({ ...content, homepageBanners: normalizeBanners(banners) });
}

function appendHomepageBanners(banners) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      updateHomepageBanners([...current.homepageBanners, ...banners])
    );
  }
  return updateHomepageBanners([...content.homepageBanners, ...banners]);
}

function updateLogo(logo) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) => saveSiteContent({ ...current, logo: normalizeLogo(logo) }));
  }
  return saveSiteContent({ ...content, logo: normalizeLogo(logo) });
}

function normalizeSiteContent(content) {
  return {
    logo: normalizeLogo(content?.logo),
    homepageBanners: normalizeBanners(content?.homepageBanners)
  };
}

function normalizeLogo(logo) {
  const url = String(logo?.url || '').trim();
  const altText = String(logo?.altText || 'Maria Clara Clothing logo').trim();
  return {
    url: url || '/brand/logo.png',
    altText: altText || 'Maria Clara Clothing logo'
  };
}

function normalizeBanners(banners) {
  const records = Array.isArray(banners) ? banners : [];
  return records
    .map((banner, index) => ({
      url: String(banner.url || banner).trim(),
      altText: String(banner.altText || 'Homepage banner').trim(),
      sortOrder: Number.isInteger(Number(banner.sortOrder)) ? Number(banner.sortOrder) : index
    }))
    .filter((banner) => banner.url)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    .map((banner, index) => ({ ...banner, sortOrder: index }));
}

module.exports = {
  appendHomepageBanners,
  getSiteContent,
  normalizeLogo,
  saveSiteContent,
  updateLogo,
  updateHomepageBanners,
  normalizeBanners
};
```

Notes:
- JSON-mode behavior is byte-for-byte the same as before (`readJsonSiteContent` is the
  old `getSiteContent` body; `saveSiteContent` keeps the pretty-print + trailing newline).
- In PG mode an absent key resolves to `defaultSiteContent()` — NOT
  `normalizeSiteContent({})`, which would drop the two default banners.
- `module.exports` is unchanged (same keys), so no caller's `require` destructuring breaks.

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/postgresPersistence.test.js`
Expected: PASS.

- [ ] **Step 5: Run the JSON-mode integration test to confirm no regression**

The existing `siteContent.test.js` calls the repo through the routes in JSON mode (it sets
`SITE_CONTENT_FILE`). The routes still call the repo synchronously at this point; because
JSON mode returns plain values, they keep working.

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/siteContent.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/siteContent/siteContentRepository.js apps/api/test/postgresPersistence.test.js
git commit -m "Back site content with Postgres via store_settings"
```

---

### Task 2: Make site-content route handlers await the repository

**Files:**
- Modify: `apps/api/src/routes/siteContent.js`
- Modify: `apps/api/src/routes/admin.js` (four site-content handlers)

In PostgreSQL mode the repo functions return Promises; the handlers must `await` them and
route rejections through `next(error)`. In JSON mode they return plain values, so
`await` is harmless and the existing tests stay green. This is the change that makes PG
mode actually correct (without it a handler would serialize a Promise into the response).

- [ ] **Step 1: Update the public GET handler in `siteContent.js`**

Replace the contents of `apps/api/src/routes/siteContent.js` with:

```js
const express = require('express');
const { getSiteContent } = require('../siteContent/siteContentRepository');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ siteContent: await getSiteContent() });
  } catch (error) {
    next(error);
  }
});

module.exports = { siteContentRouter: router };
```

- [ ] **Step 2: Update the admin `GET /site-content` handler**

In `apps/api/src/routes/admin.js`, replace:

```js
router.get('/site-content', (_req, res) => {
  res.json({ siteContent: getSiteContent() });
});
```

with:

```js
router.get('/site-content', async (_req, res, next) => {
  try {
    return res.json({ siteContent: await getSiteContent() });
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 3: Update the admin `PUT /site-content/homepage-banners` handler**

In `apps/api/src/routes/admin.js`, replace:

```js
router.put('/site-content/homepage-banners', (req, res, next) => {
  try {
    const siteContent = updateHomepageBanners(req.body?.banners);
    return res.json({ siteContent, banners: siteContent.homepageBanners });
  } catch (error) {
    return next(error);
  }
});
```

with:

```js
router.put('/site-content/homepage-banners', async (req, res, next) => {
  try {
    const siteContent = await updateHomepageBanners(req.body?.banners);
    return res.json({ siteContent, banners: siteContent.homepageBanners });
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 4: Update the admin `POST /site-content/homepage-banners/images` handler**

In `apps/api/src/routes/admin.js`, replace:

```js
router.post('/site-content/homepage-banners/images', bannerUpload.array('images', 6), (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: 'At least one banner image is required' });
    }

    const currentBanners = getSiteContent().homepageBanners;
    const uploadedBanners = files.map((file, index) => ({
      url: bannerUploadUrl(file.filename),
      altText: 'Homepage banner',
      sortOrder: currentBanners.length + index
    }));
    const siteContent = appendHomepageBanners(uploadedBanners);

    return res.status(201).json({ siteContent, banners: siteContent.homepageBanners, uploadedBanners });
  } catch (error) {
    return next(error);
  }
});
```

with:

```js
router.post('/site-content/homepage-banners/images', bannerUpload.array('images', 6), async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: 'At least one banner image is required' });
    }

    const { homepageBanners: currentBanners } = await getSiteContent();
    const uploadedBanners = files.map((file, index) => ({
      url: bannerUploadUrl(file.filename),
      altText: 'Homepage banner',
      sortOrder: currentBanners.length + index
    }));
    const siteContent = await appendHomepageBanners(uploadedBanners);

    return res.status(201).json({ siteContent, banners: siteContent.homepageBanners, uploadedBanners });
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 5: Update the admin `POST /site-content/logo/image` handler**

In `apps/api/src/routes/admin.js`, replace:

```js
router.post('/site-content/logo/image', logoUpload.single('image'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A logo image is required' });
    }

    const siteContent = updateLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing logo'
    });

    return res.status(201).json({ siteContent, logo: siteContent.logo });
  } catch (error) {
    return next(error);
  }
});
```

with:

```js
router.post('/site-content/logo/image', logoUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A logo image is required' });
    }

    const siteContent = await updateLogo({
      url: logoUploadUrl(req.file.filename),
      altText: 'Maria Clara Clothing logo'
    });

    return res.status(201).json({ siteContent, logo: siteContent.logo });
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 6: Run the site-content integration test**

Run: `DATABASE_URL= ADMIN_TOKEN= node --test test/siteContent.test.js`
Expected: PASS (banner update 200, banner upload 201, logo upload 201, file contents reloaded correctly).

- [ ] **Step 7: Run the full API test suite**

Run: `DATABASE_URL= ADMIN_TOKEN= npm test`
Expected: PASS — all suites green (no regressions in admin, catalog, postgresPersistence, etc.).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/siteContent.js apps/api/src/routes/admin.js
git commit -m "Await site content repository in routes"
```

---

## Self-Review

**Spec coverage:**
- Persistence switch `usePostgresSiteContent()` → Task 1, Step 3. ✓
- Reuse `store_settings` key/value, key `siteContent`, no schema change → Task 1, Step 3 (no `schema.sql` touched). ✓
- Dual-mode `getSiteContent`/`saveSiteContent`/`updateHomepageBanners`/`appendHomepageBanners`/`updateLogo` → Task 1, Step 3. ✓
- Absent-PG-key falls back to `defaultSiteContent()` → Task 1, Step 3 (`getSiteContent`). ✓
- Callers `await` (public GET + 4 admin handlers, with `try/catch`) → Task 2, Steps 1–5. ✓
- Tests: keep `siteContent.test.js` green + extend `postgresPersistence.test.js` wiring assertion → Task 1 Step 1 + Task 2 Step 6/7. ✓
- Out of scope (no schema, no seed, no UI, no contract change) → respected; none of those files appear in any task. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows complete code. ✓

**Type/name consistency:** `usePostgresSiteContent`, `SITE_CONTENT_KEY`, `readPostgresValue`, `writePostgresValue`, `readJsonSiteContent`, `isPromise`, `defaultSiteContent`, `normalizeSiteContent`, `normalizeBanners`, `normalizeLogo` are defined in Task 1 Step 3 and referenced consistently. Route handlers use exported names `getSiteContent`/`updateHomepageBanners`/`appendHomepageBanners`/`updateLogo`, all present in `module.exports`. ✓
