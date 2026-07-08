# Maria Clara Clothing Deployment Readiness Audit

Date: 2026-07-08
Branch checked: `codex-edits`
Scope: customer storefront, admin website, API, PostgreSQL, Docker deployment, and external integrations.

## Executive Recommendation

The project is technically ready for an online customer preview and controlled COD soft launch after production secrets, HTTPS, and backups are configured. The core customer path is working: the storefront loads, checkout is server-authoritative, order confirmation is private, Docker services run, health checks pass, and the critical checkout browser test passed against the rebuilt API container.

Do not treat the current local state as final public production until the operational go-live items are completed. The remaining blockers are production secrets, domain/HTTPS setup, persistent database/upload backups, and committing/reviewing the current work.

Pancake POS realtime order sync has now been verified locally in live mode. The latest fresh checkout order exported as `live` / `sent`, and current catalog mappings are `82/82` verified with `0` open conflicts.

## Readiness Verdict

| Area | Status | Notes |
| --- | --- | --- |
| Customer storefront | Ready for soft launch | Maintenance mode is off, product pages/cart/checkout are covered by tests. |
| Checkout/orders | Ready for COD soft launch | Critical checkout browser journey passed against rebuilt API. |
| Admin website | Ready for internal use | Admin routes and Grafana redesign are present; secure cookie auth is covered by tests. |
| API | Ready after production env setup | Production config validation exists and passed with safe sample secrets. |
| PostgreSQL | Ready with managed/persistent storage | Migrations ran in Docker; backups still need production setup. |
| Upload/media storage | Needs production plan | Docker volume works locally; production needs persistent backup or object storage strategy. |
| Pancake POS | Ready for controlled live checkout verification | Runtime is configured in `live`, latest fresh website order exported as `sent`; one old historical test row still fails for remote inventory. |
| Notifications | Optional, not ready for automated SMS/email | `ORDER_NOTIFICATIONS_ENABLED=false`; manual COD confirmation is still possible. |
| J&T live booking | Not ready, intentionally dry-run | Current flow supports export/preview, not live booking. |
| Deployment hygiene | Needs commit/review before release | Many intentional uncommitted files are present; generated web dist was removed from tracking and ignored. |

## Verification Performed

Commands run from the repo root:

| Check | Result |
| --- | --- |
| `npm test` | Passed: 270 passed, 2 skipped, 0 failed. |
| `node --test apps/web/test/*.test.js` | Passed: 125 passed, 0 failed. |
| `npm run build:web` | Passed. |
| Production config validation with safe sample env | Passed. |
| `docker compose build api` | Passed. |
| `docker compose up -d --force-recreate api` | Passed; migrations ran. |
| `docker compose ps` | `api`, `web`, and `postgres` are running; Postgres is healthy. |
| `curl -fsS http://localhost:8081/api/health` | Passed: `{"ok":true,"service":"maria-clara-clothing"}`. |
| `npm run test:e2e -w apps/web` | Passed after unsandboxed browser run: 16 passed, 1 skipped. |
| `npm run test:e2e -w apps/web -- e2e/checkout-v2.spec.js` | Passed against rebuilt API: 1 passed. |
| Fresh Pancake live checkout verification | Passed: `DEMO-1783478294695-740F` exported as `live` / `sent`. |

Note: the first e2e attempt failed because Chromium could not launch in the sandbox (`MachPortRendezvousServer Permission denied`). The same suite passed when run unsandboxed.

## Current Runtime Observations

- Public settings endpoint reports `maintenanceMode: false`.
- Enabled customer payment method is Cash on Delivery only.
- Docker health is good locally.
- Local Postgres currently has 16 products and 12 orders.
- After rebuilding the API, 7 schema migrations are applied.
- Pancake tables exist after the rebuild: `pancake_catalog_variations`, `pancake_variant_mappings`, `pancake_sync_conflicts`, `pancake_order_exports`, and related reference tables.
- Runtime Pancake config from the API container reports:
  - `mode: live`
  - `configured: true`
  - `timeoutMs: 20000`
  - `shopId: 4275005`
  - `warehouseId: 1c5f28ed-6be3-45a0-b683-f87f6704fe6b`
  - `orderSourceId: 100378768366281`
- Pancake database state:
  - Open conflicts: `0`
  - Current mappings: `82/82` verified
  - Live sent exports: `3`
  - Remaining old failed export: one historical test row rejected by Pancake because remote inventory is not enough for `ARISOFF-S`.

## Go-Live Blockers

1. Commit and deploy a clean release branch.

   The working tree has many uncommitted changes, including Pancake sync files, API schema changes, admin redesign files, generated web dist files, and local JSON data changes. Do not deploy from an unreviewed dirty tree.

2. Set production environment variables.

   Required minimum:

   ```env
   APP_ENV=production
   DATABASE_URL=...
   POSTGRES_PASSWORD=...
   ADMIN_TOKEN=...
   ADMIN_PASSWORD=...
   CUSTOMER_AUTH_SECRET=...
   ORDER_CONFIRMATION_SECRET=...
   TRUST_PROXY=1
   CHECKOUT_V2_REQUIRED=true
   ```

   Generate secrets with `openssl rand -hex 32`. Do not reuse local secrets.

3. Put the site behind HTTPS on the real domain.

   Use Cloudflare or another TLS reverse proxy. The app uses secure cookies in production, so customer/admin sessions need HTTPS.

4. Configure persistent production storage.

   PostgreSQL and uploaded product/site images must survive deploys and server restarts. Docker named volumes are acceptable for a first VPS launch only if backups are configured.

5. Confirm production Pancake and inventory.

   The verified local mode is `PANCAKE_MODE=live`. Before public launch, confirm the production env uses the same shop, warehouse, and order source IDs, and fix remote Pancake stock for `ARISOFF-S` if that SKU will be sold.

6. Confirm production catalog and inventory.

   The local Docker database currently has 16 products. Before opening to customers, verify the intended live catalog, active statuses, photos, prices, sizes, stock, and shipping rules.

7. Backups and rollback.

   Add a documented backup and rollback flow for Postgres and uploads before the first paid traffic.

## Recommended Launch Path

### Phase 1: Online Preview

Use this for owner/team review, not paid traffic.

1. Deploy the current Docker stack to a VPS or protected Cloudflare tunnel.
2. Use production-style secrets even for preview.
3. Keep `PANCAKE_MODE=live` only if you want preview checkout orders to appear in Pancake. Otherwise temporarily use `shadow`.
4. Verify:
   - Homepage
   - Product page
   - Cart
   - Checkout COD order
   - Admin login
   - Admin order appears
   - Upload/product image previews

### Phase 2: Soft Launch With Pancake Realtime

Use this for the first real customer traffic.

1. Keep COD only.
2. Keep J&T in dry-run/export flow.
3. Keep Pancake `live` with the verified shop, warehouse, and order source.
4. Admin reviews each order after Pancake receives it.
5. Monitor logs and database backups daily.

### Phase 3: Full Production Operations

Use this after the first monitored soft-launch orders are clean.

1. Keep catalog conflicts at `0`.
2. Keep these values set:

   ```env
   PANCAKE_MODE=live
   PANCAKE_API_BASE_URL=https://pos.pages.fm/api/v1
   PANCAKE_API_KEY=...
   PANCAKE_SHOP_ID=...
   PANCAKE_WAREHOUSE_ID=...
   PANCAKE_ORDER_SOURCE_ID=...
   PANCAKE_AUTO_SYNC_ENABLED=true
   ```

3. Place one live test order.
4. Confirm it appears in Pancake POS.
5. Confirm inventory changes flow correctly.
6. Add backups and monitoring to the daily operating routine.

## Production Checklist

- [ ] Merge/commit current work into the deployment branch.
- [ ] Remove generated/accidental local artifacts from the release if they are not intended.
- [ ] Configure production `.env` with strong secrets.
- [ ] Set `APP_ENV=production`.
- [ ] Use a production PostgreSQL database.
- [ ] Configure database backups.
- [ ] Configure persistent uploads backup.
- [ ] Deploy behind HTTPS.
- [ ] Set `TRUST_PROXY` to the exact proxy hop count.
- [ ] Confirm `/api/health` returns OK on the production domain.
- [ ] Confirm maintenance mode is off.
- [ ] Confirm storefront product count, prices, photos, and stock.
- [ ] Place a test COD order.
- [ ] Confirm the order appears in admin.
- [ ] Confirm the private thank-you link works.
- [ ] Keep Pancake live only after confirming the same shop/warehouse/order source in production.
- [ ] Keep J&T dry-run unless official live API credentials and specs are complete.
- [ ] Enable order notifications only after SMS/email credentials are tested.

## Final Answer

Yes, the project can be deployed online for customer viewing after normal production setup. For accepting real customer orders, it is ready for a controlled COD soft launch with Pancake live order export, provided production secrets, HTTPS, backups, and the first production test order are completed.
