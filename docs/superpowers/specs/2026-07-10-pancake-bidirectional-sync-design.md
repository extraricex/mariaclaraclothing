# Pancake Bidirectional Sync Design

Date: 2026-07-10
Status: Approved design, pending implementation plan

## Purpose

Make the website, admin dashboard, and Pancake POS operate as one connected system for orders, statuses, inventory, customer details, payment details, shipping details, discounts, COD amounts, notes, and tracking numbers.

The existing Pancake integration already supports automatic catalog import, Pancake-to-website inventory reconciliation, website order export queueing, and live website order creation in Pancake when `PANCAKE_MODE=live`. This design extends that foundation into safe bidirectional sync.

## Scope

This project adds automated background sync for:

- Website order creation to Pancake POS.
- Pancake order creation or updates into website/admin.
- Bidirectional order status updates.
- Bidirectional customer, address, notes, tracking, shipping, payment, discount, COD, and total fields where Pancake API supports writes.
- Pancake inventory changes into website inventory and storefront product availability.
- Durable sync logs, retry state, idempotency, and admin-visible sync state.

This project does not create or edit Pancake products automatically. Product matching continues through verified SKU and Pancake variation mappings. Admin product editor fields for Pancake product ID, Pancake variation ID, Pancake SKU, and barcode can be added as mapping metadata, but Pancake remains the source for Pancake-side product identifiers.

## Sync Method

Default method is backend polling every 1-5 minutes because public official Pancake webhook documentation was not found during discovery. The worker will use configurable intervals and safe API pagination.

If Pancake provides official webhook documentation or enabled webhook settings later, webhook ingestion can be added as a second entry point into the same idempotent sync pipeline. Webhooks must not bypass duplicate protection, timestamp checks, or sync logs.

## Data Model

Add durable Postgres tables:

- `pancake_order_links`: one row per linked order, keyed by local `order_number` and unique `pancake_order_id`.
- `pancake_sync_events`: idempotent inbound/outbound work records with direction, entity type, entity ID, event key, status, attempts, next retry time, safe error code, and payload hashes.
- `pancake_sync_logs`: append-only safe operational logs for admin and support review.
- `pancake_order_snapshots`: latest normalized Pancake order snapshot for conflict comparison and timestamp checks.

Extend existing `pancake_order_exports` or migrate its successful live export fields into `pancake_order_links` without losing existing sent rows.

No API keys, webhook secrets, raw provider payloads with credentials, or full sensitive provider responses are stored in logs.

## Identity and Idempotency

Order matching priority:

1. Existing `pancake_order_id`.
2. Pancake `custom_id` matching website `orderNumber`.
3. Website order number present in Pancake note/custom fields.
4. Phone + order total + created time window only as a low-confidence match that creates a sync conflict instead of auto-merging.

Product matching priority:

1. Verified Pancake variation ID.
2. Verified Pancake SKU mapping.
3. Barcode if present and verified.
4. Website variant ID only when previously linked.

Product name is never used as the sole matching key.

Each inbound Pancake order update receives a deterministic event key from Pancake order ID, updated timestamp, status, tracking number, and payload hash. Replayed events are marked duplicate and do not create another order or deduct inventory again.

Each outbound website update uses a deterministic event key from local order number, changed fields, local updated timestamp, and target Pancake order ID. Retries reuse the same event row until terminal success or blocked state.

## Conflict and Source-of-Truth Rules

Use timestamp-aware field merging:

- Website checkout owns initial website order creation and local order number.
- Pancake owns absolute stock quantity.
- Admin owns local manual edits until Pancake sends a newer timestamp for the same field.
- Pancake owns tracking number if it was added or updated in Pancake after the local tracking timestamp.
- Payment and fulfillment status use the newest source timestamp when both systems can update the field.
- Unknown Pancake status values map to `other` and create a non-blocking sync log entry.

Never overwrite newer local data with older Pancake data. Never overwrite newer Pancake data with older website/admin data. If timestamps are missing or ambiguous for a sensitive field, keep local data and create a conflict log requiring admin review.

## Status Mapping

Normalize local statuses:

- `received`: New
- `confirmed`: Confirmed
- `packed`: Packing
- `shipped`: Shipped
- `delivered`: Delivered
- `cancelled`: Cancelled
- `returned`: Returned
- `failed`: Failed
- `unreachable`: Unreachable
- `other`: Unknown/Other

Pancake statuses are mapped through a dedicated mapper. Known names and numeric codes map to local statuses. Unknown values become `other` and keep the raw Pancake value in the safe snapshot/log for support review.

## Website to Pancake Flow

When a website order is created:

1. Save the order locally through the existing checkout transaction.
2. Deduct website inventory through the existing stock deduction path.
3. Enqueue outbound Pancake order sync in the same durable transaction when possible.
4. Background worker exports the order to Pancake in `PANCAKE_MODE=live`.
5. On success, store Pancake order ID, sync status `synced`, and last sync time.
6. On retryable failure, keep local order saved, mark sync `pending` or `failed`, and retry automatically.
7. On missing mapping, mark sync `blocked` with safe error `pancake_order_item_mapping_missing`.

Outbound payload includes order number, customer, phone, email, address, barangay, city, province, ZIP code, item names, SKUs, variant IDs, quantities, prices, discounts, shipping fee, payment method, payment status, COD amount, total amount due, and notes as supported by Pancake API fields.

## Pancake to Website Flow

Polling worker loads Pancake orders changed since the last cursor timestamp.

For each Pancake order:

1. Normalize Pancake payload into the local order model.
2. Match to an existing local order using identity rules.
3. If linked, merge changed fields with timestamp protection.
4. If not linked and confidence is high, create a local admin order with `channel='Pancake POS'`.
5. If matching confidence is low, create a sync conflict and do not create a duplicate.
6. Record sync logs and update the cursor only after processing the page safely.

Pancake-created orders imported locally must not deduct local inventory again if Pancake stock reconciliation already reflects the sale. Local inventory changes from Pancake orders are handled by absolute inventory reconciliation, not by applying order deltas twice.

## Admin Order Updates to Pancake

When admin edits order status, customer details, address, payment fields, shipping details, tracking number, or notes:

1. Save the local order update.
2. Create an outbound Pancake sync event for changed Pancake-supported fields.
3. Worker sends the update to Pancake if the order is linked.
4. If the order is not linked, leave the event pending until the order export/link succeeds.
5. If Pancake rejects unsupported fields, mark only those fields blocked and keep local changes.

Admin must not need a manual sync button for normal operation.

## Inventory Sync

Continue using Pancake inventory reconciliation as absolute stock source:

- Pancake stock changes update local product variants.
- Website storefront reflects updated stock through existing product APIs.
- Stock `0` shows sold out.
- Low stock uses existing inventory settings for limited pieces alerts.

Website order creation still deducts local stock immediately for customer experience and oversell protection. The later Pancake absolute reconciliation corrects drift without double-applying the same Pancake order.

Outbound website-to-Pancake inventory writes are not part of the first implementation unless Pancake write endpoint behavior and rate limits are confirmed. If added later, it must be controlled by a separate env flag and event log.

## Admin UI

Admin Order Details shows:

- Pancake POS order ID.
- Sync status: `synced`, `pending_sync`, `sync_failed`, `blocked`, `not_linked`.
- Last synced time.
- Last sync error safe code.
- Product mapping status.
- Inventory sync status.
- Recent sync log entries.

The existing Pancake status metric should use durable link/event data instead of only export status when available.

## Error Handling and Retry

Provider/network failures:

- Do not fail customer checkout.
- Do not lose local order data.
- Mark event `failed_retryable`.
- Retry with exponential backoff capped by config.
- Preserve safe error code for admin.

Permanent failures:

- Mark event `blocked`.
- Store safe error code.
- Show admin action needed only when mapping/config/manual correction is required.

The worker must not crash the API process. A failed event must not block unrelated events.

## Environment Variables

Use existing Pancake variables and add explicit sync controls:

- `PANCAKE_API_BASE_URL`
- `PANCAKE_API_KEY`
- `PANCAKE_SHOP_ID`
- `PANCAKE_WAREHOUSE_ID`
- `PANCAKE_ORDER_SOURCE_ID`
- `PANCAKE_WEBHOOK_SECRET`
- `PANCAKE_MODE`
- `PANCAKE_AUTO_SYNC_ENABLED`
- `PANCAKE_AUTO_SYNC_INTERVAL_MS`
- `PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS`
- `PANCAKE_ORDER_POLL_INTERVAL_MS`
- `PANCAKE_ORDER_POLL_PAGE_SIZE`
- `PANCAKE_ORDER_POLL_LOOKBACK_MS`
- `PANCAKE_SYNC_MAX_ATTEMPTS`

All secrets remain server-side and are documented in `.env.example` without real values.

## Testing

Automated tests cover:

- Website order creation enqueues Pancake sync without failing checkout.
- Live order export stores Pancake order ID and link state.
- Admin status changes enqueue outbound Pancake update events.
- Pancake order polling imports a new Pancake order into admin.
- Pancake order polling updates an existing linked order without duplication.
- Unknown Pancake status maps to `other`.
- Duplicate inbound event does not duplicate order or inventory movement.
- Retryable Pancake API failure creates retry state and later succeeds.
- Missing product mapping blocks sync with a safe error code.
- Pancake inventory reconciliation updates local storefront stock.
- Order details source renders Pancake sync ID, status, last sync, error, mapping, and inventory sections.

Manual verification covers:

1. Customer places website order.
2. Order appears in admin.
3. Order automatically syncs to Pancake.
4. Pancake order ID appears in admin.
5. Admin status update syncs to Pancake.
6. Pancake status update syncs to admin.
7. Pancake inventory change updates admin/storefront.
8. Pancake-created order appears in admin.
9. Pancake tracking number appears in admin.
10. API failure retries automatically.
11. Duplicate Pancake update does not create duplicate order or double stock movement.

## Rollout

Use staged rollout:

1. `PANCAKE_MODE=shadow`: build logs/events only, no Pancake writes.
2. `PANCAKE_MODE=live` with order export enabled: website orders create Pancake orders.
3. Enable inbound Pancake polling.
4. Enable outbound admin updates for status/tracking/customer/payment/shipping fields.

Each stage must expose admin-visible sync status and safe logs before enabling the next stage.
