# Pancake POS Phase 2 Catalog Mapping Design

Date: 2026-07-04
Status: Approved for planning
Mode: Read-only Pancake access

## Purpose

Import Pancake reference and catalog data, map Maria Clara website variants to Pancake variations by exact normalized SKU, validate price representation, and expose conflicts in the existing Admin → Pancake POS page. Phase 2 never creates or changes Pancake products, inventory, customers, or orders.

This design extends the Phase 1 connection foundation and the approved full synchronization design in `2026-07-02-pancake-pos-synchronization-design.md`.

## Verified Pancake API Contract

Use only the official production API at `https://pos.pages.fm/api/v1` and authenticate with the server-held `api_key` query parameter. The current official OpenAPI document at `https://api-docs.pancake.biz/openapi.json?lang=en` defines the Phase 2 reads:

- `GET /shops`
- `GET /shops/{SHOP_ID}/warehouses`
- `GET /shops/{SHOP_ID}/order_source`
- `GET /shops/{SHOP_ID}/products/variations`

The product/variation endpoint is paginated with `page_number`, `page_size`, `total_entries`, and `total_pages`. Variation records include the Pancake variation ID, product ID, display identifier, retail price, product metadata, timestamps, and per-warehouse quantities. Phase 2 stores inventory fields only as catalog evidence; it does not apply them to storefront stock.

## Scope

Phase 2 adds:

- read-only client methods for warehouses, order sources, and every page of product variations;
- safe normalized mirrors of shop, warehouse, order-source, and variation identity data;
- deterministic exact-SKU mapping against active website variants;
- mapping conflicts and coverage reporting;
- explicit warehouse and order-source selection in local integration settings;
- currency and price-unit evidence with a blocked/confirmed state;
- authenticated admin import and read APIs;
- responsive additions to the existing Pancake POS admin page.

Phase 2 does not add webhooks, inventory mutations, scheduled reconciliation, order request generation, Pancake writes, or customer synchronization.

## Ownership and Safety

Website merchandising remains authoritative. Imports must never overwrite product titles, copy, images, collections, SEO, website prices, variant sizes, or website stock.

Pancake identifiers, raw price values, active/hidden state, and warehouse availability are mirrored evidence. The API key remains only in server environment configuration and is never written to PostgreSQL, returned by an API, logged, or bundled into browser assets.

The integration must be in `read_only` mode before a catalog import can call Pancake. `disabled` returns a safe disabled result. `shadow` and `live` are rejected for Phase 2 activation because later phases are not implemented. An API key is sufficient to discover shops; warehouse, source, and catalog reads additionally require a selected shop.

## Data Model

### `pancake_shops`

Store only safe shop reference fields returned by `GET /shops`: shop ID, display name, last-seen timestamp, and a digest of the accepted safe fields. Do not mirror linked pages, advertising account information, or other channel metadata in Phase 2.

### `pancake_warehouses`

Store safe warehouse reference fields:

- `shop_id`
- `warehouse_id`
- `name`
- `allow_create_order`
- `source_updated_at` when provided
- `last_seen_at`

Use `(shop_id, warehouse_id)` as the unique key. Do not store phone numbers or full warehouse addresses because Phase 2 does not need them.

### `pancake_order_sources`

Store:

- `shop_id`
- `order_source_id` as text because the API can return numeric or string IDs
- `parent_id` as nullable text
- `name`
- `source_updated_at`
- `last_seen_at`

Use `(shop_id, order_source_id)` as the unique key.

### `pancake_catalog_variations`

Store one latest safe record per Pancake variation:

- `shop_id`
- `pancake_product_id`
- `pancake_variation_id`
- `display_id`
- `normalized_sku`
- `product_name`
- `retail_price_raw`
- `is_hidden`
- `is_locked`
- `source_updated_at`
- `payload_digest`
- `last_seen_import_id`
- `last_seen_at`

Do not store Pancake product images, supplier data, internal notes, costs, full raw payloads, or inventory mutations in Phase 2.

### `pancake_variant_mappings`

Store the auditable relationship:

- local `product_variants.id`
- local product slug
- original and normalized local SKU
- Pancake product and variation IDs
- selected warehouse ID when configured
- mapping status: `verified`, `missing`, `duplicate_local`, `duplicate_pancake`, or `inactive`
- last verified import ID and timestamp
- Pancake payload digest

Unique constraints prevent one active local variant from mapping to multiple Pancake variations and one Pancake variation from mapping to multiple active local variants.

The mapping import may update `product_variants.external_pos_variant_id` only for a unique verified match. It clears nothing automatically: a previously stored ID that disagrees with a new unique match becomes a blocking conflict for admin review.

### `pancake_sync_conflicts`

Store machine-readable catalog conflicts with entity references, severity, redacted context, first/last seen timestamps, occurrence count, and resolution state. Phase 2 conflict codes are:

- `local_sku_blank`
- `local_sku_duplicate`
- `pancake_sku_blank`
- `pancake_sku_duplicate`
- `pancake_match_missing`
- `external_id_mismatch`
- `shop_not_selected`
- `warehouse_not_selected`
- `warehouse_disallows_orders`
- `order_source_not_selected`
- `currency_unknown`
- `price_unit_ambiguous`
- `price_mismatch`

Repeated imports update the same open conflict rather than creating duplicates. A later clean import resolves only conflicts that the new complete import proves absent.

### `pancake_catalog_imports`

Store one audit record per complete or failed import: start/end time, mode, page counts, local/Pancake variation counts, mapped/missing/conflict counts, selected reference IDs, price evidence counts, status, duration, and a safe error code. Never store provider URLs containing the API key or raw response bodies.

Extend `pancake_connections` with selected shop/warehouse/order-source metadata plus currency and price-unit validation states. Selections are non-secret local settings. Environment IDs, when present, are treated as locked deployment overrides; otherwise an administrator can select imported records.

## SKU Normalization and Mapping

Normalize both sides with Unicode NFKC, trim leading and trailing whitespace, and uppercase using locale-independent rules. Do not remove punctuation or internal characters because `ABC-1` and `ABC1` may be different SKUs.

For every complete import:

1. Load all active local variants and every imported Pancake variation.
2. Group both sides by normalized SKU.
3. Map only groups containing exactly one active local variant and exactly one Pancake variation.
4. Mark blank and duplicate groups as blocking conflicts.
5. Mark unmatched active website variants as `missing` conflicts.
6. Permit draft/inactive website variants to remain unmapped without blocking readiness.
7. Persist verified mappings and safe conflict counts in one PostgreSQL transaction after all Pancake pages have been fetched and validated.

If any page fails or pagination is inconsistent, mark the import failed and do not resolve old conflicts or replace the last complete mirror.

## Pagination and Provider Validation

Request a bounded page size and follow `total_pages` from page 1. Reject invalid page numbers, negative totals, missing data arrays, repeated pages, or a total-page count above the configured safety maximum. Cap total records to prevent a malformed provider response from exhausting memory.

All client errors use the Phase 1 safe error taxonomy. Retryable status is retained, but the admin API never exposes provider response bodies or credential-bearing URLs.

## Shop, Warehouse, and Order-Source Selection

The admin page lists imported shops, warehouses, and order sources. An administrator can select one of each when no environment override is set.

- A selected shop must be returned by the authenticated API key.
- A selected warehouse must belong to the configured shop.
- A warehouse with `allow_create_order: false` can be viewed but cannot pass future order-export readiness.
- The selected order source must belong to the configured shop.
- Changing the selected shop invalidates the current warehouse/source readiness and requires a new complete catalog import; prior imports remain as audit records.
- Changing any selection recalculates readiness but performs no Pancake write.

## Currency and Price-Unit Validation

Pancake `retail_price` is stored exactly as an integer `retail_price_raw`; Phase 2 does not assume whether it represents pesos or centavos.

For uniquely mapped variants with a website price, compute two read-only candidates:

- raw-as-centavos: `retail_price_raw === website_price_cents`
- raw-as-pesos: `retail_price_raw * 100 === website_price_cents`

The admin page displays sample comparisons and evidence counts. Automatic confirmation is allowed only when every comparable unique mapping supports exactly one candidate and at least three mappings were compared. Mixed evidence, too few samples, or legitimate price differences keep the state `ambiguous` and require a later explicit admin confirmation backed by a known product comparison.

Currency must be shown only when returned by the account API. Missing or non-PHP currency remains `unknown` or `conflict`; it is never inferred from locale. Phase 4 remains blocked until currency is PHP and one price unit is confirmed.

## Server APIs

All routes live below `/api/admin/integrations/pancake`, inherit existing admin session authentication and CSRF protection, and use the sensitive admin rate limiter.

- `POST /catalog/import`: run one read-only complete import; reject concurrent imports.
- `GET /catalog/status`: return latest import summary, coverage, validation state, and safe errors.
- `GET /catalog/mappings`: paginated mapping and conflict rows with filters.
- `GET /references`: return imported shops, warehouses, and order sources.
- `PUT /references/selection`: save local shop, warehouse, and order-source selections when not environment-locked.

Responses contain no API key, webhook secret, raw provider body, supplier/cost data, or unnecessary address/contact data.

## Admin UI

Extend the existing responsive Pancake POS page without redesigning the admin interface. Add:

- an `Import catalog` button labeled as read-only;
- latest import status and timestamp;
- mapping coverage totals;
- shop, warehouse, and order-source dropdowns with locked-state messaging;
- currency and price-unit validation cards;
- a filterable mapping/conflict table showing local product, size, SKU, Pancake product, variation ID, status, and safe conflict code;
- clear readiness blockers for later phases.

The page must work at phone, tablet, and desktop widths and preserve existing loading, error, focus, and button behavior.

## Failure Behavior

- Missing API key: no provider call; return `incomplete`.
- API key present without a selected shop: import and persist the safe shop list, then return `shop_selection_required` without requesting shop-scoped endpoints.
- Authentication failure: fail the import with `pancake_auth_failed`; retain the last complete mirror.
- Timeout, rate limit, or server failure: fail safely; retain the last complete mirror.
- Invalid or inconsistent pagination: fail with `pancake_invalid_response`.
- Duplicate or blank SKU: persist a blocking conflict; do not guess.
- Database failure: roll back the new mirror, mappings, selections, and conflicts.
- Concurrent import: return conflict status without starting a second request sequence.
- Browser disconnect: server import may finish; its audit result remains queryable.

## Testing and Acceptance

Phase 2 requires:

- client contract tests for every read endpoint, pagination, timeouts, malformed payloads, and secret redaction;
- migration tests for tables, indexes, constraints, and absence of secret columns;
- mapping tests for unique, blank, duplicate, inactive, missing, and stale external-ID cases;
- price-unit tests for centavo, peso, insufficient, mixed, and mismatch evidence;
- repository transaction and rollback tests;
- authenticated admin API and CSRF tests;
- responsive admin source/browser tests;
- full API and web regression suites and production build;
- Docker migration, rebuild, health, and deployed admin checks;
- a credentialed read-only contract test against the user's Pancake shop before Phase 2 is declared operational.

Phase 2 is accepted when a complete import can safely show every active website SKU as verified or conflicted, selection and price validation states are explicit, no website merchandising or stock changes, and no secret appears in browser, database, logs, or tracked files.
