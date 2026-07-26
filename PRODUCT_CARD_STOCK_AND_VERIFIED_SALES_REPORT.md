# Product Card Stock and Verified Sales Implementation

## Stock Source

- Inventory source: The website product-variant inventory balance (`product_variants.stock_quantity` in PostgreSQL and `variants[].stockQuantity` in the JSON fallback). The live public catalog was inspected on July 26, 2026 and returned 18 active products with different real product totals from 0 to 49 units.
- Variant calculation: `availableStock` is the non-negative sum of stock across stored sellable variants. The calculation excludes variants marked inactive, unsellable, deleted, archived, damaged, or test when those flags exist. The current schema treats every stored product variant as active/sellable and does not place damaged or test inventory in `stock_quantity`.
- Reserved inventory handling: PayMongo reservations already deduct the authoritative variant balance transactionally. Expired or cancelled reservations restore it once. The display therefore reads `stock_quantity` directly and does not subtract a reservation twice.
- Low-stock threshold: Global default is 10. Admin can change it under **Settings > Product Card Sales Information**, and a product can inherit or override it. Stock is clamped with `Math.max(0, calculatedStock)`.

## Sold Quantity Source

- Eligible statuses: Non-test stored orders whose order status is not `cancelled`, `canceled`, `returned`, `failed`, `expired`, `unreachable`, `draft`, `pending_payment`, or `abandoned_checkout`, and whose payment status is not `unpaid`, `failed`, `expired`, `pending_payment`, `cancelled`, `canceled`, or `refunded`. This includes valid created COD orders (`cod_pending`) and verified paid PayMongo orders.
- Excluded statuses: Cancelled/canceled, returned, failed, expired, unreachable, draft, pending-payment, abandoned checkout, unpaid, fully refunded, and all records marked `is_test_order`.
- Refund handling: A fully refunded order contributes zero eligible units and its item quantity appears in the admin refund/return deduction. `partially_refunded` remains eligible because the current database tracks refund money, not a reliable refunded quantity per order item.
- Return handling: An order with status `returned` contributes zero eligible units and its item quantity appears in the admin refund/return deduction. Per-item partial-return quantities are not currently modeled.
- Test-order handling: `is_test_order = true` is excluded in both PostgreSQL and JSON calculations.

The website displays eligible stored-order units net of whole-order refunds and returns. It does not claim per-item net sales where the database lacks refund/return quantity data.

## Historical Sales

- Field added: `historical_sold_quantity` with source, note, updated-by, and updated-at fields; product display overrides are stored in `commerce_stats`.
- Validation: Quantity must be a whole number from 0 to 2,147,483,647. Database and application validation reject negative values. Default is 0.
- Audit trail: An authenticated admin change records the actor ID and server timestamp. Computed website sales cannot be edited or persisted from the Product Editor.
- Products with adjustment: None were added by this implementation. Every existing product remains at 0 until an admin enters a verified external or historical source.

## Product Card Design

- Desktop: A compact centered row appears directly under price information using backend-provided `stockDisplayText` and `soldDisplayText`.
- Mobile: The row uses small readable text, natural wrapping, and a maximum width. Tests at 320, 360, 390, and 430px found no document or row overflow.
- Sold-out display: `Sold out • [verified count] sold`, or only `Sold out` when the sold label is hidden.
- Low-stock display: `Only [actual quantity] left • [verified count] sold`.
- Normal-stock display: `In stock • [verified count] sold` by default. Exact high stock appears only when configured.
- New-product display: `New` is shown for zero sold units only when the product has a real `createdAt` date inside the configured recent-product period (default 30 days). Legacy products without a trustworthy publication date do not receive a fabricated “New” label.

The product page uses the same shared component below the price and above the size selector/product facts. No live-viewer, recent-purchase, random-sale, or minimum-150 behavior exists.

## Performance

- Query method: One grouped PostgreSQL order-items aggregate supplies all products in a grid. JSON fallback reads the order store once. Product variant stock is already loaded in the catalog’s existing batch variant query.
- Cache: Public product and settings APIs use `Cache-Control: no-store`.
- Cache invalidation: No product-commerce cache is retained. The next request reflects checkout stock deduction, cancellation/expiry restock, inventory adjustment, eligible status/payment transition, refund/return transition, or historical adjustment.
- N+1 query status: Passed. Product grids execute one sales aggregation, not one order query per card.

## Tests

- TEST 1 — Zero stock: Passed (`Sold out`).
- TEST 2 — One stock: Passed (`Only 1 left`).
- TEST 3 — Stock 6 below threshold: Passed (`Only 6 left`).
- TEST 4 — Stock 35 above threshold: Passed (`In stock`); exact 35 remains hidden by default.
- TEST 5 — Zero sales: Passed (`New` only for a recently published product; otherwise hidden).
- TEST 6 — One sale: Passed (`1 sold`).
- TEST 7 — 187 verified sales: Passed (`187 sold`).
- TEST 8 — 1,204 verified sales: Passed (`1,204 sold` exact; `1.2K sold` abbreviated).
- TEST 9 — Cancelled order: Passed; excluded.
- TEST 10 — Refunded order: Passed; fully refunded quantity excluded and reported as a deduction.
- TEST 11 — Test order: Passed; excluded.
- TEST 12 — Website 42 + verified historical 120: Passed (`162 sold`).
- TEST 13 — Product-card grid: Passed; shared row appears on all 15 local active fixture cards and remains aligned.
- TEST 14 — Mobile: Passed at 320, 360, 390, and 430px on both grid and product page. No horizontal overflow; the row remained inside the card/viewport.
- TEST 15 — Performance: Passed; the centralized grouped query prevents N+1 order-item queries.
- Admin API: Passed; historical adjustment audited, negative input rejected, private note/source withheld publicly, and computed website quantity not persisted as editable data.
- Production build: Passed (Vite, 132 modules).
- API suite: 605 passed, 2 skipped because `TEST_POSTGRES_URL` was not configured, 0 failed.
- Frontend source suite: 253 passed, 0 failed.
- Focused responsive browser validation: Passed with real rendered text `In stock • 187 sold`.
- Lint/type checks: The repository defines no standalone lint or type-check scripts. JavaScript syntax checks and the production build passed.

## Files Changed

- `apps/api/db/schema.sql`
- `apps/api/db/migrations/20260726_product_verified_sales.sql`
- `apps/api/src/orders/orderRepository.js`
- `apps/api/src/products/catalogRepository.js`
- `apps/api/src/products/catalogPresenter.js`
- `apps/api/src/products/productCommerceStatsService.js`
- `apps/api/src/routes/products.js`
- `apps/api/src/routes/admin.js`
- `apps/api/src/routes/storeSettings.js`
- `apps/api/src/settings/storeSettingsRepository.js`
- `apps/api/test/productBestSellers.test.js`
- `apps/api/test/productCommerceStatsService.test.js`
- `apps/api/test/productVerifiedSalesAdminApi.test.js`
- `apps/api/test/storeSettingsRepository.test.js`
- `apps/web/src/components/ProductCommerceStats.jsx`
- `apps/web/src/components/ProductCard.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/admin/ProductEditor.jsx`
- `apps/web/src/admin/Settings.jsx`
- `apps/web/src/lib/storeSettings.js`
- `apps/web/test/productCommerceStatsSource.test.js`
- `apps/web/test/customerCartAndInventoryBadgesSource.test.js`
- `apps/web/test/storefrontSettingsSource.test.js`

## Remaining Issues

- The migration and application changes are implemented locally but have not been deployed to production in this task.
- Partial refund and partial return quantities cannot be deducted per item until the order model records those quantities. The implementation does not estimate them.
- Variant-specific damaged, reserved, and test buckets are not separate columns in the current catalog schema. The authoritative `stock_quantity` is already the net sellable balance; adding separate operational buckets would require a coordinated inventory-model migration.
- Existing legacy products without a trustworthy creation/publication date hide the zero-sold label instead of being falsely labeled “New.”

## Final Status

Ready for deployment. The implementation uses real inventory, eligible stored orders, and manually verified historical adjustments only. No random count, fake scarcity, fake minimum, or fabricated popularity rule was added.
