# Maria Clara Clothing Webstore

Monorepo for the Maria Clara Clothing webstore: an Express API with dual JSON/PostgreSQL
persistence and a redesigned React + Tailwind storefront/admin (with a built-in analytics
dashboard), all runnable with Docker Compose.

## Layout

```
apps/api    Express API + legacy static site (src/, test/, data/, db/, scripts/, public/)
apps/web    React + Tailwind redesign (storefront at /, admin at /admin)
docs        Specs, plans, and recommendations (see docs/ENHANCEMENT_PROPOSALS.md)
```

## Quick start (Docker — full stack)

```bash
printf 'ORDER_CONFIRMATION_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
docker compose up --build
```

- React storefront + admin: `http://localhost:8081` (admin at `/admin`)
- API + legacy static site: `http://localhost:3000`
- Store analytics: the in-app admin Dashboard (`/admin`)
- PostgreSQL is migrated and seeded automatically on first start.

Default credentials are for local use only — override `ADMIN_TOKEN`, `ADMIN_PASSWORD`, and
`POSTGRES_PASSWORD` before deploying anywhere public.
The ignored root `.env` must provide a unique `ORDER_CONFIRMATION_SECRET` of at least 32
characters. Never rotate it while customers still need access to existing confirmations.

## Quick start (no Docker)

```bash
npm install
cp apps/api/.env.example apps/api/.env   # defaults work without Postgres (JSON files)
npm run dev:api                          # Express API on :3000
npm run dev:web                          # React app on :5173 (proxies /api to :3000)
```

- New storefront: `http://localhost:5173/`, admin: `http://localhost:5173/admin`
- Legacy static site (still served by the API): `http://localhost:3000/`

## Environment (apps/api/.env)

- `ADMIN_TOKEN` / `ADMIN_PASSWORD` — admin auth (defaults `local-admin-token` / `admin`)
- `DATABASE_URL` — optional; enables PostgreSQL persistence (JSON files otherwise)
- `PANCAKE_WEBHOOK_SECRET` — reserved for future POS integration
- `CHECKOUT_V2_REQUIRED` — rejects legacy browser-authoritative checkout when `true`
- `ORDER_CONFIRMATION_SECRET` — HMAC secret for private guest order confirmations

`.env` files are gitignored; only `.env.example` is committed.

## Commands (run from repo root)

```bash
npm test                       # API test suite (54 tests, never needs Postgres)
npm run build:web              # production build of the React app
npm run db:migrate             # apply db/schema.sql (needs DATABASE_URL)
npm run db:seed                # import JSON data into Postgres
npm run audit:product-images   # classify product image references
npm run jnt:address-guide      # regenerate the J&T address guide JSON
npm run test:e2e -w apps/web  # critical quote-to-private-confirmation journey (Docker required)
```

Checkout V2 deployment and rollback steps are documented in
[`docs/phase-1-checkout-v2-rollout.md`](docs/phase-1-checkout-v2-rollout.md).

If your shell has `DATABASE_URL` or `ADMIN_TOKEN` set, clear them for tests:
`DATABASE_URL= ADMIN_TOKEN= npm test`.

## Product Data And Images

`apps/api/data/products.json` is the seed/backup catalog. When `DATABASE_URL` is enabled,
product records, variants, and image records are stored in PostgreSQL tables, including
`product_images`.

Product image cleanup rule:

- Remote CDN image URLs are safe because they are hosted outside this repo.
- Local URLs under `/uploads/products/` still need their physical files in
  `apps/api/public/uploads/products/`.
- Run `npm run audit:product-images` before deleting local upload files.

## J&T Export

The J&T Excel export uses the template in `apps/api/data/jnt/jntexportfile.xlsx`.
Do not delete files inside `apps/api/data/jnt/` unless the export feature is changed
and tested.
