# Maria Clara Clothing Webstore

Monorepo for the Maria Clara Clothing webstore: an Express API, PostgreSQL production
persistence, and a React + Tailwind storefront/admin, all runnable with Docker Compose.
JSON persistence remains available only for isolated local development and tests.

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

Default credentials are for local use only — override `ADMIN_TOKEN`, `ADMIN_PASSWORD`,
`CUSTOMER_AUTH_SECRET`, and `POSTGRES_PASSWORD` before deploying anywhere public.
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

- `APP_ENV` — use `development` locally and `production` only with all required secrets
- `ADMIN_TOKEN` / `ADMIN_PASSWORD` — legacy local API auth and admin login bootstrap values
- `CUSTOMER_AUTH_SECRET` — customer compatibility-token secret; minimum 32 characters in production
- `DATABASE_URL` — optional in development and mandatory in production
- `TRUST_PROXY` — trusted reverse-proxy hops; Docker Nginx uses `1`
- `PANCAKE_WEBHOOK_SECRET` — reserved for future POS integration
- `CHECKOUT_V2_REQUIRED` — rejects legacy browser-authoritative checkout when `true`
- `ORDER_CONFIRMATION_SECRET` — HMAC secret for private guest order confirmations
- `ORDER_NOTIFICATIONS_ENABLED` — enables the delivered-order SMS/email worker
- `SEMAPHORE_API_KEY` / `SEMAPHORE_SENDER_NAME` — Semaphore SMS credentials
- `RESEND_API_KEY` / `ORDER_NOTIFICATION_FROM_EMAIL` — Resend email credentials
- `JNT_INTEGRATION_MODE` — keep `dry_run` until J&T Philippines grants official API access

`.env` files are gitignored; only `.env.example` is committed.

Admin and customer browser sessions use random server-side records in PostgreSQL. The browser
receives an `HttpOnly`, `SameSite=Lax`, production-`Secure` session cookie and a separate CSRF
cookie. Authentication credentials are not stored in `localStorage`. Password changes and admin
token rotation revoke prior admin sessions.

## Production deployment boundary

Set `APP_ENV=production` and provide unique values for `DATABASE_URL`, `ADMIN_TOKEN`,
`ADMIN_PASSWORD`, `CUSTOMER_AUTH_SECRET`, and `ORDER_CONFIRMATION_SECRET`. Startup rejects local
defaults, short secrets, missing PostgreSQL, and all `*_DATA_FILE`/JSON persistence overrides.
Generate secrets with `openssl rand -hex 32`; do not reuse values between environments.

Production Docker templates are in `deploy/`:

```bash
cp deploy/production.env.example deploy/production.env
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml up -d --build
```

Fill `deploy/production.env` with real secrets before running the stack. The file is gitignored.
Use [`docs/production-deployment-runbook-2026-07-08.md`](docs/production-deployment-runbook-2026-07-08.md)
for the full launch, verification, backup, and rollback checklist.

Run the API behind one controlled reverse proxy and set `TRUST_PROXY` to the exact hop count.
Endpoint-specific rate limits cover login, registration, quotes, checkout, cart writes, order
lookups, uploads, and security actions. Their limits and windows are documented in
`apps/api/.env.example` and can be disabled locally with a max value of `0`.

Responses include framing, MIME-sniffing, referrer, permissions, and report-only CSP headers.
Review CSP reports before converting the policy to enforcement. Meta Pixel stays unloaded until
the shopper selects “Allow analytics”; shoppers can withdraw or change that choice through the
footer’s “Privacy choices” control.

Before a release:

```bash
npm test
node --test apps/web/test/*.test.js
npm run build:web
docker compose up -d --build --force-recreate
curl -fsS http://localhost:8081/api/health
```

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

Order detail also provides a server-generated J&T parcel preview using the effective parcel
weight, customer address, items, and COD amount. It never books a shipment in `dry_run` mode.
See [`docs/jnt-integration-recommendation.md`](docs/jnt-integration-recommendation.md).

Delivered-order SMS/email setup and monitoring are documented in
[`docs/parcel-notification-operations.md`](docs/parcel-notification-operations.md).
