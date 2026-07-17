# Meta Purchase Value Fix Report

## Root Cause

Two historical browser conditions could create bad value data: a retired helper converted missing centavos to zero, and the live base Pixel still allowed Meta automatic/Event Setup Tool Purchase inference with no authoritative order object. The active manual React Purchase and production CAPI records already used numeric values, but automatic inference could emit an empty value and currency and bypass the permanent event ID.

The old static Purchase calls remain removed, automatic Pixel events are disabled, and strict value/currency/event-ID validators now protect every dispatch boundary. See [META_VALUE_AND_CURRENCY_FIX_REPORT.md](META_VALUE_AND_CURRENCY_FIX_REPORT.md) for the complete audit evidence.

## Exact Affected Flow

- Browser Pixel: historical zero helper and automatic/Event Setup Tool Purchase path.
- Conversions API: not affected in the seven inspected production outbox records; protected by new final validators.
- COD: manual committed-order path valid; automatic browser inference could create the malformed extra event.
- PayMongo: manual verified-webhook path valid; automatic success-page inference was disabled.
- Thank You page: current server-backed claim valid; automatic URL/button inference was uncontrolled.
- Other: no repository GTM, partner SDK, or second manual Pixel implementation was found.

## Price Storage

- Database unit: integer centavos.
- Peso or centavo: stored in centavos, sent to Meta in pesos.
- Conversion used: divide by 100 exactly once after strict integer validation.

Examples: `64900` becomes numeric `649`; `129800` becomes numeric `1298`. Formatted centavo strings are rejected rather than guessed.

## Final Purchase Value Source

The backend quote calculates current item subtotal, discount, shipping, and any actual surcharge. Its final `totalCents` is persisted as `orders.total_cents`. Both Pixel and CAPI use the server-built payload from that persisted field. The frontend total and DOM text are never Purchase authorities.

## Browser Purchase

- Value: finite numeric pesos greater than zero.
- Currency: exact `PHP`.
- Event ID: permanent database `meta_purchase_event_id` (`purchase_<orderNumber>`).
- Result: invalid values/currency/IDs and duplicate refresh/rerender claims are blocked; tests pass.

## Server Purchase

- `custom_data.value`: finite numeric pesos greater than zero.
- `custom_data.currency`: exact `PHP`.
- `event_id`: same permanent ID as browser.
- Result: builder, queue, unique outbox, worker, and final transport validation pass.

## COD Test

- Order number: prior controlled production `MCC-1784104905864-8BE3`.
- Final order total: ₱729 (`72900` centavos).
- Browser value: `729`.
- Server value: `729`.
- Deduplication: identical event ID, one claim, one outbox row; refresh/reopen skipped.
- Final Purchase count: one application identity; current Meta UI merged-count confirmation pending.

## PayMongo Test

- Order number: pending one new owner-authorized successful payment.
- Paid amount: automated exact-match coverage passed.
- Browser value: automated paid-only claim passed.
- Server value: automated verified-webhook payload passed.
- Webhook retry result: duplicate ignored; no second outbox row.
- Final Purchase count: pending Meta Test Events proof.

## Thank You Page Refresh Test

Passed in automated and prior controlled COD testing. PostgreSQL is the idempotency authority; local storage is only secondary protection.

## Meta Test Events Result

Meta previously accepted test-only numeric `729` and `1298` PHP server Purchases. A signed-in Meta Events Manager session was unavailable for the post-release browser/server merged view, so final acceptance is pending.

Production release `30d5db7` is deployed. The migration is applied once, all 66 order records pass persisted Meta value/currency checks, all 7 Purchase outbox rows contain positive JSON-number values and `PHP`, and the public Pixel bootstrap disables automatic event configuration before its single initialization.

## Remaining Issues

1. Delete any automatic Purchase rule from Event Setup Tool.
2. Complete and observe one COD and one successful PayMongo order in Meta Test Events.
3. Confirm refresh and webhook replay add no Purchase and Ads reports one result per real order.

## Final Status

**Not Fixed** — code and database verification pass, but the user-required live COD plus PayMongo Meta Test Events validation has not yet been completed.
