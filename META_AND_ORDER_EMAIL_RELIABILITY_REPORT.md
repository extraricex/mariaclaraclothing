# Meta Tracking and Order Email Reliability Report

Audit date: 2026-07-18 (Asia/Manila)

## Overall Status

**Not Ready**

The application-side tracking and order-email reliability changes are deployed and healthy in production at revision `3b8b8b1`. SMTP delivery, COD order creation, PayMongo pending-order creation, idempotency, Pancake synchronization, PageView Pixel/CAPI pairing, backend email creation, retry state, and Thank You refresh protection were exercised against production.

The task is not marked fully ready for two external reasons:

1. Live browser captures prove that Meta is still delivering account-side Event Setup rules (`ViewContent` and `PageView`) that are not present in this repository. The CAPI token is send-only and no authenticated Meta Events Manager session was available to remove or inspect those rules.
2. Production PayMongo uses live credentials. A successful-payment webhook test cannot be completed safely without an authorized payment instrument. Pending-payment behavior is production-verified; paid/replay behavior is automated-test verified.

The website PostgreSQL order database is the source of truth. Pancake POS is a downstream synchronization target and Meta is a downstream reporting destination.

### Architecture

- Frontend: React 18 SPA built by Vite and served by Nginx.
- Backend: Node.js and Express.
- Database: PostgreSQL; JSON repositories remain only as development/test fallbacks.
- COD flow: authoritative backend checkout transaction.
- PayMongo flow: pending order and hosted checkout session, followed by a verified webhook for payment success.
- Pancake: live export plus durable inbound/outbound synchronization.
- Meta Pixel: centralized React service and one external bootstrap.
- Meta CAPI: first-party analytics endpoint, durable outbox, dispatch ledger, and worker.
- Email: Nodemailer SMTP with a PostgreSQL transactional outbox and retry worker.
- Production: Cloudflare to Caddy to Docker Compose on Hostinger.

### Deployment and recovery evidence

- Production migrations applied:
  - `20260717_meta_purchase_dispatch_ledger.sql`
  - `20260718_meta_and_order_email_reliability.sql`
- Production health endpoint: healthy after every deployment.
- Pre-deployment backup: `/var/backups/mariaclara/manual-20260717T170026Z`.
- Off-host verified copy: `production-backups/manual-20260717T170026Z` in the project parent workspace; checksum verification passed.
- Production configuration backup before removing Meta Test Events mode: `/var/backups/mariaclara/config-20260717T182446Z`.

## Meta Root Causes

Confirmed causes were:

1. CAPI historically covered far fewer funnel events than Pixel. The durable server bridge now covers PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, and Purchase.
2. The old bootstrap and React route tracker could both own initial PageView. React is now the only PageView owner.
3. The public unversioned Meta bootstrap was stale in Cloudflare. HTML now references a versioned bootstrap and Nginx serves it with `no-store`/`no-cache`; the deployed bootstrap initializes Pixel but does not send PageView.
4. ViewContent originally omitted `num_items`, causing correct server validation to reject the CAPI copy. The payload now includes one item.
5. InitiateCheckout and AddPaymentInfo sanitized only part of their IDs, causing Pixel/server mismatches. Both channels now use one normalized ID.
6. Quote refreshes could create duplicate AddPaymentInfo identities. The ID is now stable for the cart and selected payment method.
7. Purchase ownership was scattered across browser lifecycle points. Purchase is now tied to an immutable order identity and atomic database dispatch state.
8. Pending PayMongo sessions and success URLs were ambiguous. Only a verified successful webhook with the exact order amount can make a PayMongo order Purchase-eligible.
9. Value parsing was duplicated. One normalizer now rejects malformed/non-positive values and converts committed centavos to numeric pesos exactly once.
10. Meta account-side Event Setup rules remain active. `autoConfig=false` does not disable rules already delivered by the account.

Historical ads attribution, modeled conversions, attribution windows, and account reporting time zones are not inferred from repository data.

## Pixel Installations Found

| Location | Result | Fix |
| --- | --- | --- |
| `apps/web/public/meta-bootstrap.js` | Only active base-script loader | Initializes once; no initial PageView; `autoConfig=false` |
| `apps/web/src/lib/metaPixel.js` | Central browser tracking service | Kept as the sole application event dispatcher |
| `apps/web/src/App.jsx` | Initial and SPA route PageView owner | One event per genuine route, no rerender event |
| `apps/api/public/js/meta-pixel.js` | Legacy second tracking surface | Permanently retired/no-op |
| Google Tag Manager | Not found in source or production root | No change |
| Meta Event Setup Tool | Account-side rules observed in browser traffic | Requires Events Manager access |

Production browser captures showed extra `ViewContent`/`PageView` traffic with account-rule identities even on pages where application code did not request those events. No automatic Purchase appeared during the cancelled-order Thank You probe, but button/URL rules cannot be ruled out without Events Manager access.

## Purchase Triggers Found

| Trigger | Channel | Status |
| --- | --- | --- |
| Committed COD order | Server CAPI | Kept; exactly one permanent event identity |
| Verified successful PayMongo webhook | Server CAPI | Kept; exact amount and atomic paid transition required |
| Confirmed Thank You page | Browser Pixel | Backend-claimed only; currently disabled as a production safety boundary |
| Checkout session creation | Either | Never Purchase |
| PayMongo return/success URL | Browser | Never payment proof |
| Place Order/payment button | Browser | Never Purchase |
| React render/remount/refresh | Browser | Cannot generate or reclaim a permanent Purchase identity |
| Pancake retry, admin view, webhook replay | Server/browser | Never creates another Purchase |

Browser Purchase remains disabled until account-side automatic Purchase rules are removed and a controlled Events Manager test proves deduplication. Server CAPI is authoritative in the interim.

## Pixel and CAPI Deduplication

- Purchase ID: `purchase_<order-number>`.
- Pixel property: `eventID`.
- CAPI property: `event_id`.
- The exact value is persisted in `orders.meta_purchase_event_id` and never regenerated.
- The same immutable payload supplies event name, value, currency, contents, and quantities.
- `meta_event_dispatches` records browser/server source, status, attempts, provider response, and sanitized errors.
- Unique constraints prevent duplicate `(event_name, event_id, source)` and duplicate order/Purchase/source rows.
- Successful server dispatches are terminal and are never retried.
- Browser claims are atomic and confirmation-token protected.

Production PageView test: one genuine mobile-width navigation produced the same event ID in the browser Pixel transport, first-party request, browser ledger row, server ledger row, and accepted CAPI response. Both rows were sent on the first attempt. Meta Test Events mode was then removed; CAPI remained enabled and provider acceptance continued.

A preliminary direct CAPI PageView validation request created one validation-only server event. The definitive result above came from a genuine browser navigation with an observed matching Pixel transport.

## Event Coverage

At the production reconciliation snapshot, durable sent rows were balanced for the application-controlled funnel:

| Event | Browser sent | Server sent | Result |
| --- | ---: | ---: | --- |
| PageView | 67 | 67 | Paired |
| ViewContent | 9 | 9 | Paired |
| AddToCart | 4 | 4 | Paired |
| InitiateCheckout | 2 | 2 | Paired |
| AddPaymentInfo | 2 | 2 | Paired |

Purchase historical totals differ by source because browser Purchase is intentionally disabled now and historical rows predate the current ledger. Current production validation confirmed one CAPI-only COD Purchase and zero Purchase for the pending PayMongo order.

User data is normalized before hashing. Empty values are omitted, expected unhashed fields (`fbp`, `fbc`, IP, user agent) remain unhashed, and missing data is never fabricated. Consent, Global Privacy Control, Do Not Track, private-route, admin-route, and bot filters remain active.

## Value and Currency

- Authoritative value: `orders.total_cents` after subtotal, discount, shipping, and valid surcharge.
- Storage: integer centavos.
- Meta conversion: centavos divided by 100 once, numeric, two-decimal maximum.
- Currency: `PHP`, enforced by constants and database constraints.
- Invalid values are skipped and stored as validation errors rather than dispatched.

Final production reconciliation found:

- eligible website Purchase value: 609,200 centavos (PHP 6,092.00);
- Meta Purchase value: 609,200 centavos;
- website/Meta value mismatches: 0;
- currency issues: 0.

Three Pancake orders had stale shipping/COD values. The existing scoped financial reconciliation service repaired only those records and re-read the provider. All three now match the authoritative website totals with zero remaining differences.

## COD Purchase Test

Production result: **Pass for application/CAPI/email behavior**.

Controlled order: `MCC-1784311191757-F068`.

- One website order after idempotency replay.
- Permanent Purchase ID stored once.
- Value PHP 769.00 and currency `PHP`.
- One CAPI Purchase, one provider response, no browser Purchase.
- One admin New Order email, accepted on attempt 1.
- One Pancake order/link.
- Customer browser closed before Thank You; email and CAPI still completed.
- Repeated Thank You refreshes and another tab created zero Purchase claims.
- Order was cancelled and marked test afterward.
- Stock restocked once; net inventory movement is zero.
- Pancake accepted the cancellation.

The test also exposed and fixed a Pancake inbound-mapping bug that could regress a locally cancelled COD confirmation to `pending`. A fresh provider read now preserves `cancelled`.

## PayMongo Purchase Test

Production pending-order result: **Pass**.

Controlled order: `MCC-1784312356413-39C6`.

- Live PayMongo configuration detected without exposing keys.
- One pending order and one hosted checkout session.
- Same order returned by checkout idempotency replay.
- One New Order — Pending Payment email, accepted on attempt 1.
- Zero browser and server Purchase dispatches before payment.
- One Pancake order/link.
- The checkout was not paid.
- Order was cancelled and marked test.
- Provider reservation released, stock restored once, net inventory movement zero, and Pancake cancellation succeeded.

Automated paid-webhook result: **Pass**. Verified payment marks paid atomically, queues one Purchase, rejects mismatched amounts/currency, and duplicate webhook replay does not create a second Purchase.

Live paid-webhook result: **Pending** because production keys are live and no authorized payment instrument was supplied.

## Thank You Refresh Test

Production result: **Pass** with browser Purchase disabled.

- Initial confirmation, three refreshes, and a second tab created zero browser Purchase claims.
- A separate cancelled-order confirmation probe rendered the real Thank You UI for eight seconds and produced zero Purchase claims and zero Pixel Purchase events.
- Temporary confirmation credentials used for both probes were invalidated immediately afterward.
- Application PageView/other events continued normally.

Automated browser-claim tests also prove that refresh, remount, another tab, webhook replay, and confirmation revisits cannot regenerate or resend a successful Purchase identity.

## Actual Order Reconciliation

Production snapshot: 2026-07-10 through 2026-07-18, Asia/Manila.

- Website orders: 74 total, including 2 controlled test orders; 72 non-test orders.
- Current strict eligible Purchases: 7.
- Legacy/imported tracking-version-1 rows intentionally locked from new Purchase dispatch: 61.
- Delivery-incomplete ineligible rows: 4.
- Test rows: 2.
- Unique eligible Purchase event IDs: 7.
- Expected Meta Purchase count: 7.
- Missing eligible events: 0.
- Duplicate event IDs: 0.
- Event-ID mismatches: 0.
- Website/Meta value mismatches: 0.
- Currency issues: 0.
- Unexpected historical/ineligible Purchase sends: 6: five pre-fix cancelled/incomplete records plus the controlled COD test.
- Missing Pancake links among eligible Purchases: 0.
- Live Pancake financial mismatches after repair: 0.

One historical, non-eligible native Pancake link (`PNK-583733454924974035`) returns a safe provider HTTP error on direct detail lookup. It remains recorded rather than silently deleted. The last full live provider pass was therefore partial (69 of 70 linked detail reads); the preceding pass was complete.

Raw Meta Events Manager rows, ads-attributed Purchases, and account-rule configuration remain unavailable without Meta dashboard/export permissions. The report does not pretend those are derivable from the local ledger.

## Email Root Cause

Confirmed causes were:

1. Earlier orders did not always create an admin notification record.
2. PayMongo pending orders did not uniformly receive the same backend-owned New Order event as COD.
3. Delivery state was insufficiently durable/visible when provider work failed.
4. Browser lifecycle and redirects could influence older notification triggers.

Permanent behavior now is:

- order and New Order outbox job are written in the authoritative backend transaction;
- the worker cannot send before commit;
- closing the browser cannot prevent the job;
- email failure never rolls back or deletes an order;
- provider acceptance ID, attempts, retry time, and sanitized error are persisted;
- unique `(order_number, event_name, channel, recipient)` prevents duplicates;
- pending PayMongo creates one New Order email; optional Payment Confirmed is a separate event.

## Email Provider

- Provider: SMTP via Nodemailer.
- Production configuration: configured and healthy.
- Recipient settings: persisted in Admin using the existing validated production recipient; no address is hardcoded in source.
- Send Test Email: provider accepted and returned a message ID.
- Controlled COD email: accepted on attempt 1.
- Controlled PayMongo pending email: accepted on attempt 1.
- Secrets and recipient addresses were not printed or logged in this report.
- SPF, DKIM, DMARC, sender alignment, and inbox placement were not independently verifiable without DNS/provider-console access.

## New Order Notification

- Backend trigger: authoritative order commit for COD and PayMongo pending orders.
- Queue: PostgreSQL `order_notification_outbox`.
- Sent state: only after SMTP acceptance.
- Idempotency: one logical New Order job per order/event/channel/recipient.
- Admin visibility: per-recipient status, attempts, sent time, sanitized error, and retry action.
- Filters: failed, pending, sent, and not queued.
- Settings: enable/disable, primary/additional recipients, optional PayMongo confirmation, retry limit, provider status, and test email.

Production rollback-only failure simulation:

- attempt 1: simulated timeout became `retrying` with `SMTP connection failed.`;
- attempt 2 after recovery: became `sent`, provider acceptance recorded, error cleared;
- persistent synthetic rows: 0;
- live SMTP configuration and real notifications were not altered.

## Missed Order Audit

Production preview range: 2026-07-01 through 2026-07-18, Asia/Manila.

- Orders checked: 72 non-test orders.
- Missing New Order notification records: 61.
- Failed notification records: 0.
- Missing by payment method: 56 COD, 5 PayMongo.
- Candidate statuses include 32 cancelled, 23 delivered, 3 returned, 2 shipped, and 1 received; one PayMongo candidate is expired.
- Historical emails queued during this audit: 0.

The Admin preview exposes the exact selectable rows. Backfill requires explicit selection and confirmation, labels messages as delayed, and will not duplicate an existing sent/active job. Bulk sending was intentionally not performed because the preview contains cancelled and expired orders that require owner review.

## Files Changed

Key task-scoped files include:

### Database/configuration

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

### Order, payment, and Pancake flow

- `apps/api/src/checkout/authoritativeCheckoutService.js`
- `apps/api/src/payments/paymongoPaymentService.js`
- `apps/api/src/payments/paymongoClient.js`
- `apps/api/src/routes/orders.js`
- `apps/api/src/routes/paymongo.js`
- `apps/api/src/routes/admin.js`
- `apps/api/src/integrations/pancake/pancakeOrderSyncService.js`
- `apps/api/test/pancakeOrderSyncService.test.js`

### Meta tracking/reconciliation

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
- `apps/api/public/js/meta-pixel-config.js`
- `apps/api/public/js/meta-pixel.js`
- `apps/web/index.html`
- `apps/web/nginx.conf`
- `apps/web/public/meta-bootstrap.js`
- `apps/web/src/lib/metaPixel.js`
- `apps/web/src/lib/funnelAnalytics.js`
- `apps/web/src/App.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/CheckoutReview.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/src/admin/MetaReconciliation.jsx`

### Email delivery/Admin

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

The corresponding API and web regression tests were also added or updated for each behavior.

## Tests Performed

- Complete API suite: 557 tests; 555 passed, 0 failed, 2 expected PostgreSQL integration skips because `TEST_POSTGRES_URL` is not set locally.
- Complete web suite: 246 passed, 0 failed.
- Production web build: passed; 128 modules transformed.
- Production API health: passed.
- Production migrations: passed.
- Production SMTP test: accepted.
- Production COD create/replay/email/CAPI/Pancake/cancel/restock: passed.
- Production PayMongo pending create/replay/email/no-Purchase/cancel/release/restock: passed.
- Production temporary email failure/recovery simulation: passed and rolled back.
- Production PageView Pixel/CAPI ID match and provider acceptance: passed.
- Production funnel ViewContent/AddToCart/InitiateCheckout/AddPaymentInfo browser/server pairing: passed.
- Production Thank You refresh/tab/cancelled-confirmation probe: passed with zero Purchase.
- Production financial reconciliation and three scoped Pancake repairs: passed.
- Production missed-email preview: passed; no historical jobs queued.

## Remaining Issues

1. Sign in to Meta Events Manager and remove automatic Event Setup rules for Purchase, checkout/Place Order buttons, Thank You URLs/text, and the observed unwanted `ViewContent` rules. Keep the normal application PageView.
2. With an authorized payment instrument, run one low-value live PayMongo payment, verify the signed webhook, replay the webhook, then refund/cancel according to the business process. Confirm one Purchase and no duplicate.
3. After account rules are removed, temporarily use Meta Test Events to verify one controlled COD Pixel/CAPI Purchase pair, then remove the test code and deliberately enable browser Purchase.
4. Review the 61-row delayed-email preview in Admin and explicitly select only orders that should notify the owner. Do not bulk-send cancelled/expired rows.
5. Review the one stale native Pancake link that returns a provider HTTP error; do not delete it without confirming its provider state.
6. Verify SMTP sender-domain authentication and inbox placement in the email/DNS provider consoles.
7. Monitor Meta reconciliation and notification failures daily for 7–14 days after the account-side changes.

## Final Status

**Not Fixed**

The deployed application now produces durable, idempotent Meta events and backend-owned admin emails, and every safe production test passed. It cannot truthfully be marked fully fixed until Meta account-side automatic rules are removed and a live paid PayMongo webhook/replay test is completed with an authorized payment method.
