# Meta Purchase Deduplication Report

Report date: 2026-07-15
Customer site: `https://mariaclaraclothing.com`

## Root Cause

The previous implementation did not store browser Purchase delivery state in the order record. It created the same deterministic-looking ID from the order number, but browser idempotency depended on React runtime state and `localStorage`. The database could therefore prevent a duplicate server outbox event, but it could not atomically prevent browser replay after storage loss, a different browser/device, an old confirmation route, or a second implementation.

The full audit also found two obsolete Purchase triggers in the API's legacy static storefront: one immediately after checkout and one on its Thank You page. The current React storefront separately triggered COD Purchase in the checkout handler and PayMongo Purchase from a Thank You effect. Those scattered paths made the invariant difficult to enforce.

Production evidence narrows the reported incident: PostgreSQL contains exactly one CAPI outbox Purchase for the recent test order, `purchase_MCC-1784093865609-BC02`, and it was sent once with numeric `value: 729` and `currency: PHP`. The duplicate result was therefore not caused by two CAPI outbox rows or a repeated PayMongo webhook. Meta Events Manager access is still required to determine whether the second incoming event was an undeduplicated browser event or an externally configured automatic Purchase event.

## Purchase Trigger Locations Found

Before consolidation:

1. `apps/web/src/pages/CheckoutReview.jsx` — browser Purchase after successful COD checkout.
2. `apps/web/src/pages/ThankYou.jsx` — browser Purchase after paid PayMongo confirmation.
3. `apps/api/public/js/checkout.js` — obsolete static-storefront Purchase after checkout.
4. `apps/api/public/js/thank-you.js` — obsolete static-storefront Purchase on confirmation render.
5. `apps/api/public/js/meta-pixel.js` — obsolete public `trackMetaPixelPurchase` implementation.
6. `apps/api/src/routes/orders.js` / authoritative checkout — server COD outbox creation.
7. `apps/api/src/orders/checkoutService.js` — legacy server COD outbox creation.
8. `apps/api/src/payments/paymongoPaymentService.js` — server Purchase after verified paid webhook.
9. `apps/api/src/marketing/metaConversionsWorker.js` — delivery/retry of the unique server outbox record; this is transport, not a second Purchase creator.

After consolidation, there is one production browser call site: the confirmed-order flow in `ThankYou.jsx`. All server creation paths call `queueMetaPurchase` in `metaPurchaseService.js`.

## Duplicate Triggers Removed

- Removed COD browser Purchase from the checkout submit handler.
- Removed both Purchase calls and the Purchase helper from the obsolete static storefront.
- Explicitly reject `Purchase` in the legacy generic Pixel wrapper so another old script cannot revive that path.
- Replaced independent server event-building/insertion calls with the centralized queue service.
- Locked historical orders to CAPI-only behavior so revisiting an old confirmation cannot manufacture a new browser Purchase after deployment.
- Kept the existing unique CAPI outbox constraint and unique PayMongo webhook-event constraint.

## Event ID Strategy

Every new order stores one permanent ID when the order is created:

`purchase_<orderNumber>`

The database fields are:

- `meta_purchase_event_id` — unique, permanent order event ID.
- `meta_purchase_tracking_version` — version 2 enables the server-backed browser protocol; migrated historical orders remain version 1 and browser-locked.
- `meta_browser_purchase_claim_id`
- `meta_browser_purchase_claimed_at`
- `meta_browser_purchase_sent_at`
- `meta_capi_purchase_queued_at`
- `meta_capi_purchase_sent_at`
- `meta_purchase_status`
- `meta_purchase_last_error`

The unique partial index on `meta_purchase_event_id`, the unique outbox `event_id`, and the unique PayMongo webhook `event_id` provide database-level protection. Ordinary order updates no longer overwrite the permanent ID or monotonic sent timestamps.

## Browser Pixel

Purchase is no longer sent from Checkout or Checkout Review. The React Thank You page:

1. retrieves the private confirmed order using its confirmation token;
2. requires committed COD or verified paid PayMongo eligibility;
3. atomically claims browser delivery in PostgreSQL;
4. receives the server-built authoritative Purchase payload and stored event ID;
5. calls `fbq("track", "Purchase", payload, { eventID })` once;
6. marks browser delivery through the protected completion endpoint.

React Strict Mode, rerenders, refreshes, concurrent tabs, and repeated API responses encounter either an active claim or `already_sent`. `localStorage` remains only a secondary safety check; it is not the source of truth.

## Conversions API

COD queues CAPI only inside the successful order/inventory transaction. PayMongo queues it only after a signed paid webhook confirms `PHP`, the exact centavo amount, a matching checkout session/order, confirmed order state, and committed inventory.

The outbox payload uses the stored ID as `event_id`. `custom_data.value` comes from the authoritative database `order.totalCents`, converted once from centavos to numeric peso units. Currency is exactly `PHP`; contents, IDs, quantities, and item prices are built by the same server function used for the browser claim.

Outbox insertion is unique and atomic. A sent outbox event is never recreated by a webhook retry, reconciliation worker, API retry, or order update.

## COD Flow Test

- Order number: Pending post-deployment controlled order
- Browser event: Automated claim/complete/refresh concurrency test passed; live Pixel event pending
- Server event: Automated unique outbox test passed; live CAPI event pending
- Event ID match: Automated exact-match assertion passed
- Meta deduplication: Pending verification in Meta Test Events
- Final Purchase count: Pending

## PayMongo Flow Test

- Order number: Pending post-deployment controlled payment
- Payment status: Automated pending/failed/cancelled rejection and verified-paid eligibility passed
- Browser event: Automated paid-only claim passed; live event pending
- Server event: Automated verified-webhook unique queue passed; live event pending
- Event ID match: Automated exact-match assertion passed
- Webhook retry test: Automated duplicate webhook test passed
- Final Purchase count: Pending

## Thank You Refresh Test

Automated result: passed. The first browser claim can complete once; concurrent claims return `claim_active`; subsequent refresh/reopen claims return `already_sent`. Historical confirmations return `legacy_order_locked`.

Live Meta Test Events result: pending post-deployment verification.

## Meta Pixel Initialization

The React HTML bootstrap initializes the configured customer Pixel once. The route tracker detects the existing initialized Pixel and does not call `init` again. Admin routes are excluded. The server CAPI Pixel ID is now the authoritative browser dataset ID whenever CAPI is enabled, and Admin prevents saving a mismatched Pixel ID.

The existing `requireConsent` setting and consent behavior were not changed.

## Item Number 3

- Item: **Decide and configure Meta consent with privacy/legal approval.**
- Status: **Intentionally skipped.** `requireConsent` remains unchanged, exactly as requested.

This excluded audit recommendation is different from section 3 of the current deduplication request; browser/CAPI event-ID matching was implemented.

## Other Audit Improvements Implemented

- Corrected contradictory COD-only/PayMongo content through an additive production migration and safe defaults.
- Corrected the verified OFFWHITE color-copy defect and the two identified trailing `Copy` names through the migration.
- Added a real catalog-backed Shop route with search, collection, available-size, availability, price, and sorting controls.
- Added a catalog/order aggregate query so the product endpoint no longer loads complete orders and customer data to derive sales counts.
- Added dynamic product and collection metadata, canonical links, Product/Offer structured data, and published-review-only AggregateRating.
- Added a real dynamic sitemap, HSTS, and immutable hashed-asset caching.
- Reduced homepage image transfer to the active hero plus delayed next-image preload; exposed the mobile benefit line.
- Made payment and free-shipping trust copy depend on actual enabled settings and quote data.
- Added clear PayMongo cancellation recovery while preserving cart and checkout draft.
- Added checkout labels, accessible errors, privacy-use copy, mobile obstruction fixes, explicit-size cart upsells, sold-out recommendation filtering, modal focus handling, and customer-safe empty states.
- Added an admin-only Meta tracking panel with event ID, source timestamps, status, error, and deduplication state.

## Files Changed

### Meta/database/backend

- `apps/api/db/migrations/20260715_meta_purchase_deduplication.sql`
- `apps/api/db/schema.sql`
- `apps/api/src/marketing/metaPurchaseService.js`
- `apps/api/src/marketing/metaEvent.js`
- `apps/api/src/marketing/marketingEventOutboxRepository.js`
- `apps/api/src/checkout/authoritativeCheckoutService.js`
- `apps/api/src/orders/checkoutService.js`
- `apps/api/src/orders/orderRepository.js`
- `apps/api/src/payments/paymongoPaymentService.js`
- `apps/api/src/routes/orders.js`
- `apps/api/src/routes/admin.js`
- `apps/api/src/routes/storeSettings.js`
- `apps/api/public/js/meta-pixel.js`
- `apps/api/public/js/checkout.js`
- `apps/api/public/js/thank-you.js`

### Storefront/admin

- `apps/web/src/lib/api.js`
- `apps/web/src/lib/metaPixel.js`
- `apps/web/src/pages/CheckoutReview.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/src/admin/OrderDetail.jsx`
- `apps/web/src/admin/Settings.jsx`

### Audit improvements

- `apps/api/db/migrations/20260715_conversion_content_corrections.sql`
- `apps/api/src/app.js`
- `apps/api/src/checkout/checkoutQuoteService.js`
- `apps/api/src/routes/checkout.js`
- `apps/api/src/routes/products.js`
- `apps/api/src/routes/sitemap.js`
- `apps/api/src/settings/storeSettingsRepository.js`
- `apps/web/nginx.conf`
- `apps/web/src/App.jsx`
- `apps/web/src/components/ReportIssueWidget.jsx`
- `apps/web/src/components/Shell.jsx`
- `apps/web/src/lib/storeSettings.js`
- `apps/web/src/pages/Account.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/Collection.jsx`
- `apps/web/src/pages/CustomerAuth.jsx`
- `apps/web/src/pages/Home.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Shop.jsx`
- `apps/web/src/pages/SizeChart.jsx`
- corresponding API and storefront automated tests

## Tests Performed

- Complete API suite: passed; optional external PostgreSQL integration tests remain skipped locally because `TEST_POSTGRES_URL` is not configured.
- Complete storefront source/unit suite: 207 passed, 0 failed.
- Focused Meta browser/server, COD, PayMongo, invalid-value, claim concurrency, refresh, route protection, initialization, and admin-panel tests: passed.
- Production Vite build: passed.
- Modified backend JavaScript syntax checks: passed.
- Production dependency audit at high severity: 0 vulnerabilities.
- Both migrations executed against the live PostgreSQL schema inside a transaction and rolled back: passed.
- Production evidence audit: one CAPI outbox row, sent once, numeric `729`, `PHP`.
- Local Docker/nginx runtime: unavailable because the local Docker daemon is stopped; production container validation is pending deployment.

## Remaining Issues

1. Deploy the code and additive migrations with a production backup and rollback point.
2. Complete one controlled COD order and one real PayMongo payment after deployment.
3. Verify both sources under the same event in Meta Test Events and confirm the final count is one after refresh/reopen/webhook retry.
4. Meta account access is required to inspect and disable any automatic Purchase configured through Event Setup Tool, GTM, a partner integration, or another dataset source if a third event remains.
5. Recommendation number 3 remains intentionally unresolved and unchanged.

## Final Status

**Not Fixed** — the code, database migration, automated deduplication tests, and production data diagnosis are complete, but the required live COD and live PayMongo Meta Test Events acceptance tests have not yet both passed. This status must not be changed to Fixed until those two tests are complete.
