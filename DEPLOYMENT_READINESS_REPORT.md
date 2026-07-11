# Deployment Readiness Report

## Status
Ready for deployment after production environment secrets, domain/TLS, backup, and monitoring setup are applied.

Critical customer, checkout, admin, inventory, and Pancake sync paths passed automated and runtime verification. Do not deploy with local/default credentials.

## Fixed Issues
- Replaced generated website order codes from `DEMO-...` to real `MCC-...` order numbers.
- Added tests preventing `DEMO-...` from returning for generated storefront orders.
- Fixed Pancake inbound tracking sync to read nested and alternate shipment fields such as `shipping_info.tracking_number`, `tracking_code`, `waybill_number`, and `bill_lading_id`.
- Fixed live Pancake order export so successful website-to-Pancake exports create the bidirectional Pancake order link used by admin order details and admin-to-Pancake status updates.
- Added automatic backfill for already-sent Pancake export rows that were missing bidirectional sync links.
- Verified admin order details can show synced Pancake state after backfill.
- Made cancellation terminal so an order cannot be reopened and cancelled twice to duplicate stock.
- Locked order line items after checkout until atomic inventory-aware editing is implemented.
- Moved issue screenshots to a private volume behind authenticated admin access and added deletion cleanup.
- Made web Docker builds reproducible with the committed npm lockfile and `npm ci`.

## What Was Checked
- Customer storefront pages: homepage, product detail, product listing route, cart, checkout empty-cart guard, customer login/register, FAQ.
- Customer UI behavior: banner responsiveness, cart drawer, mobile menu, page transitions, product gallery swipe, stock badges, cart badge, checkout validation, Thank You order display, Messenger support from settings.
- Admin pages: login, dashboard, orders, order details, products, inventory, customers, discounts, banners, settings, Pancake POS.
- Checkout flow: add to cart, server quote totals, V2 order placement, private confirmation token, Thank You redirect, order persistence, stock deduction, empty-cart checkout redirect.
- Pancake integration: connection status, catalog import status, inventory reconciliation status, live order export status, inbound polling, outbound sync queue, sync link status.
- Security and deployment config: production secret validation, same-origin API access, no frontend Pancake credentials, security headers, PostgreSQL requirement in production, Docker startup.

## Verification Results
- API tests: `311 pass, 0 fail, 2 skipped`; both skipped PostgreSQL cases passed separately against PostgreSQL 16.
- PostgreSQL integration tests: `3 pass, 0 fail, 0 skipped` after applying migrations.
- Web source tests: `160 pass, 0 fail`.
- Web production build: passed with `npm run build:web`.
- Docker web image build: passed using `npm ci`; dependency audit reported zero vulnerabilities.
- Playwright e2e: `16 passed, 1 skipped`.
- Runtime responsive browser audit: passed at 390px, 412px, 768px, and 1366px widths.
- Docker rebuild/restart: passed.
- API health: `{"ok":true,"service":"maria-clara-clothing"}`.
- A previously configured local stack reported healthy Pancake link and queue state. Production remains disabled until the staged `read_only` and `shadow` checks pass.

## Customer Website Test Result
Passed.

No horizontal overflow or console errors were found in the runtime page audit across mobile, tablet, and desktop widths. Existing automated tests cover luxury storefront styling, responsive banner height, product cards, product detail gallery swipe, cart drawer accessibility, cart badge, stock alerts, empty-cart checkout restriction, and Messenger support.

## Admin Dashboard Test Result
Passed.

Admin login and authenticated admin routes loaded successfully on mobile, tablet, and desktop widths. Existing tests verify the dark/Grafana-style admin UI, responsive navigation, responsive order details, compact product display, cleaned product names, Pancake sync diagnostics, product management, discounts, settings, and website content controls.

## Checkout Test Result
Passed.

Checkout V2 uses backend quotes and idempotency, excludes browser-controlled totals from order requests, validates missing fields with red styling and scroll focus, redirects empty carts to cart with the required message, persists orders, deducts inventory, and shows private Thank You confirmation data.

## Pancake POS Sync Status
Passed for implemented polling-based sync.

The codebase now supports:
- Website/admin to Pancake: live order export, admin status/tracking/customer/address/payment note updates for linked orders, retryable outbound sync queue.
- Pancake to admin: automatic polling, order import/update, status mapping, customer/address/items/totals/payment/shipping/tracking updates, duplicate prevention, stale update protection, logs.
- Inventory: catalog SKU/variant mapping, inventory reconciliation from Pancake to website/admin, low stock and sold out storefront states.

No official public Pancake webhook documentation was found during this audit, so the deployed implementation uses backend polling. Default order polling interval is `PANCAKE_ORDER_POLL_INTERVAL_MS=300000` ms.

## Inventory Sync Status
Passed for implemented reconciliation flow.

Automated tests verify product matching by SKU/Pancake variant mapping, catalog mapping conflicts, inventory reconciliation, stock deductions on checkout, oversell prevention, low-stock threshold settings, and sold-out behavior. Runtime Pancake inventory status reported `complete` with no failed sync events.

## Banner Admin Control
Passed.

Admin website content/settings tests verify homepage hero/banner title, subtitle, premium cotton-style copy, buttons, links, images/logos, ticker, and storefront settings persist through admin APIs and reflect on customer pages.

## Security and Production Settings
Passed with manual setup required.

Production config rejects:
- Missing `DATABASE_URL`.
- Local/default `ADMIN_TOKEN`.
- Local/default `ADMIN_PASSWORD`.
- Short `CUSTOMER_AUTH_SECRET`.
- Short `ORDER_CONFIRMATION_SECRET`.
- JSON file persistence overrides in production.
- Non-official Pancake API host in production.

Security headers are applied by both API and Nginx. API keys are server-side only. Admin auth uses secure cookie/CSRF flow in the React admin client.

## Required Environment Variables
- `APP_ENV=production`
- `DATABASE_URL`
- `POSTGRES_PASSWORD` if using the bundled Docker PostgreSQL service
- `ADMIN_TOKEN`
- `ADMIN_PASSWORD`
- `CUSTOMER_AUTH_SECRET`
- `ORDER_CONFIRMATION_SECRET`
- `TRUST_PROXY=2` for the recommended Caddy -> Docker nginx -> Express path
- `CHECKOUT_V2_REQUIRED=true`
- `PANCAKE_MODE=disabled` for first deployment; promote through `read_only` and `shadow` before `live`
- `PANCAKE_API_BASE_URL=https://pos.pages.fm/api/v1`
- `PANCAKE_API_KEY`, `PANCAKE_SHOP_ID`, `PANCAKE_WAREHOUSE_ID`, and `PANCAKE_ORDER_SOURCE_ID` before enabling Pancake
- `PANCAKE_ORDER_POLL_INTERVAL_MS`
- `PANCAKE_ORDER_POLL_LOOKBACK_MS`
- `PANCAKE_SYNC_MAX_ATTEMPTS`
- Optional: `META_PIXEL_ID`, `META_CONVERSIONS_API_ENABLED`, `META_CONVERSIONS_API_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`
- Optional: `ORDER_NOTIFICATIONS_ENABLED`, `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`, `RESEND_API_KEY`, `ORDER_NOTIFICATION_FROM_EMAIL`

## Remaining Manual Setup
- Configure production domain, DNS, TLS certificate, and reverse proxy.
- Replace all local/default secrets before setting `APP_ENV=production`.
- Configure PostgreSQL backups and restore testing.
- Back up and restore-test both `maria_clara_uploads` and private `maria_clara_issue_uploads`.
- Configure log retention and uptime/error monitoring.
- Confirm final Maria Clara Clothing Messenger URL in admin/store settings.
- Confirm final Pancake shop, warehouse, order source, SKU mappings, and live API credentials.
- Clean old local/demo Pancake export rows if this development database is reused. They are historical blocked rows and should not be carried into production.
- Keep J&T in `dry_run` unless official production API credentials/specs are available.

## Known Risks
- Pancake webhooks are not implemented because no official public webhook documentation was found. Automatic sync uses polling instead.
- Real Pancake status/tracking edits were not manually performed in the live Pancake UI during this audit. The inbound polling/update path is covered by automated tests and local sync worker logs.
- One Playwright collection-management test is intentionally skipped unless `TEST_COLLECTION_NAME` is set because it mutates persistent catalog state.
- There is no `npm run lint` script in this monorepo; syntax/build/test coverage was used instead.

## Final Recommendation
Deploy after completing the manual production setup above.

The application is ready from a code, build, test, Docker runtime, checkout, admin, inventory, and Pancake polling-sync perspective. Do not deploy using local Docker defaults or a development database containing historical demo rows.
