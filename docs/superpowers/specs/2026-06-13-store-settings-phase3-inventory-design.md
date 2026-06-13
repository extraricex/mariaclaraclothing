# Store Settings Phase 3 Design — Inventory Section

Phase 3 of the Settings roadmap (`docs/enhancementdata.md`), building on the settings
module from phases 1–2. Makes the low-stock threshold admin-editable. Scoped to
threshold only — out-of-stock behavior stays hard-blocked (current behavior), and
backorders/pre-orders are explicitly out of scope for this phase.

## Motivation

The low-stock threshold is hard-coded as `12` in five places: three in the API
(`GET /api/admin/products/settings`, the products-summary `lowStock` count, and the
per-product `stockStatus` used by admin filters) and two in the React storefront
("Limited pieces" badges in `apps/web/src/components/ProductCard.jsx` and
`apps/web/src/pages/Product.jsx`). The admin should control it from Settings, per the
roadmap's Inventory Settings item.

## Goals

- Admin edits the low-stock threshold from a new collapsible **Inventory** card on
  `/admin/settings`.
- The threshold drives: storefront "Limited pieces" badges, the admin products
  summary `lowStock` count, the `stock=low_stock` filter, and
  `GET /api/admin/products/settings`.
- The admin Dashboard's low-stock queue follows automatically (it renders
  server-computed values) — this is the phase's "restock alert" story.

## Out of scope

- Backorders / pre-orders / out-of-stock behavior toggle (explicitly deferred).
- Stock-deduction changes (orders already validate stock server-side).
- Notifications (later phase, after `codex-edits` merges).
- The legacy static storefront (`apps/api/public/`) keeps its hard-coded copy.

## Data model

New `inventory` section in the settings document:

```js
inventory: {
  lowStockThreshold: 12
}
```

Validation (`error.status = 400`, exact message): the threshold must be an integer
between 1 and 999 — `'Low stock threshold must be an integer between 1 and 999.'`
Standard section semantics (defaults-backed, like `general`/`shipping`/`payments`;
the phase-2 partial-merge behavior is only needed for `website`).

## API

No new endpoints. Changes:

- `SETTINGS_SECTIONS` gains `'inventory'`; normalizer `normalizeInventory(value)`.
- `apps/api/src/routes/admin.js` (products area — not touched by `codex-edits`):
  - `productSummary(products, lowStockThreshold)` and
    `productStockStatus(product, lowStockThreshold)` take the threshold as a
    parameter; their call sites `await getStoreSettings()` and pass
    `settings.inventory.lowStockThreshold`.
  - `GET /api/admin/products/settings` returns the stored threshold.
- `GET /api/storefront-settings` payload gains `inventory: { lowStockThreshold }`.

## Storefront (React app)

- `apps/web/src/lib/storeSettings.js`: `DEFAULT_STOREFRONT_SETTINGS` gains
  `inventory: { lowStockThreshold: 12 }`; new `useStorefrontSettings()` hook
  (`useState(DEFAULT_STOREFRONT_SETTINGS)` + `useEffect` resolving the cached
  `loadStorefrontSettings()` promise — same pattern as `useCart`).
- `ProductCard.jsx`: `limited` uses `settings.inventory.lowStockThreshold` via the
  hook instead of the literal `12`.
- `Product.jsx`: the "Limited pieces — N left in Size" note uses the same setting.
- Admin Dashboard/Products pages: no changes (server-computed values).

## Admin UI

One new collapsible **Inventory** `SectionCard` on `/admin/settings`, rendered
between Payments and SEO: a numeric input for the threshold with helper text
("Products at or below this stock count show 'Limited pieces' on the storefront and
count as low stock in the admin"), a Save button (`PUT /api/admin/settings/inventory`),
and the standard status feedback.

## Testing

- `storeSettingsRepository.test.js`: inventory defaults; round-trip; validation
  errors (0, 1000, non-integer).
- `adminSettings.test.js`: PUT round-trip; `GET /api/admin/products/settings`
  reflects the stored threshold; with a high threshold the products summary
  `lowStock` count includes in-stock products that were previously "in stock";
  public endpoint contains `inventory.lowStockThreshold`.
- Web source tests: `ProductCard.jsx` / `Product.jsx` use the settings threshold and
  contain no literal `<= 12` stock checks; `Settings.jsx` has the Inventory card;
  `storeSettings.js` exports `useStorefrontSettings`.
- Contract `apps/api/data/admin-contracts/settings.json`: add `lowStockThreshold`
  to `managedFields`; remove `configure inventory settings` from
  `futureAdminActions`. Update `apps/api/src/settings/README.md`.

## Conflict safety vs. codex-edits

Modified files: settings repository + tests, `admin.js` products area (their diff is
orders-only), `storeSettings.js` route + web lib, `ProductCard.jsx`, `Product.jsx`,
`Settings.jsx`, contract, README. No `App.jsx`, `orders.js`, `Checkout.jsx`,
`AdminLayout.jsx`, or orders-test changes. `apps/web/dist` rebuilt and committed when
the work lands on `main`.
