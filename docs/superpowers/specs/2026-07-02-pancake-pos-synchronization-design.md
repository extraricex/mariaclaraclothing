# Pancake POS Synchronization Design

## Purpose

Connect the Maria Clara Clothing website and admin system to Pancake POS while preserving a complete local operational mirror. Pancake POS will own inventory and fulfillment state. The website will continue to own customer-facing merchandising, checkout, authoritative local order creation, and the customer experience.

The integration must tolerate temporary Pancake outages, duplicate or missed webhooks, delayed inventory changes, retries, and application restarts without losing local orders or creating duplicate Pancake orders.

## External contract

The integration uses Pancake POS Open API at `https://pos.pages.fm/api/v1`. Authentication is an `api_key` query parameter. Pancake supports shop, warehouse, order, customer, product variation, and inventory endpoints. Pancake webhooks can send `orders`, `customers`, `products`, and `variations_warehouses` records to a configured HTTPS endpoint and can include a custom request header.

Before live writes are enabled, a read-only connection probe must establish:

- the correct Pancake shop ID;
- the active warehouse ID and whether it allows order creation;
- the Pancake order-source/account identifier for the website;
- that the Pancake account currency is PHP;
- how PHP prices are represented by the account API;
- that every active website SKU maps to exactly one Pancake variation;
- whether Philippine Pancake address identifiers are available for the store account.

Price conversion must remain blocked until the read-only product comparison proves the correct unit. The website stores money in centavos; the integration must not assume that Pancake uses centavos or whole pesos.

## System ownership

### Website-owned fields

- Product title and customer-facing copy
- Product images and image order
- Collections
- SEO and metafields
- Website pricing and discount presentation
- Checkout quotes and checkout idempotency
- Local order number
- Customer account data
- Local order history and immutable checkout snapshots

### Pancake-owned fields

- Pancake product and variation identifiers
- Sellable inventory by warehouse
- Operational order status after Pancake accepts the order
- Packaging, pickup, shipment, return, cancellation, and COD collection state
- Pancake tracking and logistics metadata
- Pancake customer and order identifiers

### Locally mirrored fields

- Raw Pancake webhook payloads
- Normalized Pancake product and variation records
- Inventory snapshots and last-change metadata
- Pancake order records and status history
- Pancake customer records
- Sync attempts, errors, conflicts, and reconciliation results

Pancake-owned fields are read-only in the local admin mirror. Local changes must never automatically write those fields back to Pancake unless a later feature adds an explicit, separately authorized command.

## Architecture

The integration is an event-driven adapter with polling reconciliation:

1. Customer checkout commits the local order and existing local stock deduction in one database transaction.
2. That same transaction inserts a Pancake order-export job in a durable outbox.
3. A background worker claims the job, builds the Pancake request, and creates the Pancake order.
4. The returned Pancake order ID is mapped to the local order number.
5. Pancake webhooks update the local mirror and normalized local fulfillment state.
6. Scheduled reconciliation compares Pancake orders, variations, and inventory against the local mirror and repairs missed webhook updates.

The customer checkout response never waits for Pancake. Pancake downtime must not prevent a valid local order from being placed. The local admin displays pending or failed synchronization clearly.

## Product and variation mapping

Website variants map to Pancake variations by normalized SKU during initial setup. Every mapping stores:

- local product slug;
- local variant database ID;
- normalized SKU;
- Pancake product ID;
- Pancake variation ID;
- Pancake warehouse ID;
- mapping status;
- last verified timestamp;
- last observed Pancake payload digest.

The existing `external_pos_variant_id` remains the storefront-facing Pancake variation reference. The dedicated mapping table is the auditable source for integration metadata.

Mapping rules:

- No active website variant may map to more than one Pancake variation.
- No Pancake variation may map to more than one active website variant.
- Missing, duplicate, or blank SKUs create blocking conflicts.
- Draft website products may remain unmapped.
- Unmapped active variants are not eligible for live Pancake order export.
- Pancake product webhooks update the operational mirror but do not overwrite website merchandising.

## Inventory synchronization

Pancake `variations_warehouses` webhooks supply variation ID, warehouse ID, sellable remaining quantity, actual quantity, change quantity, and timestamps.

The website storefront uses Pancake's sellable `remain_quantity` for the configured fulfillment warehouse. Inventory events apply as absolute snapshots rather than local deltas. This prevents the local checkout deduction and the later Pancake stock webhook from deducting stock twice.

Inventory processing:

1. Authenticate and persist the raw webhook.
2. Resolve the variation mapping.
3. Reject negative or structurally invalid quantities.
4. Ignore records older than the last applied Pancake timestamp for that variation and warehouse.
5. Replace the local variant stock with Pancake's sellable quantity.
6. Append an `inventory_movements` record with source `pancake`, the previous quantity, resulting quantity, and webhook event reference.
7. Record a conflict instead of mutating stock when no unique mapping exists.

A complete variations reconciliation runs every 10–15 minutes. A daily full inventory comparison produces a report even when no corrections are required.

## Order export

Each local website order is exported once through the durable outbox. The Pancake request includes:

- Pancake shop ID and configured warehouse ID;
- local order number as `custom_id` and in the internal note;
- website order source/account;
- customer name, phone, and email;
- full shipping address and supported Pancake geography identifiers;
- item `variation_id` and quantity;
- explicitly validated Pancake retail price representation;
- shipping fee, total discount, COD amount, and free-shipping flag;
- `received_at_shop: false`;
- checkout channel metadata in the note.

The integration stores the exact outbound request with secrets removed, response status, Pancake order ID, attempt count, and timestamps.

Idempotency protections:

- One unique export job per local order.
- One unique Pancake mapping per local order.
- Before retrying an ambiguous timeout, search Pancake for the local `custom_id` or other supported unique reference.
- Never issue a second create request when a matching Pancake order already exists.
- Permanent validation failures become conflicts requiring admin resolution.

If Pancake rejects an order because stock changed after the latest mirror update, retain the local order, mark it `sync_conflict`, and surface it immediately in admin. Do not silently cancel the customer order.

## Inbound order synchronization

Pancake order webhooks are the operational authority after mapping. Store the raw numeric Pancake status and its name, then map it to local normalized fields. Initial mapping:

| Pancake status | Meaning | Local normalized state |
| --- | --- | --- |
| 0 | New | confirmed / unfulfilled |
| 17 | Waiting for confirmation | pending confirmation |
| 1 | Confirmed | confirmed / unfulfilled |
| 8 | Packaging | processing / unfulfilled |
| 9 | Waiting for pickup | processing / ready for pickup |
| 2 | Shipped | shipped / in transit |
| 3 | Received | delivered |
| 16 | Collected money | delivered / paid |
| 4 | Returning | return in progress |
| 15 | Partial return | partially returned |
| 5 | Returned | returned |
| 6 | Canceled | canceled |
| 7 | Deleted recently | archived conflict; never hard-delete locally |

Other Pancake statuses are retained raw and shown as unmapped until a deliberate mapping is added. Every normalized change appends a local order status event with source `pancake`.

Webhook updates never overwrite immutable checkout totals or item snapshots. Operational amounts from Pancake are stored in the Pancake mirror so discrepancies remain visible.

## Customer synchronization

Customer webhooks populate a Pancake customer mirror keyed by Pancake customer ID, with normalized phone and email indexes for lookup. The website customer account remains locally owned. Pancake customer updates must not overwrite website passwords, sessions, saved-address consent, or local identity fields.

Admin can view linked Pancake customer information and order history. Ambiguous phone matches are marked for review rather than merged automatically.

## Webhook receiver

Expose `POST /api/integrations/pancake/webhook` on the public HTTPS API.

Security and processing rules:

- Configure a high-entropy `X-Pancake-Webhook-Secret` through Pancake custom webhook headers.
- Compare the secret in constant time.
- Apply a strict JSON content type, request-size limit, rate limit, and schema validation.
- Persist the raw body and selected headers before asynchronous processing.
- Return success quickly after durable persistence.
- Never log the API key, webhook secret, customer address, or complete phone number.
- Deduplicate using a unique event digest composed from webhook type, shop ID, record ID, record timestamp, and canonical payload hash because the documented payload does not guarantee a universal event ID.
- Keep processing attempts and the final state independently from the raw event.

The webhook endpoint accepts only the configured shop. Events for other shops are rejected and audited.

## Reconciliation

Webhooks are treated as fast notifications, not the only recovery mechanism.

Scheduled jobs:

- Every 10–15 minutes: incremental product-variation and inventory reconciliation.
- Every 10–15 minutes: recently changed Pancake order reconciliation.
- Daily: full active variation inventory comparison.
- Daily: unresolved mapping and order conflict report.
- Nightly: encrypted database backup verification.

Reconciliation uses cursors and overlapping time windows so records near a boundary are not missed. Writes are idempotent.

## Database structure

Add the following PostgreSQL tables:

### `pancake_connections`

Non-secret connection metadata: shop ID, warehouse ID, order source ID, enabled mode, currency-validation state, last successful connection time, and health state. The API key and webhook secret remain environment secrets and are never stored in this table.

### `pancake_variant_mappings`

Local variant/SKU to Pancake product, variation, and warehouse mapping with unique constraints and verification state.

### `pancake_inventory_snapshots`

Latest Pancake sellable and actual quantities per variation and warehouse, source timestamp, payload digest, and applied timestamp.

### `pancake_order_mappings`

Unique local order number to Pancake order ID mapping, custom ID, export state, last Pancake status, and last synchronized timestamp.

### `pancake_order_mirror`

Normalized Pancake order fields plus the latest redacted Pancake record. Immutable local checkout data remains in `orders`.

### `pancake_customer_mirror`

Pancake customer identity and contact mirror with normalized lookup values and source timestamps.

### `pancake_webhook_events`

Immutable raw payload, event digest, type, source record identifiers, processing state, attempts, and error details.

### `pancake_sync_outbox`

Durable outbound jobs with unique aggregate/event constraints, redacted request payload, retry schedule, lease fields, attempt count, and result.

### `pancake_sync_conflicts`

Blocking and warning conflicts with entity references, machine-readable codes, context, status, resolution notes, and timestamps.

### `pancake_reconciliation_runs`

Job type, cursor/window, counts, corrections, conflicts, status, duration, and error summary.

## Worker behavior

Workers use database leases with `FOR UPDATE SKIP LOCKED`, matching the project's existing outbox approach. Retryable failures use bounded exponential backoff with jitter. Authentication failures pause all Pancake writes and raise a critical admin alert. Validation failures do not retry indefinitely. Stale leases recover automatically.

Suggested job states are `pending`, `sending`, `sent`, `retry`, `failed`, and `conflict`.

## Admin mirror

Add an `Admin → Pancake POS` section with:

- connection health and mode;
- shop, warehouse, order source, and currency validation;
- last webhook and reconciliation times;
- pending, retrying, failed, and conflicting jobs;
- SKU/variation mapping coverage;
- website versus Pancake inventory comparison;
- local/Pancake order linkage and Pancake status history;
- mirrored Pancake customer record;
- redacted webhook and sync attempt audit trail;
- manual retry, reprocess, and reconciliation actions;
- exportable conflict and reconciliation reports.

The admin must label each field as Website-owned, Pancake-owned, or Mirrored. Dangerous actions require confirmation and an admin audit event.

## Configuration and operating modes

Environment secrets:

- `PANCAKE_API_KEY`
- `PANCAKE_WEBHOOK_SECRET`

Non-secret settings:

- Pancake API base URL fixed to the official HTTPS host;
- shop ID;
- fulfillment warehouse ID;
- website order-source ID;
- reconciliation intervals;
- request timeouts;
- integration mode.

Modes:

- `disabled`: no external calls or webhook mutations;
- `read_only`: connection, catalog, mapping, and reconciliation reads only;
- `shadow`: build and validate order requests without sending creates;
- `live`: outbound orders and inbound mirror updates enabled.

Changing to `live` requires all blocking readiness checks to pass.

## Backup and recovery

The local mirror is not by itself an independent backup. Protect it with:

- encrypted nightly PostgreSQL backups stored outside the application host and Docker volumes;
- 30 daily and 12 monthly restore points;
- periodic restore tests;
- immutable webhook and sync audit retention;
- documented recovery order: restore database, disable outbound writes, replay unprocessed webhooks, reconcile Pancake state, then re-enable live mode.

Customer PII in backups must follow the same access controls and retention policy as the production database.

## Failure behavior

- Pancake unavailable: website checkout continues; export remains queued.
- Webhook unavailable: Pancake can retry, and scheduled reconciliation repairs the mirror.
- Duplicate webhook: deduplication returns success without applying twice.
- Unknown SKU or variation: create a blocking mapping conflict.
- Stale inventory webhook: retain for audit and do not overwrite newer stock.
- Ambiguous order timeout: search Pancake before retrying creation.
- API authentication failure: pause integration and alert admin.
- Currency or price-unit mismatch: block shadow-to-live promotion.
- Local database unavailable: webhook returns a retryable failure because durability was not achieved.

## Rollout phases

### Phase 1: Connection and schema

Add configuration validation, integration tables, a read-only Pancake client, health checks, and the admin status shell.

### Phase 2: Catalog mapping

Import shops, warehouses, order sources, products, and variations. Build SKU mapping and conflict reporting. Validate currency and price units.

### Phase 3: Inventory mirror

Enable authenticated webhook persistence, inventory processing, storefront stock replacement, and scheduled reconciliation.

### Phase 4: Order shadow mode

Generate Pancake order requests from real local orders, validate them, and display what would be sent without creating Pancake orders.

### Phase 5: Live order export

Enable durable Pancake order creation, mapping, retries, ambiguous-timeout recovery, and sync conflict handling.

### Phase 6: Order and customer mirror

Enable inbound order/customer processing, normalized status mapping, local status events, and complete admin mirror views.

### Phase 7: Backup and operational hardening

Enable full reconciliation schedules, off-host encrypted backups, restore testing, alerts, metrics, runbooks, and live-mode readiness checks.

Each phase must pass unit, integration, migration, failure-injection, and browser/admin tests before the next phase is activated. Production starts in `read_only`, advances to `shadow`, and reaches `live` only after credentialed Pancake contract tests pass.

## Acceptance criteria

- Every active website SKU has one verified Pancake variation mapping.
- Pancake inventory updates reach the website and missed events are repaired automatically.
- Every local order is retained even when Pancake is unavailable.
- Live order export cannot create duplicates under retries or timeouts.
- Pancake order and customer data are visible locally with a complete audit trail.
- Website merchandising is never overwritten by Pancake operational data.
- Local admin clearly exposes pending sync, failures, and conflicts.
- No Pancake secret appears in browser bundles, logs, database records, or admin responses.
- A documented and tested independent database restore exists.
