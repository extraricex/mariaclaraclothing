# CLAUDE.md — Maria Clara Clothing Webstore

Guidance for working in this repository. Read this before adding features or fixing bugs.
Every section is written so it can be updated independently when the code changes.

## ⚠️ Monorepo restructure (2026-06-12)

The repo is now an **npm-workspaces monorepo**. The entire original app moved, unchanged,
into `apps/api/`. **Every path in the sections below that mentions `src/`, `test/`,
`data/`, `db/`, `scripts/`, or `public/` now lives under `apps/api/`** (e.g.
`apps/api/src/routes/admin.js`, `apps/api/data/products.json`). Everything else in this
document — patterns, contracts, enums, test conventions — still holds.

New top-level pieces:

- **`apps/web/`** — the redesigned frontend: Vite + React 18 + Tailwind CSS v4 +
  react-router. Storefront at `/`, admin SPA at `/admin`. It consumes the same `/api`
  endpoints (dev: Vite proxy to `:3000`; Docker: nginx proxy). It reuses the exact
  browser-storage contracts (`maria-clara-cart`, `maria-clara-admin-token`,
  `maria-clara-last-order`) and the checkout payload shape, so carts/sessions work across
  old and new UIs. The legacy static site in `apps/api/public/` is intentionally kept
  (tests pin it; it is the fallback UI).
- **`docker-compose.yml`** — full stack: `postgres:16` + `api` (auto-migrates, seeds only
  when the products table is empty — see `apps/api/docker-entrypoint.sh`) + `web`
  (nginx serving the built React app on :8081) + `grafana` (:3001, provisioned from
  `infra/grafana/` with the "Maria Clara — Store Overview" dashboard, uid
  `maria-clara-overview`).
- **Root `package.json`** — workspace proxy scripts: `npm test`, `npm run dev:api`,
  `npm run dev:web`, `npm run build:web`, `npm run db:*` all work from the repo root.
- One test was path-adjusted for the move: `apps/api/test/adminReadiness.test.js` reads
  `docs/admin-system-roadmap.md` from the **repo root** `docs/` (three levels up).
- Design/spec docs for the redesign: `docs/superpowers/specs/2026-06-12-modern-redesign-design.md`,
  plan in `docs/superpowers/plans/`, and pending-review ideas in `docs/ENHANCEMENT_PROPOSALS.md`.

### apps/web conventions

- ES modules, JSX, functional components + hooks only; no state library. Shared logic in
  `src/lib/` (`api.js`, `adminApi.js`, `cart.js`, `money.js`, `addressGuide.js`,
  `richText.js` — the sanitizer allow-list mirrors the legacy `sanitizeRichNode`).
- Tailwind v4 CSS-first config: design tokens live in `@theme` in `src/index.css`
  (paper/ink/clay/accent palette, Clash Display + Switzer via Fontshare).
- Money is still integer centavos everywhere; format only via `lib/money.js`.
- Admin API field names differ between list and detail endpoints (e.g. product list rows
  use `image`/`inventoryQuantity`; the public order confirmation returns flattened
  `{ order: { customerName, addressLine, ... } }`) — check `productSummaryRecord`,
  `orderSummary`, and the public confirmation shape in `apps/api/src/routes/orders.js`
  before adding fields.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack & Dependencies](#tech-stack--dependencies)
3. [Commands](#commands)
4. [Architecture](#architecture)
5. [Persistence: the dual JSON/PostgreSQL pattern](#persistence-the-dual-jsonpostgresql-pattern)
6. [Conventions & Patterns](#conventions--patterns)
7. [Backend Module Reference](#backend-module-reference)
8. [HTTP API Reference](#http-api-reference)
9. [Frontend Reference](#frontend-reference)
10. [Configuration Reference](#configuration-reference)
11. [Data Files Reference](#data-files-reference)
12. [Scripts Reference](#scripts-reference)
13. [Testing Guide](#testing-guide)
14. [Adding New Features](#adding-new-features)
15. [Domain Rules (business logic)](#domain-rules-business-logic)
16. [Troubleshooting](#troubleshooting)

---

## Project Overview

Maria Clara Clothing is a Philippine streetwear brand (oversized/crop-box 240 GSM cotton shirts).
This repo is its full webstore:

- **Customer storefront** — a Shopify-look-alike static-HTML site (`public/*.html`) served by
  Express. Customers browse the catalog, add to cart (localStorage), and place
  **Cash-on-Delivery (COD)** orders with structured Philippine addresses
  (province → city/municipality → barangay).
- **Admin workspace** — a single-page app at `/admin.html` (hash-routed) where the owner manages
  products, collections, orders, homepage banners, and exports orders to a
  **J&T Express** shipment Excel file.
- **Backend** — a small Express API (`src/`) with dual persistence: JSON files for local/demo
  use, PostgreSQL when `DATABASE_URL` is set.

There is no payment gateway: every order is COD, confirmed by text message. There are no user
accounts; the only authentication is a single admin password/token.

The repo also carries a documentation trail of how it was built:
`docs/` (recommendations, plans, specs), `MD_FILES/` (page-by-page UI specs for customer and
admin sides), and `data/admin-contracts/` (machine-readable contracts of what each future admin
area manages — these are asserted by tests).

---

## Tech Stack & Dependencies

No build step, no bundler, no transpiler, no TypeScript, no framework. Plain Node.js + browser JS.

### Runtime dependencies (`package.json`)

| Package | Version | Why it's here |
|---|---|---|
| `express` | ^4.21 | HTTP server, static file serving, routing (`src/app.js`, `src/routes/*`) |
| `pg` | ^8.21 | PostgreSQL pool/queries (`src/db/postgres.js`). Tests assert the `^8.` range (`test/postgresPersistence.test.js`) |
| `dotenv` | ^16 | Loads `.env` — called in `src/config/env.js`, `src/db/postgres.js`, `scripts/db-reset-local.js` |
| `multer` | ^2.1 | Image uploads for products and homepage banners (`src/routes/admin.js`) |
| `xlsx` | ^0.18.5 | Reads/writes the J&T Excel export template (`src/jnt/jntExport.js`, `scripts/generate-jnt-address-guide.js`) |

### Dev dependencies

| Package | Why |
|---|---|
| `@playwright/test` | Installed but **there are no Playwright tests in the repo** — it was used for manual visual review (see `.gitignore` entries for `.playwright-profile/`, screenshots). Do not assume a Playwright suite exists. |

### Frontend (CDN, no npm)

- **Bootstrap 5.3.3** CSS + icons from jsDelivr. Loaded **before** `/styles.css` — tests enforce
  this order (`test/pageShell.test.js → assertBootstrapBeforeCustomStyles`).
- `public/styles.css` (~7,900 lines) is the single custom stylesheet for storefront **and** admin.

### Test runner

- Node's built-in `node:test` + `node:assert/strict`. `npm test` = `node --test` (runs `test/*.test.js`).
- Requires Node ≥ 18 (global `fetch`, `FormData`, `Blob` are used in tests), and `node --watch`
  for `npm run dev` implies Node ≥ 18.11.

---

## Commands

```bash
npm install                     # setup
cp .env.example .env            # required once; defaults work without Postgres

npm start                       # node src/server.js (port from PORT, default 3000)
npm run dev                     # node --watch src/server.js (auto-restart)
npm test                        # node --test → runs all test/*.test.js

# PostgreSQL (only when DATABASE_URL is set in .env)
npm run db:migrate              # applies db/schema.sql (idempotent CREATE/ALTER IF NOT EXISTS)
npm run db:seed                 # imports data/products.json + data/orders.json into Postgres
npm run db:reset:local          # creates DB if missing, then DROPs the app tables (destructive!)

# Maintenance
npm run audit:product-images    # classifies product image refs; run BEFORE deleting uploads
npm run jnt:address-guide       # regenerates public/data/jnt-address-guide.json from the J&T template
```

Local URLs (port depends on `PORT` in your `.env` — README uses 3100):

- Customer site: `http://localhost:<PORT>/`
- Admin login: `http://localhost:<PORT>/admin-login.html`
- Admin app: `http://localhost:<PORT>/admin.html`

There is no lint or format command — match existing style by hand (see [Conventions](#conventions--patterns)).

---

## Architecture

### Directory layout (and why)

```
src/                      Backend (CommonJS, require/module.exports)
  server.js               Entry point: createApp() + listen. Nothing else.
  app.js                  Express app factory. Mounts static files, routers, error handler.
                          Tests import createApp() and listen on port 0 — keep app creation
                          side-effect free and separate from listening.
  config/env.js           dotenv + typed access to PORT only. (Most modules read process.env
                          directly at CALL time so tests can override per-test — see Conventions.)
  db/postgres.js          Lazy singleton pg Pool. hasDatabaseUrl()/query()/transaction()/closePool().
  routes/                 HTTP layer only: validation/normalization of req bodies, status codes.
    products.js           Public storefront catalog API (read-only).
    orders.js             Public checkout API (create order, fetch confirmation).
    siteContent.js        Public site content API (homepage banners).
    admin.js              Everything behind admin auth: product CRUD/import/export/images,
                          order list/detail/update, J&T export, banner management. Largest route file.
  products/               Catalog domain.
    catalogRepository.js  Load/validate/normalize/save products (JSON file OR Postgres).
    catalogPresenter.js   Maps repository records → storefront product shape (adds ids, etc).
    catalogSeed.js        (empty placeholder file)
  orders/orderRepository.js   Order persistence (JSON file OR Postgres).
  siteContent/siteContentRepository.js   Homepage banners (JSON file only — no Postgres table).
  jnt/jntExport.js        Builds the J&T Excel workbook from orders; validates required fields.
  admin/ analytics/ customers/ discounts/ marketing/ settings/
                          README-only placeholder modules. Tests REQUIRE these READMEs and the
                          matching data/admin-contracts/<area>.json to exist (adminReadiness.test.js).

public/                   Frontend, served statically by Express. ES modules in the browser.
  index.html product.html cart.html checkout.html thank-you.html
  faq.html shipping-returns.html terms.html        Customer pages (share the "shell": header,
                                                   drawer, search overlay, footer — duplicated
                                                   in each HTML file, no templating).
  admin-login.html admin.html                      Admin pages (Bootstrap-heavy, no Meta Pixel!).
  styles.css              ALL custom CSS (storefront + admin). Heavily asserted by tests.
  js/
    api.js                Tiny fetch wrappers for the public API (cache: 'no-store').
    shell.js              Shared shell behavior: cart count, menu drawer, search overlay,
                          homepage banner carousel, page transitions, trackStorefrontEvent().
    storefront.js         Homepage product grids + the whole product detail page renderer.
    cart.js               localStorage cart store + cart page renderer.
    checkout.js           Checkout page: address selectors (province/city/barangay), shipping
                          fee logic, upsells, order submission.
    thank-you.js          Order confirmation page.
    admin.js              The entire admin SPA (~2,700 lines, hash routing, all admin pages).
    meta-pixel.js         Self-initializing Meta Pixel wrapper exposing window.trackMetaPixel* fns.
    meta-pixel-config.js  One line: window.MARIA_CLARA_META_PIXEL_ID = '' (set per deployment).
  data/
    jnt-address-guide.json        GENERATED (npm run jnt:address-guide). Province/city/barangay
                                  hierarchy used by checkout AND admin order editing.
    philippines-addresses.json    PSGC-based address data (built by scripts/build-psgc-addresses.mjs;
                                  currently superseded by the J&T guide for checkout).
  brand/                  Logo, hero images, video. Asserted to exist by brandAssets.test.js.
  uploads/products/       Multer upload destination for product images (also banners under
                          uploads/banners/ once one is uploaded).
  MANDALA WHITE/          Legacy product photo assets (kept; product mandala-white-v1 was removed
                          from the catalog — a test asserts it stays out).

data/                     Server-side data (NOT served to browsers).
  products.json           Seed/backup catalog — 15 products. THE source of truth without Postgres.
  orders.json             Order store without Postgres ({ "orders": [...] }).
  site-content.json       Homepage banners store.
  admin-contracts/*.json  Per-area contracts (managedFields, futureAdminActions, storefrontFieldMap).
  jnt/jntexportfile.xlsx  J&T Excel TEMPLATE. Do not delete/modify — export and tests depend on
                          its exact sheets ('List', 'Addressing guide', 'Dịch vụ') and layout.

db/schema.sql             Postgres schema (idempotent). Apply with npm run db:migrate.
scripts/                  Operational node scripts (see Scripts Reference).
test/                     node:test suites (see Testing Guide).
docs/                     Human docs: recommendations, superpowers/plans, superpowers/specs.
MD_FILES/                 Page-by-page UI specs (ADMIN_SIDE/, CUSTOMER_SIDE/).
```

### Request/data flow

```
Customer browser                           Admin browser
  public/js/api.js                           public/js/admin.js (adminFetch + Bearer token)
        │                                          │
        ▼                                          ▼
  /api/products  /api/orders  /api/site-content  /api/admin/** (requireAdmin middleware)
        │              │              │                │
  catalogPresenter  routes/orders  siteContentRepo   routes/admin.js (normalize* helpers)
        │              │                               │
  catalogRepository  orderRepository ◄─────────────────┤ (products + orders + siteContent + jntExport)
        │              │
        ├── JSON files (data/*.json)         when DATABASE_URL is absent or *_DATA_FILE override set
        └── PostgreSQL (src/db/postgres.js)  when DATABASE_URL is set
```

Key boundary rules:

- **Routes own HTTP concerns** (status codes, request normalization with thrown
  `error.status = 400` errors). **Repositories own persistence + record validation.**
  **Presenter (`catalogPresenter`) owns the storefront-facing product shape** — the storefront
  never sees raw repository records.
- The storefront product shape adds synthetic ids: product `id = catalog-<slug>`, variant
  `id = catalog-<slug>-<index>`, image `id = catalog-image-<slug>-<index>`. Checkout sends these
  ids back; `routes/orders.js` strips the `catalog-` prefix to re-find the product and
  **re-validates price and stock server-side**.
- Admin writes products through `catalogRepository.saveEditableProduct`; the storefront
  immediately reflects changes because all storefront reads go through the same repository
  (with `Cache-Control: no-store` on the API and `cache: 'no-store'` on the client fetches).

---

## Persistence: the dual JSON/PostgreSQL pattern

This is the most important backend pattern. Three stores follow it (products, orders) or a
JSON-only variant (site content):

```js
// products (src/products/catalogRepository.js)
function usePostgresProducts() {
  return hasDatabaseUrl() && !process.env.PRODUCTS_DATA_FILE;
}
// orders (src/orders/orderRepository.js)
function usePostgresOrders() {
  return hasDatabaseUrl() && !process.env.ORDERS_DATA_FILE;
}
```

Rules:

1. **Postgres is used iff `DATABASE_URL` is set AND no file-override env var is set.**
   Setting `PRODUCTS_DATA_FILE` / `ORDERS_DATA_FILE` / `SITE_CONTENT_FILE` forces JSON mode —
   this is how every test isolates itself (temp files via `fs.mkdtemp`).
2. **Repository functions return either a plain value (JSON mode) or a Promise (Postgres mode).**
   Callers that must support both use the `isPromise()` helper and branch:
   ```js
   function listCatalogProducts() {
     const products = listEditableProducts();
     if (isPromise(products)) return products.then(toVisibleCatalogProducts);
     return toVisibleCatalogProducts(products);
   }
   ```
   Routes simply `await` the result (awaiting a plain value is fine). **When adding repository
   functions, preserve this dual sync/promise behavior** or at minimum make routes `await`.
3. **JSON writes are pretty-printed with a trailing newline:**
   `fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)`. Keep this exact format —
   `data/products.json` is committed and diffs matter.
4. **Postgres rows ↔ JS objects** are mapped by hand in `fromPostgres*` functions
   (snake_case columns → camelCase fields). Order upserts use
   `INSERT ... ON CONFLICT (order_number) DO UPDATE`; product saves delete+reinsert images and
   variants inside a `transaction()`.
5. **Module-load caveat:** `catalogRepository.js` reads `data/products.json` at require time to
   build the exported `editableProducts`/`catalogProducts` snapshots (legacy exports used by
   `catalog.test.js`). Consequently:
   - `PRODUCTS_DATA_FILE` must point at a valid products JSON **before** the module is first
     required (tests set it at the top of the file or use `createFreshApp()` cache-busting).
   - Prefer `listEditableProducts()` / `listCatalogProducts()` over the static snapshot exports
     in new code.
6. **Site content is JSON-only** (`data/site-content.json`, override `SITE_CONTENT_FILE`).
   There is no `site_content` table; if it ever moves to Postgres, follow the products/orders
   pattern.

`db/schema.sql` is **idempotent** — `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ... ADD COLUMN
IF NOT EXISTS` for columns added later. When adding a column: add it to the `CREATE TABLE` *and*
add a matching `ALTER TABLE ... IF NOT EXISTS` line so existing databases migrate.

---

## Conventions & Patterns

### Module system — two worlds, do not mix

| Location | System | Import style |
|---|---|---|
| `src/`, `scripts/*.js`, `test/` | CommonJS | `const { x } = require('../path')`, `module.exports = { ... }` |
| `public/js/` | Browser ES modules | `import { x } from './api.js'` (always with `.js` extension), `export function` |
| `scripts/*.mjs` | Node ES modules | one-off scripts only |

Node built-ins are required with the `node:` prefix: `require('node:fs')`, `require('node:path')`,
`require('node:crypto')`, `require('node:fs/promises')`.

### Naming

- Files: camelCase (`catalogRepository.js`, `jntExport.js`, `siteContentRepository.js`).
  Frontend files: kebab-case where multi-word (`meta-pixel.js`, `thank-you.js`).
- Tests: `test/<area><Topic>.test.js` camelCase (`adminJntExport.test.js`).
- Exports are **named, never default**; `module.exports` objects list keys alphabetically in the
  repositories. Routers export `{ xxxRouter: router }`.
- Money fields always end in `Cents` and hold **integer centavos** (`priceCents: 64900` = ₱649.00).
  Pesos exist only at the UI edge (`formatMoney`, `adminPesoToCents`, `formatAdminPesoInput`).
- Normalizers are `normalizeX(...)`, validators `validateX(...)` / `requireString|PositiveNumber|NonNegativeNumber`,
  render helpers in frontend are `renderX(...)`, initializers `initializeX(...)`, binders `bindX(...)`.

### Error handling (backend)

Throw an `Error` with a `status` property for client errors; the central handler in `src/app.js`
turns it into JSON and hides messages for 5xx:

```js
const error = new Error('Product status is invalid');
error.status = 400;
throw error;
// app.js: res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong' })
```

Routes use `try { ... } catch (error) { return next(error); }` around async work. Error JSON shape
is always `{ error: '<message>' }` — tests assert exact messages, so changing copy breaks tests.

### Defensive normalization at every boundary

Request bodies are never trusted: every field goes through `String(x || '').trim()`,
`Number(...)` + `Number.isInteger` checks, `Array.isArray` guards. See `normalizeProductRequest`,
`normalizeOrderUpdate` (`src/routes/admin.js`) and `normalizeCheckout` (`src/routes/orders.js`)
for the canonical style. Repositories normalize again (`normalizeEditableProduct`) and validate
(`validateProducts`) before writing. Follow this two-layer approach for new endpoints.

### Status enums

Defined as `Set`s at the top of `src/routes/admin.js` and validated with `validateEnum`:

- order `status`: `received | confirmed | packed | shipped | delivered | cancelled`
- `fulfillmentStatus`: `unfulfilled | packed | shipped | delivered | cancelled`
- `paymentStatus`: `cod_pending | paid | cancelled | refunded`
- `codConfirmationStatus`: `pending | confirmed | unreachable | cancelled`
- `deliveryStatus`: `pending | ready | out_for_delivery | delivered | returned | cancelled`
- product `status`: `active | draft | archived` (draft/archived are hidden from the storefront)
- product `merchandisingStatus`: `sale | sold_out` (derived from variant stock when absent)

If you add a status value, update: the Set in `admin.js`, `db/schema.sql` defaults if relevant,
admin UI badge/label functions in `public/js/admin.js` (`statusBadgeClass`, `paymentStatusLabel`,
`fulfillmentStatusLabel`, ...), and the tests asserting the enums.

### Frontend conventions

- **DOM hooks are `data-*` attributes, never classes**: JS queries
  `[data-add-to-cart]`, `[data-admin-orders]`, `[data-checkout-submit]`, etc. Classes are for CSS
  only. Tests grep for these attributes — removing/renaming one breaks tests.
- **All dynamic HTML is built with template literals** and **every interpolation is escaped** with
  the locally-defined `escapeHtml` / `escapeAttribute` helpers (each module deliberately carries
  its own copy — there is no shared util file in the browser). The only sanctioned exception is
  `renderRichProductText` in `storefront.js`, which sanitizes admin-authored rich descriptions
  through `sanitizeRichNode` (allow-list of tags, `href`/limited `style` only). Never insert
  unescaped user/product data.
- **Analytics**: `trackStorefrontEvent(name, payload)` (from `shell.js`) pushes to
  `window.dataLayer`. Meta Pixel calls are global functions invoked with optional chaining so
  pages work when the pixel script is absent: `window.trackMetaPixelAddToCart?.(product, variant, qty)`.
  Customer pages load `/js/meta-pixel-config.js` + `/js/meta-pixel.js`; **admin pages must not**
  (asserted by `frontendBehavior.test.js`).
- **Browser storage keys** (all prefixed `maria-clara-`):
  - `localStorage['maria-clara-cart']` — cart items array
  - `localStorage['maria-clara-admin-token']` — admin bearer token
  - `sessionStorage['maria-clara-last-order']` — checkout confirmation for thank-you page
  - `sessionStorage['maria-clara-meta-purchase-<orderNumber>']` — Purchase event dedupe
- **Cart item shape** (created in `storefront.js → addProductToCart`):
  `{ productId, slug, variantId, productName, size, quantity, unitPriceCents, imageUrl,
  externalPosProductId, externalPosVariantId }`.
- **Page transitions**: `shell.js → bindPageTransitions()` intercepts same-origin link clicks,
  adds `is-page-leaving`, then navigates after 150 ms. `admin.js` has its own copy.
- **Buttons** carry both the custom and Bootstrap classes together, e.g.
  `class="button button-dark btn btn-dark"` — tests assert these exact combinations.
- Currency display: storefront uses `Intl.NumberFormat('en-PH', { currency: 'PHP' })`; cart/
  checkout/thank-you append ` PHP` with `narrowSymbol`.

### CSS conventions

- One file, `public/styles.css`. Sections roughly: shell/header → homepage → product page → cart →
  checkout → thank-you → admin (`.admin-*` prefix for everything admin).
- Breakpoints used consistently: `max-width: 420px`, `max-width: 480px`, `max-width: 749px`,
  `min-width: 750px) and (max-width: 989px`, `min-width: 990px`, plus admin-specific `1080px`/`1180px`.
- Many granular structure tests regex-match selectors AND specific declarations
  (e.g. `.limited-stock-label { color: #c01818 }`). When editing CSS, run `npm test` and update
  the matching assertions deliberately.

### Git conventions

History is short; commit subjects are concise imperative Title-style lines without scopes or
trailers, e.g. `Add admin homepage banner manager`, `Initial Maria Clara webstore`. Follow that:
one-line imperative summary, no conventional-commit prefixes.

---

## Backend Module Reference

### `src/db/postgres.js`

| Export | Signature | Notes |
|---|---|---|
| `hasDatabaseUrl()` | `() => boolean` | The persistence switch. |
| `getPool()` | `() => pg.Pool` | Lazy singleton; throws without `DATABASE_URL`. |
| `query(sql, values?)` | `(string, any[]) => Promise<Result>` | One-off query on the pool. |
| `transaction(cb)` | `(client => Promise<T>) => Promise<T>` | BEGIN/COMMIT/ROLLBACK + release. Use for multi-statement writes (product save, import). |
| `closePool()` | `() => Promise<void>` | Used by scripts' `.finally()`. |

### `src/products/catalogRepository.js`

Editable product record shape (what admin sees / what's stored):

```js
{ slug, name, description, collections: ['New Arrivals'], category, productType, vendor,
  tags: [], seo: { title, description, handle }, metafields: { key: [values] },
  themeTemplate, status, featured, merchandisingStatus,
  priceCents, compareAtPriceCents|null,
  images: [{ url, altText, sortOrder }],
  variants: [{ size, sku, priceCents|null, stockQuantity, externalPosVariantId }],
  productPage: { heading, intro, sections: [{ title, body?, items? }],
                 sizeChartImageUrl?, featuredImageUrl?, mediaLimit?, soldOutText? } }
```

| Export | What it does / when to use |
|---|---|
| `listEditableProducts()` | All products (admin views). Sync array (JSON) or Promise (PG). |
| `findEditableProductBySlug(slug)` | One product or `null`. |
| `saveEditableProduct(product, originalSlug?)` | Normalize + upsert. Pass `originalSlug` when the slug may have been renamed (deletes the old row). |
| `deleteEditableProduct(slug)` | Returns deleted product or `null`. |
| `replaceEditableProducts(products)` | Full import — wipes and rewrites (used by admin import & db:seed). |
| `listCatalogProducts()` / `findCatalogProductBySlug(slug)` | Storefront-visible only (filters out `draft`/`archived`), mapped via `toCatalogProduct`. Used by the presenter — routes should use the presenter instead. |
| `normalizeEditableProduct(product)` | Fills every default (slugify name, default variant, fallback image `/product/3.png`, default productPage, derive merchandisingStatus...). |
| `validateProducts(products)` | Throws descriptive errors (`products[3].images[0].url must be a non-empty string.`, duplicate-slug check). Runs on every JSON load AND write. |
| `loadEditableProducts(filePath?)`, `writeEditableProducts(products, filePath?)` | Raw JSON IO. |
| `catalogProducts`, `editableProducts`, `productsPath` | Module-load-time snapshots/path (legacy; used by `catalog.test.js`). Avoid in new code. |

### `src/products/catalogPresenter.js`

| Export | Storefront product shape it returns |
|---|---|
| `listCatalogProducts()` / `findCatalogProductBySlug(slug)` | `{ id: 'catalog-<slug>', slug, name, description, priceCents, compareAtPriceCents, collection, collections, merchandisingStatus, featured, productPage, images: [{ id, url, altText, sortOrder }], variants: [{ id: 'catalog-<slug>-<i>', size, sku, priceCents, stockQuantity, externalPosVariantId }] }` |

### `src/orders/orderRepository.js`

Order record shape: see `normalizeCheckout` in `src/routes/orders.js` plus admin-managed fields
(`status`, `fulfillmentStatus`, `paymentStatus`, `codConfirmationStatus`, `deliveryStatus`,
`deliveryMethod`, `trackingNumber`, `tags`, `notes`, `exportedToJnt`, `jntExportedAt`,
`channel`, `placedAt`, `updatedAt`).

| Export | Notes |
|---|---|
| `saveOrder(order)` | Insert-or-replace by `orderNumber` (all async). |
| `listOrders()` | Sorted newest-first by `placedAt`. |
| `findOrderByNumber(orderNumber)` | `null` when absent. |
| `updateOrder(orderNumber, changes)` | Shallow-merges `changes`, stamps `updatedAt`. Returns updated order or `null`. |
| `resetOrderRepositoryForTests()` | Truncates the store (PG `DELETE` or empty JSON). |

### `src/siteContent/siteContentRepository.js`

| Export | Notes |
|---|---|
| `getSiteContent()` | `{ homepageBanners: [{ url, altText, sortOrder }] }`; falls back to two `/brand/` hero defaults when the file is missing. |
| `updateHomepageBanners(banners)` | Replaces the list (normalized, re-sorted, sortOrder reindexed 0..n). |
| `appendHomepageBanners(banners)` | Append (used by upload endpoint). |
| `saveSiteContent(content)` / `normalizeBanners(banners)` | Lower-level helpers. |

### `src/jnt/jntExport.js`

| Export | Notes |
|---|---|
| `validateJntOrders(orders)` | Returns `[{ orderNumber, missing: ['customer name', 'valid phone number', ...] }]` for orders missing export fields. Empty array = all good. |
| `writeJntExportBuffer(orders)` / `buildJntExportWorkbook(orders)` | Loads template `data/jnt/jntexportfile.xlsx`, clears sheet `List` from **row 9**, writes one row per order under the **row-8 headers**, preserves template cell styles. 13 columns A–M: receiver, phone, address, province, city, barangay, express type (`JNT_DEFAULT_EXPRESS_TYPE`, default `EZ`), parcel name (product names), weight kg, parcel count, parcel value, COD amount, remarks (`Small x1; Medium x1 | <notes>`). |
| `normalizePhilippinePhone(phone)` | Accepts `09…`, `639…`, `+639…` (11-digit mobile) → returns `+639XXXXXXXXX` or `''` if invalid. |

### `src/routes/admin.js` internals worth knowing

- `requireAdmin` middleware: compares `Authorization: Bearer <token>` to `adminToken()`
  (`process.env.ADMIN_TOKEN || 'local-admin-token'`). `POST /login` compares to `adminPassword()`
  (`process.env.ADMIN_PASSWORD || 'admin'`) and returns the token. **Login route is mounted
  before `router.use(requireAdmin)` — keep any new public admin route above that line.**
- Multer instances: product images (5 MB, ≤8 files, `image/*` only, name
  `<slug>-<timestamp>-<rand><ext>` into `PRODUCT_UPLOAD_DIR` or `public/uploads/products`);
  banners (8 MB, ≤6 files, into `BANNER_UPLOAD_DIR` or `public/uploads/banners`).
- `withSyncedStorefrontProductPage(product)`: on create/update, mirrors `name` → `productPage.heading`
  and `description` → `productPage.intro` so the storefront description always matches admin edits.
- `productSummary(products)` returns `{ total, active, draft, archived, lowStock, soldOut }`
  (low stock = total inventory 1–12; threshold 12 also lives in the storefront as
  `LOW_STOCK_THRESHOLD` and in `/products/settings`).
- Static route ordering matters: specific paths (`/products/export`, `/products/import`,
  `/products/settings`, `/orders/export/jnt`) are declared **before** `/:slug` and
  `/:orderNumber` params. Add new literal routes above the param routes.

---

## HTTP API Reference

### Public (no auth, `Cache-Control: no-store`)

| Endpoint | Returns / behavior |
|---|---|
| `GET /api/health` | `{ ok: true, service: 'maria-clara-clothing' }` |
| `GET /api/products` | `{ products: [storefront products], source: 'catalog' }` — active products only |
| `GET /api/products/:slug` | `{ product, source: 'catalog' }` or 404; draft/archived → 404 |
| `GET /api/site-content` | `{ siteContent: { homepageBanners } }` |
| `POST /api/orders` | Creates COD order. Validates customer (fullName, phone), structured address (houseAddress, barangay, city, province + addressLine), non-empty items; per item re-checks: product/variant exists, stock ≥ qty (`'<Size> is sold out for <Name>'`), unit price matches catalog (`'Cart item price has changed'`). Returns 201 `{ orderNumber: 'DEMO-<ts>-<hex>', syncStatus: 'frontend_only', ... }` |
| `GET /api/orders/:orderNumber` | Order confirmation payload (used by thank-you page). |
| `GET /collections/all` | Serves `index.html` (Shopify-style collection URL alias). |

### Admin (`Authorization: Bearer <ADMIN_TOKEN>`)

| Endpoint | Behavior |
|---|---|
| `POST /api/admin/login` | `{ password }` → `{ token }` or 401 |
| `GET /api/admin/session` | `{ authenticated: true }` (token check) |
| `GET /api/admin/products?status=&collection=&q=&stock=&sort=` | `{ products: [summary rows], summary }`. `stock`: `in_stock|low_stock|sold_out`; `sort`: `name_asc|name_desc|inventory_asc|inventory_desc` |
| `GET/POST/PUT/DELETE /api/admin/products[/:slug]` | CRUD with full normalization; PUT merges over existing record |
| `POST /api/admin/products/:slug/duplicate` | Copy (default `-copy` slug, `draft` status) |
| `GET /api/admin/products/export` | JSON download of all products |
| `POST /api/admin/products/import` | `{ products: [...] }` → replaces entire catalog |
| `GET /api/admin/products/settings` | Static recommended settings (statuses, sizes, collections, lowStockThreshold 12) |
| `POST /api/admin/products/:slug/images` | multipart `images[]` upload → appends |
| `PUT /api/admin/products/:slug/images` | Replace image list (≥1 required) |
| `DELETE /api/admin/products/:slug/images/:index` | Delete by index (cannot delete last image) |
| `GET /api/admin/orders?status=&q=` | `{ orders: [orderSummary rows incl. jntExportStatus: exported/missing_fields/ready] }` |
| `GET /api/admin/orders/:orderNumber` | Full order |
| `PATCH /api/admin/orders/:orderNumber` | Partial update via `normalizeOrderUpdate` (statuses, customer, address, tags, notes, trackingNumber, deliveryMethod) |
| `POST /api/admin/orders/export/jnt` | `{ orderNumbers?: [] }` → xlsx download `JNT_Orders_YYYY-MM-DD.xlsx`. Without orderNumbers: all not-yet-exported, not shipped/delivered/cancelled orders. 400 with per-order `missing` fields if validation fails. Marks orders `exportedToJnt: true` + `jntExportedAt`. |
| `GET /api/admin/site-content` | Site content (admin view) |
| `PUT /api/admin/site-content/homepage-banners` | Replace banner list |
| `POST /api/admin/site-content/homepage-banners/images` | multipart `images[]` → append uploaded banners |

---

## Frontend Reference

### Page → script map

| Page | Scripts (in order) | Notes |
|---|---|---|
| `index.html` | meta-pixel-config, meta-pixel, `shell.js`, `storefront.js` | grids `#product-grid` (New Arrivals), `#freedom-grid` (Freedom of Mind), banner carousel `[data-homepage-banners]` |
| `product.html?slug=<slug>` | same | `#product-detail` fully rendered by `storefront.js → renderProductDetail` |
| `cart.html` | shell, `cart.js` | `#cart-items`, `[data-empty-cart]`, `[data-filled-cart]`, `[data-cart-footer]`, `[data-checkout-link]` |
| `checkout.html` | shell, `checkout.js` | `#checkout-form`, province/city/barangay `<select>`s, summary, upsells. No site header — its own `checkout-brand-header`. |
| `thank-you.html` | shell, `cart.js`, `thank-you.js` | reads `?order=` then falls back to sessionStorage |
| `faq.html`, `shipping-returns.html`, `terms.html` | shell only | static content pages |
| `admin-login.html` | `admin.js` | `isLoginPage` branch; Shopify-style login card |
| `admin.html` | `admin.js` | full SPA; **no meta pixel**, Bootstrap layout (`admin-frame container-fluid`, sidebar `col-12 col-lg-3`) |

### Admin SPA structure (`public/js/admin.js`)

- Auth: token in `localStorage`; `adminFetch()` adds the Bearer header and redirects to login
  on 401. `initializeAdminPage()` verifies `/api/admin/session` on load.
- **Hash routing**: pages are `<section data-admin-page="...">` blocks in `admin.html`; the hash
  (`#dashboard`, `#orders`, `#products`, `#collections`, `#website-content`, `#customers`,
  `#shipping-settings`, `#settings`) selects one via `renderAdminPage()`. Navigation links use
  `data-admin-nav-link`. Unknown hash → `dashboard`.
- Each page has a `load<Page>()` entry (`loadOrders`, `loadProducts`, `loadCollectionsPage`,
  `loadWebsiteContentPage`, `loadDashboardSummary`) and `render*` functions building HTML strings.
- Orders page: work queues (Needs COD confirmation / Ready for J&T / Ready to ship), filter shell,
  table with selection checkboxes (`selectedOrderNumbers`), detail/edit mode
  (`setOrderDetailMode`), address dropdowns hydrated from the J&T guide
  (`hydrateAdminOrderAddressDropdowns`), J&T export button (`exportJntOrders` → blob download).
- Products page: summary cards, ABC analysis mock, filters, table → product editor
  (`renderProductDetail`) with rich-text description editor (`contenteditable`,
  `applyDescriptionCommand`), variants table, image upload/alt/delete, SEO preview, metafields,
  duplicate/delete actions, CSV/JSON import (`parseProductsCsv`), print/export more-actions.
- Collections page: fixed list `STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind']`;
  add/remove products to a collection rewrites the product's `collections` array via PUT.
- Website page: homepage banner manager (list, alt text, sort, delete, upload, save).
- Toasts: `showAdminToast('Changes saved successfully.')`.
- Peso inputs: forms use `name="pricePeso"` with `adminPesoToCents` /
  `formatAdminPesoInput` — **never** expose raw cents in admin form fields
  (a test asserts `name="priceCents"` does not appear).

### Storefront shipping/address logic (`checkout.js`)

- Address data: `/data/jnt-address-guide.json` (lazy, cached promise, tiny hard-coded
  CAVITE/IMUS/BUCANDALA IV fallback if fetch fails).
- Region resolution from selected province: CAVITE or METRO MANILA → `metro_manila_cavite`;
  `islandGroup` Visayas/Mindanao → `visayas_mindanao`; else `luzon`.
- Fees (cents): metro_manila_cavite 8000, luzon 12000, visayas_mindanao 18000.
  **Free shipping when cart quantity ≥ 2** (`freeShippingUnlocked`).
- Until house+province+city+barangay are filled, fee shows “Calculated after address”
  (`pending_address` region, `[data-shipping-pending]`).
- Barangays with `doorToDoor !== 'YES'` show a warning (`[data-door-to-door-warning]`).
- Delivery estimates per region via `deliveryEstimateForRegion`.
- On submit: builds payload (customer, structured address, totals, `checkoutChannel:
  'storefront_checkout'`, `paymentMethod: 'cash_on_delivery'`, `cartSnapshot`,
  `adminEditableTotals`), POSTs, stores confirmation in sessionStorage, clears cart, redirects to
  `/thank-you.html?order=<n>`.

---

## Configuration Reference

### Environment variables (`.env`, gitignored; `.env.example` is the template)

| Variable | Required? | Default | Used by |
|---|---|---|---|
| `PORT` | no | `3000` | `src/config/env.js` → server listen. Local convention is 3100 (README). |
| `DATABASE_URL` | no | — | Enables PostgreSQL everywhere (`src/db/postgres.js`). Without it, JSON files are used. |
| `ADMIN_TOKEN` | prod yes | `local-admin-token` | Bearer token for `/api/admin/**`. Tests rely on the default. |
| `ADMIN_PASSWORD` | prod yes | `admin` | `POST /api/admin/login`. |
| `PANCAKE_WEBHOOK_SECRET` | no | — | **Reserved/unused in code today** (planned Pancake POS webhook). Keep in `.env.example`. |
| `META_PIXEL_ID` | no | — | **Not read by server code.** The pixel id is set client-side in `public/js/meta-pixel-config.js` (`window.MARIA_CLARA_META_PIXEL_ID = ''`) or `<html data-meta-pixel-id>`. See `docs/meta-pixel-setup.md`. |
| `PRODUCTS_DATA_FILE` | tests | `data/products.json` | Forces JSON product store at this path (disables PG for products). |
| `ORDERS_DATA_FILE` | tests | `data/orders.json` | Same for orders. |
| `SITE_CONTENT_FILE` | tests | `data/site-content.json` | Same for site content. |
| `PRODUCT_UPLOAD_DIR` | tests | `public/uploads/products` | Multer destination for product images. |
| `BANNER_UPLOAD_DIR` | tests | `public/uploads/banners` | Multer destination for banner images. |
| `JNT_DEFAULT_EXPRESS_TYPE` | no | `EZ` | Express Type column in J&T export. |

`process.env` is read **at call time** in route/repository helpers (e.g. `adminToken()`,
`ordersDataFile()`), not cached at module load — keep doing this so tests can flip env vars
per test. (`src/config/env.js` is the one exception and only handles PORT.)

### Config files

| File | Controls |
|---|---|
| `package.json` | scripts (see Commands); `"main": "src/server.js"`; no `"type": "module"` (CommonJS default). Tests assert `db:migrate`/`db:seed` script strings and the `pg` semver range. |
| `db/schema.sql` | Postgres DDL — idempotent, applied via `npm run db:migrate` (executed as one `query()`). |
| `.gitignore` | `.env*` (except `.env.example`), `node_modules/`, `.DS_Store`, Playwright artifacts, `.superpowers/`, root review screenshots. |
| `data/admin-contracts/<area>.json` | One per admin area (`products, orders, customers, discounts, analytics, marketing, settings`): `{ area, managedFields[], futureAdminActions[] }` (+ `storefrontFieldMap` for products). `adminReadiness.test.js` asserts each exists with non-empty arrays and that order fields like `cartSnapshot` stay listed. Update the contract when you add managed fields. |

There is no tsconfig, ESLint, Prettier, Playwright config, or MCP configuration in this repo.

---

## Data Files Reference

| File | Notes |
|---|---|
| `data/products.json` | Canonical catalog (15 products). Pretty-printed, trailing newline. Edited by the admin API in JSON mode. **Tests pin exact contents**: product count 15, specific slugs (`oranges-mcc-box-tee`, the long `oversized-fit-shirt-mc-curiosity-*` slugs), prices 64900/92900, SKUs (`ORANGE01S`, `BLOOM-001M`), stock values, image URLs, productPage text. Editing this file ⇒ update `test/catalog.test.js` + `test/health.test.js` fixtures. |
| `data/orders.json` | `{ "orders": [...] }`. Demo orders; safe to clear locally. |
| `data/site-content.json` | `{ "homepageBanners": [...] }`. |
| `data/jnt/jntexportfile.xlsx` | **J&T template — treat as binary fixture.** Sheets `List` (headers row 8, data row 9+, range `A1:M5098`), `Addressing guide` (province/city/barangay rows, `A1:D42989`), `Dịch vụ`. Source for both the export and the generated address guide. The `.xls` sibling is an artifact; the `.xlsx` is what code reads. |
| `public/data/jnt-address-guide.json` | Generated by `npm run jnt:address-guide`. Shape: `{ metadata{ source, sheet, provinceCount: 82, ... }, provinces: [{code,name}], cities: { PROVINCECODE: [...] }, barangays: { 'PROV|CITY': [{..., doorToDoor}] }, doorToDoor }`. Codes are pipe-joined uppercase names (`CAVITE|IMUS|BUCANDALA IV`). Consumed by checkout and admin order editing. Regenerate (don't hand-edit). |
| `public/data/philippines-addresses.json` | PSGC dataset built by `scripts/build-psgc-addresses.mjs` (islandGroup logic lives there). Currently not fetched by any page (checkout uses the J&T guide), kept for reference/future. |
| `public/uploads/products/` | Uploaded product images; referenced by `/uploads/products/...` URLs in products.json. Run `npm run audit:product-images` before deleting anything here. |

---

## Scripts Reference

| Script | What it does |
|---|---|
| `scripts/db-migrate.js` | Reads `db/schema.sql`, runs it via `query()`, closes pool. Needs `DATABASE_URL`. |
| `scripts/db-seed.js` | `replaceEditableProducts(data/products.json)` + `saveOrder` for each order in `data/orders.json`. Needs `DATABASE_URL`. Idempotent (upserts). |
| `scripts/db-reset-local.js` | Connects to the `postgres` admin DB, creates the target DB if missing, then **drops** `product_images, product_variants, products, orders`. Local dev only. |
| `scripts/audit-product-images.js` | Library + CLI. `auditProductImages({ productsPath?, publicDir?, uploadDir? })` classifies every image URL as `remote` / `local-public` / `local-upload`, reports `missingLocalFiles` and `unusedLocalUploadFiles`. Exported for `test/productImageAudit.test.js`. Run before cleaning `public/uploads/products/`. |
| `scripts/generate-jnt-address-guide.js` | Parses the template's `Addressing guide` sheet → `public/data/jnt-address-guide.json`. Run after replacing the J&T template. |
| `scripts/build-psgc-addresses.mjs` | One-off: builds `philippines-addresses.json` from PSGC dumps (`node scripts/build-psgc-addresses.mjs [sourceDir] [outputPath]`, default source `/private/tmp/psgc-dumps`). |

Script conventions: `main().catch(set exitCode).finally(closePool)` for DB scripts; `console.log`
confirmation message at the end.

---

## Testing Guide

### Running

```bash
npm test                                 # all suites
node --test test/adminOrders.test.js     # one file
node --test --test-name-pattern="J&T"    # by test name
```

Tests never need Postgres — they force JSON mode with `*_DATA_FILE` env overrides.

**⚠️ Your local `.env` leaks into tests** (dotenv loads it via `src/config/env.js` /
`src/db/postgres.js`). If your `.env` sets `DATABASE_URL`, product tests hit Postgres and fail
with 500s; if it sets a non-default `ADMIN_TOKEN`, the login/auth tests fail
(`'change-this-admin-token' !== 'local-admin-token'`). dotenv does not override variables already
set in the shell, so run:

```bash
DATABASE_URL= ADMIN_TOKEN= npm test     # 54/54 pass regardless of .env contents
```

(Empty string is falsy for `hasDatabaseUrl()` and falls through to the token default.)

### The two test styles (know which one you're writing)

**1. API/integration tests** (`health`, `catalog` (partly), `adminOrders`, `adminProducts`,
`adminJntExport`, `siteContent`, `productImageAudit`):

- Start a real server: `createApp()` + `app.listen(0, '127.0.0.1')`, talk to it with global
  `fetch`, always `finally { server.close() }` (await closure via
  `new Promise((resolve) => server.close(resolve))` when a second server follows).
- Isolate state with temp files:
  ```js
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-orders-')), 'orders.json');
  ```
  Save the previous env value first and restore it in `finally` via the local `restoreEnv(name, value)`
  helper (copy it — there's no shared test util file; helpers are duplicated per test file on purpose).
- Bust the require cache when env must be re-read at module load:
  ```js
  function createFreshApp() {
    delete require.cache[require.resolve('../src/app')];
    delete require.cache[require.resolve('../src/routes/admin')];
    delete require.cache[require.resolve('../src/orders/orderRepository')];
    return require('../src/app').createApp();
  }
  ```
  Include every module in the chain that captured stale state (repositories especially).
- Admin requests: default token `local-admin-token`; helpers `adminRequest()` /
  `jsonAdminRequest(method, body)` build the headers.
- Multipart uploads in tests: `new FormData()` + `new Blob([Buffer.from('fake image bytes')], { type: 'image/png' })`.

**2. Structure/source-regex tests** (`frontendBehavior`, `homepageStructure`, `pageShell`,
`adminProducts` first test, `adminOrders` first test, `brandAssets`, `postgresPersistence`,
`adminReadiness`):

- They `fs.readFileSync` HTML/JS/CSS source and `assert.match` / `assert.doesNotMatch` against
  regexes — locking in markup hooks (`data-*` attributes), CSS selectors *and* specific
  declarations, function names, and even removed features (`doesNotMatch` guards regressions).
- **This is the project's substitute for browser E2E tests.** Consequences:
  - Renaming a function, data-attribute, class, or even reformatting CSS can fail tests.
    Run `npm test` after any `public/` edit and update assertions intentionally.
  - When you add UI, add matching structure assertions to the relevant test file
    (and `doesNotMatch` assertions for anything you deliberately removed).

### Assertion / fixture conventions

- `node:assert/strict`; favor `assert.equal`/`deepEqual` on whole objects
  (e.g. the J&T row array, the audit summary object).
- Exact-string error assertions (`'Order status is invalid'`,
  `'Small is sold out for MARIACLARA ORANGE — CROP BOX 240 GSM Shirt'`) — error copy is contract.
- Shared fixtures are plain functions in the same file (`exampleOrder()`, `ORDER_ITEM` const,
  `createOrder(port, customer)`).
- Catalog-dependent tests use the real `data/products.json` and its known slugs/stock
  (e.g. `oranges-mcc-box-tee` is fully sold out; the “curiosity” product has Small in stock).

### Common pitfalls

- Forgetting `restoreEnv` → env leaks across test files (they share one process per file but
  `node --test` may run files concurrently in separate processes — still restore).
- Forgetting cache-busting → module-level snapshots (`catalogRepository`) read the wrong file.
- Changing `data/products.json` (count ≠ 15, prices, stock) without updating
  `catalog.test.js`/`health.test.js`.
- Adding a customer page without the shell (announcement bar, drawer, search overlay, footer,
  `shell.js`, Bootstrap-before-styles.css, meta-pixel scripts) — `pageShell.test.js`,
  `brandAssets.test.js`, and `frontendBehavior.test.js` enumerate pages by filename; add the new
  page to those lists.

---

## Adding New Features

### Add a new API endpoint (admin example)

1. Pick the router (`src/routes/admin.js` for authed, or a public router). For admin, declare
   literal paths **above** the `/:slug` / `/:orderNumber` param routes, and below
   `router.use(requireAdmin)` unless intentionally public.
2. Normalize the request body with a `normalizeX(body)` helper that throws
   `error.status = 400` errors with user-readable messages; validate enums via `validateEnum`.
3. Call repository functions; `await` them (works in both JSON and PG modes).
4. Respond `res.json({ <noun>: ... })` (201 for creations); wrap in try/catch → `next(error)`.
5. Add an integration test in the matching `test/admin*.test.js` (or a new file) using the
   temp-file + `createFreshApp` pattern, including a 401 unauthenticated assertion for admin routes.
6. If the admin UI consumes it, wire `public/js/admin.js` (use `adminFetch`) and add structure
   assertions for new `data-*` hooks.

### Add a field to products

1. `db/schema.sql`: column on `products` (or variants/images) **plus** an
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line.
2. `catalogRepository.js`: `normalizeEditableProduct` (default + normalization),
   `validateProducts` (if required), `savePostgresProduct` (insert + `ON CONFLICT` update list),
   `fromPostgresProduct`, and `toCatalogProduct` if the storefront needs it.
3. `catalogPresenter.js → toStorefrontProduct` if exposed to the storefront.
4. `routes/admin.js → normalizeProductRequest` (and `productSummaryRecord` if it appears in the
   table view).
5. Admin UI: form field in `renderProductDetail` + `productFromForm` in `public/js/admin.js`.
6. Contract: add to `data/admin-contracts/products.json` `managedFields`
   (+ `storefrontFieldMap` if customer-visible) — `adminReadiness.test.js` and
   `catalog.test.js` check these.
7. Tests: extend the CRUD round-trip in `adminProducts.test.js`; run `npm run db:migrate` on any
   existing database.

### Add a field to orders

Same shape: `schema.sql` (+ALTER), `orderRepository.js` (`upsertPostgresOrder` params + conflict
list + `fromPostgresOrder`), checkout payload in `routes/orders.js → normalizeCheckout` and/or
admin `normalizeOrderUpdate`, `orderSummary` if shown in the list, admin UI render/update form,
`data/admin-contracts/orders.json`, J&T export row if relevant, tests.

### Add a customer-facing page

1. Copy the `<head>` + shell skeleton from an existing page (announcement bar, header,
   `data-menu-drawer`, `data-search-overlay`, footer). Bootstrap CSS link **before** `/styles.css`.
2. Include `/js/meta-pixel-config.js`, `/js/meta-pixel.js`, and `shell.js` (as a module).
3. Body class `shopify-prototype` + page-specific class.
4. Register the page in the lists at the top of `test/pageShell.test.js`,
   `test/brandAssets.test.js`, and the customer-pages array in `test/frontendBehavior.test.js`.
5. Page logic goes in a new `public/js/<page>.js` ES module importing from `api.js`/`cart.js`/`shell.js`.

### Add an admin page (SPA section)

1. `public/admin.html`: add `<section class="admin-page-section" data-admin-page="<name>" hidden>`
   and a sidebar link `data-admin-nav-link="<name>"`.
2. `public/js/admin.js`: add a `load<Name>Page()` and call it from `renderAdminPage(page)`;
   reset any selection state when leaving the page (see how `orders`/`products` do it).
3. Style with `.admin-*` classes in `styles.css`.
4. Add structure assertions (nav link, page section, key hooks) to the admin structure test.

### Add a new admin area/module (e.g. discounts becoming real)

1. Replace the placeholder `src/<area>/README.md` content with real docs (the file must keep existing).
2. Keep/extend `data/admin-contracts/<area>.json` — `adminReadiness.test.js` requires
   `area`, non-empty `managedFields`, non-empty `futureAdminActions`.
3. Follow the repository/presenter/route layering and the dual-persistence pattern if it stores data.

### Add a script

CommonJS in `scripts/*.js`, wired into `package.json` scripts with a namespaced name
(`db:`, `audit:`, `jnt:`). DB scripts: `main().catch(...).finally(() => closePool())`.
If logic is testable, export it and gate CLI behavior behind `if (require.main === module)`
(see `audit-product-images.js`).

---

## Domain Rules (business logic)

- **Currency**: integer centavos everywhere server-side; ₱ formatting client-side only.
- **COD only**: `paymentMethod: 'cash_on_delivery'`; new orders start
  `status: received`, `fulfillmentStatus: unfulfilled`, `paymentStatus: cod_pending`,
  `codConfirmationStatus: pending`, `deliveryStatus: pending`,
  `deliveryMethod: 'Standard shipping'`, `channel: 'Online Store'`.
- **Order numbers**: `DEMO-<Date.now()>-<4 hex>` (`createOrderNumber` in `routes/orders.js`).
- **Free shipping**: cart quantity ≥ 2 (enforced in checkout UI; server stores the flag/fee the
  client sends — server does **not** recompute shipping, by design for admin-editable totals).
- **Server-side checkout validation** does recompute/verify: variant existence, stock
  sufficiency, and unit price equality against the catalog.
- **Low stock threshold = 12** (storefront “Limited pieces” label, admin lowStock summary,
  `/products/settings`). Inventory = sum of variant `stockQuantity`.
- **Storefront visibility**: only `status: 'active'` products; `merchandisingStatus: 'sold_out'`
  products render disabled purchase UI and are excluded from upsells.
- **Philippine addresses** are structured: `houseAddress`, `barangay`, `city`, `province`,
  `country: 'Philippines'`, plus a composed `addressLine`
  (`house, barangay, city, province, Philippines`). All four parts are required at checkout and
  on admin address edits.
- **Phones**: normalized to `+639XXXXXXXXX` for J&T; invalid → counted as missing field.
- **J&T export marks orders** (`exportedToJnt`, `jntExportedAt`) but does **not** change
  fulfillment status — shipping status remains a manual admin step.
- **Shopify parity is intentional**: the storefront mimics Shopify markup/classes
  (`product__media-wrapper`, `media-gallery`, `price--on-sale`, slideshow, etc.) per the
  reference docs in `docs/`. Don't "clean up" those class names; tests pin them.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm test` fails with 401s/500s (e.g. `401 !== 200`, token mismatch) but the code is untouched | Your `.env` sets `DATABASE_URL` and/or a custom `ADMIN_TOKEN`, which tests don't expect. Run `DATABASE_URL= ADMIN_TOKEN= npm test`. |
| `DATABASE_URL is required for PostgreSQL persistence.` | Something called Postgres while `DATABASE_URL` is unset *and* a code path bypassed the `usePostgres*()` guard. In tests, set the `*_DATA_FILE` override (and `createFreshApp()`); locally, set `DATABASE_URL` or remove the call. |
| Tests fail after editing `public/` HTML/CSS/JS with regex mismatch errors | The structure tests pin source content. Find the failing `assert.match` and update it together with your change (or restore the expected markup). |
| Tests fail after editing `data/products.json` | `catalog.test.js` / `health.test.js` pin count (15), slugs, prices, stock. Update fixtures with the data change. |
| Admin API returns 401 in dev | Token mismatch: UI stored an old token in `localStorage['maria-clara-admin-token']`. Clear storage and re-login; check `ADMIN_TOKEN`/`ADMIN_PASSWORD` in `.env` (defaults: `local-admin-token` / `admin`). |
| Product changes not visible on storefront | Product `status` is `draft`/`archived`, or in PG mode you edited `data/products.json` (the file is ignored when `DATABASE_URL` is set) — use the admin API or `npm run db:seed`. |
| `Cart item price has changed` / `... is sold out ...` on checkout | Server re-validates against current catalog; cart was created before a price/stock change. Expected behavior. |
| J&T export 400 `Some orders are missing J&T export fields` | Response lists per-order `missing` fields (name, valid phone, detailed address, province, city, barangay, payment method, total). Fix the order in admin first. |
| J&T export rows shifted/corrupted | Template `data/jnt/jntexportfile.xlsx` was modified. Headers must stay on row 8 of the `List` sheet; data writes start row 9. Restore the template, rerun `npm run jnt:address-guide`. |
| Checkout dropdowns empty | `public/data/jnt-address-guide.json` missing/corrupt → regenerate with `npm run jnt:address-guide` (UI falls back to CAVITE/IMUS only). |
| `db:migrate` fails | Postgres not running / wrong `DATABASE_URL`. For a fresh local DB run `npm run db:reset:local` (creates the DB) then `db:migrate` + `db:seed`. |
| Uploads 400 `Only image uploads are allowed` / silent file drop | Multer filter requires `image/*` mimetype; limits 5 MB ×8 (products), 8 MB ×6 (banners). |
| Port already in use | Another instance running; change `PORT` in `.env` (README convention: 3100). |
| Meta Pixel events not firing | Pixel id is empty by design. Set it in `public/js/meta-pixel-config.js` (deployment-specific), not via the server env. Events still mirror into `window.dataLayer` regardless. |
| `node --test` reports zero tests | Run from the repo root; Node ≥ 18 required (global fetch/FormData used by tests). |
