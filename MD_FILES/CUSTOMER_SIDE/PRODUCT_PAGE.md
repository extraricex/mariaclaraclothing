# Product Page

## Route
- `/product.html?slug=<product-slug>`

## Source Files
- `public/product.html`
- `public/js/storefront.js`
- `public/js/cart.js`
- `public/js/shell.js`
- `public/styles.css`

## Purpose
The product page shows one product with a Shopify-style product detail layout, media gallery, variant selector, quantity selector, add-to-cart flow, quick checkout, upsell products, and product description.

## Main Sections
- Shopify-style customer header and announcement bar.
- Product media carousel/gallery.
- Product title, sale pricing, selected size, and stock status.
- Size dropdown with unavailable sizes disabled.
- Quantity stepper.
- Add to Cart button.
- Check Out button for direct checkout.
- Pickup availability message.
- Product description and size chart.
- Share modal/copy-link behavior.
- Upsell section for other items.
- Featured image section.
- Footer with payment methods and copyright.

## Data and Behavior
- Loads product data from `GET /api/products/:slug`.
- Loads related products from `GET /api/products`.
- Adds selected variant to local cart storage.
- Buy now adds the item to cart, then redirects to `/checkout.html`.
- Gallery and lightbox are handled by `storefront.js`.

## Notes
- Variant stock controls whether sizes are available.
- Low-stock variants show a limited-pieces label.
