# Meta Tracking and Order Email Reliability Report

Audit date: 2026-07-17 (Asia/Manila)

## Overall Status

**Not Ready**

The repository now has a centralized, database-backed Meta event system and a durable, backend-triggered admin email outbox. The automated suites and local browser checks pass. The implementation is not marked ready because the current production site is still serving an older Meta bootstrap, the available environment has no SMTP or Meta CAPI credentials, and no live PayMongo, SMTP, or Meta Test Events transaction could be completed.

The website order database is the order and revenue source of truth. Pancake POS is treated as a downstream synchronization target, not the authority for whether an order exists.

### Architecture inspected

- Frontend: React 18 single-page application built by Vite and served by Nginx.
- Backend: Node.js and Express API.
- Database: PostgreSQL in the deployed/local Docker architecture, with JSON repositories retained for development/test fallbacks.
- Order creation: authoritative backend checkout service for COD and PayMongo pending orders.
- Payment confirmation: verified PayMongo webhook handler.
- Pancake POS: asynchronous export/synchronization after the website order exists.
- Meta browser tracking: one React service, initialized by the external bootstrap and coordinated by the route tracker.
- Meta server tracking: first-party analytics endpoint, durable marketing outbox, dispatch ledger, and Meta Conversions API worker.
- Email provider: Nodemailer SMTP transport.
- Email delivery: PostgreSQL transactional outbox plus background worker and retry state.

## Meta Root Causes

Confirmed causes and reliability gaps found in the project were:

1. Server-side Meta coverage was historically centered on Purchase. Browser PageView and earlier funnel events did not consistently create equivalent CAPI events, explaining why server PageView volume could be hundreds below Pixel volume.
2. Initial PageView had more than one potential owner: the older bootstrap sent an unconditional PageView while the React route tracker also owned SPA navigation tracking. The local implementation now gives all PageViews to the route tracker; the production bootstrap inspected on 2026-07-17 is still the older version and must be replaced by deployment.
3. A legacy static storefront had a second Meta implementation and event helper surface. It has been permanently retired to no-op functions, leaving the React service as the only code path that initializes or dispatches Pixel events.
4. Funnel event IDs and server dispatch state were not all persisted in one generic idempotency ledger. A generic dispatch ledger now covers PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, and Purchase.
5. Browser Purchase protection depended too heavily on component/session behavior. React remounts, refreshes, another tab, or a revisited confirmation URL could not be made authoritative with `useRef`, memory, or storage alone. Browser Purchase now requires an atomic backend claim against the permanent order event identity.
6. Purchase value parsing existed in more than one context. Value normalization is now centralized, rejects non-positive or malformed amounts, converts database centavos exactly once, and always uses `PHP`.
7. PayMongo checkout creation and the return URL were possible points of confusion with payment success. Purchase eligibility now depends only on a verified successful webhook, matching amount/currency, and an atomic transition to paid.
8. Automatic events configured inside Meta Events Manager cannot be inspected or disabled from this repository. The code disables Pixel `autoConfig`, but an account-side URL/button Purchase remains an external duplicate risk until checked in Events Manager.
9. Production is not running the verified local code. The public root contained one Meta bootstrap reference and no visible Google Tag Manager installation, but the fetched production bootstrap still contained its own initial `PageView` call.

No claim is made that every discrepancy visible in Meta Ads Manager is caused by code. Attribution windows, modeled conversions, account-side Event Setup rules, consent, blockers, and reporting time zones must be evaluated separately from the order-to-event reconciliation.

## Pixel Installations Found

| Location | Role before/at audit | Duplicate installation | Fix |
| --- | --- | --- | --- |
| `apps/web/public/meta-bootstrap.js` | Loads the Pixel base script | Production version also sends initial PageView | Local version now initializes once and does not send PageView |
| `apps/web/src/lib/metaPixel.js` | React Pixel and first-party CAPI bridge | Kept as the single active implementation | Centralized init, payloads, IDs, consent, dispatch, and Purchase readiness |
| React route tracker in `apps/web/src/App.jsx` | Initial load and genuine SPA route PageViews | Kept; it is now the only PageView owner | One ID per real navigation; rerenders do not create events |
| `apps/api/public/js/meta-pixel.js` | Legacy static storefront tracking | Yes, it was a second event surface | Permanently retired; contains no `fbq`, Pixel script URL, or network dispatch |
| `apps/api/public/js/meta-pixel-config.js` | Legacy static Pixel configuration | Could activate the legacy path | Pixel ID is intentionally blank and the legacy runtime is no-op |
| Google Tag Manager | No installation found in repository or inspected production root HTML | Not found | No change |
| Meta Event Setup Tool | Account-side configuration | Cannot be inspected from source | Manually remove automatic Purchase rules after deployment |

The base script and `fbq("init", pixelId)` remain only in the centralized React implementation. Route navigation does not reinitialize Pixel.

## Purchase Triggers Found

| Trigger | Browser/server | Eligibility | Status |
| --- | --- | --- | --- |
| COD authoritative order commit | Server | Validated customer/address, inventory, backend totals, committed order, permanent order number | Kept; creates permanent ID and queues CAPI once |
| Verified PayMongo webhook | Server | Valid signature, successful payment, exact amount, PHP, atomic paid transition | Kept; duplicate webhook/event processing is idempotent |
| Thank You confirmation | Browser | Backend-confirmed eligible order, stored ID/value/currency, successful atomic browser claim | Kept; uses stored identity and cannot regenerate it |
| PayMongo checkout-session creation | Server | Pending payment only | Does not send Purchase |
| PayMongo success/return URL | Browser | Navigation is not payment proof | Does not make an order eligible |
| Place Order/payment button click | Browser | Intent only | Does not send Purchase |
| React render/unprotected effect | Browser | Not an eligible trigger | Removed/guarded by backend claim |
| Legacy static checkout/Thank You scripts | Browser | Obsolete second implementation | Purchase calls removed; runtime retired |
| Pancake retry, webhook, or admin order view | Server/browser | Downstream/admin activity | Never sends Purchase |

The browser Purchase switch defaults to disabled until the deployment is checked in Meta Test Events and any account-side automatic Purchase is removed. CAPI remains the server authority for an eligible order.

## Pixel and CAPI Deduplication

- Event-ID strategy: Purchase uses one permanent ID derived from the real order identity, in the form `purchase_<order-number>`. It is created only after the order exists and is stored in the order record.
- Browser property: `eventID`.
- Server property: `event_id`.
- The event name, ID, value, currency, content IDs, quantities, and customer action snapshot are derived from the same stored server payload.
- Database fields: `meta_purchase_event_id`, `meta_purchase_value`, `meta_purchase_currency`, browser claim/sent timestamps, CAPI queued/sent timestamps, status, and sanitized last error.
- Dispatch table: `meta_event_dispatches` records event name, event ID, optional order, browser/server source, value, currency, claim/status, attempts, response ID, sanitized error, and sent time.
- Unique constraints prevent duplicate event-name/event-ID/source dispatches and duplicate order/event/source Purchase dispatches.
- Simultaneous claims cannot both own the same dispatch. Successful dispatches are never retried; retryable failures may be claimed again safely.
- Test result: repository and service tests pass for matching IDs, repeat claims, retryable failure, successful terminal dispatch, webhook replay, and Thank You revisits.
- Live Meta deduplication result: **not verified** because no CAPI token/test code and no authorized real provider transaction were available.

## Event Coverage

| Event | Browser trigger | CAPI trigger | Shared identity and protection |
| --- | --- | --- | --- |
| PageView | Initial valid storefront load and genuine SPA route change | First-party endpoint for the same navigation | One generated ID; duplicate rerenders ignored; bot/private-route filtering |
| ViewContent | Real product view with selected variant | Same first-party action | Same event name/ID/product payload |
| AddToCart | Successful cart addition | Same first-party action | Same ID, value, currency, contents |
| InitiateCheckout | Genuine checkout start | Same first-party action | Same ID and authoritative cart totals |
| AddPaymentInfo | Checkout review becomes valid with selected payment method | Same first-party action | Same ID and checkout payload |
| Purchase | Eligible order confirmation only | COD commit or verified paid PayMongo webhook | Permanent order ID, atomic source ledgers, strict value/PHP |

User data is normalized before hashing and empty values are omitted. When actually collected and permitted, the server payload may include hashed email, phone, first/last name, city, province, postal code, country `ph`, and external customer ID. `fbp`, `fbc`, client IP, and user agent remain unhashed as required. The implementation does not fabricate unavailable matching data and honors consent, Global Privacy Control, and Do Not Track handling.

Local 390 px browser validation produced exactly three PageViews for homepage, shop, and product navigation. All three had unique IDs, and each request carried identical browser `eventId` and server `metaEventId` with `PageView` as the event name. A product-view request was also observed. This confirms application behavior, not Meta provider acceptance.

## Value and Currency

- Final total source: backend-calculated `orders.total_cents` after subtotal, discount, shipping, and valid surcharge calculations.
- Storage unit confirmed: integer centavos.
- Meta conversion: divide by 100 exactly once and round to two decimal places.
- Currency: hard constant and database constraint `PHP`.
- Validation: finite numeric value greater than zero; formatted strings, empty strings, zero, `null`, and invalid amounts are skipped and recorded as validation errors.
- Cross-system rule: order details, Thank You page, CAPI/Pixel payload, PayMongo paid amount, and Pancake export must all originate from the authoritative order totals.
- Test result: valid numeric and formatted input normalization, invalid input rejection, exact centavo conversion, PHP enforcement, and paid-amount mismatch rejection pass.

## COD Purchase Test

Automated result: **Pass**.

The test creates one authoritative COD order, confirms one order and permanent Purchase identity, queues CAPI after successful persistence, keeps Pixel/CAPI ID and PHP value aligned, and prevents duplicate order/event creation with a repeated idempotency key.

Live Meta/Pancake result: **Pending**. A real production order was not created because that would affect inventory, reporting, email recipients, and external systems without deployment/provider authorization.

## PayMongo Purchase Test

Automated result: **Pass**.

A pending order does not send Purchase. A verified successful webhook with the matching amount and currency atomically marks the order paid and queues one CAPI Purchase. Replaying the webhook or receiving another successful event for the already-paid order does not create another Purchase. Browser Purchase can claim only the same stored event identity.

Live PayMongo result: **Pending** because PayMongo credentials and an authorized payment were unavailable.

## Thank You Refresh Test

Automated result: **Pass**.

The page loads the confirmed order and asks the backend for the stored Purchase payload. The backend claim is authoritative. Refresh, remount, another tab, revisiting the URL, or a repeated confirmation response cannot regenerate the ID or reclaim a sent/in-progress browser dispatch. A failed/skipped browser call may be retried because it was not marked sent.

Live browser/Meta result: **Pending** until deployed with Pixel/CAPI credentials and verified in Meta Test Events.

## Actual Order Reconciliation

These figures are a read-only snapshot of the **local project PostgreSQL database**, not the inaccessible production order database. Snapshot range: 2026-06-03 through 2026-07-17 UTC.

- Website orders: 48 non-test orders with positive totals.
- Eligible Purchases: 45.
- COD orders: 48.
- Paid PayMongo orders: 0.
- Unique Meta Purchase IDs: 45.
- Expected Meta count: 45 eligible unique Purchases.
- Browser Purchase sent timestamps: 2.
- CAPI Purchase sent timestamps: 0.
- Correctly matched live provider pairs: not measurable without Meta response data.
- Duplicate permanent event IDs: 0, enforced by a unique database index.
- Missing CAPI sends relative to eligible local orders: 45.
- Actual order revenue / expected Meta value: available in the authenticated reconciliation page; not copied into this report because this local database is not confirmed to be production.

Admin > Analytics > Meta Reconciliation now shows one row per authoritative order, browser/server state, ID match, value/currency checks, Purchase eligibility, Pancake presence, warnings, and date-range totals. It also reports coverage for all six funnel events.

## Email Root Cause

Confirmed causes were:

1. PayMongo pending-order creation did not reliably create the same New Order notification as COD. It now creates exactly one logical `admin_new_order` notification when the pending order is committed; payment confirmation is a separate optional event.
2. Notification initiation was not uniformly coupled to the authoritative backend order transaction. It is now written to the transactional outbox after the authoritative order write in the same database transaction. The worker cannot see or send it until the transaction commits.
3. Available/local SMTP transport and recipient settings are absent. Consequently, delivery cannot occur in this environment.
4. The local order audit found 43 real orders with no New Order notification row and five with terminal failed rows. Those five rows have zero attempts and blank legacy errors, consistent with enqueue/configuration failure rather than a recorded SMTP-provider rejection.
5. Previous status/error visibility was insufficient. Errors are no longer silently swallowed; sanitized errors, attempts, provider acceptance IDs, retry time, and terminal state are persisted and shown in Admin.
6. Browser/Thank You/redirect behavior can no longer determine whether an admin email exists. Closing the customer browser has no effect on the committed backend outbox job.

## Email Provider

- Provider: SMTP through Nodemailer.
- Configuration status in the available environment: **not configured**; SMTP host, credentials, sender, and recipient are absent.
- Sender: configured through secure environment settings; no address or secret is hardcoded in source.
- Recipient: primary and additional recipients are admin-editable, validated settings. The environment recipient is only a migration fallback.
- Domain authentication: not verifiable locally; SPF, DKIM, DMARC, sender-domain alignment, and provider rate limits require provider/DNS access.
- Retry support: yes. Temporary connection, DNS, socket, TLS, timeout, and SMTP 4xx errors are scheduled for retry. Authentication and permanent SMTP 5xx failures become visible terminal failures.
- Secrets: never returned by status APIs or written to the report/logs.

## New Order Notification

- Backend trigger: both COD and PayMongo write the New Order outbox record during the authoritative order transaction after the order and items are safely stored. Processing begins only after commit.
- Queue/outbox: one durable row per order, event, email channel, and recipient.
- Idempotency: unique `(order_number, event_name, channel, recipient)` constraint. Replayed checkout requests and PayMongo webhooks cannot create duplicate New Order emails for the same recipient.
- PayMongo behavior: New Order — Pending Payment is created once at order creation. Optional Payment Confirmed is a separate setting and event created only by the verified paid webhook.
- Provider acceptance: status becomes Sent only after SMTP accepts the message and a provider message ID is recorded.
- Failure behavior: email failure never rolls back or deletes the valid order.
- Email content: subject, order time, customer/contact, complete structured address, payment/order status, product/SKU/variant/size/quantity/unit price, subtotal, discount, shipping, total, Pancake status, and admin order link. No service secrets or internal stack traces are included.
- Test result: automated COD, PayMongo pending/paid, browser-close independence, temporary-provider retry, permanent failure, and duplicate idempotency scenarios pass.

Admin > Settings > Order Notifications now provides enable/disable, primary/additional recipients, optional PayMongo Payment Confirmed email, retry maximum, provider readiness, test email, and a read-only missed-email preview. Admin Order Details shows per-recipient state, sent time, attempts, sanitized error, and retry. Orders can be filtered by notification failed, pending, sent, or not queued.

## Missed Order Audit

Local project database only:

- Orders checked: 48.
- Missing notifications: 43.
- Failed notifications: 5.
- Sent notifications: 0.
- Backfill available: yes, through an admin-only date-range preview and explicit selected-order confirmation.
- Historical messages sent during this audit: 0.
- Historical messages queued during this audit: 0.

The backfill labels messages as delayed, avoids existing sent/pending jobs, records every attempt, and caps each explicit operation at 200 selected orders. It will not automatically email all historical orders.

## Files Changed

Task-scoped implementation files are grouped below. The worktree also contains separate SEO/catalog/Pancake changes from the interrupted broader task; those are not attributed to this reliability fix.

### Database and configuration

- `apps/api/db/schema.sql`
- `apps/api/db/migrations/20260717_meta_purchase_dispatch_ledger.sql`
- `apps/api/db/migrations/20260718_meta_and_order_email_reliability.sql`
- `apps/api/src/config/env.js`
- `apps/api/src/settings/storeSettingsRepository.js`
- `.env.example`
- `apps/api/.env.example`
- `deploy/production.env.example`
- `docker-compose.yml`
- `deploy/docker-compose.production.yml`

### Authoritative order and payment flow

- `apps/api/src/checkout/authoritativeCheckoutService.js`
- `apps/api/src/payments/paymongoPaymentService.js`
- `apps/api/src/payments/paymongoClient.js`
- `apps/api/src/routes/orders.js`
- `apps/api/src/routes/paymongo.js`

### Meta tracking and reconciliation

- `apps/api/src/marketing/metaEvent.js`
- `apps/api/src/marketing/metaPurchaseService.js`
- `apps/api/src/marketing/metaEventDispatchRepository.js`
- `apps/api/src/marketing/metaFunnelEvent.js`
- `apps/api/src/marketing/marketingEventOutboxRepository.js`
- `apps/api/src/analytics/storefrontAnalyticsRepository.js`
- `apps/api/src/analytics/storefrontMetaEventService.js`
- `apps/api/src/analytics/metaOrderReconciliationRepository.js`
- `apps/api/src/analytics/metaOrderReconciliationService.js`
- `apps/api/src/routes/analytics.js`
- `apps/api/src/routes/admin.js`
- `apps/api/public/js/meta-pixel-config.js`
- `apps/api/public/js/meta-pixel.js`
- `apps/web/public/meta-bootstrap.js`
- `apps/web/src/lib/metaPixel.js`
- `apps/web/src/lib/funnelAnalytics.js`
- `apps/web/src/lib/api.js`
- `apps/web/src/App.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/CheckoutReview.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/src/admin/MetaReconciliation.jsx`
- `apps/web/src/admin/AdminLayout.jsx`

### Admin order-email delivery

- `apps/api/src/notifications/adminOrderEmail.js`
- `apps/api/src/notifications/adminOrderEmailNotificationService.js`
- `apps/api/src/notifications/adminOrderNotificationAuditService.js`
- `apps/api/src/notifications/orderNotificationOutboxRepository.js`
- `apps/api/src/notifications/orderNotificationWorker.js`
- `apps/api/src/routes/storeSettings.js`
- `apps/api/src/app.js`
- `apps/web/src/admin/Settings.jsx`
- `apps/web/src/admin/OrderDetail.jsx`
- `apps/web/src/admin/Orders.jsx`
- `apps/web/src/lib/storeSettings.js`

### Reliability tests

- `apps/api/test/adminOrderEmail.test.js`
- `apps/api/test/adminOrderNotificationAudit.test.js`
- `apps/api/test/authoritativeCheckoutService.test.js`
- `apps/api/test/frontendBehavior.test.js`
- `apps/api/test/marketingEventOutbox.test.js`
- `apps/api/test/metaEvent.test.js`
- `apps/api/test/metaEventDispatchRepository.test.js`
- `apps/api/test/metaFunnelEvent.test.js`
- `apps/api/test/metaOrderReconciliation.test.js`
- `apps/api/test/metaPurchaseService.test.js`
- `apps/api/test/paymongoClient.test.js`
- `apps/api/test/paymongoPaymentService.test.js`
- `apps/api/test/storeSettingsRepository.test.js`
- `apps/web/test/metaPixel.test.js`
- `apps/web/test/metaPixelBootstrap.test.js`
- `apps/web/test/metaValueTimingSource.test.js`
- `apps/web/test/metaReconciliationSource.test.js`
- `apps/web/test/metaEmailReliabilityAdminSource.test.js`

## Tests Performed

- Complete API test suite: 556 tests; 554 passed, 0 failed, 2 expected skips.
- Complete web source/unit suite: 245 passed, 0 failed.
- Production web build: passed; 128 modules transformed.
- Legacy Pixel retirement regression: 15 passed, 0 failed.
- Static search: only the centralized React Meta module contains Pixel initialization/dispatch; the legacy runtime contains none.
- Database migration validation: both new reliability migrations are recorded in PostgreSQL in the correct order.
- Local API health: passed.
- Local mobile-width PageView navigation check at 390 × 844: three genuine routes produced three unique, matching browser/server IDs and no rerender duplicate.
- Admin missed-email preview: authenticated read-only preview passed and returned the same 43 missing plus five failed local records.
- No live SMTP message, real PayMongo payment, Pancake production order, or Meta Test Events event was sent during this audit.

## Remaining Issues

1. Deploy the current API/web images and migrations. Production still serves an older Meta bootstrap and therefore does not yet have the verified behavior.
2. Configure production SMTP transport secrets and a verified sender in environment variables, then save at least one validated recipient under Admin > Settings > Order Notifications.
3. Verify SPF, DKIM, DMARC, sender alignment, SMTP rate limits, and provider acceptance with Send Test Email.
4. Configure the production Meta Pixel ID and CAPI access token. Use a Meta test event code during verification and remove it afterward.
5. In Meta Events Manager, remove any automatic Purchase based on button clicks, checkout/Thank You URLs, or confirmation text. Keep normal PageView tracking.
6. Keep browser Purchase disabled until one controlled COD order demonstrates one matching Pixel/CAPI pair and one counted Meta Purchase in Test Events. Then enable it deliberately.
7. Run one controlled COD order through website DB, Pancake sync, Meta Test Events, and SMTP. Verify exact total/PHP, matching event IDs, one New Order email, and refresh/tab safety.
8. Configure PayMongo production/test credentials and run one controlled successful payment plus webhook replay. Verify no Purchase before payment and one Purchase after verified payment.
9. Run a controlled temporary SMTP failure and recovery against the deployed worker. Confirm the valid order remains, state moves to Retrying, and one email is accepted after recovery.
10. Connect to the actual production order database and rerun Admin Meta Reconciliation and missed-email preview. The local counts in this report must not be treated as production totals.
11. Review the backfill preview with an authorized administrator and select only confirmed real orders. No historical email should be queued without that approval.
12. Compare website orders to Pancake only as a downstream sync audit. Missing Pancake rows must not remove website orders from expected Purchase or email counts.

## Final Status

**Not Fixed**

The permanent code paths, database constraints, admin controls, retry mechanisms, reconciliation, and automated tests are implemented and passing. The task cannot truthfully be marked Fixed until the new build is deployed and the required controlled real-order tests prove all of the following against production services:

- one real eligible order produces one counted Meta Purchase;
- Pixel and CAPI use the same event ID and exact final PHP value;
- Thank You refreshes/tabs and PayMongo webhook replay do not create another Purchase;
- key CAPI funnel coverage is accepted by Meta;
- every COD and PayMongo order produces exactly one New Order admin notification;
- closing the customer browser cannot prevent email creation;
- temporary SMTP failure retries and succeeds once; and
- failed notification state is visible and manually retryable in Admin.
