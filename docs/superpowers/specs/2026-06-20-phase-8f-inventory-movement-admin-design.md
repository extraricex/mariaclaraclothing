# Phase 8F Inventory Movement Admin Design

## Goal

Give administrators a dedicated, responsive inventory operations dashboard for investigating stock changes. The screen must provide Grafana-style native monitoring panels, filtered browsing, summary totals, pagination, and CSV export across both JSON-file and Postgres persistence modes.

## Scope

Phase 8F includes:

- A dedicated `/admin/inventory/movements` route under the existing Products navigation.
- Server-side filtering, sorting, summaries, and pagination.
- Server-side daily movement series and reason-distribution aggregates.
- CSV export of the complete filtered result set.
- A responsive Tailwind CSS dashboard that uses native SVG charts and a table on larger screens, then stacks panels and uses movement cards on small screens.
- Links from movement records to related admin product and order pages when those identifiers exist.

This phase does not change how movements are recorded, add new movement reasons, restore an external Grafana service, or introduce a separate reporting service.

## Architecture

Extend the existing `inventoryMovementRepository` rather than creating a second data source. Both JSON-file and Postgres implementations will accept the same normalized query options and return the same records, summaries, daily series, and reason breakdown.

Add two authenticated admin endpoints:

- `GET /api/admin/inventory-movements` returns filtered, sorted, paginated records, summary totals, and pagination metadata.
- `POST /api/admin/inventory-movements/export` returns a CSV containing every record matching the submitted filters, independent of the current page.

The React admin page will use the existing `adminJson` and `adminDownload` helpers. It will remain within the current admin layout and reuse the project's Tailwind v4 theme tokens and component conventions. Charts will be small native SVG components; no chart package or embedded Grafana instance is added.

## Query Contract

The list endpoint accepts:

- `q`: case-insensitive partial match across product name, product slug, SKU, and order number.
- `reason`: one of `order_created`, `order_cancelled`, or `admin_stock_correction`.
- `dateFrom`: inclusive UTC calendar date in `YYYY-MM-DD` format; custom ranges require both date fields.
- `dateTo`: inclusive UTC calendar date in `YYYY-MM-DD` format; custom ranges require both date fields.
- `range`: optional preset `7d`, `30d`, or `90d`; the API converts it to an inclusive UTC date range ending on the current UTC date. Explicit `dateFrom` and `dateTo` take precedence.
- `sort`: `newest` or `oldest`, defaulting to `newest`.
- `page`: positive integer, defaulting to `1`.
- `pageSize`: positive integer capped at `100`, defaulting to `25`.

The response shape is:

```json
{
  "movements": [],
  "summary": {
    "totalMovements": 0,
    "stockAdded": 0,
    "stockRemoved": 0,
    "netChange": 0
  },
  "dailySeries": [
    {
      "date": "2026-06-20",
      "stockAdded": 0,
      "stockRemoved": 0,
      "netChange": 0
    }
  ],
  "reasonBreakdown": [
    {
      "reason": "order_created",
      "movementCount": 0,
      "quantityMagnitude": 0
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Summary, daily-series, and reason-breakdown values cover the complete filtered result set before pagination. `stockAdded` is the sum of positive changes. `stockRemoved` is the absolute value of negative changes so it can be displayed as a positive magnitude. `netChange` is the signed sum of all changes.

`dailySeries` contains one UTC calendar bucket for every date in the active range, including zero-value dates, ordered oldest to newest. A preset includes the current UTC date and the preceding 6, 29, or 89 dates. When no range or explicit dates are submitted, the endpoint defaults to the latest 30 UTC calendar days. `reasonBreakdown` contains the three supported reasons in stable display order and uses movement count for donut proportions; `quantityMagnitude` supports panel details and tooltips.

Date filtering treats `dateFrom` as `00:00:00.000Z` and `dateTo` as `23:59:59.999Z` for the submitted UTC dates.

The export endpoint accepts the same filters in its JSON body, excluding pagination. Its CSV columns are Date, Product, Product Slug, SKU, Size, Reason, Source, Order Number, and Quantity Change. Values must be escaped according to CSV quoting rules.

## Repository Behavior

The repository will expose one query operation that normalizes and validates filters before selecting a persistence-specific implementation. The normalized query resolves the default or preset date range before either implementation runs.

For JSON-file mode, it will read the movement store, apply filters and sorting in memory, compute summaries and chart aggregates, then slice the requested page.

For Postgres mode, it will build parameterized conditions and use database queries for the filtered records, aggregate summary, daily date buckets, reason groups, and total count. User-provided values must never be interpolated into SQL. Sort direction will be selected from the validated allowlist. Missing days and reasons are filled after querying so JSON and Postgres responses match exactly.

The export path will reuse the same normalized filters and ordering without applying pagination. This prevents the screen and exported CSV from disagreeing.

## Admin Interface

The existing `/admin/inventory` page remains the stock overview. A `Movement history` item will be added beside it in the Products submenu and will resolve to `/admin/inventory/movements`.

The movement page uses the approved Operations Overview arrangement and contains:

- A title and concise description.
- An `Export CSV` action.
- Summary cards for total movements, stock added, stock removed, and net change.
- Range presets for 7 days, 30 days, and 90 days plus custom dates; 30 days is selected by default.
- A native SVG time-series panel comparing daily stock additions and removals.
- A native SVG donut panel showing movement-count distribution across orders, cancellations, and admin corrections.
- A search field, reason selector, custom date controls, and sort selector.
- A desktop and tablet table showing date, product/SKU, reason, order, source, and change.
- A small-screen card list exposing the same information without horizontal scrolling.
- Previous and next pagination controls with current-page context.
- A clear empty state and inline load/export errors.

Product names link to `/admin/products/:slug` when `productSlug` exists. Order numbers link to `/admin/orders/:orderNumber` when `orderNumber` exists. Missing relations are rendered as plain fallback text.

Filter changes reset to page 1 and reload the server result. Every metric and chart uses the same active filters as the ledger. The export button submits the active search, reason, date, range, and sort filters, but never sends page or page size.

## Responsive Behavior

The interface uses the current Tailwind v4 breakpoint and color conventions with dark monitoring panels inspired by Grafana inside the existing Maria Clara admin shell. Summary cards render in one column at the narrowest width, two columns on small screens, and four columns on large screens. The time-series panel receives more horizontal space than the reason panel on desktop. All panels stack vertically on mobile. Filters stack on narrow screens and form a compact toolbar as space permits.

The movement table is hidden on small screens and replaced by cards. This avoids a horizontally scrolling audit table and keeps the quantity change, reason, relation, and timestamp readable. Positive changes use a restrained success treatment; negative changes use the existing accent treatment. Meaning is also expressed through signed text, not color alone. Charts include visible legends and text summaries; empty periods render `No movement data` instead of an empty SVG.

## Validation And Errors

The API returns `400` for malformed dates, a custom range missing either date, unsupported range presets, a date range where `dateFrom` is after `dateTo`, unsupported reasons or sort values, and invalid page parameters. Authentication remains enforced by the existing admin router middleware.

Repository and export failures flow through the existing admin error handler. The page shows failures inline and retains the active filters. An export failure does not clear displayed records. Empty filtered results show an explicit no-movements state rather than an empty table shell.

## Testing

Focused API tests will verify:

- Admin authentication for list and export endpoints.
- Search, reason, inclusive date, and sort filtering.
- Range preset and default 30-day behavior.
- Summary, daily series, zero-filled days, and reason breakdown calculated before pagination.
- Page boundaries and page-size validation.
- Equivalent JSON-file behavior and Postgres query contracts.
- CSV headers, ordering, filter reuse, escaping, filename, and content type.
- Invalid filter responses.

Focused web source tests will verify:

- The route and Products submenu entry.
- The list request and export request use the same non-pagination filters.
- Summary cards, desktop table, mobile cards, pagination, empty state, and inline errors are present.
- Native SVG trend and donut panels, legends, responsive stacking, and no-data states are present.
- Product and order links use encoded identifiers.

The full verification run will include the relevant API and web tests, the production web build, and `git diff --check`.

## Success Criteria

An authenticated administrator can open the movement operations dashboard, monitor stock flow and reason distribution for 7-day, 30-day, 90-day, or custom periods, investigate stock changes by product, SKU, order, reason, or date, navigate large result sets, follow related product and order links, and export all matching records. Records, summaries, and chart aggregates remain consistent in JSON-file and Postgres modes, and the page fits both desktop and mobile admin layouts without horizontal page overflow.
