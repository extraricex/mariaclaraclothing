# Maria Clara Clothing Website Conversion Audit

Audit date: July 25, 2026 (Asia/Manila)

Production website: https://mariaclaraclothing.com

## Overall Status

Not Ready

The local implementation is buildable and passes the automated and browser test matrix, but the release is not yet deployed. A live or test-mode PayMongo completion, a controlled production COD order, a new post-deployment Pancake export, and a production admin-email receipt were not performed because production is configured for live payments and fulfillment and no authorized test customer identity or PayMongo test credentials were provided.

## Executive Summary

The audit did not find evidence that the store has “no orders.” The website database recorded 32 successful non-test Online Store orders and ₱29,340.00 in revenue during the available first-party measurement window. All 32 were Cash on Delivery. The observed website order conversion was 3.7% against 858 measured landing sessions, but the pre-fix funnel is incomplete because anonymous analytics requests were failing.

The most serious confirmed customer-facing defect was on product pages: a successfully loaded cached main product image could remain at CSS opacity `0`, leaving a large blank gallery. The defect reproduced on the production CURIOSITY BLACK product page. The local fix now binds loaded and failed states to the active image URL; browser validation shows the same image complete, 389 × 389 natural pixels, eager/high-priority, and opacity `1`.

The most serious confirmed measurement defect was a recurring production `500` on `POST /api/analytics/events`. Anonymous events passed `customer: null`, while `addHashedCustomerData` read `customer.email`. This lost first-party funnel records and affected Meta funnel mirroring for anonymous consenting sessions. The null-safe fix and regression test are implemented.

Four additional confirmed problems were corrected:

- Website conversion analytics counted Pancake POS imports as website orders.
- `/products/...` aliases rendered duplicate `200` product pages instead of permanently redirecting.
- `/collections/all` generated an absolute HTTP redirect and discarded UTM parameters.
- Old `/pages/contact` and `/policies/...` paths returned `404`.

The site already had strong checkout foundations: guest checkout, dependent Province → City → Barangay fields, quote-backed totals, backend idempotency, transactional order/stock writes, durable PayMongo webhooks, Pancake export outboxes, durable email outboxes, and permanent Meta Purchase identities. Those mechanisms were retained and regression-tested.

The production evidence does not prove that price, traffic quality, trust, or checkout is the sole root cause. The strongest remaining evidence-backed risks are slow real-user performance, zero published reviews, limited product photography on several products, four expired PayMongo attempts with no successful PayMongo order in the measured window, and unresolved SMTP authentication failures.

## Current Funnel

Available measurement window: July 17, 2026 01:48:48 UTC through the July 25 audit.

- Sessions: 858 unique landing/page-view sessions
- Product views: 468 unique product-viewing sessions
- Add to Cart: 45 unique add-to-cart sessions
- Checkout: 40 unique sessions reached `/checkout`; 22 older `InitiateCheckout` events and 14 `AddPaymentInfo` sessions were recorded
- Orders: 32 successful non-test Online Store orders
- Conversion rate: 3.7%
- Website revenue: ₱29,340.00
- Average order value: ₱916.88

These historical stage counts must not be treated as a perfectly monotonic funnel. Anonymous analytics requests were returning `500`, and some older event names represented a later checkout action than their label suggested. The database remains authoritative for successful orders and revenue.

Traffic/device context from the same window:

- Mobile sessions: 528
- Desktop sessions: 329
- Direct source: 382 sessions
- `facebook`: 331 sessions
- `m.facebook`: 44 sessions
- `lm.facebook`: 24 sessions
- Homepage landings: 408 sessions
- Legacy `/products/...` links continued receiving visits

## Funnel Map and Customer Journey Evidence

| Step | Production evidence | Confirmed or likely abandonment risk | Status after local implementation |
|---|---|---|---|
| 1. Homepage landing | Homepage loaded at 390 px; 408 measured landing sessions | Confirmed p75 LCP 4,456 ms and TTFB 1,115 ms. Two competing hero CTAs were visible. | One primary hero CTA. Actual most-ordered, in-stock products appear directly after the hero when order data exists. |
| 2. Collection | Public collections loaded and product cards linked to canonical product paths | No checkout-stopping error reproduced. Slow image/API delivery remains a likely risk. | Existing responsive/lazy image behavior retained. |
| 3. Product | Production cached main image loaded but remained opacity `0` | Confirmed blank product gallery; high-impact product-confidence failure. | Fixed URL-bound image load state; browser shows opacity `1`. |
| 4. Size/variant | Sizes, sold-out states, size chart, stock text, and selected state were visible | Some products have limited media; sizing uncertainty remains likely. No missing-selection bypass reproduced. | Size selections are measured. Size chart and inline availability retained. |
| 5. Add to Cart | Production Add to Cart opened the cart drawer with the chosen size | No broken button reproduced. | Existing stock limits retained; drawer now adds quote-backed free-shipping progress and configured payment reassurance. |
| 6. Cart | Product, size, quantity, line price, subtotal, and total were present | Shipping was only “calculated at checkout”; drawer lacked progress/reassurance. | Progress uses backend quote fields. No frontend-only discount promise was added. |
| 7. Checkout start | Guest checkout and a three-step progress header were available | Historical tracking undercounted this stage. | Explicit `checkout_start` server-backed event added. |
| 8. Shipping information | Dependent Province, City, Barangay fields worked; ZIP and email were optional | Invalid-field attempts were not categorized in admin analytics. | Missing province/city/barangay, invalid phone/address, stock, and API errors are categorized; first invalid field remains focused. |
| 9. Review | Names, normalized phone, full address, items, and totals survived navigation | No data-loss defect reproduced. | Explicit `shipping_info_completed` event added. |
| 10. COD or PayMongo | COD was available. Four PayMongo orders expired; no successful PayMongo order occurred in the measured window. | PayMongo abandonment or payment friction is likely, but a provider defect is not confirmed. | `payment_failed` and `payment_cancelled` events added. Live payment configuration was not changed. |
| 11. Place Order | Backend quote and idempotency key already used | Double-click risk was already guarded but was not visible in funnel analytics. | `place_order` and duplicate-submission issue events added. |
| 12. Order creation | 32 valid website orders were committed | No systematic order-create failure found. | Database-only website order filter added to analytics. |
| 13. Inventory deduction | Transactional and idempotent API tests pass | No duplicate stock deduction reproduced. | Existing transaction retained; full backend regression suite passes. |
| 14. Pancake POS | 43 live exports were sent in the window; one older shadow remained blocked on province mapping | Pancake failures can occur independently after a valid website commit. | Pancake failures now appear in Checkout Issues. No provider mutation was made. |
| 15. Thank You | Production Thank You loaded; backend claim prevents repeated Purchase dispatch | Thank You views were not a distinct website funnel step. | `thank_you_view` event added and deduped by order. |
| 16. Admin email | 36 sent, 2 failed with SMTP authentication, 11 not queued during the window | Confirmed notification reliability gap; orders remain valid. | Email failures appear in Checkout Issues. Existing retry action retained. |
| 17. Meta Purchase | 35 eligible website orders had valid permanent PHP/value identities; 30 CAPI-only and 5 browser+CAPI controlled/history events; 4 payment-pending orders were ineligible | Normal live browser Purchase is intentionally disabled, so account-side deduplication cannot be fully revalidated here. | Meta event identities and Purchase code were not altered; null anonymous funnel bug fixed. |

## Confirmed Order Blockers

No reproducible checkout-stopping P0 was found in the production COD path. The following confirmed defects materially damaged product confidence, routing, or visibility into abandonment.

### Blank main product image

- Problem: A cached product image could finish loading and still remain invisible.
- Evidence: On the production CURIOSITY BLACK product page, the main image was `complete`, had natural dimensions 389 × 389, and computed opacity `0`.
- Funnel stage: Product view
- Severity: P1 — high conversion impact
- Affected code: `apps/web/src/pages/Product.jsx`
- Reproduction steps: Open the product route on mobile, wait for the main image request to complete, inspect the main gallery image opacity.
- Fix: Replaced one global boolean with URL-bound `loadedImageUrl` and `failedImageUrl` states; removed the effect that reset a cached load after `onLoad`.
- Test result: Local browser reports complete image, natural width 389, width 350, eager loading, high fetch priority, and opacity `1`.

### Anonymous analytics `500`

- Problem: `addHashedCustomerData` assumed an object even when anonymous requests passed `customer: null`.
- Evidence: Production API logs repeatedly showed `Cannot read properties of null (reading 'email')` from `metaFunnelEvent.js` during `POST /api/analytics/events`.
- Funnel stage: All measured stages
- Severity: P0 — observability and attribution integrity
- Affected code: `apps/api/src/marketing/metaFunnelEvent.js`
- Reproduction steps: Send a valid anonymous funnel event with no authenticated customer.
- Fix: Normalize non-object/null customer input to an empty object before accessing fields.
- Test result: Null-customer regression test passes; full backend suite passes.

### Website analytics included Pancake POS orders

- Problem: Completed-order analytics did not filter `checkoutChannel` or `channel`.
- Evidence: Production orders contained both `storefront_checkout`/`Online Store` and `pancake_pos`/`Pancake POS`; the previous summary accepted both.
- Funnel stage: Successful orders, conversion, revenue, product performance
- Severity: P1 — decision-quality error
- Affected code: `apps/api/src/analytics/storefrontAnalyticsService.js`
- Reproduction steps: Request admin analytics for a period containing a completed Pancake-imported order.
- Fix: Count only `checkoutChannel=storefront_checkout` or `channel=Online Store`, then apply payment/status/test exclusions.
- Test result: Regression fixture confirms Pancake POS, cancelled, returned/failed, and marked test orders are excluded.

### Duplicate and broken legacy routes

- Problem: Canonical `/products/{canonical-handle}` returned `200`, old policy/page paths returned `404`, and `/collections/all` discarded campaign parameters and emitted an HTTP absolute redirect.
- Evidence: Production HTTP checks reproduced all three behaviors.
- Funnel stage: Landing → product/collection
- Severity: P1 — paid/social landing continuity and duplicate indexing
- Affected code: `apps/web/nginx.conf`, `apps/api/src/routes/products.js`
- Reproduction steps: Request `/products/hawak-white-oversized-240-gsm-shirt?utm_source=audit`, `/collections/all?utm_source=audit`, `/pages/contact`, and `/policies/privacy-policy` without following redirects.
- Fix: Force plural product routes through one `301`, remove the internal control query from the destination, preserve UTM/query parameters, use relative redirects, and map known Shopify page/policy routes.
- Test result: Source and route tests pass. Runtime nginx validation awaits a deployment/container because the local Docker daemon was unavailable.

### Concurrent JSON analytics writes

- Problem: Development/JSON-fallback analytics writes could interleave and corrupt the JSON file.
- Evidence: Parallel local browser tests reproduced invalid JSON and `500` analytics requests.
- Funnel stage: Local/test observability only; production uses PostgreSQL
- Severity: P2 in production, P1 for reliable testing
- Affected code: `apps/api/src/analytics/storefrontAnalyticsRepository.js`
- Reproduction steps: Send many funnel events concurrently while `ANALYTICS_DATA_FILE` is enabled.
- Fix: Serialize fallback mutations and atomically rename completed temporary files.
- Test result: A 30-event concurrent regression test leaves valid, complete JSON.

## Homepage Audit

- Problems:
  - Two hero buttons competed for the primary action.
  - Product prioritization was collection-order-driven instead of actual order-data-driven.
  - Production p75 LCP and TTFB are slow.
  - No published reviews exist, so a legitimate review section cannot be added.
- Changes:
  - Retained only the configured primary hero CTA.
  - Added a “Most ordered” section based solely on positive `successfulOrderCount` values and currently available variants.
  - Retained eager/high-priority hero loading, responsive candidates, fixed dimensions, and route-level lazy chunks.
- Result:
  - Mobile browser snapshot shows one hero CTA followed by product content.
  - Seven-viewport route matrix passes with no horizontal overflow or broken visible images.

## Product Page Audit

- Problems:
  - Confirmed invisible main image.
  - Payment/shipping reassurance was not consolidated near Add to Cart.
  - Several active products have only two real images.
- Changes:
  - Fixed cached main-image visibility.
  - Added settings-backed COD/PayMongo availability, shipping-fee disclosure, and shipping/exchange link near Add to Cart.
  - Added `size_select` measurement.
  - Kept product facts conditional on actual metafields/product data.
- Result:
  - Product image, price, sizes, stock, quantity, Add to Cart, size chart, and reassurance are visible in local browser validation.
  - Gallery arrows, thumbnails, keyboard Home behavior, swipe, and single-image behavior pass e2e tests.

## Product Database and Catalog Audit

- Production source of truth contained 18 active products, including 3 sold-out products, and 23 recorded product URL aliases.
- Current prices, compare-at prices, variant IDs, SKU/size inventory, collection membership, image URLs, and product facts continue to come from the product database/API. No price, stock, specification, or promotion was hardcoded by this implementation.
- Production reviews contained 0 records.
- KAMALAYAN EYE, MC ACID BLACK, MC ACID OFFWHITE, THE GOOD TIME, and IMPERIAL were among the products with only two real images at audit time. No duplicate media was created to inflate image counts.
- The new Content Readiness view flags missing structured size charts, verified product detail copy, alt text, color, media, and SEO descriptions without filling them with invented facts.

## Size and Fit

- Problems:
  - No verified model measurements exist for every product.
  - Product content readiness flags structured size-chart gaps in part of the catalog.
- Changes:
  - Did not invent model measurements.
  - Retained verified structured rows/image fallback, inches/centimeters where present, modal focus trapping, sold-out buttons, and visible selected-size state.
  - Added server-backed size-selection analytics.
- Result:
  - Required variant stock constraints pass backend and frontend tests.
  - Size chart is reachable beside the selector and through the full size-guide route.

## Reviews and Trust

- Problems:
  - Production review database contains zero reviews.
  - Two SMTP authentication failures were recorded.
  - Product media coverage is limited on multiple products.
- Changes:
  - No reviews, ratings, names, photos, verification labels, or trust claims were fabricated.
  - Existing public review component continues to show only published records and supported filters.
  - Added real settings-backed payment/delivery reassurance and retained visible policies/contact/social links.
- Result:
  - Review acceptance criterion remains unmet until genuine reviews are published.

## Cart Audit

- Problems:
  - Drawer lacked a clear free-shipping progress statement and payment reassurance.
- Changes:
  - Added progress from authoritative quote fields only.
  - Shows “add N more” only when the server says free shipping is enabled and the cart is below the threshold.
  - Added COD and PayMongo reassurance only for configured methods.
- Result:
  - Quantity, removal, persistence, line totals, discount, shipping, total, checkout, and focus-trap tests pass.

## Checkout Audit

- Problems:
  - Historical funnel did not distinguish checkout start, completed shipping information, Place Order clicks, address failure types, stock failures, duplicate submissions, or generic order API failures.
- Changes:
  - Added `checkout_start`, `shipping_info_completed`, `place_order`, `checkout_error`, `payment_failed`, `payment_cancelled`, and `thank_you_view`.
  - Added categories for invalid address, missing Province, missing City, missing Barangay, invalid phone, insufficient stock, duplicate submission, payment failure, order API failure, Pancake failure, and email failure.
  - Hashes cart/order references and sanitizes URLs, emails, phone-like values, and long identifiers.
  - Added date-filtered Conversion Overview, Conversion Funnel, and Checkout Issues admin routes.
- Result:
  - Local isolated-PostgreSQL COD e2e passes.
  - Province, City, Barangay names/codes persist through all mobile widths and Review navigation.
  - Existing idempotency, authoritative quote, stock transaction, confirmation token, and refresh deduplication regression tests pass.

## COD Test

Result:

Partial pass in an isolated local PostgreSQL database. One e2e order generated one `POST /api/orders`, one idempotency key, one committed website order, the expected ₱649.00 item plus ₱80.00 configured shipping total, a private confirmation, and a functioning Thank You page. Backend tests verify one stock deduction and idempotent retries.

Not accepted as a full production COD test: Pancake, SMTP, Meta live dispatch, and fulfillment were deliberately disabled, and no fulfillment-ready production order was created without authorized test customer data.

## PayMongo Test

Result:

Backend PayMongo checkout-session, signature, webhook, paid-amount, reservation, refund, replay, Purchase eligibility, and idempotency tests pass.

Not accepted as an end-to-end PayMongo test. Production is in LIVE mode. Four PayMongo attempts expired in the measured window and no successful PayMongo order occurred. A live charge was not created and the configuration was not switched. Owner must provide/activate PayMongo test-mode credentials in a non-production environment for the final hosted-checkout test.

## Pancake POS Test

Result:

Read-only production inspection found 43 sent live website exports in the measurement window. Structured address, item mapping, payment state, retry, exact custom-ID recovery, and duplicate-prevention tests pass. One older shadow remained blocked because a province could not be resolved.

Not accepted as a new controlled production test because no authorized production test order was created and the Pancake API was not mutated.

## Email Notification Test

Result:

Production records in the measurement window: 36 admin notifications sent, 2 failed with SMTP authentication, and 11 not queued. Backend tests confirm the email is queued after commit, is independent of browser/Pancake success, sends once, leaves a valid order committed on failure, and supports protected retry.

Not accepted as fully ready until SMTP authentication is repaired/enabled and a post-deployment order produces one received admin email.

## Meta Pixel and CAPI Regression

Result:

- ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, and Purchase regression tests pass.
- 35 production-eligible order identities had numeric values, PHP currency, and permanent unique event IDs.
- 30 were CAPI-only and 5 controlled/history records had both browser and CAPI completion.
- Four payment-pending orders correctly had no Purchase.
- The anonymous CAPI funnel null-customer failure is fixed.
- No campaign, ad set, ad, budget, audience, creative, placement, bid, attribution, or destination was changed.

Normal production browser Purchase is intentionally disabled while CAPI is authoritative. Account-side primary-dataset reception/deduplication still requires Meta Test Events or Events Manager access after deployment.

## Mobile Audit

- 320px: Pass — homepage, collection, product, information checkout, validation, and route matrix have no horizontal overflow.
- 360px: Pass — same matrix; dependent dropdown values persist.
- 390px: Pass — production and local browser inspected; main product image, size controls, cart drawer, and checkout are usable.
- 430px: Pass — same matrix; dependent dropdown values persist.
- Tablet: Pass — 768 × 1024 route/checkout matrix.
- Desktop: Pass — 1024 and 1440 route matrix.

Physical iOS/Android keyboards and real in-app Facebook/Instagram browsers were not available. Browser categories are now captured anonymously so post-deployment device-specific failures can be measured.

## Performance

- Before:
  - Production RUM p75 LCP: 4,456 ms
  - FCP: 2,979 ms
  - INP: 432 ms
  - CLS: 0.12
  - TTFB: 1,115 ms
  - Main product image could remain invisible despite completing.
- After:
  - Main product image is visible at opacity `1`, retains eager loading and high fetch priority, and uses responsive Shopify candidates.
  - Vite output retains route-level chunks; final shared JS is 287.96 kB (91.53 kB gzip), and CSS is approximately 106 kB (18.24 kB gzip).
  - Product reviews, admin analytics, checkout, and other large routes remain split.
- Remaining issues:
  - Post-deployment RUM is required to prove LCP/INP/TTFB improvement.
  - Origin/API TTFB and image delivery require infrastructure-level profiling.
  - Production p75 LCP, INP, and TTFB remain above desired targets until measured otherwise.

## Legacy URL Audit

- Old URLs found:
  - `/products/{handle}` duplicate product pages
  - `/collections/all`
  - `/pages/contact`
  - `/pages/faq`
  - `/pages/shipping-returns`
  - `/pages/shipping-and-returns`
  - `/pages/size-chart`
  - `/pages/terms-of-use`
  - `/policies/terms-of-service`
  - `/policies/privacy-policy`
  - `/policies/refund-policy`
  - `/policies/shipping-policy`
- Redirects added:
  - All known plural product routes → one canonical `/product/{publicHandle}` `301`
  - Shopify page/policy mappings → current site routes
  - `/collections/all` → `/shop`
  - Query parameters/UTMs preserved
- Canonical status:
  - Sitemap already uses `/product/{publicHandle}`.
  - Product SEO canonical remains the singular `/product/...` structure.
  - No confirmed stale alternate Maria Clara domain remained in the canonical or sitemap paths inspected.
  - Runtime production redirects are pending deployment.

## Changes Implemented

1. Fixed invisible cached product images.
2. Fixed anonymous Meta/funnel event null-customer errors.
3. Added a versioned conversion-observability migration.
4. Expanded privacy-safe server-backed funnel event coverage.
5. Added browser/device/error classification and sanitization.
6. Added atomic JSON-fallback analytics writes.
7. Filtered conversion/revenue to authoritative Online Store orders.
8. Added Manila-aware Today, Yesterday, Last 7, Previous 7, Last 30, and Custom ranges.
9. Added Admin > Analytics > Conversion Overview.
10. Added Admin > Analytics > Conversion Funnel.
11. Added Admin > Analytics > Checkout Issues.
12. Added separate top viewed, top added-to-cart, and top purchased product rankings.
13. Added resolvable checkout issue categories, including provider/email failures.
14. Added address, stock, duplicate, payment, API, Pancake, and email failure counts.
15. Added size selection, checkout start, shipping completion, Place Order, failure, and Thank You events.
16. Added product-page settings-backed trust copy.
17. Added cart-drawer quote-backed free-shipping progress.
18. Added cart-drawer configured payment reassurance.
19. Reduced the homepage to one primary hero CTA.
20. Added actual-order-data-backed, in-stock “Most ordered” homepage products.
21. Added safe `301` legacy product, collection, page, and policy redirects with query preservation.
22. Updated stale e2e product handles to current canonical public handles.
23. Added focused regression coverage for every conversion-observability change.

## Files Changed

- `apps/api/db/schema.sql`
- `apps/api/db/migrations/20260725_conversion_observability.sql`
- `apps/api/src/analytics/storefrontAnalyticsRepository.js`
- `apps/api/src/analytics/storefrontAnalyticsService.js`
- `apps/api/src/marketing/metaFunnelEvent.js`
- `apps/api/src/routes/admin.js`
- `apps/api/src/routes/products.js`
- `apps/api/test/conversionObservabilitySource.test.js`
- `apps/api/test/metaFunnelEvent.test.js`
- `apps/api/test/productPublicHandles.test.js`
- `apps/api/test/storefrontAnalytics.test.js`
- `apps/web/nginx.conf`
- `apps/web/src/App.jsx`
- `apps/web/src/admin/AdminLayout.jsx`
- `apps/web/src/admin/Analytics.jsx`
- `apps/web/src/admin/AnalyticsRangeControls.jsx`
- `apps/web/src/admin/CheckoutIssues.jsx`
- `apps/web/src/admin/ConversionFunnel.jsx`
- `apps/web/src/components/Shell.jsx`
- `apps/web/src/lib/funnelAnalytics.js`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/CheckoutReview.jsx`
- `apps/web/src/pages/Home.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/e2e/checkout-upsell-gallery.spec.js`
- `apps/web/test/conversionAnalyticsSource.test.js`
- `apps/web/test/defectRegressionsSource.test.js`
- `apps/web/test/productPageSource.test.js`
- `WEBSITE_CONVERSION_AUDIT_AND_IMPLEMENTATION.md`
- `CONVERSION_GROWTH_ACTION_PLAN.md`

Pre-existing runtime-data changes in `apps/api/data/cart-sessions.json` and `apps/api/data/discounts.json` were not treated as implementation files.

## Validation Completed

- Backend: 599 tests passed, 0 failed, 2 skipped because `TEST_POSTGRES_URL` was not configured for those two suite cases.
- Frontend source/regression: 250 tests passed.
- Checkout/gallery e2e: 7 passed using an isolated temporary PostgreSQL database.
- Customer route matrix: 7 viewports passed (320, 360, 390, 430, tablet, laptop, desktop).
- Accessibility and cursor interaction e2e: passed.
- Production web build: passed.
- `git diff --check`: passed.
- PostgreSQL analytics write: local API returned `202`; the row stored the event/category/browser class, a 64-character reference hash, and no customer PII.
- Local browser: product image opacity `1`; homepage single CTA; admin overview/funnel/issues loaded; DB-derived issue resolved state persisted.

## Recommendations Not Yet Implemented

- Publish genuine reviews: deferred because the production review database contains zero records.
- Add product/customer photos: deferred because no additional approved media was available; images were not duplicated.
- Fill missing model measurements: deferred because measurements were not verified.
- Repair SMTP authentication: requires valid owner-controlled credentials/provider action.
- Complete PayMongo test-mode hosted checkout: requires test credentials and a non-live provider configuration.
- Complete controlled production COD/Pancake/email/Meta test: requires authorized test identity and fulfillment coordination.
- Enable normal browser Purchase: deferred because CAPI is authoritative and enabling it without Events Manager validation could create attribution risk.
- Change live campaigns or destinations: explicitly out of scope and not performed.
- Promise faster delivery/exchange outcomes: deferred unless supported by current policy and operations.
- Infrastructure TTFB optimization: requires origin/nginx/database profiling after deployment.

## Priority Roadmap

### P0 — Immediate

- Deploy the code and database migration through the existing production release process.
- Verify `POST /api/analytics/events` returns `202` instead of the anonymous-event `500`.
- Repair/enable admin email SMTP authentication and run one authorized COD test.
- Run PayMongo in test mode in a non-production environment, including webhook replay.
- Confirm new nginx redirects return one-hop `301` with preserved UTM parameters.

### P1 — High Impact

- Investigate the four expired PayMongo attempts with provider-side test evidence.
- Add genuine published reviews and approved customer photos.
- Add verified front/back/detail/fabric/model imagery to products with two images.
- Complete structured size charts and confirmed product metadata flagged by Content Readiness.
- Reduce production LCP, INP, and TTFB using post-deployment RUM and server timing.

### P2 — Growth

- Use the new funnel to compare mobile/browser abandonment by stage.
- Improve recommendations using more order co-occurrence data once sufficient volume exists.
- Add back-in-stock notifications only after consent and notification delivery are operational.
- Add review fit feedback once real review volume supports it.

### P3 — Experiments

- Test alternate hero copy while keeping one primary CTA.
- Test product trust-line placement.
- Test bundle presentation using only server-validated offers.
- Test review placement after genuine reviews exist.

## Final Status

Not ready for production

The code is locally ready for a controlled release candidate, but the final acceptance criteria still require deployment and owner-authorized live/test integration validation. Do not mark the overall CRO project complete until the post-deployment COD, PayMongo test-mode, Pancake, email, Meta, and redirect checks pass.
