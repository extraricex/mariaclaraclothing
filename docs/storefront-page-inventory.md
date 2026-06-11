# Storefront Page Inventory

Date: 2026-06-03

This document records the storefront pages currently present in the project so page purpose, scripts, data dependencies, and future retrieval points are easy to find.

## Shared Frontend Files

- `public/styles.css`
  - Global storefront styling.
  - Page-specific sections for homepage, product, cart, checkout, and policy pages.

- `public/js/shell.js`
  - Shared shell behavior.
  - Header cart count.
  - Mobile drawer behavior.
  - Search overlay behavior.

- `public/js/api.js`
  - Browser API wrapper.
  - `getProducts()`
  - `getProduct(slug)`
  - `createOrder(payload)`

- `public/js/cart.js`
  - Cart local-storage behavior.
  - Cart page rendering.
  - Cart totals.
  - Cart count updates.
  - Checkout link enable/disable behavior.

- `public/js/storefront.js`
  - Homepage product rendering.
  - Product detail rendering.
  - Product gallery, variants, quantity, add-to-cart, and share behavior.

- `public/js/checkout.js`
  - Checkout rendering and order submission.
  - PSGC address loading and fallbacks.
  - Shipping fee calculation.
  - Free-shipping messaging.
  - Related product rendering.
  - Admin-ready order payload creation.

## Backend Retrieval Points

- `src/app.js`
  - Express app setup.
  - Static files from `public`.
  - API routes.

- `src/routes/products.js`
  - Product catalog API.
  - Used by homepage, product page, search, checkout related products.

- `src/routes/orders.js`
  - Demo order API.
  - Used by checkout.
  - Validates customer, address, cart item availability, and prices.

- `src/products/catalogSeed.js`
  - Source product catalog data.

- `src/products/catalogPresenter.js`
  - Product presentation helpers for storefront/API responses.

- `src/products/catalogRepository.js`
  - Product lookup repository.

## Pages

### Homepage

- Route: `/`
- File: `public/index.html`
- Main script: `public/js/storefront.js`
- Shared script: `public/js/shell.js`
- Purpose:
  - Main storefront landing and shopping entry point.
  - Shows brand hero, new arrivals, brand sections, product cards, and footer.
- Data:
  - Loads products from `/api/products`.
  - Uses assets from `public/brand`.
- Current retrieval notes:
  - Product cards should come from shared catalog data.
  - Cart count should be synced from local storage.

### Product Page

- Route format: `/product.html?slug={product-slug}`
- Example route: `/product.html?slug=good-shirt-crew-neck-regular-fit-premium-quality-shirt-tee-copy`
- File: `public/product.html`
- Main script: `public/js/storefront.js`
- Shared script: `public/js/shell.js`
- Purpose:
  - Product detail page with image gallery, pricing, variants, quantity, add-to-cart, description, size chart, and share behavior.
- Data:
  - Loads one product from `/api/products/:slug`.
  - Uses catalog product images and variant stock from `src/products/catalogSeed.js`.
- Current retrieval notes:
  - Product page reference design is documented in `docs/superpowers/specs/2026-05-28-product-page-reference-layout-design.md`.

### Cart Page

- Route: `/cart.html`
- File: `public/cart.html`
- Main script: `public/js/cart.js`
- Shared script: `public/js/shell.js`
- Purpose:
  - Review cart items before checkout.
  - Edit quantities.
  - Remove items.
  - View estimated total.
  - Continue to checkout when cart has items.
- Data:
  - Reads cart items from browser local storage.
  - Cart item shape is produced by product add-to-cart behavior in `public/js/storefront.js`.
- Current retrieval notes:
  - Cart does not submit orders directly.
  - Checkout starts at `/checkout.html`.

### Checkout Page

- Route: `/checkout.html`
- File: `public/checkout.html`
- Main script: `public/js/checkout.js`
- Shared script: `public/js/shell.js`
- Purpose:
  - Complete Cash on Delivery checkout.
  - Collect contact and structured Philippine delivery address.
  - Calculate shipping.
  - Submit admin-ready order data.
  - Show confirmation after order creation.
- Data:
  - Reads cart items from browser local storage.
  - Loads product suggestions from `/api/products`.
  - Submits order payload to `POST /api/orders`.
  - Loads Philippine PSGC address data from external PSGC endpoints with local fallbacks.
- Current retrieval notes:
  - Approved checkout completion design is documented in `docs/superpowers/specs/2026-06-03-guided-checkout-completion-design.md`.
  - Prior shipping-offer plan is documented in `docs/superpowers/plans/2026-05-28-checkout-shipping-offers.md`.

### FAQ Page

- Route: `/faq.html`
- File: `public/faq.html`
- Shared script: `public/js/shell.js`
- Purpose:
  - Static FAQ content for customer support.
- Data:
  - Static HTML content.
- Current retrieval notes:
  - Uses shared header, search overlay, drawer, and footer.

### Shipping And Returns Page

- Route: `/shipping-returns.html`
- File: `public/shipping-returns.html`
- Shared script: `public/js/shell.js`
- Purpose:
  - Static shipping and returns policy content.
- Data:
  - Static HTML content.
- Current retrieval notes:
  - Should stay aligned with checkout shipping rules:
    - Free shipping for 2 or more items.
    - Region-based standard shipping.

### Terms Page

- Route: `/terms.html`
- File: `public/terms.html`
- Shared script: `public/js/shell.js`
- Purpose:
  - Static terms of use content.
- Data:
  - Static HTML content.
- Current retrieval notes:
  - Uses shared header, search overlay, drawer, and footer.

## Assets

### Brand Assets

- `public/brand/logo.png`
- `public/brand/hero1.jpg`
- `public/brand/hero1-web.jpg`
- `public/brand/hero1v2.jpg`
- `public/brand/hero2.png`
- `public/brand/hero2-web.jpg`
- `public/brand/video-poster.mp4`

Used by homepage, shared header, and brand sections.

### Product Assets

- `public/MANDALA WHITE/mandala white front.jpg`
- `public/MANDALA WHITE/mandala white back.jpg`
- `public/MANDALA WHITE/mandala1.jpg`
- `public/MANDALA WHITE/mandala2.jpg`
- `public/MANDALA WHITE/mandala3.jpg`
- `public/MANDALA WHITE/mandala3rd.jpg`
- `public/MANDALA WHITE/mandala4.jpg`
- `public/MANDALA WHITE/mandala5.jpg`
- `public/MANDALA WHITE/mandalafinishwhite.jpg`
- `public/MANDALA WHITE/mandalawhite.jpg`

Used by catalog/product pages through `src/products/catalogSeed.js`.

## Test Coverage

- `test/brandAssets.test.js`
  - Confirms expected brand/page assets exist.

- `test/catalog.test.js`
  - Confirms catalog behavior and product data contract.

- `test/frontendBehavior.test.js`
  - Confirms frontend markup and script contracts for product, cart, checkout, and responsive behavior.

- `test/health.test.js`
  - Confirms server, product API, and order API behavior.

- `test/homepageStructure.test.js`
  - Confirms homepage structure.

- `test/pageShell.test.js`
  - Confirms shared page shell consistency.

## Local URLs

With the server running on port `3100`:

- Homepage: `http://localhost:3100/`
- Product page example: `http://localhost:3100/product.html?slug=good-shirt-crew-neck-regular-fit-premium-quality-shirt-tee-copy`
- Cart: `http://localhost:3100/cart.html`
- Checkout: `http://localhost:3100/checkout.html`
- FAQ: `http://localhost:3100/faq.html`
- Shipping and Returns: `http://localhost:3100/shipping-returns.html`
- Terms: `http://localhost:3100/terms.html`
