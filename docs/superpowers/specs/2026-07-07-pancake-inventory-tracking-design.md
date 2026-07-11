# Pancake POS Inventory Tracking Design

Date: 2026-07-07
Status: Approved
Mode: inventory-only Phase 3

## Purpose

Use Pancake POS as the source of truth for website stock after the Phase 2 catalog mapping is clean. This phase updates local website inventory from the selected Pancake warehouse and records an audit trail, but it does not create Pancake orders, process webhooks, write to Pancake, or change storefront merchandising.

## Scope

Phase 3 adds manual/admin-triggered inventory reconciliation:

- read Pancake product variations through the existing read-only client;
- extract the selected warehouse's sellable quantity for each mapped variation;
- update `product_variants.stock_quantity` as an absolute snapshot;
- insert `inventory_movements` rows with source `pancake` and reason `pancake_reconcile`;
- persist one reconciliation audit with counts, status, safe errors, and timestamps;
- expose authenticated admin APIs and a small Admin -> Pancake POS control for running and viewing inventory reconciliation.

This phase does not add automatic scheduler jobs, public webhooks, order export, Pancake writes, customer sync, or product overwrite behavior.

## Ownership

Pancake owns sellable stock for the selected warehouse. The website still owns product titles, descriptions, images, collections, prices, checkout, and customer experience.

Inventory reconciliation only touches `product_variants.stock_quantity` and inventory audit records. It must never change website product content, Pancake products, Pancake stock, orders, or customer data.

## Readiness Rules

Reconciliation can run only when:

- Pancake mode is `read_only`;
- the API key is configured;
- shop and warehouse selections exist;
- the latest catalog mapping has zero conflicts;
- all active website variants have verified Pancake variation mappings.

If any readiness rule fails, the run returns a safe blocked result and does not change stock.

## Quantity Rules

The reconciliation reads Pancake variation records and finds the entry in `variations_warehouses` matching the selected warehouse ID. It treats `remain_quantity` as the sellable stock value. If `remain_quantity` is absent, negative, non-integer, or the warehouse row is missing, that variant is skipped and counted as a conflict.

Valid stock changes are absolute snapshots:

- previous website stock: `product_variants.stock_quantity`;
- next website stock: Pancake selected warehouse `remain_quantity`;
- movement quantity: `next - previous`.

Rows with no stock change still count as checked, but do not create a movement row.

## Audit and Failure Behavior

Each run records a `pancake_inventory_reconciliations` audit row with status `running`, `complete`, `blocked`, or `failed`. Complete runs store checked, updated, unchanged, skipped, and conflict counts.

Failures must retain current stock. A failed provider request or invalid global response does not partially apply updates. Per-variant invalid quantities skip only that variant and record safe conflict data.

## Admin Surface

Admin -> Pancake POS adds:

- latest inventory reconciliation status;
- checked/updated/skipped/conflict counts;
- a read-only `Sync inventory` button;
- clear copy that this updates website stock from Pancake and still performs no Pancake writes or order sync.

