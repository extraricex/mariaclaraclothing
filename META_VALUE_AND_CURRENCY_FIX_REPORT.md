# Meta Value and Currency Fix Report

Report date: 2026-07-17

Store: `https://mariaclaraclothing.com`
Dataset / Pixel ID: `595813035761213`

## Root Cause

The 30% diagnostic came from an uncontrolled browser Purchase path, not the current server Conversions API outbox.

The production HTML initialized the Meta base Pixel without disabling automatic event configuration. That allowed a point-and-click Event Setup Tool rule or Meta automatic button detection to infer `Purchase` from a checkout/confirmation interaction without an authoritative order payload. Such an automatic event has no backend order total, PHP constant, or permanent order event ID, so it can arrive with empty `value` and `currency` and can double-count the manually tracked Purchase.

The audit also found a historical value defect in retired browser code: a cents helper used `Number(cents || 0)`, and an old static Thank You guard allowed an order number with a missing total. That combination could send zero instead of refusing the event. Those Purchase calls are no longer active.

Evidence excluding the current CAPI path:

- all seven production `marketing_event_outbox` Purchase rows store JSON-number values and `currency: "PHP"`;
- every row was accepted once (`attempt_count = 1`);
- recent browser-claim and CAPI logs show the same event ID, numeric value, and `PHP` for each order;
- repository and Git-history searches found no manual Purchase implementation that assigned an empty currency;
- the live HTML still had automatic event configuration enabled before this release.

Meta documents that a dataset can receive events from manual code, the point-and-click Event Setup Tool, and partner integrations. The dataset ID is the Pixel ID, so these sources can be mixed in one diagnostic: [Set up and install the Meta Pixel](https://www.facebook.com/help/messenger-app/952192354843755).

## Exact Affected Integration

- Browser Pixel: **Affected historical/automatic path.** The manual React Purchase payload was already numeric/PHP; automatic Pixel configuration was the path capable of empty fields.
- Conversions API: **Not the source in inspected production records.** Seven of seven persisted CAPI Purchases contain numeric values and `PHP`.
- COD: The automatic browser rule could run during COD checkout/confirmation. The controlled manual COD browser/server path was valid.
- PayMongo: No malformed production CAPI row was found. The manual server path remains paid-webhook-only; an automatic browser rule could still infer Purchase from the success interaction until disabled.
- Thank You page: The current manual call is server-claimed and guarded. Automatic button/URL tracking was not guarded by the order database and was disabled.
- Other: No GTM, Shopify tracking integration, Conversions API Gateway, or second manual Pixel was found in the project. Account-side Event Setup Tool and partner settings still require owner-visible Events Manager confirmation.

## Purchase Trigger Locations Found

Current controlled locations:

1. `apps/web/src/pages/ThankYou.jsx` requests a server-backed browser claim, sends the returned payload once, and completes the claim.
2. `apps/web/src/lib/metaPixel.js` contains the only active `fbq("track", "Purchase", ...)` dispatcher.
3. `apps/api/src/orders/checkoutService.js` and the authoritative checkout transaction queue COD through the centralized service after commit.
4. `apps/api/src/payments/paymongoPaymentService.js` queues PayMongo only after a verified paid webhook.
5. `apps/api/src/marketing/metaPurchaseService.js` owns eligibility, browser claims, payload validation, and CAPI queueing.
6. `apps/api/src/marketing/metaConversionsWorker.js` delivers the unique outbox row; it does not create a second identity.

Inactive/blocked locations:

- `apps/api/public/js/meta-pixel.js` rejects `Purchase` explicitly.
- Old static checkout and Thank You Purchase calls were removed.
- Checkout and Review pages do not send Purchase.
- Pixel bootstraps now set `autoConfig` to `false` before `init`, blocking automatic button/URL Purchase inference.

## Value Handling

- Database price unit: integer centavos (`price_cents`, `unitPriceCents`, `total_cents`).
- Peso or centavo: Meta receives pesos.
- Conversion used: strict integer centavos are divided by 100 exactly once and rounded to two decimals.
- Normalization: formatted peso input can be normalized only by the reusable Meta helper; empty, nonnumeric, zero, negative, or non-finite values become `null` and are not sent.
- Final total source: persisted backend `orders.total_cents`, copied from the authoritative quote calculation:

  `subtotal - discount + shipping + actual surcharge = final total`

The browser receives the server-built Purchase payload. It does not parse DOM text or trust a frontend-submitted total. PayMongo must report `PHP` and the exact stored centavo amount before Purchase is eligible.

## Currency Handling

Configured currency: `PHP`

- `META_CURRENCY=PHP` is documented and passed to the API container.
- The server resolves blank, malformed, lowercase, or non-PHP configuration to `PHP`.
- Browser code exports one `META_CURRENCY = "PHP"` constant.
- Browser and server validators require exact case-sensitive `PHP`.
- The database defaults `orders.currency` and `orders.meta_purchase_currency` to `PHP` and applies check constraints that reject another or empty value.
- The CAPI client and durable outbox independently refuse invalid monetary payloads before network delivery.

## Browser Pixel

- Purchase value: numeric pesos converted from the saved final `totalCents`.
- Currency: exact `PHP`.
- Event ID: permanent `purchase_<orderNumber>` returned by the protected backend claim.
- Test result: browser unit/source suite passed; invalid empty/string/zero values, empty/lowercase/non-PHP currency, missing event ID, malformed contents, rerenders, concurrent claims, refresh, and reopen are blocked.

All monetary browser events (`ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, and `Purchase`) require a numeric positive value and exact `PHP` when value is present.

## Conversions API

- `custom_data.value`: numeric pesos converted once from persisted `orders.total_cents`.
- `custom_data.currency`: exact `PHP`.
- `event_id`: the same permanent `purchase_<orderNumber>` used by the browser.
- Test result: API, outbox, transport, worker, and PostgreSQL integration tests passed. Malformed Purchase payloads never call Meta.

The order record now stores the exact dispatched value/currency, queued/sent timestamps, status, and last validation/API error. Admin Order Details displays these fields in an admin-only Meta tracking panel.

## COD Test

- Order number: prior controlled production order `MCC-1784104905864-8BE3` (cancelled after testing; stock restored once).
- Value: `729` from stored `72900` centavos (₱649 item + ₱80 shipping).
- Currency: `PHP`.
- Browser event ID: `purchase_MCC-1784104905864-8BE3`.
- Server event ID: `purchase_MCC-1784104905864-8BE3`.
- Deduplication: application IDs match; browser claim and outbox each occurred once; refresh/reopen returned `already_sent`.
- Result: application and database tests pass. Meta UI merged-source confirmation for this release remains pending.

## PayMongo Test

- Order number: no new owner-authorized live payment was created for this release.
- Paid amount: pending live test.
- Value: automated paid-path tests use the exact stored amount.
- Currency: automated tests require `PHP`.
- Browser event ID: automated exact-match assertion passed.
- Server event ID: automated exact-match assertion passed.
- Webhook retry test: passed; duplicate PayMongo event IDs do not queue another Purchase.
- Result: pending one successful live PayMongo Test Events payment.

## Thank You Page Refresh Test

Result: passed in automated and prior controlled COD testing. The backend atomically leases browser delivery, records the sent timestamp, and returns `already_sent` after refresh/reopen. React state and local storage are secondary guards only.

## Meta Test Events Result

Meta previously accepted privacy-safe server test Purchases with numeric `729`/`1298` and `PHP`, and production CAPI continues to return HTTP 200 for valid rows. The in-app signed-in browser was unavailable during this release, so the required Events Manager visual proof that the new browser and server events are merged/deduplicated could not be completed.

Required final verification:

1. remove any automatic `Purchase` rule in Events Manager > Settings > Open Event Setup Tool;
2. set a temporary Test Event Code on the server;
3. complete one COD and one successful PayMongo payment;
4. confirm browser and server Purchase show numeric value, `PHP`, identical event IDs, and a deduplicated/merged result;
5. refresh/reopen the Thank You page and replay the PayMongo webhook; confirm no new Purchase;
6. remove the Test Event Code.

## Historical Events

Already received malformed events cannot be rewritten. The 30% warning can remain visible while Meta's rolling diagnostic window still includes historical events. It should decline only as new valid events replace them; no historical successful Purchase was resent.

## Tests Performed

- API test suite: 489 passed, 0 failed, 2 optional PostgreSQL tests skipped in the host run.
- Storefront/admin test suite: 219 passed, 0 failed.
- PostgreSQL release tests in Docker: 3 passed, including concurrent checkout idempotency and unique Meta outbox delivery.
- PostgreSQL exact amount assertion: stored `72900` centavos produced `meta_purchase_value = 729` and both currency fields `PHP`.
- Production Vite build: passed.
- Local Docker API/web/PostgreSQL health: passed.
- Lint/type checking: no lint or type-check scripts are configured; JavaScript syntax, tests, and production compilation passed.

## Remaining Issues

1. Deploy this release so the live Pixel bootstrap disables automatic event configuration.
2. Remove the old automatic Purchase rule from the Meta account if it appears in Event Setup Tool.
3. Complete one new live COD and one live PayMongo transaction in Meta Test Events.
4. Confirm Meta's merged/deduplicated label and final count of one Purchase per order.

## Final Status

**Not Fixed**

The code, database constraints, automatic-event block, and automated/PostgreSQL tests are complete. Per the acceptance requirement, status remains Not Fixed until one post-release COD order and one successful PayMongo payment are visibly validated and deduplicated in Meta Test Events.
