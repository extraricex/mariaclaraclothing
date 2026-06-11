# Modern Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Deviation note:** this plan is executed in-session by its author the same night it
> was written (owner asleep, fixed token budget). React page internals reference the
> spec (`docs/superpowers/specs/2026-06-12-modern-redesign-design.md`) and the legacy
> implementation in `apps/api/public/js/` as the behavioral source of truth instead of
> duplicating every component's code here. Contracts, structures, and commands are exact.

**Goal:** Convert the repo to an npm-workspaces monorepo, add a React + Tailwind redesigned frontend, dockerize everything, and provision a Grafana dashboard.

**Architecture:** Existing Express app moves wholesale to `apps/api` (zero internal changes, 54 tests stay green). New `apps/web` Vite + React 18 + Tailwind v4 SPA consumes the same `/api` (dev proxy / nginx proxy). `docker-compose.yml` runs postgres + api + web + grafana; Grafana is provisioned with a Postgres datasource and a committed dashboard.

**Tech Stack:** npm workspaces, Express (unchanged), Vite, React 18, react-router-dom 6, Tailwind CSS v4 (`@tailwindcss/vite`), nginx, PostgreSQL 16, Grafana OSS.

---

### Task 1: Monorepo restructure

**Files:**
- Move: `src/ test/ data/ db/ scripts/ public/ package.json package-lock.json .env.example` → `apps/api/`
- Create: root `package.json` (workspaces), updated root `.gitignore` entries if needed
- Keep at root: `docs/`, `MD_FILES/`, `CLAUDE.md`, `README.md`, `.env` (gitignored, stays for local api run via `dotenv` — copy into `apps/api/.env`)

- [ ] **Step 1:** `mkdir -p apps/api && git mv src test data db scripts public package.json package-lock.json .env.example apps/api/` (use `git mv` so history follows). Copy (not move) the gitignored `.env` to `apps/api/.env`.
- [ ] **Step 2:** Root `package.json`:

```json
{
  "name": "maria-clara-monorepo",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:api": "npm run dev -w apps/api",
    "dev:web": "npm run dev -w apps/web",
    "start": "npm start -w apps/api",
    "build:web": "npm run build -w apps/web",
    "test": "npm test -w apps/api",
    "db:migrate": "npm run db:migrate -w apps/api",
    "db:seed": "npm run db:seed -w apps/api",
    "db:reset:local": "npm run db:reset:local -w apps/api",
    "audit:product-images": "npm run audit:product-images -w apps/api",
    "jnt:address-guide": "npm run jnt:address-guide -w apps/api"
  }
}
```

- [ ] **Step 3:** `rm -rf node_modules package-lock.json` leftovers at root if any remain, then `npm install` at root (hoists workspace deps, regenerates lockfile at root).
- [ ] **Step 4:** Run: `DATABASE_URL= ADMIN_TOKEN= npm test` → expect **54 pass, 0 fail**. (`npm -w` sets cwd to `apps/api`, so `node --test` finds `test/`.)
- [ ] **Step 5:** Smoke: `DATABASE_URL= npm start` then `curl localhost:3000/api/health` → `{"ok":true,...}`. Kill server.
- [ ] **Step 6:** Commit: `Move app into apps/api workspace`

### Task 2: Scaffold apps/web (Vite + React + Tailwind)

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.js`, `apps/web/index.html`, `apps/web/src/main.jsx`, `apps/web/src/App.jsx`, `apps/web/src/index.css`

- [ ] **Step 1:** `apps/web/package.json` — deps: `react`, `react-dom`, `react-router-dom`; dev: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`. Scripts: `dev` (`vite --port 5173`), `build`, `preview`.
- [ ] **Step 2:** `vite.config.js` with react + tailwindcss plugins and dev proxy:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000', '/brand': 'http://localhost:3000', '/product': 'http://localhost:3000', '/data': 'http://localhost:3000', '/MANDALA WHITE': 'http://localhost:3000' } }
});
```

(Proxy `/uploads`, `/brand`, `/product`, `/data`, `/MANDALA WHITE` because product image URLs and the J&T address guide are served by the api.)

- [ ] **Step 3:** `index.css`: `@import "tailwindcss";` + `@theme` tokens (brand orange `#e8590c`-family accent, ink `#111`, paper `#faf8f5`, display font stack) + small component utilities.
- [ ] **Step 4:** Router skeleton in `App.jsx`: routes `/`, `/product/:slug`, `/cart`, `/checkout`, `/thank-you`, `/faq`, `/shipping-returns`, `/terms`, `/admin/login`, `/admin/*`. Placeholder pages render headings.
- [ ] **Step 5:** `npm install` at root; `npm run build:web` → builds clean. Commit: `Scaffold React + Tailwind web app`

### Task 3: Shared lib (API client, money, cart store)

**Files:**
- Create: `apps/web/src/lib/api.js`, `apps/web/src/lib/money.js`, `apps/web/src/lib/cart.js`, `apps/web/src/lib/adminApi.js`

Contracts (must match legacy exactly):
- `money.js`: `formatMoney(cents)` → `Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' })`.
- `cart.js`: key `maria-clara-cart`; item shape `{ productId, slug, variantId, productName, size, quantity, unitPriceCents, imageUrl, externalPosProductId, externalPosVariantId }`; functions `readCart/writeCart/addItem/updateQuantity/removeItem/cartCount/subtotalCents`; dispatch `window` event `maria-clara-cart-changed` on write so the header badge updates; React hook `useCart()`.
- `api.js`: `fetchProducts()`, `fetchProduct(slug)`, `fetchSiteContent()`, `fetchOrder(orderNumber)`, `createOrder(payload)` — all `fetch('/api/...', { cache: 'no-store' })`, throw `Error(body.error)` on !ok.
- `adminApi.js`: token in `localStorage['maria-clara-admin-token']`; `adminFetch(path, opts)` adds Bearer; on 401 clears token and navigates to `/admin/login`; helpers `login(password)`, `getJson`, `sendJson(method, path, body)`, `downloadBlob(path, body)` for J&T export.

- [ ] Steps: implement each file, `npm run build:web` passes, commit `Add web app API client, cart store, money helpers`.

### Task 4: Storefront shell + Home

**Files:**
- Create: `apps/web/src/components/Shell.jsx` (header w/ cart badge + drawer nav + announcement bar, footer), `apps/web/src/components/ProductCard.jsx`, `apps/web/src/pages/Home.jsx`

Behavior: Home fetches products + site content; hero = first homepage banner (fallback `/brand/` images via API siteContent defaults); sections "New Arrivals" and "Freedom of Mind" filtered by `product.collections`; ProductCard shows image, name, price (sale price + struck compare-at when `compareAtPriceCents`), `sold_out` badge, low-stock "Limited pieces" label when total variant stock 1–12.

- [ ] Steps: implement, verify against running api (`npm run dev:api` + `npm run dev:web`, curl/browse), commit `Add storefront shell and home page`.

### Task 5: Product page

**Files:** Create `apps/web/src/pages/Product.jsx`

Behavior: gallery (main image + thumbs), name, price/compare-at, size selector from variants (disable size when `stockQuantity === 0`), qty stepper, Add to cart (uses `cart.addItem`, fires toast), sold-out state (`merchandisingStatus === 'sold_out'` → disabled CTA with `productPage.soldOutText` fallback "Sold out"), rich sections from `productPage.sections`, size-chart image when present. Description rendering: product descriptions may contain admin-authored HTML — sanitize with an allow-list (`P, BR, STRONG, EM, U, A[href], UL, OL, LI`) mirroring legacy `sanitizeRichNode`; never `dangerouslySetInnerHTML` raw values.

- [ ] Steps: implement, manual verify on `oranges-mcc-box-tee` (sold out) and a curiosity slug (in stock), commit `Add product detail page`.

### Task 6: Cart, Checkout, Thank-you, static pages

**Files:** Create `apps/web/src/pages/Cart.jsx`, `Checkout.jsx`, `ThankYou.jsx`, `Faq.jsx`, `ShippingReturns.jsx`, `Terms.jsx`, plus `apps/web/src/lib/addressGuide.js`

- `addressGuide.js`: lazy cached fetch of `/data/jnt-address-guide.json`; expose `loadGuide()`, `regionForProvince(name)` (CAVITE/METRO MANILA → `metro_manila_cavite`; islandGroup Visayas/Mindanao → `visayas_mindanao`; else `luzon` — port logic from legacy `checkout.js`), fee map `{ metro_manila_cavite: 8000, luzon: 12000, visayas_mindanao: 18000 }`, free shipping at cart qty ≥ 2.
- Checkout: customer fields (fullName, phone, email optional), province→city→barangay cascading selects from guide, house address, fee display ("Calculated after address" until complete), door-to-door warning when barangay `doorToDoor !== 'YES'`, payload identical to legacy (`checkoutChannel: 'storefront_checkout'`, `paymentMethod: 'cash_on_delivery'`, `cartSnapshot`, `adminEditableTotals`, composed `addressLine`). On success: store confirmation in `sessionStorage['maria-clara-last-order']`, clear cart, navigate `/thank-you?order=<n>`.
- ThankYou: read `?order=` → `fetchOrder`, fallback sessionStorage.
- Static pages: port copy from legacy HTML.

- [ ] Steps: implement, end-to-end manual order against dev api (JSON mode) → expect 201 + order visible via `GET /api/orders/:n`, commit `Add cart, checkout, and confirmation pages`.

### Task 7: Admin app

**Files:** Create `apps/web/src/admin/Login.jsx`, `AdminLayout.jsx` (sidebar + guard), `Dashboard.jsx`, `Orders.jsx`, `OrderDetail.jsx`, `Products.jsx`, `ProductEditor.jsx`, `Banners.jsx`

- Login: password → `POST /api/admin/login`, store token, redirect.
- Layout: verifies `GET /api/admin/session`; sidebar routes `/admin` (dashboard), `/admin/orders`, `/admin/products`, `/admin/banners`.
- Dashboard: summary cards from `GET /api/admin/products` summary + order queue counts from `GET /api/admin/orders`; Grafana panel iframes (`VITE_GRAFANA_URL` default `http://localhost:3001`, dashboard uid `maria-clara-overview`) with a visible fallback note when iframe unreachable/JSON mode.
- Orders: table w/ status filter + search (server params), queue chips, detail page with status selects (the five enums), address edit (cascading selects reusing `addressGuide.js`), tracking number, notes; PATCH via `normalizeOrderUpdate` contract; J&T export button → `POST /api/admin/orders/export/jnt` blob download, surface per-order `missing` fields on 400.
- Products: table (status/stock filters, search, sort), editor (name, description textarea, status, featured, collections checkboxes, price/compare-at in **pesos** converted to cents on save, variants grid w/ stock + sku, image upload via multipart `images[]`, alt text, delete guard last image), duplicate + delete actions.
- Banners: list, alt/sort edit, delete, upload, save → PUT/POST site-content endpoints.

- [ ] Steps: implement page-by-page, manual verify each against dev api with default token, commit per page group (`Add admin login and layout`, `Add admin orders pages`, `Add admin products pages`, `Add admin dashboard and banners`).

### Task 8: Docker + Grafana

**Files:**
- Create: `apps/api/Dockerfile`, `apps/api/.dockerignore`, `apps/web/Dockerfile`, `apps/web/nginx.conf`, `docker-compose.yml`, `infra/grafana/provisioning/datasources/postgres.yml`, `infra/grafana/provisioning/dashboards/dashboards.yml`, `infra/grafana/dashboards/maria-clara-overview.json`

- `apps/api/Dockerfile`: `node:22-alpine`, copy workspace package files + install prod deps, copy app, `CMD ["node", "src/server.js"]`. Entrypoint script runs `db:migrate` + `db:seed` (idempotent) when `DATABASE_URL` set, then starts.
- `apps/web/Dockerfile`: stage 1 `node:22-alpine` build (`npm ci` workspace-aware at root or plain install in apps/web), stage 2 `nginx:alpine` with `nginx.conf` (SPA `try_files ... /index.html`; `location /api { proxy_pass http://api:3000; }` plus same for `/uploads`, `/brand`, `/product`, `/data`).
- `docker-compose.yml` services: `postgres` (16-alpine, healthcheck, volume), `api` (build apps/api, env `DATABASE_URL=postgres://postgres:postgres@postgres:5432/maria_clara`, `ADMIN_TOKEN`/`ADMIN_PASSWORD` from compose env with insecure defaults + warning comment, ports 3000), `web` (build, ports 8080:80, depends_on api), `grafana` (image grafana-oss, port 3001:3000, anonymous viewer env, provisioning + dashboards volumes, depends_on postgres).
- Dashboard JSON panels (all PostgreSQL datasource): total revenue stat (`SELECT COALESCE(SUM(total_cents)/100.0,0) FROM orders WHERE status NOT IN ('cancelled')`), orders/day timeseries (`date_trunc('day', placed_at)`), status piechart, COD confirmation funnel barchart, top products by qty (`jsonb_array_elements(items)`), low-stock table (join products/variants, HAVING sum ≤ 12). Verify column names against `db/schema.sql` before writing queries.

- [ ] Steps: write files; if Docker daemon available run `docker compose build` + `up` + smoke (`curl localhost:3000/api/health`, `curl localhost:8080`, grafana login page at 3001); if not available, note it in summary. Commit `Dockerize stack with Postgres and Grafana dashboard`.

### Task 9: Docs + final verification

- [ ] Update `CLAUDE.md` (paths → `apps/api`/`apps/web`, new commands, monorepo section) and `README.md` (quickstart: npm dev flow + docker compose flow).
- [ ] Run: `DATABASE_URL= ADMIN_TOKEN= npm test` → 54 pass. `npm run build:web` → clean.
- [ ] Final commit `Update docs for monorepo and redesign`; leave summary for owner.

## Self-review

- Spec coverage: monorepo (T1), React+Tailwind storefront (T2–6), admin (T7), Grafana + Docker (T8), docs (T9), proposals doc already committed. ✔
- Legacy frontend intentionally untouched inside `apps/api/public` (spec "non-goals"). ✔
- Type/contract consistency: cart shape, storage keys, payload fields copied verbatim from legacy source — executor must diff against `apps/api/public/js/checkout.js` while porting. ✔
