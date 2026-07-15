# Meta Value Fix Report

## Root Cause

The browser tracking implementation had two concrete value defects:

1. The shared cents-to-pesos helper used `Number(cents || 0)`. Missing, empty, or otherwise unusable amounts could therefore become the numeric value `0` and enter an ecommerce event payload.
2. `InitiateCheckout` could run from the cart page, cart drawer, or initial checkout render before the customer supplied an address and before the backend returned the final discount and shipping quote. The first subtotal-only event then activated the browser deduplication guard and suppressed the later authoritative amount.

The browser and legacy storefront builders also filtered malformed order lines and continued with partial `content_ids`/`contents`, and there was no final common dispatch guard enforcing a numeric positive `value` and the exact currency `PHP`.

The server Purchase builder already sourced its top-level amount from the stored `order.totalCents` and rejected an invalid top-level total. It still needed the same centralized conversion helper, strict line validation, a stable order-number-first event ID, delivery-time validation, and useful safe response logging.

The production configuration inspected on 2026-07-15 has Meta Conversions API disabled and no access token configured. The current production CAPI worker therefore cannot be the source of a newly delivered server event warning. The warning is attributable to browser/historical event data unless a different external integration is also connected to the same Meta dataset. Meta Events Manager access was not available to identify the individual historical event row.

## Events Checked

- PageView: contains no monetary amount by design.
- ViewContent: uses the real selected/default in-stock variant price and variant/product identifier.
- AddToCart: runs only after a successful stock-valid cart addition; value is unit price multiplied by the accepted quantity.
- InitiateCheckout: now waits for the finalizable backend quote and uses its `totalCents`, items, discount, and shipping result.
- AddPaymentInfo: inherits the strict final quote payload and selected payment method.
- Purchase: uses the successfully persisted order for COD and the verified paid order for PayMongo.
- Conversions API: this application intentionally sends server-side Purchase only; no duplicate server implementations of earlier funnel events were added.

## Browser Pixel Fix

The active React Pixel and legacy customer storefront now share the same rules:

- Stored integer centavos are converted to pesos exactly once.
- Every monetary event must contain `typeof value === "number"`, a finite value greater than zero, and `currency: "PHP"` before `fbq` can run.
- Invalid IDs, quantities, prices, or totals cause the event to be skipped instead of sending `0`, a string, `null`, `undefined`, `NaN`, or partial contents.
- ViewContent uses the current variant price when one exists.
- AddToCart uses `unit price × accepted quantity` and runs only after cart and stock validation succeeds.
- InitiateCheckout no longer runs from the cart link, cart drawer, or initial address page render. It runs after the backend returns a finalizable quote containing the final shipping and discount calculation.
- Purchase uses only the authoritative order response and all persisted order items.

Development-only browser logs include the event name, event ID, order ID, numeric Purchase value, currency, payment method, item count, browser send status, and server-status placeholder. Invalid monetary payloads generate a development warning and are not dispatched.

## Conversions API Fix

The server Purchase payload now sets:

```json
{
  "custom_data": {
    "value": 1278,
    "currency": "PHP"
  }
}
```

The actual number varies with the stored order total. The builder rejects invalid totals and invalid order lines. The outbox repository independently rejects nonnumeric, zero, negative, missing, or non-PHP payloads. The API client performs a final validation immediately before the network request, so malformed existing or manually inserted events are not sent.

Safe backend logs now record event name, event ID, numeric value, currency, order number, payment method, item count, HTTP response status, events received, retry status, and a sanitized provider error. Access tokens, customer email, phone, address, payment credentials, and other private order data are not logged.

## Currency and Unit

Product prices, line prices, shipping amounts, discounts, and order totals are stored as integer centavos in fields such as `priceCents`, `unitPriceCents`, and `totalCents`. The centralized conversion converts once at the Meta boundary:

- `64900` centavos becomes numeric `649` pesos.
- `129800` centavos becomes numeric `1298` pesos.
- Currency is exactly `PHP`.
- Formatted centavo strings such as `₱64,900` and `PHP 64900` are rejected to prevent ambiguous or double conversion.

## Final Amount Source

`buildAuthoritativeQuote` is the single price authority. It reloads current product/variant records and calculates:

```text
sum(unitPriceCents × quantity)
- discountTotalCents
+ shippingFeeCents
= totalCents
```

Free shipping stores a shipping fee of zero. The current checkout has no separate customer surcharge. `authoritativeCheckoutService` copies that quote snapshot into the order, and `orderRepository` persists it in `orders.total_cents`. Browser Purchase and server CAPI both convert that persisted `order.totalCents`; they do not trust a browser-submitted total or parse displayed text. PayMongo also charges this same `totalCents`, and a paid webhook is rejected unless its PHP centavo amount exactly matches the stored order.

## Purchase Deduplication

The deterministic ID is `purchase_<orderNumber>`.

- Browser: `{ eventID: "purchase_<orderNumber>" }`
- Server: `event_id: "purchase_<orderNumber>"`
- Event name on both sides: `Purchase`
- The server outbox has a unique database constraint on `event_id`.
- COD checkout idempotency prevents duplicate order creation/outbox insertion.
- PayMongo webhook event IDs and the Meta outbox unique event ID prevent webhook retries from creating another Purchase.
- The React runtime set plus persistent browser storage prevent React rerenders, revisits, and thank-you refreshes from dispatching another browser Purchase.

This follows Meta's recommended matching of Pixel `eventID` to CAPI `event_id` with the same event name: [Handling Duplicate Pixel and Conversions API Events](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events).

## COD Test

Result: Passed automated coverage. A successful COD order uses the persisted authoritative total, queues one CAPI Purchase inside the same commerce transaction, returns the same event ID to the browser, and does not duplicate on retry or refresh. Quantity, multiple-item, discount, shipping, exact grand-total, malformed-total, and outbox-deduplication cases passed. A live production Test Events COD order has not yet been run for this release.

## PayMongo Test

Result: Passed automated coverage and code-path verification. Checkout creation uses the authoritative centavo total and remains `pending_payment`. Failed, pending, cancelled, and unrelated webhook events cannot create Purchase. A signed paid webhook must report `PHP`, a paid payment ID, and an amount exactly equal to `order.totalCents`; only then is the order marked paid and the server Purchase queued. The browser Purchase is gated on the private confirmation response reporting `paymentMethod === "paymongo"` and `paymentStatus === "paid"`. A live PayMongo/Meta Test Events payment has not yet been run for this release.

## Meta Test Events Result

Result: Not run at report generation. Production CAPI was disabled with no server access token configured, so no live request was submitted to Meta and no claim of Meta acceptance or deduplication is made. Deployment and activation status must be checked operationally alongside this report.

Automated results:

- API: 428 passed, 0 failed, 2 skipped because `TEST_POSTGRES_URL` is not configured.
- Web: 201 passed, 0 failed.
- Production Vite build: passed.
- Lint/type checking: no lint or type-check scripts are defined; `--if-present` checks had nothing to execute.

## Meta Events Manager Test Procedure

1. Deploy this change and configure the production server with the same dataset/pixel ID used by the browser, a server-only CAPI access token, `META_CONVERSIONS_API_ENABLED=true`, and a temporary Test Events code. Never place the token in a `VITE_` variable or browser code.
2. In Meta Events Manager, select the Maria Clara Clothing dataset (Meta now groups web sources into datasets whose ID corresponds to the Pixel ID), then open **Test events**. Meta documents the current dataset/Pixel setup flow here: [Set up and install the Meta Pixel](https://www.facebook.com/help/messenger-app/952192354843755).
3. Copy the server Test Event Code shown under **Test server events** into the server's temporary `META_CONVERSIONS_API_TEST_EVENT_CODE` setting and restart only the API service.
4. Open a private browser window, accept Meta tracking consent if required, and enter the website URL under **Test browser events**.
5. Open the homepage and verify one browser PageView.
6. Open a real ₱649 product and inspect ViewContent: `value` must be the number `649`, currency `PHP`, and the ID must match the selected variant/product.
7. Add quantity 1 and inspect AddToCart: value `649`, quantity `1`, item price `649`.
8. If stock allows, add quantity 2 in a fresh cart and inspect AddToCart: value `1298`, quantity `2`, item price `649`.
9. Enter a valid delivery address and continue to review. Inspect InitiateCheckout only after the quote returns; its value must equal the displayed review total after discount and shipping.
10. Complete one COD order. Inspect Purchase and confirm browser and server rows share event name `Purchase`, the same `purchase_<orderNumber>` ID, numeric value greater than zero, currency `PHP`, item IDs, quantities, and the database/admin/thank-you grand total.
11. Refresh the thank-you page and confirm no additional browser Purchase appears.
12. Complete one PayMongo test payment. Confirm no Purchase while pending or after only visiting the success URL; Purchase must appear only after the signed paid webhook is processed. Confirm the paid amount, database total, Pixel value, and CAPI `custom_data.value` match.
13. In the Purchase event details, verify Browser and Server connection methods and the deduplicated/merged status. Meta specifies that matching `eventID`/`event_id` and matching event/event_name are the recommended keys: [Server Event Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event).
14. Remove the temporary Test Event Code after testing, restart the API, and monitor **Diagnostics**, **Event Match Quality**, and Purchase deduplication for new production orders.

## Remaining Issues

- Production CAPI needs a valid server-side Meta access token and must be enabled.
- Live COD and PayMongo Test Events validation must be completed after deployment.
- `TEST_POSTGRES_URL` was not available locally, so two optional PostgreSQL integration tests were skipped; the unit, source, API, and build suites passed.
- Meta's historical warning may remain visible until its diagnostic window ages out even after all new events are correct.

## Final Status

Not Fixed

The implementation is fixed and fully passing its available automated checks, but the end-to-end production goal is not complete until CAPI is configured/enabled and Meta Test Events confirms browser/server acceptance and deduplication.
