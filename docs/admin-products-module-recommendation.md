# Admin Products Module Recommendation

Date: 2026-06-03

This document defines the recommended first version of the Products admin module for Maria Clara Clothing. It is a planning document only. No implementation is included here.

## Goal

Build a Products admin page where the store owner can manage product records without editing code. Product changes should update the same product source used by the customer-facing storefront, so product titles, prices, images, variants, and inventory stay aligned across admin, product pages, cart, checkout, and orders.

## Current Product Source

The current product source of truth is:

- `data/products.json`

The current product code path is:

- `src/products/catalogRepository.js` validates and loads product records.
- `src/products/catalogPresenter.js` shapes product data for the storefront API.
- `GET /api/products` and `GET /api/products/:slug` power the customer-facing website.
- Product field mapping is documented in `docs/admin-product-storefront-field-map.md`.

The first Products admin should edit this JSON-backed product source. Later, the storage can move to a real database and hosted image storage without changing the customer-facing API response shape.

## Recommended Scope For First Version

The first Products admin should include:

- product list
- create product
- edit product details
- delete or archive product
- add/change product photos
- edit price and compare-at price
- edit product description
- manage size/color variants
- manage inventory quantity
- set product status
- assign collections/categories
- export products
- import products
- print product list
- filter products
- recommended product settings panel

This is the right next admin module after Orders because product price, images, and inventory directly affect customer checkout accuracy.

## Products Page Layout

Use the same simplified admin shell:

- dark top bar
- left sidebar
- light gray admin background
- white cards
- compact table
- professional badge colors
- responsive desktop/tablet/mobile layout

### Products Page Header

Header content:

- title: `Products`
- total product count badge
- primary button: `Create product`
- secondary actions:
  - `Import`
  - `Export`
  - `Print`

### Summary Cards

Recommended cards:

- Total products
- Active products
- Draft products
- Archived products
- Low stock variants
- Sold out products

### Filter Tabs

Recommended tabs:

- All
- Active
- Draft
- Archived
- Low stock
- Sold out

### Search And Filter Bar

Filters:

- search by product title, SKU, slug, collection
- status filter
- collection filter
- stock filter
- price range filter, later if needed

First version should support search, status, collection, and stock state. Price range can wait.

### Products Table

Recommended columns:

- Checkbox
- Product
- Status
- Inventory
- Price
- Compare-at price
- Collections
- Variants
- Featured
- Updated
- Actions

Product cell should show:

- thumbnail
- product title
- slug or SKU helper text

Actions:

- Edit
- Duplicate, later
- Archive
- Delete

## Product Create And Edit Form

Use a detail panel or full edit page. For first version, a right-side edit panel is acceptable if it remains usable on mobile. A full edit page is better once product fields grow.

### Required Fields

- Product title
- Slug
- Price
- At least one image
- At least one variant

### Product Details

Editable fields:

- title
- slug
- description
- collections/categories
- product status: `Active`, `Draft`, `Archived`
- featured: true/false
- product page heading
- product page intro
- product page content sections
- sold-out button text
- media limit

### Pricing

Editable fields:

- price
- compare-at price

Validation:

- price must be greater than or equal to zero
- compare-at price can be blank
- compare-at price should be greater than price if present
- admin should show prices in PHP but store values as cents

### Product Photos

First version should support adding photos by URL.

Why URL first:

- current product data already stores image URLs
- no file upload/storage service is configured yet
- it avoids adding cloud storage before the product admin is useful

Photo fields:

- image URL
- alt text
- sort order

Photo actions:

- add photo
- edit photo URL
- edit alt text
- reorder photos
- remove photo
- choose primary image by sort order

Future version:

- upload image file
- store image in local uploads or cloud storage
- generate image previews
- validate file type and file size

### Variants And Inventory

Variant fields:

- size
- color, optional
- SKU
- stock quantity
- external POS variant ID, optional

Variant actions:

- add variant
- edit variant
- remove variant
- mark sold out by setting stock to zero

Inventory rules:

- stock quantity must be a whole number
- stock quantity cannot be negative
- sold-out label on the storefront should update automatically
- low-stock label should follow the storefront threshold

### Product Status

Recommended statuses:

- `Active`: visible and purchasable if variants have stock
- `Draft`: hidden from storefront product grids and search
- `Archived`: not shown on storefront and not editable in normal list unless archived filter is active
- `Sold out`: can be derived from inventory, but existing `merchandisingStatus` can still support storefront badges

First version can map status to existing fields:

- `active` maps to normal visible product
- `draft` maps to hidden from admin filters and future storefront rules
- `archived` maps to hidden from admin default view and future storefront rules
- `sold_out` maps to existing sold-out behavior

## Delete, Archive, And Safety

Recommendation: use archive as the default safe action.

Delete behavior:

- show a confirmation dialog
- block deletion if product appears in existing orders, or require archive instead
- keep old order snapshots untouched

First version:

- implement `Archive` safely
- implement `Delete` only if no existing orders reference the product

Reason: order history should never break because a product was deleted.

## Export Products

First version should export JSON.

Export content:

- all product fields
- images
- variants
- product page data

Export format:

- `products-export-YYYY-MM-DD.json`

Future version:

- CSV export for spreadsheet editing

## Import Products

First version should import JSON matching the existing product schema.

Import flow:

1. Admin selects JSON file.
2. System validates product records.
3. System shows a preview summary:
   - products to create
   - products to update
   - validation errors
4. Admin confirms import.
5. System writes valid records.

Import safety:

- reject invalid records
- do not partially overwrite products without confirmation
- keep a backup copy before import

CSV import can come later. JSON import is safer for the current schema.

## Print Products

Print action should open the browser print dialog with a printer-friendly product list.

Print view should include:

- product title
- status
- price
- variants
- stock
- SKU
- collections

Do not print the full edit forms.

## Recommended Settings Panel

Add a Products settings section or side card with recommended defaults:

- Low stock threshold: default `12`
- Default collection: `New Arrivals`
- Default status for new products: `Draft`
- Default product type: `Oversized Shirt`
- Default currency: PHP
- Image requirements:
  - primary image required
  - alt text recommended
- Variant defaults:
  - Small
  - Medium
  - Large
  - XLarge
  - 2XLarge
  - 3XLarge

First version can display these settings and use them as form defaults. Editing settings can come after core product CRUD works.

## API Routes

Recommended protected admin routes:

- `GET /api/admin/products`
- `GET /api/admin/products/:slug`
- `POST /api/admin/products`
- `PUT /api/admin/products/:slug`
- `DELETE /api/admin/products/:slug`
- `POST /api/admin/products/import`
- `GET /api/admin/products/export`

All admin routes must require admin authentication.

Public storefront routes should remain:

- `GET /api/products`
- `GET /api/products/:slug`

## Data Flow

Admin product changes should update `data/products.json`.

After saving:

1. Admin submits product data.
2. Backend validates the product.
3. Backend writes product data to the product source.
4. Storefront product API reads the updated product.
5. Customer-facing product cards, product pages, cart validation, and checkout use the latest product data.

## Validation Rules

Product validation should reject:

- missing title
- missing slug
- duplicate slug
- invalid price
- compare-at price lower than sale price
- missing images
- image without URL
- variant without size
- variant without ID/SKU generation path
- negative stock
- non-number stock

Product validation should warn, but not block:

- missing alt text
- missing compare-at price
- no collection
- no featured status

## Recommended First Implementation Order

1. Add product repository write methods.
2. Add admin product API tests.
3. Add protected admin product API routes.
4. Add product list UI.
5. Add create/edit product form.
6. Add image URL management.
7. Add variant and inventory management.
8. Add archive/delete behavior.
9. Add export JSON.
10. Add import JSON with validation preview.
11. Add print stylesheet/view.
12. Add recommended settings display.

## What To Defer

Defer these until core product CRUD is stable:

- real image file uploads
- cloud storage
- CSV import/export
- bulk edit
- duplicate product
- advanced SEO fields
- barcode generation
- supplier/vendor management
- product bundles

## Acceptance Criteria

The Products admin first version is ready when:

- admin can create a product
- admin can edit product title, slug, description, price, compare-at price, status, collections, and featured setting
- admin can add/edit/remove image URLs
- admin can add/edit/remove size variants
- admin can update stock quantity
- admin can archive or safely delete a product
- admin can export product data
- admin can import valid product JSON
- admin can print a product list
- product changes appear on the customer-facing website without code edits
- tests cover create, update, delete/archive, import, export, and storefront visibility

## Recommended Decision

Start with JSON-backed product CRUD and image URL management. This matches the current architecture and gets the admin useful quickly. Add real file uploads and database storage after product CRUD is proven.

