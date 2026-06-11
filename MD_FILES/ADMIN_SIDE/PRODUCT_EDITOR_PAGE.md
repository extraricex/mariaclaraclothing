# Product Editor Page

## Route
- `/admin.html#products`
- Opened from Products page by selecting or creating a product.

## Source Files
- `public/js/admin.js`
- `public/admin.html`
- `public/styles.css`
- `src/routes/admin.js`

## Purpose
The Product Editor page lets admins edit all product data that appears on the customer website.

## Main Sections
- Editor header with back button, title, status, duplicate, view, more actions, and navigation arrows.
- Product title card.
- Rich description editor.
- Media gallery.
- Category selector.
- Variants table.
- Category metafields.
- SEO listing.
- Right sidebar settings.

## Editable Data
- Product title.
- Description.
- Photos and alt text.
- Price and compare-at price.
- Category and collection.
- Product type.
- Vendor.
- Tags.
- Status.
- Variants, SKU, price, and stock.
- SEO title, meta description, and handle.

## Behavior
- Save product writes changes to the admin product API.
- Media can be uploaded, deleted, reordered, and saved.
- Variant rows can be added or deleted.
- Product description supports rich-text commands.

## Notes
- Customer product pages read from the same product data, so saved edits affect the storefront.
