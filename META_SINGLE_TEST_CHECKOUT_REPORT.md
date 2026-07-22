# Meta Single Test Checkout Report

## Scope

No Meta campaign, ad set, ad, budget, audience, creative, placement, bidding strategy, optimization setting, attribution setting, or destination setting was changed.

The test used one controlled Cash on Delivery checkout. It did not create a real payment. The order was marked as a controlled test, cancelled after verification, restocked, and retained as an audit record.

## Test Order

- Test reference: `META-TEST-20260722T121634-A2E18A`
- Order number: `MCC-1784694210631-5836`
- Payment method: Cash on Delivery
- Order status: Cancelled after verification
- Payment status: `cod_pending`
- Final order total: 729
- Currency: `PHP`
- Actual transaction time: 2026-07-22 12:23:30 PHT (`event_time: 1784694210`)

No private customer details are included in this report.

## Primary Dataset

- Dataset name: Maria Clara Clothing
- Dataset ID: `595813035761213`
- Browser Pixel used: Yes — `595813035761213` only
- CAPI used: Yes — `595813035761213` only
- Result: Passed. Production configuration, persisted order audit, browser payload, CAPI payload, and Meta Test Events all used the primary dataset.

The production Meta access token remains server-side and is not included here. The accepted CAPI event on dataset `595813035761213` confirms the configured token could send to the primary dataset.

## Secondary Dataset

- Dataset name: MCC Pixel Tracker
- Dataset ID: `763597815708078`
- Browser Purchase received: No
- Server Purchase received: No
- Result: Passed. Its Test Events view contained neither `Purchase` nor the controlled event ID.

## Pixel Purchase

- Event name: `Purchase`
- Value: 729
- JavaScript type: `number`
- Currency: `PHP`
- Event ID: `purchase_MCC-1784694210631-5836`
- Dispatch count: 1
- Result: Passed. Meta Test Events displayed value `729`, currency `PHP`, the permanent event ID, and status `Deduplicated` for the Browser event.

## CAPI Purchase

- Event name: `Purchase`
- `custom_data.value`: 729
- JSON type: `number`
- `custom_data.currency`: `PHP`
- `event_id`: `purchase_MCC-1784694210631-5836`
- `event_time`: `1784694210`
- Dispatch count: 1
- Meta response: Accepted on the first attempt; one event received and a provider trace recorded
- Result: Passed. The durable outbox contains one sent Purchase row with `attempt_count: 1`; the server dispatch table contains one sent row; Meta Test Events displayed value `729`, currency `PHP`, and the matching event ID.

Meta Test Events visually rendered the same Server row twice with identical event ID, event time, value, and currency. The application audit confirms this was not a second application dispatch: there is one outbox row, one claim/attempt, one server dispatch row, and one accepted API response.

## Deduplication

- Pixel `eventID`: `purchase_MCC-1784694210631-5836`
- CAPI `event_id`: `purchase_MCC-1784694210631-5836`
- Exact match: Yes
- Same dataset: Yes — `595813035761213`
- Same value: Yes — 729
- Same currency: Yes — `PHP`
- Meta deduplication result: Confirmed. Meta marked the Browser Purchase `Deduplicated` against the Server Purchase.
- Expected counted Purchase: 1

## Thank You Page Refresh Test

- First refresh: No additional Purchase or order
- Multiple refreshes: Three additional refreshes; no additional Purchase or order
- Reopened URL: No additional Purchase or order
- Second browser tab: No additional Purchase or order
- Additional Pixel Purchase: 0
- Additional CAPI Purchase: 0
- Additional website order: 0
- Result: Passed. Final audit remained one order, one permanent event ID, one browser dispatch, one server dispatch, and one original stock deduction.

A delayed Pancake auto-backfill exposed a test-isolation race during this check. It created one Pancake record, not a duplicate. The order was immediately cancelled, Pancake confirmed provider status `cancelled`, inventory was restored exactly once, and production was patched so controlled test orders are excluded from all Pancake enqueue/list/work-item paths and ignored by inbound Pancake polling.

## Final Purchase Count

- Website orders created: 1
- Unique Purchase event IDs: 1
- Pixel Purchase dispatches: 1
- CAPI Purchase dispatches: 1
- Deduplicated transactions: 1
- Expected Meta Purchase count: 1
- Final result: Passed

Containment audit:

- Notification outbox records: 0
- Pancake orders created: 1 controlled test record, cancelled at Pancake; duplicate Pancake orders: 0
- Inventory movements: one `order_created` deduction (`-1`) and one `order_cancelled` restoration (`+1`), net 0
- Final local order status: `cancelled`
- Final Pancake provider status: `cancelled`

## Files Changed

Production implementation:

- `apps/api/db/migrations/20260722_meta_controlled_test_checkout.sql`
- `apps/api/db/schema.sql`
- `apps/api/scripts/create-meta-controlled-test-grant.js`
- `apps/api/src/checkout/authoritativeCheckoutService.js`
- `apps/api/src/marketing/marketingEventOutboxRepository.js`
- `apps/api/src/marketing/metaControlledTest.js`
- `apps/api/src/marketing/metaConversionsApi.js`
- `apps/api/src/marketing/metaEvent.js`
- `apps/api/src/marketing/metaPurchaseService.js`
- `apps/api/src/routes/orders.js`
- `apps/api/src/integrations/pancake/pancakeOrderExportRepository.js`
- `apps/api/src/integrations/pancake/pancakeOrderExportService.js`
- `apps/api/src/integrations/pancake/pancakeOrderSyncService.js`
- `apps/web/src/admin/OrderDetail.jsx`
- `apps/web/src/lib/api.js`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/CheckoutReview.jsx`
- `apps/web/src/pages/ThankYou.jsx`

Automated tests:

- `apps/api/test/authoritativeCheckoutService.test.js`
- `apps/api/test/checkoutV2Routes.test.js`
- `apps/api/test/metaControlledTest.test.js`
- `apps/api/test/metaConversionsApi.test.js`
- `apps/api/test/metaEvent.test.js`
- `apps/api/test/metaPurchaseService.test.js`
- `apps/api/test/pancakeOrderExportRepository.test.js`
- `apps/api/test/pancakeOrderExportService.test.js`
- `apps/api/test/pancakeOrderSyncService.test.js`
- `apps/web/test/checkoutV2.test.js`

Report:

- `META_SINGLE_TEST_CHECKOUT_REPORT.md`

## Remaining Issues

No unresolved application issue blocks this acceptance result.

Meta Test Events rendered two identical visual Server rows for the one accepted server dispatch. Both carried the same permanent event ID and transaction time; the durable application audit proves only one CAPI dispatch occurred. This is recorded as a Meta UI observation, not a second application send.

The controlled-order Pancake auto-backfill race found during testing is fixed and deployed. The affected test record is cancelled in both the website and Pancake, with inventory fully restored and no duplicate Pancake order.

## Final Status

Fixed
