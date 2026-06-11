# Admin Product Management Readiness

This project is prepared for a future admin website without adding the admin UI yet.

## Current Product Source

Editable product content now lives in `data/products.json`.

Each product record supports:

- `slug`
- `name`
- `description`
- `collections`
- `priceCents`
- `compareAtPriceCents`
- `merchandisingStatus`
- `featured`
- `productPage`
- ordered `images`
- size/stock `variants`

Image records support:

- `url`
- `altText`
- `sortOrder`

Variant records support:

- `size`
- `sku`
- `stockQuantity`
- `externalPosVariantId`

Product page records support:

- `heading`
- `intro`
- editable content `sections`
- `sizeChartImageUrl`
- `mediaLimit`
- `soldOutText`

## Storefront Data Flow

`src/products/catalogRepository.js` loads and validates `data/products.json`.

`src/products/catalogPresenter.js` converts repository products into the existing storefront API response shape.

Admin-to-storefront field mapping is documented in `docs/admin-product-storefront-field-map.md`.

The public frontend still uses the same endpoints:

- `GET /api/products`
- `GET /api/products/:slug`

## Future Admin Phase

The future admin website should edit the JSON-backed product fields first, then later swap the repository storage from JSON to a database or hosted file storage.

Recommended admin features:

- create product
- edit title, slug, description, collections, prices, and featured status
- add, replace, reorder, and remove images
- edit size variants, SKUs, and stock
- validate required product fields before saving
- update the shared product source directly so product pages stay aligned with admin edits

Keeping the frontend API stable means the customer-facing website should not need a redesign when admin management is added.
