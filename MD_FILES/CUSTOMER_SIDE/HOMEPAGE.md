# Homepage

## Route
- `/`
- `/index.html`
- `/collections/all` serves the homepage collection view.

## Source Files
- `public/index.html`
- `public/js/shell.js`
- `public/js/storefront.js`
- `public/styles.css`

## Purpose
The homepage is the main customer storefront for Maria Clara Clothing. It introduces the brand, displays campaign visuals, and shows product collections.

## Main Sections
- Shopify-style header with FAQ, Shipping and Returns, Terms of Use, and New Arrivals links.
- Search overlay, mobile drawer menu, account icon placeholder, and cart icon.
- Announcement bar: `BUY 2 ITEMS TO GET FREE SHIPPING FEE`.
- Hero carousel with campaign images.
- New Arrivals product grid.
- Freedom of Mind product grid.
- Campaign video.
- About Us brand section.
- Footer with policy links and contact.

## Data and Behavior
- Product cards are loaded by `public/js/storefront.js`.
- Product data comes from `GET /api/products`.
- Search uses product names, descriptions, collections, and variants.
- Cart count is read from local storage through `public/js/cart.js`.

## Notes
- This page is the working destination for cart Continue shopping links.
- Product card clicks open `/product.html?slug=<product-slug>`.
