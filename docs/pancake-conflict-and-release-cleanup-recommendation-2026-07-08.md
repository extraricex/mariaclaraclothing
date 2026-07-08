# Pancake Conflict And Release Cleanup Recommendation

Date: 2026-07-08
Branch checked: `codex-edits`

## Current Finding

The current local database no longer has open Pancake sync conflicts.

Latest checked state:

- Open Pancake conflicts: `0`
- Resolved historical conflicts: `84`
- Verified Pancake variant mappings: `82`
- Total current mappings: `82`
- Price unit status: `confirmed_pesos`
- Pancake API key is present in runtime config.
- Pancake mode is currently `live`.
- Pancake runtime is configured with shop `4275005`, warehouse `1c5f28ed-6be3-45a0-b683-f87f6704fe6b`, and order source `100378768366281`.
- Fresh website checkout `DEMO-1783478294695-740F` was exported live with status `sent`.

This means the immediate problem is not SKU conflict cleanup anymore. The immediate remaining cleanup is release grouping plus historical test export noise.

## Recommendation

Keep `PANCAKE_MODE=live` for the local verified integration, because shop, warehouse, order source, catalog mappings, and a fresh live checkout have been confirmed.

Recommended sequence:

1. Keep the Pancake API key only in ignored environment files or deployment secrets.
2. Keep shop, warehouse, and order source fixed to the verified IDs below.
3. Run a fresh catalog import before production deployment.
4. Verify open conflicts remain `0`.
5. Run inventory reconciliation.
6. Fix remote Pancake inventory for `ARISOFF-S` before retrying the remaining failed historical test row.
7. Group the branch changes into intentional release commits.

## Pancake Configuration Cleanup

Known Pancake references from the local database:

| Type | ID | Name | Note |
| --- | --- | --- | --- |
| Shop | `4275005` | `MARIA CLARA CLOTHING` | Recommended shop. |
| Warehouse | `1c5f28ed-6be3-45a0-b683-f87f6704fe6b` | `MARIA CLARA CLOTHING` | Recommended first warehouse; previous inventory checks referenced this ID. |
| Warehouse | `c29f9fec-cf15-492d-ac52-bd5c36181159` | `Tanza` | Use only if this is the real fulfillment warehouse. |
| Order source | `100378768366281` | `MARIA CLARA CLOTHING` | Best existing brand-aligned source. |
| Order source | `-17` | `Shopify` | Avoid for website orders unless intentionally preserving old Shopify reporting. |

Recommended `.env` direction:

```env
PANCAKE_MODE=live
PANCAKE_SHOP_ID=4275005
PANCAKE_WAREHOUSE_ID=1c5f28ed-6be3-45a0-b683-f87f6704fe6b
PANCAKE_ORDER_SOURCE_ID=100378768366281
PANCAKE_REQUEST_TIMEOUT_MS=20000
PANCAKE_AUTO_SYNC_ENABLED=true
```

After this, rebuild/recreate the API service and rerun the Pancake import from Admin -> Pancake POS.

## Conflict Resolution Policy

Use this rule for future conflicts:

| Conflict type | Fix |
| --- | --- |
| `pancake_match_missing` | Create the missing Pancake variation with the exact website SKU, or archive/remove the website variant. |
| `local_sku_blank` | Add a website SKU before syncing. |
| `local_sku_duplicate` | Make website SKUs unique. Do not map duplicates manually. |
| `pancake_sku_blank` | Add the missing SKU in Pancake. |
| `pancake_sku_duplicate` | Make Pancake SKUs unique. |
| `external_id_mismatch` | Re-import after confirming SKU identity; update stale external POS IDs only after SKU match is trusted. |
| `price_mismatch` | Fix product prices before inventory/order sync. |
| `pancake_inventory_warehouse_missing` | Select the correct warehouse or fix Pancake variation warehouse inventory. |

Do not manually edit `pancake_variant_mappings` unless there is a verified emergency. The import code is designed to rebuild mappings from source data.

## Repository Cleanup Recommendation

Current working tree has a large dirty set. Before deployment, clean it into intentional groups:

1. Pancake sync implementation
   - API schema/migrations
   - Pancake client/service/repository files
   - Pancake API tests
   - Docker env additions

2. Admin redesign
   - Admin layout/dashboard/orders/Pancake UI
   - Shared admin CSS
   - Admin responsive/source tests

3. Documentation
   - Deployment readiness report
   - Pancake recommendation/status docs
   - Superpowers specs/plans if they are intentionally kept

4. Generated/local data cleanup
   - `apps/api/data/cart-sessions.json`
   - `apps/api/data/discounts.json`
   - `apps/web/dist/*`

Recommended action for generated/local data:

- Do not commit local cart session changes.
- Do not commit local discount fixture changes unless they are intentional seed data.
- Decide whether `apps/web/dist` should be tracked. If Docker builds from source, generated `dist` files should normally be ignored or excluded from release commits.

## Go/No-Go

### Safe To Do Now

- Keep the customer site online in preview or soft-launch mode.
- Keep COD checkout enabled.
- Use admin order management.
- Use Pancake `live` mode for verified website checkouts.

### Do Not Do Yet

- Do not deploy from the current dirty branch without grouping and reviewing changes.
- Do not retry the remaining failed historical test row until Pancake inventory for `ARISOFF-S` is corrected.

## Definition Of Done

Conflict and cleanup work is complete when:

- `PANCAKE_MODE=live`.
- Runtime reports configured shop, warehouse, and order source.
- Latest import has `conflictCount=0`.
- Current mappings are all `verified`.
- Inventory reconciliation completes without open conflicts.
- One website test order appears in Pancake POS.
- Working tree is clean except for intentional release files.
- API tests, web tests, web build, and critical checkout e2e pass.
