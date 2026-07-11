# Pancake Live Order Export Design

## Context

Pancake POS sync is currently safe and automatic: catalog imports, inventory reconciliation, and order shadow payload building run in the API background worker. Shadow export proves that website orders can be converted into Pancake order payloads without creating Pancake orders.

The next step is controlled live order creation. This must stay opt-in behind `PANCAKE_MODE=live` so the current read-only/shadow behavior remains safe.

## Scope

Build live Pancake order export for website orders that already have a queued Pancake export row. The live exporter will reuse the existing shadow payload builder, call Pancake's official `POST /shops/{SHOP_ID}/orders` endpoint, and persist the returned Pancake order ID.

Out of scope for this step:

- Pancake webhook ingestion.
- Editing or canceling Pancake orders after creation.
- Creating Pancake products or changing Pancake inventory.
- Cleaning old demo order blocks automatically.

## Behavior

When `PANCAKE_MODE` is `read_only` or `shadow`, automatic sync continues to build local shadow payloads only.

When `PANCAKE_MODE` is `live`, the automatic worker processes queued exports as live exports:

1. Queue missing local website orders.
2. Load Pancake readiness and verified SKU mappings.
3. Build the same Pancake order payload used for shadow review.
4. Send the payload to Pancake with `POST /shops/{SHOP_ID}/orders`.
5. Store the redacted request payload, Pancake order ID, mode `live`, status `sent`, and `sent_at`.
6. Never send an export row that is already `sent`.

If Pancake returns a retryable provider/network error, the row becomes `failed` so a later worker cycle can retry. If the payload cannot be built because mappings or references are missing, the row becomes `blocked`.

## Duplicate Protection

The website order number remains the idempotency key:

- `pancake_order_exports.order_number` is unique.
- Newly created website orders enqueue one export row with that order number.
- Sent rows are excluded from future processing.
- The Pancake payload includes `custom_id` equal to the website order number.

This prevents the API from creating duplicate Pancake orders during normal retries or container restarts.

## API Client

Extend `pancakeClient` with `createOrder(shopId, payload)`:

- Method: `POST`.
- Path: `/shops/{SHOP_ID}/orders`.
- Authentication: existing `api_key` query parameter.
- Request body: JSON payload from `buildPancakeOrderPayload`.
- Response validation: accept an object and extract the order ID from common response shapes: `id`, `data.id`, or `order.id`. If no ID exists, classify it as `pancake_invalid_response`.

## Admin UI

The existing Pancake admin page remains focused on status. Copy should indicate that `sent` means a live Pancake order was created. No secret values are displayed.

## Testing

Add tests before implementation for:

- Pancake client sends `POST /shops/{SHOP_ID}/orders` with JSON and extracts the Pancake order ID.
- Live export sends mapped queued orders, marks them `sent`, and stores the Pancake ID.
- Live export never sends orders unless `PANCAKE_MODE=live`.
- Live export classifies provider errors as retryable `failed` rows and mapping/readiness problems as `blocked` rows.
- Repository can mark a row sent and exclude sent rows from queued work.

