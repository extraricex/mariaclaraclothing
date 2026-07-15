# Reviews System Implementation Report

## Overall Status

Ready

The product reviews system and the Meta Purchase event corrections are implemented. Production rollout requires the normal database migration, production secrets, and a live Meta Test Events verification after deployment.

## Customer Review UI

- Features implemented:
  - Published, database-backed product reviews only; no demo or hardcoded reviews.
  - Average rating, published review count, five-star distribution, filters, sorting, pagination, and responsive review cards.
  - Verified Purchase and resolved-concern badges, variant/size, review date, customer photos, photo lightbox, helpful count display, and public store replies.
  - Product Reviews and Store Reviews data/UI structure. The Store Reviews tab appears only when enabled and at least one published store review exists.
  - Write a Review modal with name, private email, required rating/message, title, variant/size, optional order number, consent, honeypot, and up to three photos.
  - Customer submissions default to Pending. The exact pending confirmation is: “Thank you! Your review has been submitted for approval.”
  - Published rating summaries on product cards across every page that uses the shared ProductCard component. Empty review counts are not invented or displayed.
- Responsive test result:
  - Passed real Chromium interaction checks at 360×740, 430×932, 768×1024, and 1440×1000.
  - Product reviews, filters, photo lightbox, submission modal, admin list/editor, and import page had no horizontal document overflow.
- Remaining issues:
  - No known application-code issue. Store Reviews remain intentionally hidden until real published store-review records exist.

## Admin Review Management

- Features implemented:
  - Admin > Reviews list, pending-count navigation badge, search, product/rating/status/source/date filters, verified/with-photo/deleted filters, counts, and pagination.
  - Full review editor for product assignment, display name, private email/order number, rating, title, body, review date, variant, size, status, photos, verified state, concern resolution, and store reply.
  - Publish, hide, archive, spam, reject through status editing, restore, soft delete, confirmed permanent delete, and the requested bulk publish/hide/spam/archive/restore actions.
  - Audit history, previous status, moderation actor/date/reason, original import row/data, admin reply date, and resolved-concern state.
  - Pending-count badge refreshes in the authenticated admin shell to notify administrators of new submissions.
- Moderation rules:
  - Hidden, Archived, Spam, Rejected, soft-deleted, and permanently deleted actions require a moderation reason.
  - Genuine negative reviews remain eligible for publication and can receive a public reply and resolved marker.
  - Only Published, non-deleted reviews are public or included in rating statistics.
  - Verified Purchase cannot be set by an admin unless the live order verification succeeds.
- Remaining issues:
  - The existing application has one authenticated admin authority rather than granular admin roles; permanent deletion is restricted by that existing admin session and CSRF protection.

## Excel Import

- Parser/library used:
  - SheetJS Community Edition 0.20.3, pinned to the official SheetJS CDN package.
- Security status:
  - The known high-severity ReDoS advisory affects releases through 0.20.1 and recommends 0.20.2 or later; 0.20.3 is in use. See the [SheetJS CVE-2024-22363 advisory](https://cdn.sheetjs.com/advisories/CVE-2024-22363).
  - The earlier prototype-pollution advisory affects releases through 0.19.2. See the [SheetJS CVE-2023-30533 advisory](https://cdn.sheetjs.com/advisories/CVE-2023-30533).
  - `npm audit --omit=dev` reports 0 vulnerabilities.
- Template format:
  - A real `.xlsx` workbook with blank `Reviews` and `Instructions` worksheets.
  - Includes every requested column, allowed values, date/product/verification/photo rules, 2,000-row limit, and a fictional example row only.
- Validation:
  - 5 MB and 2,000-row limits; workbook signature, worksheet/header, and formula-cell checks.
  - Product matching priority is product ID, SKU, then slug; product name is never used.
  - Validates rating, required fields, strict calendar dates, email, status, text length, unsafe text/formula prefixes, public HTTPS photo URLs, duplicate rows, and existing duplicates.
  - Preview is mandatory. A signed token binds confirmation to the exact file name, bytes, and valid-row count; confirmation reparses the workbook.
  - Every imported review is stored as Pending with source Imported, batch ID/date/admin, original row, and original data. Requested verification is assigned only after real-order validation.
  - Failed rows remain out of the database and are available as a formula-safe CSV error report.
- Test result:
  - Template, preview, matching priority, Pending enforcement, signed confirmation, batch/original metadata, verification, invalid inputs, formulas, unsafe URLs, impossible dates, and duplicate detection passed automated tests.

## Verified Purchase Logic

- Matching method:
  - A real order must exist for the supplied order number.
  - The order must be Delivered through its order, fulfillment, or delivery status.
  - The private reviewer email or logged-in customer account must match the order.
  - The order items must contain the reviewed product by stable product ID/slug/handle.
  - Imported, customer-submitted, and admin-created records all use this same verifier; none can directly assert verification.
- Test result:
  - Delivered matching order passes. Missing, pending, failed, customer-mismatched, product-mismatched, and nonexistent orders fail.

## Visibility Controls

- Global toggle:
  - Enable Reviews; Show Reviews on Product Pages; Show Ratings on Product Cards; Allow Customers to Submit Reviews; Auto-publish Verified Reviews; Require Admin Approval; Show Store Reviews; Allow Review Photos.
  - Disabling visibility hides UI without deleting records. Re-enabling restores published records.
- Per-product toggle:
  - Reviews enabled for this product and Show rating summary are persisted by the product editor for JSON and PostgreSQL storage.
  - Product cards and product details honor the per-product switches.
- Test result:
  - Global off/on and per-product off/on were exercised against the real routes and repository; records and published statistics remained intact.

## Security

- Content sanitization:
  - Review fields are normalized as bounded plain text and rendered through React text nodes. Public serializers omit reviewer email, customer ID, and order number.
- File validation:
  - Customer uploads allow only JPG, PNG, or WebP, maximum three files and 5 MB each.
  - Sharp decodes the actual file, enforces a 40-megapixel input ceiling, rotates, resizes to a maximum 1600×1600, strips metadata, and writes WebP at bounded quality.
  - Imported/admin remote images require public HTTPS image URLs and reject private/reserved IPv4 and IPv6 addresses, credentials, formula prefixes, and executable formats.
- Rate limiting:
  - Customer review POST requests are limited by IP (default 8 per hour) and include a honeypot. Admin actions use existing authenticated sensitive-action limits and CSRF protection.
- Remaining issues:
  - None of the production-readiness blockers listed in the request remain.

## Meta Purchase Event Correction

### Authoritative final total

`apps/api/src/checkout/checkoutQuoteService.js` is the authoritative checkout calculator. It resolves server-side product/variant prices and quantities, applies discounts, applies the configured shipping fee or free-shipping rule, and produces `quote.totalCents`.

The accepted quote snapshot is persisted to `order.totalCents`. PayMongo charges that same centavo total and its paid webhook rejects a currency or amount mismatch. Browser Pixel and Conversions API convert only the stored integer centavo value to a numeric PHP amount; they do not read DOM text or independently rebuild the order total.

Checkout review displays `quote.totalCents`; thank-you and admin order details display persisted `order.totalCents`. The admin calculation is retained only as a fallback for old records missing a valid stored total.

### COD timing

- Purchase is created only after the order, inventory movements, cart conversion, discount claim, and related writes succeed in the database transaction.
- The browser receives the successfully created order response and then sends Pixel Purchase.
- The CAPI outbox row is committed with the saved order; a worker delivers it after commit.
- Clicking Place Order alone cannot send Purchase, and the checkout idempotency key prevents duplicate order creation.

### PayMongo timing

- Checkout creation stores a Pending Payment order and does not send Purchase.
- Purchase is queued only from a signature-verified `checkout_session.payment.paid` flow after the session/order reference, PHP currency, and exact paid centavo amount match the stored order.
- Failed, pending, cancelled, expired, abandoned, amount-mismatched, and paid-after-cancellation flows do not create Purchase.
- The browser sends its matching Purchase only after the confirmation endpoint reports `paymentStatus: paid`.

### Validation and deduplication

- Invalid, missing, formatted, fractional-cent, zero, negative, `NaN`, or non-numeric totals return no Purchase event and cannot enter the CAPI outbox.
- Both sources use event name `Purchase`, currency `PHP`, the persisted total, matching contents/quantities, and `purchase_<order ID>`.
- Browser uses `{ eventID: metaEventId }`; server uses `event_id: metaEventId`.
- Browser uses an in-memory plus persistent localStorage order guard. The server outbox has a unique `event_id`, and order/PayMongo idempotency guards prevent duplicate persistence.
- Meta documents matching event name plus Pixel `eventID` and CAPI `event_id` as its recommended deduplication method. See [Meta’s duplicate-event documentation](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events).

### Development-only logging

Development logs contain only order ID, event ID, numeric value, currency, payment method, item count, browser sent state, CAPI queued/sent state, and a safe reason. Names, contact details, addresses, payment credentials, and notes are excluded.

### Meta Events Manager > Test Events procedure

1. Apply the reviews migration and deploy the API/web build. Confirm the browser Pixel ID and server `META_PIXEL_ID` refer to the same Meta dataset/pixel.
2. In Meta Events Manager, open **Data Sources/Datasets**, select the Maria Clara dataset, then open **Test events**.
3. Under server test instructions, copy the displayed Test Event Code. Set `META_CONVERSIONS_API_TEST_EVENT_CODE` to that code, keep `META_CONVERSIONS_API_ENABLED=true`, and restart the API worker. Never put the CAPI access token in browser code.
4. Under **Test browser events**, enter the deployed storefront URL and use **Open Website** so the browser session is associated with the Test Events screen.
5. Create a COD order with a recorded subtotal, discount, shipping fee, and final total. Wait for both Browser and Server `Purchase` entries.
6. Open the event details and verify:
   - Event name is `Purchase` for both sources.
   - `value` is a number greater than zero and exactly equals the checkout, admin, thank-you, and database grand total in pesos.
   - `currency` is exactly `PHP`.
   - Browser `eventID` and server `event_id` are the same `purchase_<order ID>`.
   - `content_ids`, `contents`, and `num_items` match all ordered variants and quantities.
   - Meta shows the browser/server pair as deduplicated rather than two counted purchases.
7. Refresh the thank-you page several times. Confirm no new browser Purchase appears and no second server Purchase/outbox row is created.
8. Complete a PayMongo test payment. Confirm no Purchase appears while Pending and that both sources appear only after the paid webhook is confirmed. Compare the paid amount with the same persisted order total.
9. Run failed, cancelled, pending, and abandoned PayMongo attempts. Confirm no Purchase appears for any of them.
10. After testing, remove `META_CONVERSIONS_API_TEST_EVENT_CODE` and restart the API so normal production events are no longer tagged as tests.

## Verification Results

- API: 427 tests; 425 passed, 0 failed, 2 skipped because `TEST_POSTGRES_URL` is not configured.
- Web: 197 tests; 197 passed, 0 failed.
- Production Vite build: passed (111 modules transformed).
- Responsive Chromium smoke test: passed at four requested viewport classes.
- Production dependency audit: 0 vulnerabilities.
- Backend JavaScript syntax checks: passed for all new review routes/services and modified Meta/PayMongo services.
- Lint/type checking: the repository has no ESLint, TypeScript dependency, or lint/typecheck script. `npm run lint --if-present` and `npm run typecheck --if-present` completed with no configured task; Node syntax checks, all tests, and the Vite production compiler were used instead.
- PostgreSQL integration note: the two existing database-only tests were skipped because this workspace has no `TEST_POSTGRES_URL`; schema/migration contract tests passed. Run the same suite against the staging PostgreSQL database before cutover.

## Modified Files

### Configuration and deployment

- `.env.example` — review import secret and review submission rate-limit examples.
- `apps/api/.env.example` — API-local review security configuration examples.
- `deploy/production.env.example` — production review secret/rate-limit examples.
- `docker-compose.yml` — passes review secret/rate-limit settings and uses the existing persistent uploads volume.
- `deploy/docker-compose.production.yml` — passes the review signing secret and submission rate-limit settings to the production API.
- `apps/api/src/config/env.js` — production validation for the optional strong import secret and rejection of JSON review persistence in production.

### Database and local data

- `apps/api/db/schema.sql` — product review flags plus review, image, import-batch, and audit tables/indexes.
- `apps/api/db/migrations/20260715_reviews_system.sql` — deployable reviews migration.
- `apps/api/data/reviews.json` — empty local repository with no demo reviews.
- `apps/api/scripts/db-reset-local.js` — resets review tables in dependency-safe order.

### Reviews backend

- `apps/api/src/reviews/reviewRepository.js` — JSON/PostgreSQL persistence, sanitization, public privacy projection, filtering, statistics, moderation, audit, deletion, and imports.
- `apps/api/src/reviews/reviewVerification.js` — delivered-order/customer/product verification.
- `apps/api/src/reviews/reviewImages.js` — safe upload validation, optimization, cleanup, and remote URL validation.
- `apps/api/src/reviews/reviewImport.js` — secure XLSX template, parsing, preview, matching, signed confirmation, import, and error CSV.
- `apps/api/src/routes/reviews.js` — customer list/statistics/submission routes.
- `apps/api/src/routes/adminReviews.js` — protected admin CRUD, moderation, settings, bulk, replies, deletion, import, and batches.
- `apps/api/src/app.js` — public review routes, rate limiting, and safe upload-error handling.
- `apps/api/src/routes/admin.js` — authenticated review subrouter and per-product review settings normalization.
- `apps/api/src/routes/storeSettings.js` — exposes the safe storefront review settings.
- `apps/api/src/settings/storeSettingsRepository.js` — eight global review toggles and normalization.
- `apps/api/src/routes/products.js` — grouped published-only rating summaries for product list/detail APIs.
- `apps/api/src/products/catalogPresenter.js` — storefront per-product review flags.
- `apps/api/src/products/catalogRepository.js` — JSON/PostgreSQL persistence for product review flags.

### Reviews frontend and admin

- `apps/web/src/components/ProductReviews.jsx` — complete customer review section, cards, filters, tabs, photos, lightbox, form, and responsive UI.
- `apps/web/src/components/ProductCard.jsx` — real published rating/count display with visibility controls.
- `apps/web/src/pages/Product.jsx` — product-page rating link and review section.
- `apps/web/src/admin/Reviews.jsx` — admin list/editor/settings/import/moderation UI.
- `apps/web/src/admin/AdminLayout.jsx` — Reviews navigation and pending badge.
- `apps/web/src/admin/ProductEditor.jsx` — per-product review switches.
- `apps/web/src/App.jsx` — Reviews admin routes.
- `apps/web/src/lib/api.js` — public review API helpers.
- `apps/web/src/lib/adminApi.js` — authenticated GET download helper for templates/error reports.
- `apps/web/src/lib/storeSettings.js` — storefront defaults for all review visibility options.

### Meta Purchase and authoritative totals

- `apps/api/src/marketing/metaEvent.js` — validated stored total, PHP Purchase payload, content/quantity data, common event ID, and safe development logging.
- `apps/api/src/marketing/marketingEventOutboxRepository.js` — blocks invalid Purchase rows and retains unique-event idempotency.
- `apps/api/src/marketing/metaConversionsWorker.js` — development-only CAPI sent-state log.
- `apps/api/src/checkout/authoritativeCheckoutService.js` — returns the same server event ID with the saved authoritative order.
- `apps/api/src/orders/checkoutService.js` — safe CAPI queueing after saved COD order writes.
- `apps/api/src/routes/orders.js` — common event ID and exact persisted totals/items in order confirmation payloads.
- `apps/api/src/payments/paymongoPaymentService.js` — queues Purchase only after confirmed exact PayMongo payment.
- `apps/web/src/lib/metaPixel.js` — validated numeric Purchase, common ID, contents, durable refresh/re-render guard, and safe development log.
- `apps/web/src/pages/ThankYou.jsx` — PayMongo browser Purchase only after paid confirmation.
- `apps/web/src/admin/OrderDetail.jsx` — persisted backend total is the displayed authoritative grand total.
- `apps/api/public/js/meta-pixel.js` — guarded, deduplicated legacy browser Purchase using the server total and event ID.
- `apps/api/public/js/checkout.js` — legacy confirmation and Pixel consume the authoritative server order response.
- `apps/api/public/js/thank-you.js` — legacy thank-you rejects unsuccessful payment states and relies on the Purchase guard.

### Automated tests

- `apps/api/test/adminReviews.test.js` — admin authentication, reason requirements, and verification forgery rejection.
- `apps/api/test/reviewImages.test.js` — upload optimization and unsafe IPv4/IPv6/format rejection.
- `apps/api/test/reviewImport.test.js` — secure template/import validation, matching, preview binding, verification, and metadata.
- `apps/api/test/reviewRepository.test.js` — published statistics, privacy, filters, photos, edits, dates, moderation, deletion, audit, and duplicates.
- `apps/api/test/reviewVerification.test.js` — delivered matching and ineligible order cases.
- `apps/api/test/reviewsRoutes.test.js` — real customer Pending submission, publication/reply, public privacy, and visibility restoration.
- `apps/api/test/reviewsSchema.test.js` — schema/migration/index and SheetJS package contract.
- `apps/api/test/checkoutQuoteService.test.js` — exact authoritative discount/shipping grand total.
- `apps/api/test/checkoutService.test.js` — updated common Meta event ID expectations in checkout persistence.
- `apps/api/test/authoritativeCheckoutPostgres.integration.test.js` — common event ID in the atomic PostgreSQL checkout test.
- `apps/api/test/inventoryDeduction.test.js` — updated common event ID expectations while preserving inventory coverage.
- `apps/api/test/frontendBehavior.test.js` — legacy browser Purchase consumes server items/total and guarded thank-you behavior.
- `apps/api/test/marketingEventOutbox.test.js` — invalid Purchase rejection and idempotent outbox behavior.
- `apps/api/test/metaConversionsApi.test.js` — updated common Meta event ID fixture.
- `apps/api/test/metaEvent.test.js` — invalid totals, exact total, quantities, contents, PHP, IDs, privacy, and paid timing.
- `apps/api/test/metaOutboxPostgres.integration.test.js` — valid PHP/value fixture for PostgreSQL deduplication.
- `apps/api/test/paymongoPaymentService.test.js` — authoritative charge and unsuccessful-payment no-Purchase behavior.
- `apps/api/test/productionConfig.test.js` — review persistence/import-secret production safeguards.
- `apps/web/test/metaPixel.test.js` — numeric totals, common ID, browser dedupe, refresh/storage safety, contents, and invalid values.
- `apps/web/test/customerThankYouCheckoutSource.test.js` — paid-only PayMongo browser Purchase and cancelled/failed/expired exclusion.
- `apps/web/test/phase5bAdminOrdersSource.test.js` — admin display uses the persisted total.
- `apps/web/test/reviewsSystemSource.test.js` — customer/admin/import/visibility feature wiring and private-field exclusion.

- `REVIEWS_SYSTEM_IMPLEMENTATION_REPORT.md` — this implementation, verification, deployment, and test report.

## Final Recommendation

Ready for production deployment after applying `20260715_reviews_system.sql`, setting the production secrets, running the two PostgreSQL integration tests against staging, and completing the Meta Test Events procedure above. The implementation does not contain the listed blockers: imports do not mutate product data, the XLSX parser is patched, content is sanitized, private reviewer fields are excluded publicly, verification is order-backed, visibility toggles preserve records, and statistics use Published reviews only.
