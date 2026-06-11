# Products Page

## Route
- `/admin.html#products`

## Source Files
- `public/admin.html`
- `public/js/admin.js`
- `src/routes/admin.js`
- `src/products/catalogRepository.js`
- `public/styles.css`

## Purpose
The Products page manages customer-facing product records, inventory, images, variants, and merchandising details.

## Main Sections
- Page heading with product count.
- Export button.
- Import control.
- More actions dropdown.
- Add product button.
- Print button.
- Product analytics summary cards.
- Search and filter toolbar.
- Products table/list.
- Product editor page/section.
- Recommended settings card.

## Filters
- Search by product, SKU, or collection.
- Status.
- Category.
- Stock.
- Sort order.

## Product Actions
- Create product.
- Edit product.
- Delete product.
- Duplicate product.
- Archive product.
- Export products.
- Import products.
- Print product list.

## Data and Behavior
- Product list uses `/api/admin/products`.
- Product create/update/delete uses admin product API routes.
- Requires Bearer admin token.
- Changes sync to customer website through the shared product database/API.

## Notes
- Product image uploads are supported through the admin product editor.
