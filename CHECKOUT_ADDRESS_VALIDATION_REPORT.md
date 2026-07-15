# Checkout Address Validation Report

## Root Cause

The previous checkout paths did not share one final delivery-information guard. The legacy/direct order normalizer checked raw values before trimming them, so whitespace-only text could pass and later be saved as blank. The authoritative checkout path validated the address quote, but order persistence, PayMongo dispatch, Pancake synchronization, and admin status changes did not all repeat the same complete-delivery check. In addition, a partial Pancake status response could replace a valid website-owned customer/address snapshot.

The fix introduces one backend delivery-details module that normalizes and validates names, Philippine mobile numbers, structured address fields, optional email and ZIP Code, and the formatted full address. The authoritative order service runs this validation before opening its commerce write transaction and again against the locked, persisted quote inside the transaction. No order, stock deduction, discount claim, notification, Meta Purchase, or Pancake export can occur when that check fails.

## Frontend Validation

- Fields required: First name, last name, Philippine mobile number, house/street, barangay, city/municipality, and province.
- Fields optional: Email and four-digit ZIP Code.
- Error behavior: Each invalid input receives a red error state, `aria-invalid`, and a field-specific message. Submission stays on Checkout, entered values remain intact, and the first invalid input is smoothly scrolled into view and focused.
- Phone handling: `09XXXXXXXXX`, `+639XXXXXXXXX`, and `639XXXXXXXXX` are accepted after removing spaces, hyphens, and parentheses. New orders store the normalized `09XXXXXXXXX` form. Letters, short values, blank values, and obvious repeated-digit placeholders are rejected.
- Review protection: `/checkout/review` independently validates the saved draft and address hierarchy codes. Missing or stale information disables order/payment actions, redirects to Checkout, and displays “Please complete your delivery information before placing your order.”
- Test result: Passed the real-browser Checkout error, focus, red-state, phone normalization, blank-ZIP, Review display, direct-Review redirect, and successful COD flow tests.

## Backend Validation

- Endpoints protected:
  - `POST /api/checkout/quotes`, including final shipping/address hierarchy validation.
  - `POST /api/orders` for the authoritative PostgreSQL checkout and the legacy/direct compatibility path.
  - The authoritative persisted-quote-to-order transaction before stock, discount, order, outbox, email, Meta, or Pancake writes.
  - `POST /api/payments/paymongo/create-checkout-session` through authoritative checkout validation and a second defensive PayMongo payload guard.
  - Verified PayMongo payment finalization for historical incomplete records.
  - Admin order correction and status transitions.
  - Pancake POS initial export, outbound updates, and inbound status processing.
- Validation schema: `apps/api/src/checkout/deliveryDetails.js` is the central server-side normalization, validation, completeness-audit, and address-formatting module. Invalid final delivery data returns HTTP 422 with `success: false`, code `INCOMPLETE_DELIVERY_ADDRESS`, a safe message, and a field-error object. Address-guide errors retain the existing safe `address_invalid` contract and also include field errors.
- Database result: Every new order stores separate name fields, normalized phone, structured address fields, optional ZIP Code, aliases needed by current consumers, and one backend-generated `formattedFullAddress`/`addressLine`.
- Bypass result: A quote request with blank street/barangay/city/province was rejected before an order existed; a direct fake-order request created no order; stock remained unchanged; no Pancake, email, or Meta side effect ran.
- Test result: Full backend suite passed 468 tests with 0 failures and 2 opt-in PostgreSQL tests skipped by the standard command. The checkout PostgreSQL concurrency test was then run separately with `TEST_POSTGRES_URL` and passed 2/2.

## Delivery Notes Removal

- Pages/components updated: React Checkout, Checkout Review, checkout draft storage, checkout API payload, legacy checkout HTML/JavaScript, customer confirmation output, admin order display, admin new-order email, J&T remarks, storefront privacy copy, and Pancake outbound payload construction.
- Admin behavior: “Delivery Notes” is no longer requested or displayed. A distinct, admin-only internal note remains for staff operations and is explicitly excluded from Pancake POS and customer output.
- Database compatibility: The existing historical `notes`/provider-note fields and columns were not deleted. New storefront orders persist an empty checkout note, so historical information remains recoverable without collecting new delivery notes.
- Pancake compatibility: Existing provider-native notes can remain in historical inbound records, but storefront delivery notes are never sent in create/update payloads.
- Test result: Source-contract tests verify that both checkout frontends and request builders omit Delivery Notes; backend order creation forces the field blank.

## PayMongo

- Address validation before session creation: The backend validates the customer, structured delivery address, cart, stock, and authoritative quote before it creates a pending order or calls PayMongo. The PayMongo session builder also refuses an incomplete stored order defensively.
- Historical protection: If a verified payment belongs to an older incomplete order, payment evidence is recorded, but the order stays unconfirmed/unfulfilled, is tagged for missing delivery information, and is not dispatched to fulfillment, Meta Purchase, admin order email, or Pancake POS.
- Test result: Passed tests proving an incomplete session is rejected before the PayMongo client is called, pending/failed events do not finalize an order, successful verified payments retain the normal flow, and an incomplete historical paid order is held safely.

## COD

- Address validation before order creation: Both authoritative and legacy COD paths validate all required delivery fields before starting cart/stock/order work. The authoritative service revalidates the persisted quote within the same transaction that deducts stock and creates the order.
- Test result: A complete mobile COD order was created successfully against disposable PostgreSQL with normalized phone, structured address, optional blank ZIP, correct Review page, and correct Thank You confirmation. Missing-address requests created no order and changed no stock.

## Pancake POS

- Incomplete order protection: Initial export and outbound update construction throw a safe blocked error before any Pancake API call. Inbound Pancake updates cannot advance an incomplete order to Confirmed, Packing, Shipped, or Delivered.
- Website authority: Status-only Pancake responses no longer overwrite or erase the customer/address saved by website checkout.
- Correct address sync: Complete orders use the centralized formatted address. Customer notes are absent from outbound create/update payloads.
- Admin recovery: After an authorized admin completes the structured delivery fields, the formatted address is rebuilt, the missing-information tag is removed, an order-history event is saved, and a linked Pancake update is queued for retry.
- Test result: Passed mapper, export, inbound preservation, outbound blocking, and retry-queue tests.

## Existing Incomplete Orders

- Number found: 60 of 64 production orders were missing one or more structured delivery fields after the post-deploy Pancake history synchronization. The status breakdown was 34 Cancelled, 23 Delivered, and 3 Returned. None was in Received, Confirmed, Packing, or Shipped status.
- Admin warning/filter added: Yes. Orders now expose a “Missing Delivery Information” count/filter and badge. Order Details lists the exact missing fields and displays “Incomplete delivery address — contact the customer before processing this order.”
- Status protection: Confirmed, Packing, Shipped, and Delivered transitions are rejected until the address is complete. Cancellation remains available.
- Manual action required: Do not invent data. These are historical/terminal orders and need no new fulfillment action. If any must be reprocessed or used for a replacement shipment, an authorized admin must contact the customer and enter real structured information first.
- Audit artifact: `apps/api/scripts/audit-incomplete-delivery.sql` is read-only and returns order number, status, and missing-field names without customer PII.

## Mobile Testing

Result: Passed at 320px, 360px, 390px, 430px, and 768px. The form and error messages had no horizontal overflow, the first invalid field received focus, required-field errors remained visible, and a 390px complete COD checkout reached the real Thank You page.

## Remaining Issues

- No real PayMongo charge or production Pancake mutation was created for this validation test. Provider calls were deliberately mocked or blocked before dispatch; their live credentials and normal integrations were not changed.
- Historical Pancake records often contain only a provider-formatted address, not separate barangay/city/province fields. They remain visible with admin warnings and are not silently backfilled. Partial Pancake status responses now preserve any complete structured delivery fields already stored.
- The project has no configured `lint` or `typecheck` package scripts. JavaScript syntax checks, the production Vite build, backend tests, PostgreSQL integration tests, and targeted Playwright tests were used instead.
- The broader pre-existing Playwright suite contains unrelated development-server/product-fixture assertions; the checkout-address suite itself passed 3/3.

## Final Status

Fixed
