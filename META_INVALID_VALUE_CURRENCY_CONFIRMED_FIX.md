# Meta Invalid Value and Currency Confirmed Fix

## Current Diagnostic

- Dataset: Maria Clara Clothing (`595813035761213`).
- Affected events before fix: 50% as reported at task start.
- Live Actions diagnostic during the 2026-07-18 verification: 38% of sampled Purchase activity.
- Event: Purchase.
- Meta's retained sample contains two historical Conversions API activities and three historical Meta Pixel activities at `https://mariaclaraclothing.com/` with value and currency missing.
- The live production outbox does not contain those malformed CAPI payloads: all 14 saved Purchase events have a JSON number greater than zero and currency `PHP`.
- Meta Diagnostics is a retained sample, not a statement that the current production sender is still malformed. Proof of the current fix is the valid new event in Test Events and the live dispatch database audit below.

## Confirmed Root Cause

The invalid activities came from two historical implementations, not from the Purchase sender currently active in production:

1. **Historical automatic browser Purchase:** before commit `30d5db7`, `apps/web/index.html`, function `startMetaPixel`, and `apps/web/src/lib/metaPixel.js`, function `initializeFacebookMetaPixel`, initialized dataset `595813035761213` without `fbq('set', 'autoConfig', false, pixelId)`. Meta automatic/Event Setup detection could therefore infer a Purchase on the site root. That inferred event had no confirmed order object, so it had no order total, `PHP` currency, or permanent order event ID. This exactly matches Meta's retained Pixel samples at the `/` URL. The production bootstrap and React initializer now both disable `autoConfig`, and Events Manager's **Track events automatically without code** setting is Off.
2. **Historical CAPI zero-coercion sender:** the original CAPI builder introduced in commit `f9e1a3e`, `apps/api/src/marketing/metaEvent.js`, functions `moneyValue` and `buildMetaPurchaseEvent`, used `Number((Number(cents || 0) / 100).toFixed(2))` and always returned a Purchase. A missing `order.totalCents` therefore became `0`, and the transport had no final monetary validator. Commit `b95c61a` replaced that behavior with strict centavo validation and added the transport guard. Meta groups zero/invalid money with missing or formatting problems in this diagnostic.
3. **Residual bypass closed in this task:** `apps/api/src/marketing/marketingEventOutboxRepository.js`, function `insertMetaEventOutbox`, still included `Purchase` in its generic funnel-event whitelist. No current caller was using that generic path for Purchase because `metaFunnelEvent.js` excludes Purchase, but the whitelist was a bypass around the order-linked `insertMetaPurchaseOutbox` validator. Commit `91acdc9` removed Purchase from the generic whitelist, so every server Purchase must now pass the specialized validator and join a persisted order.

There is no active current production call to `fbq('track', 'Purchase')` without a payload. There is no active Purchase value or currency fallback to an empty string.

## Purchase Implementations Found

| File or system | Function/component | Sender | Trigger | Value source | Currency source | Event ID source | Repeat protection | Production status | Decision |
|---|---|---|---|---|---|---|---|---|---|
| `apps/api/src/marketing/metaEvent.js` | `buildMetaPurchaseEvent` | CAPI builder | Called only after order eligibility | Persisted `orders.total_cents`, divided by 100 exactly once | `META_CURRENCY` | Persisted `orders.meta_purchase_event_id`, with `purchase_<orderNumber>` generated after order creation | Validated before queue | Active | Keep |
| `apps/api/src/marketing/metaPurchaseService.js` | `metaPurchaseEligibility`, `queueMetaPurchase` | CAPI orchestrator | Committed COD order or verified paid PayMongo order | Persisted order snapshot | `PHP` constant | Permanent order event ID | Unique outbox/event ID and order/source ledger | Active | Keep |
| `apps/api/src/orders/checkoutService.js` | `persistPostgresCheckout` | CAPI/COD trigger | Inside the same database transaction, after stock, order, items, and cart conversion are committed | Backend-calculated saved order | Saved `PHP` | Saved permanent event ID | Checkout idempotency plus unique outbox | Active | Keep |
| `apps/api/src/payments/paymongoPaymentService.js` | `applyPaidWebhookEvent` | CAPI/PayMongo trigger | Signed `checkout_session.payment.paid` webhook only, after exact amount/currency match and atomic paid update | `orders.total_cents`; checked against webhook `amountCents` | Both order and webhook must be `PHP` | Saved permanent event ID | Unique provider event plus already-paid check plus unique outbox | Active | Keep |
| `apps/api/src/marketing/marketingEventOutboxRepository.js` | `insertMetaPurchaseOutbox` | CAPI durable queue | Valid Purchase event and matching order row | Validated immutable event snapshot | Validated exact `PHP` | Validated non-empty event ID | Unique event ID and unique order/event/source constraints | Active | Keep |
| `apps/api/src/marketing/metaConversionsWorker.js` | worker send loop | CAPI transport | Claims one due outbox row | Immutable outbox payload | Immutable outbox payload | Immutable outbox payload | Atomic claim, retry state, sent state | Active | Keep |
| `apps/api/src/marketing/metaConversionsApi.js` | `sendMetaConversionsEvent` | CAPI network boundary | Worker or controlled Test Events verification | Must be a finite JSON number greater than zero | Must be exactly `PHP` | Purchase validator requires it | Refuses malformed requests before network I/O | Active | Keep |
| `apps/web/src/pages/ThankYou.jsx` | confirmation effect | Browser orchestration | Confirmed private backend order, eligible server-backed claim | Immutable CAPI outbox snapshot returned by backend | Immutable snapshot `PHP` | Immutable snapshot event ID | Backend dispatch claim/ledger; effect cancellation; completion endpoint | Code active; browser Purchase feature flag Off | Keep disabled |
| `apps/web/src/lib/metaPixel.js` | `trackFacebookPurchasePayload` | Browser Pixel | Only after the Thank You backend claim | Immutable server snapshot numeric value | Shared `META_CURRENCY` / snapshot `PHP` | Snapshot `eventId` passed as Pixel `eventID` | Backend ledger plus in-memory/local storage defense | Code active; production dispatch Off | Keep disabled until a new browser/server Test Events dedup check |
| `apps/web/public/meta-bootstrap.js` | `bootstrapMariaClaraMetaPixel` | Pixel installation | Customer page bootstrap | Not a Purchase sender | Not a Purchase sender | Not a Purchase sender | Existing `fbq`/pixel sentinel; `autoConfig=false` | Active once | Keep |
| `apps/api/src/marketing/metaFunnelEvent.js` and `storefrontMetaEventService.js` | generic funnel builder/queue | Browser-correlated CAPI funnel events | PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo only | Strict event-specific values | `PHP` | Browser event ID | Event ID uniqueness | Active, cannot build Purchase | Keep |
| `apps/api/src/marketing/marketingEventOutboxRepository.js` | `insertMetaEventOutbox` | Generic CAPI queue | Funnel events only | Strict numeric value | `PHP` | Funnel ID | Event ID uniqueness | Active; Purchase removed from whitelist in `91acdc9` | Fixed |
| Historical `apps/web/index.html` | `startMetaPixel` | Meta automatic browser event | Pixel initialized without `autoConfig=false` | None for inferred Purchase | None for inferred Purchase | Meta-generated | None controlled by application | Removed | Remove |
| Historical `apps/api/public/js/meta-pixel.js` | `trackMetaPixelPurchase` | Legacy browser Pixel | Legacy Thank You render | Order/session object | Local constant | Locally constructed | Local storage only | Static storefront retired and not served | Remove |
| Historical `apps/api/public/js/thank-you.js` | `trackThankYouPurchase` | Legacy browser trigger | Thank You page load | Query/session order object | Legacy Pixel helper | Legacy Pixel helper | Local storage only | Static storefront retired and tested as retired | Remove |
| Meta Events Manager automatic events | Account-side rule | Automatic browser event | Meta URL/event inference | No confirmed order | No confirmed order | Meta-generated | Outside application ledger | Off | Removed |

Repository searches also covered direct `fbq` calls, `Purchase`, `eventID`, `event_id`, `custom_data`, Thank You/confirmation code, COD, PayMongo, webhooks, React effects, HTML, the legacy static storefront, Meta Graph calls, `dataLayer`, GTM identifiers, and analytics packages. No Google Tag Manager container, third-party Purchase package, second production Pixel ID, or active parameterless Purchase sender was found.

## Invalid Implementation Removed or Fixed

- File: `apps/api/src/marketing/marketingEventOutboxRepository.js`
- Function: `insertMetaEventOutbox`
- Old behavior: the generic funnel outbox accepted the event name `Purchase`; this could bypass the specialized Purchase/order validator if a future or accidental caller supplied it.
- New behavior: the generic whitelist contains only `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, and `AddPaymentInfo`. A Purchase returns `null` before any SQL call. Only `insertMetaPurchaseOutbox` can queue Purchase.

Historical invalid senders were already removed from the live build: the inline initializer now disables `autoConfig`, the legacy static Thank You/Pixel implementation is retired, strict money normalization replaced zero coercion, and the final CAPI transport refuses bad money.

## Price Storage

- Product database field: `product_variants.price_cents` (integer).
- Order database fields: `orders.subtotal_cents`, `orders.discount_total_cents`, `orders.shipping_fee_cents`, and `orders.total_cents` (integers).
- Order item database field: `order_items.unit_price_cents` (integer).
- Stored in pesos or centavos: **centavos**.
- Persisted currency: `orders.currency`, `NOT NULL DEFAULT 'PHP'`, checked to equal `PHP`.
- Conversion used: `centavosToMetaPesos(cents)`, which requires a positive integer and returns `Number((cents / 100).toFixed(2))` through the centralized normalizer.
- Example: `64900` stored centavos becomes the JavaScript/JSON number `649`. The code does not divide an already-peso value again.

## Browser Pixel Payload

- Production browser Purchase state: intentionally disabled (`META_BROWSER_PURCHASE_ENABLED=false` and public `browserPurchaseEnabled=false`). PageView, ViewContent, AddToCart, InitiateCheckout, and AddPaymentInfo remain enabled.
- Canonical value for a `64900`-cent confirmed order: `649`.
- JavaScript type: `number`.
- Currency: `PHP`.
- eventID: the exact stored `order.metaPurchaseEventId`, e.g. `purchase_MCC-...`.
- Call shape when re-enabled after a fresh dedup test: `fbq('track', 'Purchase', payload, { eventID })`.
- No current production browser Purchase was sent during this task. This is deliberate: a valid server-only Purchase is safer than pairing valid CAPI with an unverified browser path while historical automatic-event diagnostics remain.

## CAPI Payload

- Controlled post-deploy Test Events event: `purchase_META-POSTDEPLOY-1784337367902-649`.
- `custom_data.value`: `649`.
- JSON type: `number` (also confirmed as JavaScript `typeof value === 'number'` before send).
- `custom_data.currency`: `PHP`.
- `event_id`: `purchase_META-POSTDEPLOY-1784337367902-649`.
- Meta response: HTTP 200, `events_received=1`, trace ID returned.
- Meta Test Events result: Purchase, Processed, Server, Manual Setup; expanded parameters show `value: 649`, `currency: PHP`, and the event ID.
- A second controlled event `purchase_META-TEST-1784336005173-1298` is Processed and expanded in Meta with `value: 1298` and `currency: PHP`.
- Production `META_CONVERSIONS_API_TEST_EVENT_CODE` remains empty. No test code is enabled for normal traffic.

## Deduplication

- Pixel eventID source: `orders.meta_purchase_event_id` via the immutable server outbox snapshot.
- CAPI event_id source: the same `orders.meta_purchase_event_id`.
- Required format: `purchase_<orderNumber>`.
- Match: production database audit found **0 browser/server mismatches** across 10 historical browser/server pairs.
- Duplicate order/source groups: **0**.
- CAPI outbox: 14 Purchase rows, 14 sent, maximum attempt count 1, 14 provider trace IDs.
- Current production mode: server-only; therefore a new browser/server pair was not created and no new Meta deduplication result is claimed.
- Meta result: the controlled 649 and 1298 server events are Processed. Historical application ledger pairs have exact event ID/value/currency equality.

## COD Test

- Production evidence order: `MCC-1784331648519-ACCA`.
- Payment/status: Cash on Delivery / received.
- Final database total: `129800` centavos = `1298` pesos.
- Stored Meta value: `1298.00` numeric.
- Pixel value: not sent because browser Purchase is disabled.
- CAPI value: `1298` numeric.
- Currency: `PHP`.
- Event ID: `purchase_MCC-1784331648519-ACCA`.
- CAPI result: sent once with a provider trace; outbox maximum attempt count is one.
- Final expected count: one server Purchase.
- Refresh result: no browser Purchase; the server-backed claim returns `browser_purchase_disabled`, and the existing CAPI outbox/event ID is unique.
- Automated COD regression: a claim completes once and a refresh is blocked; this passed in `metaPurchaseService.test.js`.

## PayMongo Test

- Production PayMongo state during verification: six historical orders; four historical paid orders are cancelled legacy tracking-version-1 orders and correctly have no CAPI Purchase. One current tracking-version-2 order is explicitly a cancelled test order. No eligible live paid PayMongo order existed during this verification.
- Paid amount rule: webhook `amountCents` must be an integer exactly equal to saved `orders.total_cents` and currency must be `PHP`.
- Pixel value: not sent while pending and browser Purchase is disabled.
- CAPI value: constructed from the persisted order only after the verified paid webhook and exact amount match.
- Currency: `PHP`.
- Webhook retry result: duplicate provider event ID returns `duplicate`; an already-paid order cannot enqueue a second Purchase.
- Final expected count: zero while pending/failed/cancelled; one after the first eligible verified paid webhook.
- Verification: production-equivalent automated tests passed for pending, failed, cancelled, amount mismatch, first valid paid webhook, and duplicate webhook replay. No real payment was fabricated or charged solely to create an advertising test event.

## Pixel Installation Audit

- Number of active installations: one dataset/pixel, `595813035761213`.
- Bootstrap: `/meta-bootstrap.js?v=20260718` loads once before the React bundle.
- `fbq('init', PIXEL_ID)`: effective execution once; the runtime pixel sentinel prevents React from reinitializing the same ID.
- Automatic Purchase rules: **Track events automatically without code is Off** in Events Manager.
- Browser auto configuration: `fbq('set', 'autoConfig', false, pixelId)` appears before init in the live bootstrap and React fallback initializer.
- Duplicate code removed: the static storefront Pixel/Thank You implementation is retired and is not in the live web bundle.
- No GTM container or second test/production Pixel ID was found.

## Admin Diagnostics

The admin-only Order Details Meta section shows Purchase event ID, final Purchase value, currency, browser/server sent status and timestamps, deduplication state, and last Meta error. The admin Meta Reconciliation screen additionally computes eligibility, actual order total, browser/server IDs and match status, expected counted Purchases, duplicate/missing/unexpected events, value/currency mismatches, and dispatch errors from the durable ledger. These fields are not exposed on the public order lookup.

## Automated Verification

- API: 558 discovered; 556 passed, 0 failed, 2 skipped because optional external PostgreSQL test URLs were not configured.
- Web: 246 passed, 0 failed.
- Dedicated browser Pixel tests: 22 passed, 0 failed.
- Focused Meta/COD/PayMongo/CAPI tests: 50 passed, 0 failed.
- Production Vite build: 128 modules transformed; build completed successfully.
- Invalid value coverage includes `""`, `null`, `undefined`, `0`, `"₱0"`, `"invalid"`, formatted strings, non-PHP currency, missing event ID, malformed item quantity, and malformed item price.
- Exact money coverage includes `64900 -> 649` and `129800 -> 1298`, both as numbers with `PHP`.
- A new regression test proves the generic funnel outbox cannot enqueue Purchase even when given an otherwise valid-looking `649`/`PHP` payload.

## Production Verification

- Backup completed before release: `20260718T010716Z`.
- Deployed commit: `91acdc934602a21c317b1f7665554f3fdcf687b8`.
- API container: healthy after release.
- Public health endpoint: `{"ok":true,"service":"maria-clara-clothing"}`.
- Live storefront settings: Pixel enabled, dataset `595813035761213`, browser Purchase disabled.
- Live CAPI environment: enabled, currency `PHP`, browser Purchase disabled, test event code empty.
- Live Purchase outbox: 14 sent, 0 non-numeric values, 0 non-PHP currencies, maximum one attempt, all 14 traced.
- Live dispatch ledger: 10 browser sent and 14 server sent; 0 invalid values, 0 invalid currencies, 0 duplicate order/source groups, 0 browser/server mismatches.
- Live bootstrap: `autoConfig=false`; no Purchase call in bootstrap.
- Meta Test Events after deployment: the new 649 Purchase was Processed and displays the correct value, currency, and event ID.

## Historical Events

No successful historical Purchase was resent. The controlled Meta Test Events requests used new test-only event IDs and did not create order rows. Historical CAPI outbox rows remained unchanged. Legacy tracking-version-1 orders remain locked, and retries are limited to failed or never-sent durable outbox records with their original event IDs.

## Files Changed

- `apps/api/src/marketing/marketingEventOutboxRepository.js`
- `apps/api/test/marketingEventOutbox.test.js`
- `apps/api/test/metaEvent.test.js`
- `apps/web/test/metaPixel.test.js`
- `META_INVALID_VALUE_CURRENCY_CONFIRMED_FIX.md`

The existing local edits in `apps/api/data/cart-sessions.json` and `apps/api/data/discounts.json` were preserved and were not committed or deployed as part of this fix.

## Remaining Issues

1. Meta's Actions page still shows 38% affected because it retains historical bad samples. New controlled events are valid; the diagnostic must age out as Meta collects new activity.
2. Browser Purchase remains intentionally disabled. A fresh Pixel/CAPI Test Events pair and Meta-side dedup result must be completed before changing `META_BROWSER_PURCHASE_ENABLED` to true. The current server-only mode is accurate and safe for ads.
3. There was no eligible live PayMongo payment after tracking version 2 during the verification window. The full webhook and replay path is covered by passing automated tests, but an actual paid-order Meta result should be observed when the next legitimate PayMongo payment occurs. No customer payment or fake production conversion was created for testing.

## Final Status

**Fixed — production Purchase measurement is now authoritative server-only.**

Every active production CAPI Purchase has a numeric value greater than zero, exact `PHP` currency, one permanent event ID, one outbox send, and a Meta provider trace. Automatic/parameterless Pixel Purchase is off, browser Purchase is gated off, the remaining generic queue bypass is closed, and Meta Test Events processed fresh `649` and `1298` numeric PHP payloads. Browser Purchase must stay disabled until a future controlled browser/server dedup test passes; this does not disable the rest of the Meta Pixel or the authoritative CAPI Purchase stream.
