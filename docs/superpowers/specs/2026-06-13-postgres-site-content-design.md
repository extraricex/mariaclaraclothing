# Postgres-backed site content — design

Date: 2026-06-13
Status: Approved (pending spec review)
Author: pairing session (owner-approved)

## Problem

`siteContentRepository` (homepage banners + logo) is **JSON-file-only**. In the Docker
stack the file lives inside the `api` container, so any container rebuild/redeploy resets
the banners and logo back to defaults. Products, orders, and store settings already
persist to PostgreSQL via the project's dual-persistence pattern; site content is the
last storefront-facing store that does not.

This implements proposal #5 from the (now-removed) `docs/ENHANCEMENT_PROPOSALS.md`:
"Postgres for site content … following the existing dual-persistence pattern."

## Goal

Make `siteContentRepository` dual-persistence so site content survives container
rebuilds when `DATABASE_URL` is set, while preserving today's exact JSON behavior for
local dev and tests. No API contract change, no admin UI change.

## Non-goals (YAGNI)

- No new database table (reuse the existing `store_settings` key/value table → **no
  `schema.sql` change**).
- No `db:seed` change — an absent key falls back to defaults on first read.
- No admin UI / public API contract change.
- No migration of existing JSON content into Postgres (defaults serve until the first
  admin edit, which then persists to Postgres).

## Collision-avoidance context

The other developer's branch (`origin/codex-edits`) is actively rebuilding the admin
React UI plus a promo/cart/checkout/orders/inventory engine. Their declared backend
reach (per `docs/enhancementdata2.md`) covers `routes/orders.js`, `routes/discounts.js`,
`routes/admin.js`, the discount/order/product repositories, a new `promos/promoEngine.js`,
and `db/schema.sql`. They do **not** touch `siteContent/`.

This design deliberately:
- Reuses the existing `store_settings` table → **zero `schema.sql` edits** (the one file
  shared with their work).
- Confines `routes/admin.js` edits to the site-content handlers only (adding `await`),
  away from the orders/discounts handlers — small and additive.

## Architecture

Mirror the established dual-persistence pattern used by `catalogRepository`,
`orderRepository`, and `storeSettingsRepository`.

### Persistence switch

```js
function usePostgresSiteContent() {
  return hasDatabaseUrl() && !process.env.SITE_CONTENT_FILE;
}
```

Setting `SITE_CONTENT_FILE` forces JSON mode. Tests already set this override, so every
existing test continues to exercise the JSON path unchanged.

### Storage

Reuse the `store_settings` table (`key text PRIMARY KEY, value jsonb, updated_at`):

```js
const SITE_CONTENT_KEY = 'siteContent';
```

Self-contained local helpers (copied from `storeSettingsRepository`, consistent with the
repo's "helpers duplicated per file on purpose" convention — no cross-module coupling):

```js
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
```

### Dual-mode functions

Each repository function returns a plain value in JSON mode and a `Promise` in PG mode;
callers `await` the result (awaiting a plain value is harmless). Add the standard
`isPromise(value)` helper.

- **`getSiteContent()`**
  - PG: `readPostgresValue(SITE_CONTENT_KEY).then(stored => stored ? normalizeSiteContent(stored) : defaultSiteContent())`
  - JSON: unchanged (read file; ENOENT → `defaultSiteContent()`).
  - **Nuance:** an absent PG key must fall back to `defaultSiteContent()` (logo + the two
    default banners), NOT bare `normalizeSiteContent({})` — the latter would return an
    empty `homepageBanners` array and drop the defaults. This matches the JSON ENOENT
    branch.

- **`saveSiteContent(content)`**
  - PG: normalize → `writePostgresValue(SITE_CONTENT_KEY, normalized)` → return normalized
    (Promise).
  - JSON: unchanged.

- **`updateHomepageBanners(banners)` / `appendHomepageBanners(banners)` / `updateLogo(logo)`**
  - Each performs get → save. Branch on `isPromise(getSiteContent())`:
    - PG: chain with `.then(content => saveSiteContent(...))`.
    - JSON: run synchronously (today's behavior preserved).

`normalizeSiteContent`, `normalizeBanners`, `normalizeLogo`, and `defaultSiteContent`
are unchanged.

### Callers updated to `await` (all in `apps/api`)

The site-content handlers are currently **synchronous**, and two of them have no
`try/catch`. Making the repo dual-mode means each handler must become `async`, `await`
the repo call, and route errors through `next(error)`.

- **`src/routes/siteContent.js`** — public `GET /api/site-content`: currently sync with no
  `try/catch`. Make the handler `async`, `await getSiteContent()`, and add
  `try/catch → next(error)` (keep the existing `Cache-Control: no-store`).
- **`src/routes/admin.js`** — four site-content handlers, each made `async` with `await`:
  - `GET /api/admin/site-content` — currently sync, **no `try/catch`**: add `async` +
    `try/catch`, `await getSiteContent()`.
  - `PUT /api/admin/site-content/homepage-banners` — already has `try/catch`: add `async`,
    `await updateHomepageBanners(...)`.
  - `POST /api/admin/site-content/homepage-banners/images` — already has `try/catch`: add
    `async`, `await getSiteContent()` for `currentBanners`, then
    `await appendHomepageBanners(...)`.
  - `POST /api/admin/site-content/logo/image` — already has `try/catch`: add `async`,
    `await updateLogo(...)`.

  These edits are localized to the site-content section, separate from the
  orders/discounts handlers.

## Data flow

```
GET /api/site-content ─► getSiteContent() ─┬─ JSON: read SITE_CONTENT_FILE / data/site-content.json
                                           └─ PG: SELECT value FROM store_settings WHERE key='siteContent'
                                                  (null → defaultSiteContent())

PUT /api/admin/site-content/homepage-banners ─► updateHomepageBanners(banners)
   ─► getSiteContent() ─► saveSiteContent({...content, homepageBanners}) ─┬─ JSON: writeFile
                                                                          └─ PG: INSERT … ON CONFLICT (key) DO UPDATE
```

## Error handling

Backend convention preserved: PG errors propagate as rejected Promises and surface
through the routes' `try/catch → next(error)`, handled by the central error handler in
`src/app.js`. No new client-facing error messages, so no error-copy contract changes.

## Testing

Tests force JSON mode (`SITE_CONTENT_FILE` override) and cannot reach a live Postgres, so
follow the repo's existing conventions:

1. **JSON-mode integration (`apps/api/test/siteContent.test.js`)** — keep green; add (if
   not already covered) a round-trip asserting banners and logo persist and reload via the
   admin API with a temp `SITE_CONTENT_FILE`.
2. **Dual-mode wiring (`apps/api/test/postgresPersistence.test.js`)** — extend the
   source-regex test to read `src/siteContent/siteContentRepository.js` and assert
   `usePostgresSiteContent` and `store_settings` appear, mirroring the existing
   `usePostgresProducts` / `usePostgresOrders` assertions. This pins the pattern without
   needing a live DB.

`DATABASE_URL= ADMIN_TOKEN= npm test` (from `apps/api`) must stay fully green.

## Rollout

- No schema migration required (table already exists). Existing deployments work
  immediately.
- On a Postgres-backed deploy, the first admin save of banners/logo writes the
  `siteContent` row; until then defaults are served.

## Files touched

- `apps/api/src/siteContent/siteContentRepository.js` (dual-mode logic)
- `apps/api/src/routes/siteContent.js` (`await`)
- `apps/api/src/routes/admin.js` (4 site-content `await`s)
- `apps/api/test/siteContent.test.js` (JSON round-trip)
- `apps/api/test/postgresPersistence.test.js` (wiring assertion)
