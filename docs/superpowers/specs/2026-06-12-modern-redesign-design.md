# Modern Redesign: Monorepo, Docker, React + Tailwind, Grafana Dashboard

**Date:** 2026-06-12 (overnight autonomous run)
**Status:** Implemented pending owner review

> **Context note.** The owner requested this redesign and went to sleep before the
> interactive design Q&A could happen ("document it first and I will review it in the
> morning"). Decisions below were therefore made autonomously; each one lists the
> assumption behind it so it can be reversed cheaply if the owner disagrees.
> Additional (not-yet-implemented) ideas live in `docs/ENHANCEMENT_PROPOSALS.md`.

## Goals (verbatim from the owner)

1. Redesign the app with a modern UI/library — **React, Tailwind**, and **Grafana** for
   the dashboard.
2. Turn the project into a **monorepo** with **Docker** containers.
3. Document any other enhancement ideas for morning review (separate doc).

## Non-goals (tonight)

- No payment gateway, user accounts, or new business features — same COD flow.
- No rewrite of the backend API. The Express API is solid, fully tested (54 tests),
  and the React app consumes it unchanged.
- No deletion of the existing static frontend. It keeps the test suite green and acts
  as a fallback until the React app is approved.

## Architecture decision summary

| Decision | Choice | Why / assumption |
|---|---|---|
| Monorepo tool | **npm workspaces** | Repo already uses plain npm (Node 22 / npm 10). pnpm/turbo/nx add toolchain for no benefit at 2 packages. |
| Backend location | **`apps/api`** (moved wholesale: `src`, `test`, `data`, `db`, `scripts`, `public`, `package.json`) | All internal paths are `__dirname`-relative, so moving the tree together is zero-risk; all 54 tests keep passing unmodified. |
| Legacy static frontend | **Kept**, still served by Express at the API's port | The structure-test suite pins it; it documents current behavior; it's the rollback path if the redesign needs changes. |
| New frontend | **`apps/web`: Vite + React 18 + Tailwind CSS v4 + React Router** | The exact stack requested. Vite = no-config dev server + production build. No state library — React context + hooks are enough at this size (cart, auth token). |
| API access from web | Vite dev proxy `/api → localhost:3000`; in Docker, nginx proxies `/api` to the api container | Frontend code uses relative `/api/...` URLs everywhere — works in dev, Docker, and any future deployment without env plumbing. |
| Dashboard | **Grafana OSS** container, provisioned Postgres datasource + a committed dashboard JSON (revenue, orders/day, status breakdown, top products). React admin dashboard embeds the panels by iframe and links out to full Grafana. | Grafana reads the same Postgres the API writes to. Assumption: Grafana is for the *admin/analytics* dashboard (its actual purpose), not for storefront UI. In JSON-file mode (no Postgres) the React dashboard falls back to API-computed summary cards, so dev without Docker still works. |
| Docker | `docker-compose.yml` at repo root with 4 services: `postgres:16-alpine`, `api` (node:22-alpine), `web` (multi-stage Vite build → nginx:alpine), `grafana` (grafana-oss) | One `docker compose up` brings up the whole stack with Postgres persistence, migration + seed on api start. |
| Design language | Editorial streetwear: near-black/off-white base, one accent (Maria Clara orange), big display type, generous whitespace; admin = clean light workspace | Matches the brand's existing photography and the Shopify-parity intent, but modernized. Easy to retheme via Tailwind tokens. |

## Monorepo layout

```
mariaclaraclothing/
  package.json            # private, workspaces: ["apps/*"], proxy scripts
  docker-compose.yml
  apps/
    api/                  # the entire existing app, unchanged internally
      package.json        # former root package.json
      src/  test/  data/  db/  scripts/  public/   # legacy static site stays here
      Dockerfile
    web/                  # NEW: React + Tailwind redesign
      package.json  vite.config.js  index.html
      src/
        main.jsx  App.jsx
        lib/        # api client, money/format helpers, cart store (localStorage)
        components/ # shell (header/footer/drawer), product card, etc.
        pages/      # Home, Product, Cart, Checkout, ThankYou, Faq, Shipping, Terms
        admin/      # Login, Layout, Dashboard (Grafana embed), Orders, Products, Banners
      Dockerfile    # build → nginx
      nginx.conf    # SPA fallback + /api proxy
  infra/
    grafana/
      provisioning/datasources/postgres.yml
      provisioning/dashboards/dashboards.yml
      dashboards/maria-clara-overview.json
  docs/  MD_FILES/  CLAUDE.md  README.md   # stay at root, updated for new paths
```

Root scripts: `npm run dev:api`, `npm run dev:web`, `npm test` (runs api workspace tests),
`npm run build:web`, plus the existing `db:*`/`jnt:*` scripts proxied with `-w apps/api`.

## React app: pages and data flow

**Storefront** (`/`): same flows as the static site, same localStorage key
(`maria-clara-cart`) and cart-item shape so carts survive switching between old and new
UIs. Checkout keeps the J&T address guide (province → city → barangay), shipping-fee
rules (Metro Manila/Cavite ₱80, Luzon ₱120, Vis/Min ₱180, free at qty ≥ 2), and posts
the identical payload to `POST /api/orders`.

**Admin** (`/admin`): token in `localStorage['maria-clara-admin-token']` (same key),
Bearer-auth fetch wrapper with 401 → login redirect. Pages: Dashboard (Grafana panels +
API summary fallback), Orders (queues, filters, detail/edit, J&T export download),
Products (list, editor, images, variants), Website content (banners).

**Error handling:** API error bodies are always `{ error }` — the client surfaces that
message in toasts/inline alerts; network failures get a retry affordance.

**Testing:** the API suite (54 tests) is the contract and keeps running unchanged from
`apps/api`. The React app gets Vitest smoke tests (helpers + critical rendering); full
E2E is listed as a follow-up in the proposals doc.

## Grafana dashboard spec

- Datasource: provisioned PostgreSQL pointing at the compose `postgres` service
  (read-only queries against `orders`, `products`, `product_variants`).
- Dashboard "Maria Clara — Store Overview": total revenue (sum `total_cents/100`),
  orders per day timeseries, order-status breakdown, COD confirmation funnel,
  top products by quantity (from `items` JSONB), low-stock table.
- Anonymous viewer access enabled **for local/dev only** (`GF_AUTH_ANONYMOUS_ENABLED`),
  so the React admin can iframe panels without an SSO setup. Flagged in the proposals
  doc as a must-change before any public deployment.

## Risks / things the owner should review in the morning

1. **Two frontends now exist.** Legacy static site on the API port, React redesign on
   the web port. Decide: keep both, or retire `apps/api/public` (then the structure
   tests pinning it should be retired with it).
2. **Grafana anonymous access** is dev-only convenience; lock down before exposing.
3. **Tailwind v4** is used (CSS-first config). If you prefer v3's `tailwind.config.js`
   ergonomics, say so — swap is cheap now.
4. **CLAUDE.md** was updated for new paths, but skim it — it encodes a lot of law.
