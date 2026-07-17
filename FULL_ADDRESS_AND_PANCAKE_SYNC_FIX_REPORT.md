# Full Address and Pancake Sync Fix Report

## Root Cause

Checkout dropdowns retained their PSGC/J&T-style codes and visible labels in React state, and the backend already resolved valid codes to authoritative readable names. Two adapter gaps caused incomplete downstream records:

1. The browser quote request stripped the readable labels and sent only the codes. The backend still resolved current checkout orders correctly, but the request did not preserve both pieces of selected-option data as requested.
2. The Pancake create/update mapper sent only `address`, `full_address`, and `post_code`. It omitted Pancake's separate readable location fields. The inbound mapper expected generic `ward`, `district`, and `province` fields, while the live Pancake response uses `commune_name`, `district_name`, and `province_name`. This caused native Pancake imports and older website orders to lose structured location names locally.

Customer order history also omitted the saved contact number and delivery address even when the database record was complete.

## Checkout Dropdown Data

- Province value and label: `provinceCode` and `provinceName`/`province`
- City value and label: `cityCode` and `cityName`/`city`
- Barangay value and label: `barangayCode` and `barangayName`/`barangay`
- Fix applied: the frontend preserves and submits both code and label. The backend does not blindly trust the label; it validates the code hierarchy against the server address dataset and stores the server-resolved readable names. Changing province clears city and barangay; changing city clears barangay.

## Frontend Payload

The checkout quote now submits:

- `houseAddress`
- `provinceCode`
- `provinceName`
- `cityCode`
- `cityName`
- `barangayCode`
- `barangayName`
- optional `postalCode`

Customer first name, last name, normalized phone, and optional email remain in the final quote-backed order request. Browser totals are still excluded and cannot override server-calculated pricing.

## Backend Validation

- Required fields: first name, last name, valid Philippine mobile number, house/street, barangay, city/municipality, and province
- Optional fields: email and four-digit ZIP Code
- Protected endpoints: checkout quote finalization, COD order creation, legacy order creation, PayMongo pending-order/session creation, and admin address correction
- Validation schema: centralized `deliveryDetails` normalization plus authoritative address-code hierarchy resolution in `addressService`
- Test result: missing or mismatched location data is rejected before order persistence, stock mutation, Pancake export, notification, or Meta Purchase dispatch. Automated backend suites passed.

## Database

- Structured address fields: `houseAddress`, `addressLine1`, `barangayCode`, `barangay`, `barangayName`, `cityCode`, `city`, `cityName`, `municipality`, `provinceCode`, `province`, `provinceName`, optional `postalCode`, and `country`
- Customer fields: separate first and last names, complete full name, normalized phone, and optional email
- Full address field: `addressLine` and `formattedFullAddress`
- Migration status: no table migration was required because orders already use a non-destructive JSONB address record. A guarded audit/backfill service was added for historical linked Pancake records.

## Full Address Formatter

One server formatter is now used by order persistence, confirmation payloads, admin CSV export, admin email, Pancake create/update payloads, and recovery. The equivalent frontend formatter is used for review, customer account, and saved-address presentation.

Implemented format:

`123 Sample Street, Bucandala IV, Imus City, Cavite, 4103, Philippines`

Blank values, `undefined`, `null`, empty commas, objects, and raw location IDs are not inserted into the formatted address.

## Pancake POS Mapping

- Customer name field: `bill_full_name` and `shipping_address.full_name`
- Contact number field: `bill_phone_number` and `shipping_address.phone_number`
- Email field: `bill_email`
- Street field: `shipping_address.address`
- Barangay field: `shipping_address.commune_name`
- City field: `shipping_address.district_name`
- Province field: `shipping_address.province_name`
- ZIP Code field: `shipping_address.post_code`
- Full address field: `shipping_address.full_address`

The same mapping is used for initial exports and admin-triggered updates. Sync remains blocked with `pancake_order_delivery_incomplete` when required customer or address information is missing.

## COD Test

Result: Passed.

- Automated COD payload tests confirmed normalized phone, all structured names, ZIP Code, and full address.
- A real post-release COD order was validated without exposing customer data: PostgreSQL stored the complete address, the saved Pancake export contained all three new readable fields, and Pancake readback returned a complete structured address. The provider's full address retained the complete original street string.
- Incomplete-address and direct-bypass tests confirmed that no order, stock deduction, Pancake export, or Meta Purchase can occur.

## PayMongo Test

Result: Passed.

- Automated tests confirmed the pending and paid PayMongo paths use the same complete stored address and that payment state does not change address ownership.
- Four existing paid PayMongo orders had complete readable details available in their linked Pancake records. The guarded backfill restored all four locally, and production readback confirmed phone, street, barangay, city, and province match between the order database and Pancake for all four.
- Address data is persisted before the PayMongo redirect and does not depend on the customer returning from PayMongo.

## Admin Order Details

Result: Passed.

- Admin shows name, phone, email, house/street, barangay, city/municipality, province, optional ZIP Code, and complete formatted address.
- Authorized address editing validates the dependent dropdown hierarchy, rebuilds the full address, records an order-history event, and queues a Pancake update for linked orders.
- The existing “Missing Delivery Information” filter and processing block remain active.

## Thank You Page

Result: Passed. The private confirmation response supplies the canonical full address, and the page now displays full customer name, contact number, and complete delivery address without location codes or internal Pancake data.

## Order Export

Result: Passed.

- Admin CSV exports include phone, complete address, barangay, city, province, and ZIP Code in separate fields.
- J&T workbook and parcel preview continue to require and export the separate readable fields.
- Customer order history now includes the saved contact number and complete delivery address.

## Existing Incomplete Orders

- Number found before recovery: 60
- Safely recovered from complete linked Pancake records: 8
- Remaining incomplete after idempotent second audit: 52
- Admin warnings: active through the missing-delivery filter, order detail alert, processing-status protection, and Pancake sync block
- Manual action required: contact the customer or correct the record from verified information. Pancake itself lacks one or more required structured fields for these 52 records, so no values were inferred or invented.

## Tests Performed

- Backend full suite: 493 tests; 491 passed and 2 PostgreSQL-environment tests skipped by their existing guard; 0 failed
- Frontend full suite: 223 passed; 0 failed
- Focused address/Pancake/backfill suite: 36 passed; 0 failed
- Production frontend build: passed
- Modified backend JavaScript syntax checks: passed
- Production health and checkout route: HTTP 200
- Production Pancake audit: 60 incomplete, 8 recoverable, 0 provider failures
- Production guarded backfill: 8 applied, 0 failures
- Production second audit: 52 incomplete, 0 recoverable, proving idempotency
- Production outbound payload: one post-release order checked; `commune_name`, `district_name`, `province_name`, and `full_address` all present
- Live PayMongo/Pancake comparison: 4 checked and 4 exact structured-address matches
- Responsive checkout behavior is covered by the passing frontend source/build tests. The in-app interactive browser was unavailable in this session, so no claim is made for a new screenshot-based device run.

## Remaining Issues

- Fifty-two historical records require manual correction because their linked Pancake data is also incomplete. They remain visibly warned and blocked from processing/sync.
- No fake COD order or paid PayMongo transaction was created in production. Validation used existing genuine production records plus isolated automated checkout/payment tests.

## Final Status

Fixed for all new COD and PayMongo orders. Historical incomplete records remain protected and require verified manual correction; they do not weaken validation for new checkout orders.
