# Pancake Order Shadow Export Design

Date: 2026-07-07
Status: Approved by user request to proceed with the next recommendation
Mode: Shadow order export; no Pancake writes

## Purpose

Generate Pancake-compatible order payloads from real website orders and persist an audit trail without sending `POST /shops/{SHOP_ID}/orders` yet. This phase proves that website checkout data, selected Pancake shop, selected warehouse, selected order source, SKU mapping, and confirmed price units are sufficient for live order export later.

## Approach

Use the existing authoritative checkout transaction as the enqueue point. After the local order, stock movement, cart conversion, promotion claim, Meta outbox, and quote consumption are persisted, insert or update one Pancake shadow export row for that local order in the same transaction. Checkout success must not depend on Pancake network availability.

An admin-triggered shadow build can also process existing local orders. It builds the same request body and stores a redacted snapshot for review. In `read_only` or `shadow` mode this never calls Pancake. In `disabled` mode it reports disabled. `live` mode remains blocked in this phase.

## Pancake Contract

The official OpenAPI document for `POST /shops/{SHOP_ID}/orders` accepts an order object. The shadow payload includes the safe subset needed for Maria Clara orders:

- `shop_id`
- `warehouse_id`
- `custom_id` set to the local order number
- `bill_full_name`
- `bill_phone_number`
- `bill_email`
- `shipping_address`
- `items[].variation_id`
- `items[].quantity`
- `items[].product_id`
- `items[].variation_info.retail_price`
- `shipping_fee`
- `total_discount`
- `is_free_shipping`
- `received_at_shop: false`
- `status: 0`
- `note`
- `note_print`

Money is converted from website centavos to Pancake whole pesos only when `price_unit_status = confirmed_pesos`. Other price-unit states block shadow payload creation.

## Readiness Rules

Shadow export is ready only when:

- Pancake mode is `read_only` or `shadow`;
- API key is configured;
- selected shop, warehouse, and order source exist;
- latest complete catalog import has zero conflicts;
- every order item resolves to one verified Pancake variation mapping;
- price unit is `confirmed_pesos`;
- the selected warehouse allows order creation when that evidence is available.

Failures become safe admin-readable status codes on the shadow export row. They do not cancel or change the local order.

## Data Model

Add `pancake_order_exports`:

- one row per local `order_number`;
- mode, status, safe error code, attempt count, shop, warehouse, order source;
- redacted request JSON;
- redacted response JSON for future live mode;
- Pancake order ID for future live mode;
- timestamps and duration.

Statuses:

- `queued`: order is awaiting shadow build;
- `shadow_built`: payload built and ready for review;
- `blocked`: readiness or mapping issue prevents payload generation;
- `failed`: unexpected internal error while building;
- `sent`: reserved for live mode and not used in this phase.

## Admin UI

Extend Admin -> Pancake POS with an order shadow section:

- current status counts;
- latest shadow export timestamp;
- button to build shadow exports;
- recent export rows with local order, status, safe error code, Pancake order ID placeholder, and timestamp.

Copy must clearly say no Pancake orders are created.

## Safety

No Pancake order create request is sent in this phase. API keys are not persisted, displayed, logged, or stored in export payloads. Customer PII is already present in local orders; admin payload snapshots are redacted enough for review by masking phone and email while retaining address context needed for operational validation.

## Acceptance Criteria

- New website orders enqueue one Pancake export audit row transactionally.
- Existing orders can be shadow-built from Admin.
- Shadow build creates a valid Pancake request for mapped orders.
- Missing mapping, unresolved catalog conflict, missing references, or unconfirmed price unit blocks shadow build with a safe code.
- Admin displays shadow counts and recent rows.
- API tests, migration tests, web source tests, full API test suite, web tests, build, Docker migration, and health check pass.
