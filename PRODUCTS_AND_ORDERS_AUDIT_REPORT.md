# Products and Orders Audit Report

Audit date: 2026-07-13  
Production code revision tested: `ee5750e`  
Production host: `mariaclaraclothing.com` / `admin.mariaclaraclothing.com`

## Overall Status

**Ready**

The Admin Products and Orders workflows are implemented, tested, and deployed. The production API, web application, PostgreSQL database, and background synchronization workers are healthy. There are no pending, failed, or blocked Pancake order events and no active inventory mismatches.

Verification summary:

- API suite: 399 tests, 397 passed, 2 PostgreSQL-only tests skipped in the local run. Both optional PostgreSQL integration cases passed separately against the project PostgreSQL container.
- Web source suite: 191/191 passed.
- Targeted Products and Orders Playwright suite: 3/3 passed, including a 390 px mobile viewport.
- Full Chromium flow suite: 35 passed, 1 intentional conditional skip.
- Production Docker build and database schema migration: passed.
- Production dependency audit: 0 known production vulnerabilities.
- Live endpoints: customer site `200`, health API `200`, products API `200`, storefront settings API `200`, admin protected by Cloudflare Access, and `www` redirects to the canonical domain.

## Product Duplication

- **Root cause:** The previous duplication path did not enforce new stable identifiers, unique SKUs, zero inventory, draft visibility, and cleared POS mappings as one authoritative server operation. Reused mutable identifiers could make a copy conflict with or inherit state from the source product.
- **Fix implemented:** `POST /api/admin/products/:slug/duplicate` now creates an independent server-side product. It copies customer-facing content, product details, shipping details, size chart, images, prices, categories, collections, tags, type, weight, and variants while generating a unique product ID, slug, public handle, variant database rows, and temporary `-COPY-<suffix>` SKUs. The copy is Draft, not featured, has zero stock, has no external variant IDs, and has no active Pancake mapping.
- **Test result:** Passed. Automated tests confirm different product and variant identities, unique SKUs, zero copied inventory, and no inherited POS mapping. Production contains one draft copy with one unique product ID, five independent variants, total stock `0`, and zero copied external IDs. Its five variants correctly show **Missing Pancake mapping** and are excluded from the customer catalog.

## Product Deletion

- **Fix implemented:** Delete is a reversible soft archive. It is available from row actions and the product editor, uses an explicit confirmation dialog with the product name and POS warning, removes the item from public catalog queries and active collection results, and preserves the database record. Archived products can be filtered and restored as Draft.
- **Historical order protection:** Order items persist product name, SKU, variant/size, quantity, unit price, and image snapshots. Product rename, repricing, or archive does not rewrite completed orders. The local archive never deletes the connected Pancake product automatically.
- **Test result:** Passed. API tests verify archive/restore and public visibility; the historical-order regression test confirms snapshots remain unchanged after product rename, repricing, and archive. UI tests verify the destructive confirmation and warning text.

## Import

- **Supported formats:** CSV only for product import. XLSX product import is deliberately disabled. The project spreadsheet package used by the separate J&T template flow is pinned to the patched upstream release, but accepting CSV only keeps product imports on the smaller and safer parsing surface.
- **Security status:** Admin authentication and CSRF protection are required. Uploads are held in memory, limited to one `.csv` file and 2 MB, reject binary NUL data, use `csv-parse`, cap imports at 5,000 variant rows, and cap individual records. Formula-leading values are rejected or escaped. Duplicate SKUs, invalid rows, conflicting routes, invalid prices/stock/status, and existing records are reported before confirmation. Pancake mapping columns are read-only and never imported as active mappings.
- **Workflow:** Preview shows valid, invalid, and skipped rows plus duplicate SKUs. Modes are Create new only, Update by SKU, and Skip duplicates. Failed rows have a downloadable CSV report. Confirmed changes use the catalog batch transaction, so PostgreSQL changes are atomic.
- **Test result:** Passed for valid preview/import, duplicate detection, formula rejection, existing records, mapping isolation, and row-report generation. Playwright verifies the real file dialog, preview, and error-report controls.

## Export

- **Fix implemented:** Products can be exported as all, current filtered results, selected products, or one row-action product. Each variant gets a row containing product ID, name, slug/handle, SKU, variant, size, price, stock, status, organization, product/variant Pancake IDs, mapping status, sync status, and last sync time. Orders export the filtered or selected order set with payment, fulfillment, totals, tracking, and Pancake status fields.
- **Safety:** CSV cells that could execute spreadsheet formulas are escaped. No API keys, secrets, tokens, or private configuration are included. Product sync lookups are batched in groups of 100 to avoid a large browser-side join.
- **Test result:** Passed. API tests verify values and formula safety. Playwright downloads and inspects real product and order CSV files, confirms filters/selection are respected, and confirms secret variable names are absent.

## More Actions

- **Actions checked:** Product Edit, Duplicate, Publish, Unpublish to Draft, Archive, Restore as Draft, Delete/archive, Export product, Sync to Pancake POS, bulk Publish, bulk Unpublish, bulk Restore, bulk Add to collection, bulk Remove from collection, and Export selected. Order actions include Save changes, status transitions, Cancel, Return, Print, Copy order number, Discard unsaved changes, and View all orders.
- **Broken actions fixed:** Placeholder menu behavior was replaced by real API calls. Menus close on outside click and Escape, support arrow/Home/End keyboard movement, restore focus, remain within mobile viewports, disable unavailable actions, and display loading/error/success feedback. Destructive operations require confirmation.
- **Test result:** Passed on desktop and a 390 x 844 mobile viewport. Keyboard focus, Escape handling, disabled actions, CSV download, and cancellation/archive confirmations were exercised.

## Products Section

- **Functions checked:** List, search, status/stock/category/collection/vendor filters, sorting, pagination, create, edit, duplicate, archive, restore, publish/unpublish, product images, multi-image upload, image deletion/reordering, variants, unique SKUs, prices, inventory, collections, content fields, visibility, Pancake mapping/status, automatic inventory sync, manual product sync, import, export, bulk selection, and action menus.
- **Issues fixed:** Stable unique product IDs were added and migrated; duplicate routes now create independent records; database SKU validation is case-insensitive and transactional; negative stock is rejected; uploads are normalized and bounded; Draft/Archived products cannot be bought; list filtering/sorting/pagination is server-driven; bulk actions are persisted; admin stock edits record inventory movements and immediately queue/attempt Pancake synchronization.
- **Persistence:** Production uses PostgreSQL only. JSON persistence overrides are rejected in production. Changes survive refresh, logout/login, container restart, and deployment because product, variant, image, alias, mapping, and sync records are database-backed; uploaded media uses the persistent production volume.
- **Production evidence:** 16 products have 16 unique stable IDs. The 15 active products have 82 variants, 82 unique SKUs, zero invalid stock values, 82 verified mappings, and 82 matched inventory states. All 15 active products have a successful product-level Pancake sync record with no error.
- **Remaining issues:** None for active products. The one draft duplicate intentionally has five unmapped variants and cannot sync or appear in the shop until reviewed and mapped.

## Orders Section

- **Functions checked:** List, search, status/payment/fulfillment/date filters, sorting, pagination, detail view, customer/address data, line snapshots, variants, quantities, subtotal, discount, shipping, total, COD/PayMongo data, courier, tracking, notes, Print, CSV export, Packing/Shipped/Delivered/Cancelled/Returned transitions, stock restoration, and Pancake status/payment/tracking synchronization.
- **Issues fixed:** Order list filtering and pagination now use server data; CSV export respects selection and filters; unsupported statuses are rejected; line items cannot be rewritten after checkout; cancellation is transactional, restores committed stock exactly once, records inventory movements, closes eligible pending PayMongo sessions, cannot be reopened, and queues the existing Pancake order for update. Local changes remain saved if Pancake is temporarily unavailable.
- **Payment safety:** PayMongo remains authoritative through verified backend/webhook processing. Paid orders map to online/prepaid transfer with COD amount `0`; pending or expired payments are never marked paid. Reservation expiry closes the provider session before releasing stock, and late payment handling does not silently reopen a cancelled order.
- **Data integrity:** Order line snapshots remain accurate after current product data changes. Cancellation and reservation release are idempotent, preventing duplicate stock restoration. Pancake events use deterministic keys and stored Pancake order IDs to prevent duplicate provider orders or wrong-order updates.
- **Test result:** Passed for authentication, list/detail, date filtering, status validation, cancellation stock restoration, one-time PayMongo release, Pancake event enqueueing, sync detail, historical snapshots, real-data UI filtering/export/detail/print, and mobile layout.
- **Remaining issues:** None.

## Pancake POS Sync

- **Product sync:** Passed. Manual sync updates the existing mapped Pancake product and variations; it never creates a duplicate product. All 15 active production products have successful product-sync audit rows with no error.
- **Inventory sync:** Passed. Admin changes enqueue absolute variant quantities, retry with bounded 1/5/15 minute backoff, and do not overwrite newer pending Admin updates. Inbound reconciliation applies mapped Pancake warehouse quantities without looping the update back. Production currently has 82/82 active variants matched, zero open conflicts, and 12 completed outbound inventory jobs with zero queued/failed jobs.
- **Order status sync:** Passed. Admin changes enqueue updates for the stored Pancake order ID. Inbound polling/webhook normalization handles official numeric and text statuses, ignores older provider timestamps, and updates linked orders without duplication. All 12 production order links are `synced` with no error.
- **Payment sync:** Passed. PayMongo-paid payloads send online/prepaid payment, verified paid amount, and COD `0`; COD orders retain COD handling. Production has four paid PayMongo orders with committed inventory. Payment update events are resolved.
- **Cancellation sync:** Passed. Admin cancellation updates the existing Pancake order. A provider order already in terminal cancelled/removed state is reconciled as success instead of being retried forever. Resolved events now clear stale safe-error codes.
- **Tracking sync:** Passed. Inbound normalization handles standard, nested shipment, and official partner tracking/courier fields. Admin courier/tracking changes are included in outbound updates when supported by Pancake.
- **Event evidence:** 278 inbound and 11 outbound production events are all `succeeded`, with zero error codes. Ten post-cutover website orders were sent to Pancake. Four older orders are intentionally marked `pancake_pre_live_cutover`, not failed. The latest automatic worker cycle completed catalog, inventory, outbound inventory, order export, inbound orders, and outbound orders successfully.
- **Remaining issues:** None for active products or linked orders. The draft copy remains deliberately unmapped; this is a publishing safety gate, not a live sync failure.

## Mobile Responsiveness

- **Products:** Controlled table scrolling, compact controls, truncated long names, visible action menus, pagination, and no page-level horizontal overflow at 390 px.
- **Orders:** Filters stack within the viewport, order rows remain readable, pagination is touch-safe, and CSV/actions remain reachable without clipping.
- **Order details:** Responsive sections, wrapped customer/address/payment data, aligned status controls, confirmation dialog, and print/action controls remain usable on mobile and desktop.

## Permissions and Security

- Product writes, deletion/archive, imports, exports, and order changes are protected by backend Admin authentication; production bearer fallback is disabled.
- Cookie sessions are opaque, expiring, revocable, `HttpOnly`, and protected with CSRF validation for writes. The admin domain is additionally protected by Cloudflare Access.
- Product/order values are validated server-side; the frontend is not the authorization boundary.
- Pancake and PayMongo credentials remain server-side and are not exported or returned by public/admin status APIs.
- Destructive UI actions require confirmation, while the backend independently enforces status and data-integrity rules.

## Critical Issues

None.

## Operational Follow-up

- Map the five draft-copy variants before publishing that product. The Admin correctly blocks its Pancake sync while mappings are absent.
- Keep the existing before-deploy backup procedure. The latest VPS backup for this audit is `20260713T110059Z`.
- Add encrypted off-server backups because the current verified deployment backups remain on the VPS.
- Use a controlled staff test order after any future Pancake credentials, warehouse, status configuration, or PayMongo mode change; do not use a real customer order for destructive acceptance testing.

## Final Recommendation

**Ready to deploy.** The audited code is already running in production. Products, inventory, orders, PayMongo state, and Pancake synchronization are currently consistent, and no critical Products or Orders defect remains open.
