# Pancake Structured Address Sync Fix Report

## Confirmed Root Cause

The production checkout and website order already retained the selected Province, City/Municipality, and Barangay names and codes. The data was lost in the outbound Pancake mapper.

The exact failing implementation was `buildPancakeShippingAddress` in `apps/api/src/integrations/pancake/pancakeOrderMapper.js`:

- It sent readable `province_name`, `district_name`, and `commune_name` values only.
- It omitted `province_id`, `district_id`, and `commune_id`, so Pancake had no geographic records to bind to its Ant Design selects.
- Pancake's current order schema spells the commune-name property `commnue_name`. The old mapper sent `commune_name`, which Pancake did not bind.
- `runOrderLiveExport` in `pancakeOrderExportService.js` marked an export sent immediately after POST. It did not retrieve the created order and verify the saved structured address.
- The old PayMongo route attempted Pancake export while payment was still pending.
- A POST timeout could leave an ambiguous result. A blind retry could create a duplicate because the existing Pancake order was not searched by the exact website order number first.

The repaired path resolves the official Pancake hierarchy, sends the exact structured fields, retrieves and verifies the saved order, and marks the export sent only after verification succeeds.

## Pancake API Schema

Schema source: [Pancake POS Open API](https://docs.pancake.biz/pos/api/) and the current [official OpenAPI document](https://api-docs.pancake.biz/openapi.json?lang=en), inspected on 2026-07-18.

- Province field: `shipping_address.province_id` (string) and `shipping_address.province_name`
- District/City field: `shipping_address.district_id` (string) and `shipping_address.district_name`
- Commune/Barangay field: `shipping_address.commune_id` (string) and the schema's exact `shipping_address.commnue_name` spelling
- Full address field: `shipping_address.full_address`; street is also sent in `shipping_address.address`
- ZIP field: `shipping_address.post_code`
- Country field: `shipping_address.country_code`, set to Philippine code `63`
- Phone field: `shipping_address.phone_number` and top-level `bill_phone_number`
- Customer fields: top-level `bill_full_name` and `bill_email`

Official geographic endpoints used:

- `GET /geo/provinces?country_code=63`
- `GET /geo/districts?province_id={province_id}`
- `GET /geo/communes?province_id={province_id}&district_id={district_id}`
- `POST /shops/{SHOP_ID}/orders`
- `GET /shops/{SHOP_ID}/orders/{ORDER_ID}`
- `PUT /shops/{SHOP_ID}/orders/{ORDER_ID}`

The official list-orders `search` query is also used to recover an exact website order ID after an ambiguous POST timeout before any retry can create another order.

## Website Address Source

- Province value/code: `CAVITE`
- Province label: `CAVITE`
- City value/code: `CAVITE|IMUS`
- City label: `IMUS`
- Barangay value/code: `CAVITE|IMUS|BUCANDALA IV`
- Barangay label: `BUCANDALA IV`
- Street: `123 Sample Street`
- ZIP: `4103`

Checkout retains the code and label through its form state and Review draft. The committed order stores them in the backend `orders.address` JSONB record. PayMongo uses that committed pending-order address after payment; it does not reconstruct the selection from a return URL or browser state.

The website and database store Philippine money in centavos (`64900` for ₱649). Pancake's order payload uses peso units (`649`).

## Geographic Mapping

- Website Province → Pancake: `CAVITE` → `Cavite`, ID `63_826`
- Website City/Municipality → Pancake: `IMUS` / Imus City → Pancake District `Imus`, ID `63_8261588`
- Website Barangay → Pancake: `BUCANDALA IV` → Pancake Commune `Bucandala iv`, ID `63_82615881238`
- Mapping method: exact provider code when available; otherwise exact normalized name within the verified parent; then conservative approved aliases such as `City of Imus`/`Imus City`/`Imus`
- Cache/database mapping: 24-hour in-process geo-list cache plus persistent `pancake_geo_mappings`

Resolution order is always Province → districts in that Province → communes in that District. A global city or barangay match is not used. Ambiguous and missing matches are blocked.

Roman numerals remain significant. Live data and automated tests confirm separate IDs for Bucandala I, II, III, IV, and V.

## Pancake Payload

Sanitized payload from the corrected production builder:

```json
{
  "custom_id": "MCC-PANCAKE-COD-TEST-MRPRDHYK",
  "bill_full_name": "Juan Dela Cruz",
  "bill_phone_number": "09171234567",
  "bill_email": "pancake-sync-test@mariaclaraclothing.com",
  "shipping_address": {
    "full_name": "Juan Dela Cruz",
    "phone_number": "09171234567",
    "address": "123 Sample Street",
    "full_address": "123 Sample Street, BUCANDALA IV, IMUS, CAVITE, 4103, Philippines",
    "province_id": "63_826",
    "province_name": "Cavite",
    "district_id": "63_8261588",
    "district_name": "Imus",
    "commune_id": "63_82615881238",
    "commnue_name": "Bucandala iv",
    "country_code": "63",
    "post_code": "4103"
  },
  "shipping_fee": 0,
  "total_discount": 0,
  "cod": 649,
  "transfer_money": 0,
  "items": [
    {
      "product_id": "deaf195b-d30a-4658-b441-09cebe7edb4b",
      "variation_id": "69c3880f-3210-48ba-a4cb-ba9ba1f7b159",
      "quantity": 1
    }
  ]
}
```

For the paid PayMongo fixture, the same address was sent with `cod: 0` and `transfer_money: 649`.

## Pancake Verification

- POST response: returned order ID equal to the exact website order number
- Retrieved order: verified through `GET /shops/{SHOP_ID}/orders/{ORDER_ID}` before the export was marked sent
- Province persisted: `63_826` / `Cavite`
- District persisted: `63_8261588` / `Imus`
- Commune persisted: `63_82615881238` / `Bucandala iv`
- Phone persisted: `09171234567`
- Email persisted: `pancake-sync-test@mariaclaraclothing.com`
- Street persisted: `123 Sample Street`
- ZIP persisted: `4103`
- Full address persisted: `123 Sample Street, Bucandala iv, Imus, Cavite`

Pancake canonicalized `full_address` and retained ZIP separately in `post_code`. After both controlled orders were cancelled, another exact provider search still returned one record apiece with all structured fields intact.

## COD Test

Result: **Passed in production**

- Website order: `MCC-PANCAKE-COD-TEST-MRPRDHYK`
- Final database total: `64900` centavos (₱649)
- Pancake COD value: `649`
- Exact Pancake records found: `1`
- Province/District/Commune retrieval: passed
- Phone/email/street/ZIP retrieval: passed
- Second export attempt: `skipped`; no second POST
- Cleanup: controlled test order cancelled after verification
- Meta/email/inventory side effects: none

## PayMongo Test

Result: **Passed with a controlled production-equivalent webhook event; no customer was charged**

- Website order: `MCC-PANCAKE-PAYMONGO-TEST-MRPRDHYK`
- Pending-payment Pancake attempt: skipped; no Purchase/order export occurred while pending
- Controlled official-shaped paid event: processed through the production `processPaidWebhook` transaction path
- Paid amount: `64900` centavos (₱649)
- Pancake `transfer_money`: `649`
- Pancake `cod`: `0`
- Exact Pancake records found: `1`
- Province/District/Commune retrieval: passed
- Phone/email/street/ZIP retrieval: passed
- Same webhook replay: returned `duplicate`
- Export after webhook replay: `skipped`; no second Pancake order
- Cleanup: controlled test order cancelled after verification
- Durable webhook rows: one
- Meta/email/notification/inventory side effects: none

The real PayMongo signature validator and paid-event rules also remain covered by the automated API suite. No real payment was fabricated and no live customer payment was replayed.

## Existing Orders

- Incomplete Pancake orders found: `6` in the read-only 2026-07-16 through 2026-07-18 preview (`17` linked orders scanned)
- Safely resolvable website orders: `5`
- One imported Pancake-origin order needs its incomplete website delivery address corrected before safe mapping
- Update tool: Admin → Pancake POS → **Existing order address reconciliation**
- Records corrected automatically: `0` historical records, by design
- Remaining manual action: preview the five resolved historical records, select the intended records, and press **Confirm Update**. The tool updates the existing Pancake order with PUT, retrieves it, verifies it, and never recreates it.

Historical orders were not modified without the required explicit selection and confirmation.

## Files Changed

- `.env.example`
- `apps/api/.env.example`
- `apps/api/db/migrations/20260718_pancake_structured_address.sql`
- `apps/api/db/schema.sql`
- `apps/api/src/config/env.js`
- `apps/api/src/integrations/pancake/pancakeAddressReconciliationService.js`
- `apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js`
- `apps/api/src/integrations/pancake/pancakeClient.js`
- `apps/api/src/integrations/pancake/pancakeFinancialReconciliationService.js`
- `apps/api/src/integrations/pancake/pancakeGeoRepository.js`
- `apps/api/src/integrations/pancake/pancakeGeoService.js`
- `apps/api/src/integrations/pancake/pancakeOrderExportRepository.js`
- `apps/api/src/integrations/pancake/pancakeOrderExportService.js`
- `apps/api/src/integrations/pancake/pancakeOrderMapper.js`
- `apps/api/src/integrations/pancake/pancakeOrderSyncRepository.js`
- `apps/api/src/integrations/pancake/pancakeOrderSyncService.js`
- `apps/api/src/payments/paymongoPaymentService.js`
- `apps/api/src/routes/adminPancake.js`
- `apps/api/src/routes/paymongo.js`
- `apps/api/test/pancakeAddressReconciliationService.test.js`
- `apps/api/test/pancakeClient.test.js`
- `apps/api/test/pancakeConfig.test.js`
- `apps/api/test/pancakeFinancialReconciliationService.test.js`
- `apps/api/test/pancakeGeoService.test.js`
- `apps/api/test/pancakeOrderExportRepository.test.js`
- `apps/api/test/pancakeOrderExportService.test.js`
- `apps/api/test/pancakeOrderMapper.test.js`
- `apps/api/test/pancakeOrderSyncService.test.js`
- `apps/api/test/pancakeStructuredAddressMigration.test.js`
- `apps/web/e2e/checkout-v2.spec.js`
- `apps/web/src/admin/OrderDetail.jsx`
- `apps/web/src/admin/PancakePos.jsx`
- `deploy/docker-compose.production.yml`
- `docker-compose.yml`
- `PANCAKE_STRUCTURED_ADDRESS_SYNC_FIX_REPORT.md`

## Remaining Issues

- Five legacy website orders are safely mapped but remain unchanged until an admin explicitly confirms the reconciliation preview, as required to prevent unintended historical edits.
- One imported Pancake-origin order in the preview has incomplete source address data and cannot be safely auto-mapped.
- Pancake's official readable District and Commune capitalization is `Imus` and `Bucandala iv`; these are the provider's own dropdown labels for the correct IDs.

No unresolved issue remains for new valid COD or successfully paid PayMongo website orders.

## Final Status

**Fixed**

Production commit: `64e56ca` (including preceding repair commits `783e3cb`, `53a5a17`, and `bd223f7`).

Verification summary:

- API tests: 572 passed, 0 failed, 2 environment-only PostgreSQL tests skipped
- Production web build: passed
- Production mobile checkout at 320, 360, 390, and 430 px: passed; Province, City, and Barangay codes survived through Review navigation
- Controlled production COD structured-address retrieval: passed
- Controlled production PayMongo paid-event and replay retrieval: passed
- Production health endpoint and containers: healthy
- Pancake webpage DOM manipulation: none
