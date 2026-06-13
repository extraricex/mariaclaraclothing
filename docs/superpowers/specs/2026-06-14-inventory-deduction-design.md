# Inventory deduction on order creation — design

Date: 2026-06-14
Status: Approved (pending spec review)
Roadmap: `docs/enhancementdata2.md` → Phase 4 (Inventory Deduction)

## Problem

Order creation (`POST /api/orders`) validates that each ordered variant has enough
stock, but it never **deducts** that stock. So the catalog stock never goes down, and
the store can oversell — a real fulfillment problem for a COD shop. Gap #6 in
`docs/enhancementdata2.md`: "Inventory is checked at checkout, but stock is not deducted
after order creation."

The existing check is also a time-of-check/time-of-use (TOCTOU) race: two concurrent
orders for the last unit can both pass the read-only check.

## Goal

When an order is created, **atomically deduct** each ordered variant's stock so the store
cannot oversell. Insufficient stock blocks the order. Admin inventory and the storefront
reflect the new levels automatically (they read the same repository).

## Scope

In:
- Atomic deduction at `POST /api/orders`, as the authoritative gate.
- Oversell is impossible even under concurrency (Postgres).
- Works in both persistence modes (JSON file / PostgreSQL).
- Admin inventory + storefront reflect reduced stock (no extra work — shared repository).

Out (YAGNI, noted follow-ups):
- Restock when an order is cancelled (intersects the co-developer's Phase 5 admin
  order-status work; deferred).
- `inventory_movements` audit ledger.
- No `db/schema.sql` change (the `product_variants.stock_quantity` column already exists).
- No `routes/admin.js` change.

## Architecture

### New repository function: `deductVariantStock(items)`

Lives in `apps/api/src/products/catalogRepository.js`, which already owns all
`product_variants` reads/writes and the `transaction()` helper. `items` is an array of
`{ slug, size, quantity }`. Dual-mode, mirroring the existing
`usePostgresProducts()` / `isPromise()` pattern.

Deduction is keyed by **product slug + variant size** (stable; size is unique per
product), not the synthetic index-based variant id.

**PostgreSQL mode** — one `transaction()`; for each item a guarded conditional update:

```sql
UPDATE product_variants
   SET stock_quantity = stock_quantity - $qty
 WHERE product_slug = $slug AND size = $size AND stock_quantity >= $qty
```

If any item's `result.rowCount === 0` (insufficient stock, or variant not found), throw —
the whole transaction rolls back, so no partial deduction. This closes the TOCTOU race:
the guard and the decrement are a single atomic statement.

**JSON mode** — read the products file, locate each item's variant by slug+size, verify
`stockQuantity >= quantity` for **all** items first; if any fails, throw before writing;
otherwise subtract every item's quantity and write the file once
(`JSON.stringify(data, null, 2)` + trailing newline — existing convention). Single-process,
so read-modify-write is effectively atomic for the dev/demo use case.

**Failure semantics:** throws an `Error` with `error.status = 409` and the existing copy
`"<Size> is sold out for <Name>"` (reusing the message keeps client behavior consistent;
409 Conflict distinguishes a concurrent/at-write shortfall from the 400 pre-validation).

Returns nothing meaningful on success (or the updated count); callers treat a thrown error
as the failure signal.

### Hook point: `routes/orders.js` `POST /` — deduction is the gate, before `saveOrder`

```
normalizeCheckout(body)          // validates items, price; read-only stock pre-check
  → deductVariantStock(items)    // authoritative atomic gate; 409 + abort on shortfall
  → saveOrder(persistedOrder)    // only persisted if deduction succeeded
```

Deducting **before** `saveOrder` means an order is never persisted if its stock could not
be secured. `items` for deduction come from the normalized checkout items
(`{ slug: productId without 'catalog-' prefix, size, quantity }`).

The read-only check inside `normalizeCheckoutItem` stays as fast pre-validation and for
its specific 400 messages; the guarded deduct is what actually prevents oversell.

Known edge (accepted): if `saveOrder` itself fails *after* a successful deduction, stock is
decremented without a persisted order. `saveOrder` is a simple upsert and rarely fails;
compensating logic is out of scope for this phase.

## Data flow

```
POST /api/orders
  normalizeCheckout ─ per item: find product+variant, check price, soft stock check
  deductVariantStock([{slug,size,qty}])
     ├─ PG:   transaction { guarded UPDATE per item; rowCount 0 → throw → ROLLBACK }
     └─ JSON: verify all, then subtract all, write file once
  saveOrder(order)               # only reached when deduction succeeded
  201 { orderNumber, ... }
```

## Error handling

- Shortfall at deduction → `Error` with `status = 409`, message
  `"<Size> is sold out for <Name>"`; central handler in `app.js` returns
  `{ error: '<message>' }` (message shown because status < 500). Order not saved.
- Pre-validation shortfall (existing) still returns 400 with the same copy.

## Testing

Tests force JSON mode and must isolate **product** state so deduction never mutates the
committed `data/products.json`. `node --test` runs each test file in its own process and
files can run concurrently, so a non-isolated success-path order would both dirty the
committed fixture and race other processes that read it (e.g. `catalog.test.js` /
`health.test.js`, which pin exact stock values) — causing flaky failures.

1. **Test isolation (required, larger than first scoped):** every test that *successfully*
   creates an order must point at its **own** temp copy of `data/products.json` via
   `PRODUCTS_DATA_FILE` (copy the real file with `fs.copyFile`, set the env, restore in
   `finally`). `findCatalogProductBySlug` and the deduction both honor `PRODUCTS_DATA_FILE`,
   so this isolates reads and writes together. The seven files that POST successful orders
   today, all of which need it:
   - `checkoutPaymentMethods.test.js`
   - `health.test.js`
   - `adminOrders.test.js`
   - `adminCartSessions.test.js`
   - `adminCustomersDiscounts.test.js`
   - `customerAccounts.test.js`
   - `maintenanceMode.test.js`

   The added isolation is additive (extra `PRODUCTS_DATA_FILE` setup/teardown; no change to
   existing assertions), keeping merge risk low even though four of these files are in the
   co-developer's area.

2. **New behavior tests** (JSON mode, temp products + orders files):
   - Creating an order decrements exactly the ordered variant's `stockQuantity` by the
     ordered quantity; other variants unchanged.
   - Ordering more than available → 409, body `{ error: '<Size> is sold out for <Name>' }`,
     and stock unchanged, order not persisted.
   - Two sequential orders that together exceed stock: the second is blocked.

3. **PG wiring (`postgresPersistence.test.js`):** assert `catalogRepository.js` source
   contains the guarded decrement (`stock_quantity = stock_quantity -` and
   `stock_quantity >=`) — the repo's convention for verifying PG behavior without a live DB.

4. **Real-Postgres smoke test** (manual, ephemeral Docker `postgres:16`, like the
   site-content smoke): migrate, seed a variant, run two concurrent `deductVariantStock`
   calls for the last unit, assert exactly one succeeds and the other throws, and final
   stock is correct.

`DATABASE_URL= ADMIN_TOKEN= npm test` (from `apps/api`) stays fully green.

## Files touched

- `apps/api/src/products/catalogRepository.js` — `deductVariantStock` + export.
- `apps/api/src/routes/orders.js` — call deduction before `saveOrder`.
- `apps/api/test/inventoryDeduction.test.js` — new behavior tests.
- `apps/api/test/postgresPersistence.test.js` — guarded-decrement wiring assertion.
- Products-file isolation (`PRODUCTS_DATA_FILE` → temp copy) added to each success-path
  order-creating test:
  - `apps/api/test/checkoutPaymentMethods.test.js`
  - `apps/api/test/health.test.js`
  - `apps/api/test/adminOrders.test.js`
  - `apps/api/test/adminCartSessions.test.js`
  - `apps/api/test/adminCustomersDiscounts.test.js`
  - `apps/api/test/customerAccounts.test.js`
  - `apps/api/test/maintenanceMode.test.js`

## Collision note

All changes are in `apps/api`. `routes/orders.js` and `catalogRepository.js` are the
co-developer's Phase 1/Phase 4 area, but `origin/codex-edits` currently has no pending work
ahead of `main`. Changes are additive (a new function + one call site) to minimize future
conflict. No `schema.sql` or `admin.js` edits.
