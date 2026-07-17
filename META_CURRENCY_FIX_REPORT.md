# Meta Currency Fix Report

## Root Cause

The live base Pixel allowed Meta automatic event configuration. An automatic/Event Setup Tool Purchase can be inferred from a checkout or confirmation interaction without the manually built order payload, producing an empty currency. The application-owned React Purchase and all seven inspected production CAPI rows used `PHP`; no manual repository path assigned an empty currency.

The fix disables Pixel automatic event configuration before `init`, centralizes the ISO currency constant, validates every monetary dispatch, persists PHP on the order, and rejects empty/non-PHP values at the browser, outbox, database, and CAPI transport boundaries.

Full evidence and file-level details: [META_VALUE_AND_CURRENCY_FIX_REPORT.md](META_VALUE_AND_CURRENCY_FIX_REPORT.md).

## Affected Source

- Browser Pixel: automatic/Event Setup Tool path affected; manual path valid and hardened.
- Conversions API: not affected in inspected production records; hardened again at queue and transport.
- COD: automatic browser inference could affect COD; controlled path uses PHP.
- PayMongo: verified webhook path uses PHP; automatic success-page inference was disabled.
- Other: no GTM, partner SDK, or second manual Pixel was found in the repository. Meta account settings still require visual confirmation.

## Currency Standard

Configured currency: PHP

`META_CURRENCY=PHP` is documented for every environment. Runtime resolution always returns the store currency `PHP`. Browser code uses a compile-time `META_CURRENCY` constant. New orders persist `currency = 'PHP'` and `meta_purchase_currency = 'PHP'` under database check constraints.

## Browser Events Fixed

- ViewContent: numeric product/variant price + `PHP`.
- AddToCart: numeric accepted line value + `PHP`.
- InitiateCheckout: numeric final backend quote + `PHP`.
- AddPaymentInfo: numeric final quote + `PHP`.
- Purchase: numeric final saved order total + `PHP` + permanent event ID.

The dispatcher refuses `""`, `null`, `undefined`, lowercase `php`, symbols, formatted currency strings, zero, negative, or non-finite values.

## Server Events Fixed

- Purchase: strict `custom_data.value`, `custom_data.currency`, `event_id`, and event-name validation before outbox insertion and before Graph API delivery.
- Other commerce events: the generic CAPI transport requires numeric positive value and `PHP` for any supported monetary event, though this application currently sends server-side Purchase only.

## Value Validation

Integer centavos in `orders.total_cents` are converted once to numeric pesos. The reusable normalizer accepts valid numeric/formatted peso input where appropriate and returns `null` for empty, zero, negative, or invalid data. A null result blocks dispatch and stores a safe admin-visible validation error.

## Currency Validation

Exact equality to `PHP` is required. Empty or invalid configuration safely resolves to PHP, but an invalid payload is never silently sent. Database constraints prevent new orders from storing an empty currency.

## COD Test

- Value: `729` in the prior controlled live COD proof; PostgreSQL release test repeated the same exact centavo-to-peso contract.
- Currency: `PHP`.
- Event ID: identical `purchase_<orderNumber>` for browser and server.
- Deduplication: refresh/reopen and duplicate outbox assertions passed.
- Result: application pass; current Meta Test Events visual confirmation pending.

## PayMongo Test

- Value: exact stored/paid amount in automated tests.
- Currency: `PHP` required from the verified webhook and Meta payload.
- Event ID: browser/server exact-match assertion passed.
- Deduplication: duplicate webhook assertion passed.
- Result: one successful live PayMongo Test Events payment remains pending.

## Meta Test Events Result

Server Test Events previously accepted numeric PHP test events. The signed-in Events Manager browser was unavailable, so post-release merged browser/server confirmation is pending.

## Historical Events

Old malformed diagnostics cannot be edited and may remain visible until they age out of Meta's diagnostic window. Successfully delivered historical Purchases were not resent.

## Remaining Issues

- Deploy the release.
- Remove any account-side automatic Purchase rule.
- Run one post-release COD and PayMongo Test Events transaction and confirm one deduplicated Purchase each.

## Final Status

**Not Fixed** — implementation and automated tests pass, but the required live Meta COD/PayMongo proof is still pending.
