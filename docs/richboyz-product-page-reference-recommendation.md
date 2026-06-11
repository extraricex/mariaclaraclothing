# Richboyz Product Page Reference Recommendation

## Goal

Use the Richboyz product page as a product-detail-page reference for Maria Clara Clothing, especially the layout, product gallery, variant selection, product information tabs, recommendations, reviews, and footer structure.

Reference reviewed: https://richboyz.com/products/box-tee-raglan

This document is for approval before implementation. No website code should be changed until this direction is approved.

## Important Boundary

We should not copy Richboyz exactly in a legal or brand sense. We should not copy their product photos, brand name, collection names, copywriting, customer service text, icons, or exact visual assets.

What we can copy as a design direction:

- product page structure
- ecommerce interaction patterns
- gallery layout
- product information hierarchy
- recommendation sections
- footer organization

The final Maria Clara page should feel similar in shopping quality but still use Maria Clara branding, product photos, copy, sizing, shipping rules, COD messaging, and J&T-ready checkout requirements.

## Reference Page Summary

The Richboyz product page has a dense clothing-brand PDP structure:

1. Header with menu, search, account, cart, and large shop navigation.
2. Breadcrumb trail.
3. Product title and sold-out status.
4. Price block.
5. Large multi-image product gallery.
6. Color selector with many swatches.
7. Size selector with size chart link.
8. Sold-out/add-to-cart button.
9. Payment method badges.
10. Product information tabs:
    - Description
    - Sizing
    - Shipping
    - Returns
11. Additional color/product choices.
12. Reviews block.
13. Style With recommendation section.
14. Community signup.
15. Expanded footer.

The reference product content includes product title, sold-out status, sale price, multiple product images, color options, size options, and description/sizing/shipping/returns content.

## Current Maria Clara Product Page

Our current product page already has:

- announcement bar
- Maria Clara header
- product media gallery
- product title and price
- size selector
- quantity controls
- add-to-cart / quick checkout behavior
- product description
- size chart image support
- share modal
- responsive layout

But compared with the Richboyz reference, our page is simpler and less commerce-dense. It does not yet fully emphasize:

- breadcrumb navigation
- multiple color swatches
- product info tabs
- payment badge row
- reviews
- style-with recommendations
- related color/product selector
- expanded ecommerce footer

## Recommended Maria Clara Product Page Direction

### 1. Product Layout

Recommended desktop layout:

- Left side: large product gallery, two-column image grid or vertical gallery.
- Right side: sticky product purchase panel.
- Product panel should remain visible while scrolling product images.
- Breadcrumb should sit above the product title.

Recommended mobile layout:

- Product image carousel first.
- Product title, price, variant selectors, and add-to-cart below.
- Product info tabs should stack cleanly.
- Related products should become horizontal swipe rows.

### 2. Product Gallery

Use a stronger gallery like the reference:

- main product image
- alternate product image
- back/close-up image
- fit/lifestyle image
- size chart image if available

Recommended behavior:

- desktop: large stacked or two-column media grid
- mobile: swipeable carousel with image count
- click/tap image opens a larger image viewer later

### 3. Product Information Panel

Recommended order:

1. Breadcrumb
2. Product title
3. Availability badge
4. Price
5. Color selector, if color variants exist
6. Size selector
7. Size chart link
8. Quantity selector
9. Add to cart / Sold out / Buy now
10. Payment method badges
11. COD and shipping reassurance

For Maria Clara, keep COD messaging visible:

- COD available
- Ships nationwide
- Free shipping for 2 items
- J&T-ready address required at checkout

### 4. Color Selector

Richboyz uses a color selector with many swatches and linked product/color options.

Recommended Maria Clara version:

- If color variants exist in the same product, show color swatches.
- If colors are separate products, show linked color/product cards.
- Use product thumbnails or clean color chips.
- Keep labels clear, such as `Black`, `White`, `Orange`, `Offwhite`.

Do not add fake colors if the product data does not support them.

### 5. Size Selector

Richboyz shows sizes from `S` to `XXXL` with size chart access.

Recommended Maria Clara version:

- Keep all product sizes visible.
- Disable sold-out sizes but keep them visible.
- Show selected size clearly.
- Keep size chart link near the size selector.
- Use Maria Clara’s existing size data and size chart images.

### 6. Add-To-Cart Area

Recommended behavior:

- Available item: show `Add to cart` and optional `Buy now`.
- Sold out item: show disabled `Sold out`.
- Low stock item: show a subtle limited-stock warning.
- Selected unavailable size: disable add-to-cart until an available size is selected.

The button should be full-width inside the sticky product panel.

### 7. Product Information Tabs

Add Richboyz-style tabs or accordion sections:

- Description
- Details
- Sizing
- Shipping
- Returns

Recommended Maria Clara content:

- Description: product story and material.
- Details: GSM, cotton, fit, neck type, print/design details.
- Sizing: size chart image and size guidance.
- Shipping: COD, J&T delivery, free shipping for 2 items.
- Returns: 7-day exchange/return policy.

On mobile, these should behave like accordions.

### 8. Payment Badges

Richboyz shows payment methods below the purchase area.

Recommended Maria Clara version:

- COD
- GCash, only if available later
- Maya, only if available later
- Bank transfer, only if available later

For now, do not advertise payment methods that are not ready. We can show `Cash on Delivery` as the primary payment badge.

### 9. Related Products And Style-With Section

Add lower product sections:

- `More Colours`
- `Style With`
- `You May Also Like`

Recommended source:

- same collection
- same product type
- same color family
- products with available stock

This should use real product cards from the catalog.

### 10. Reviews

The Richboyz page includes review placeholders.

Recommended Maria Clara version:

- Add a simple review section visually.
- Do not collect reviews yet unless backend support is planned.
- Start with a static state:
  - `This product has no reviews yet.`
  - `Reviews coming soon.`

### 11. Footer

Use the richer footer direction already documented in the storefront UI recommendation:

- Join the Community
- Email signup
- Company
- Customer Service
- Social links

This should eventually be shared across all customer pages, not only product pages.

## Recommended Implementation Phases

### Phase 1: Layout Match

Build the product page layout first:

- breadcrumb
- large gallery
- sticky product panel
- price/availability
- size selector
- add-to-cart state
- responsive mobile carousel layout

### Phase 2: Product Info Tabs

Add:

- Description
- Details
- Sizing
- Shipping
- Returns

Use existing product data where possible. Add product data fields only if needed.

### Phase 3: Related Product Blocks

Add:

- More Colours
- Style With
- You May Also Like

Use catalog products and existing product cards.

### Phase 4: Footer Upgrade

Add the expanded ecommerce footer and reuse it across:

- homepage
- product page
- cart
- FAQ
- shipping and returns
- terms

## Recommended Tests Before Implementation

Add or update tests for:

- product page has breadcrumb
- product page has gallery + sticky purchase panel
- product page has color/size selectors when data supports them
- unavailable sizes stay visible but disabled
- product page has product info tabs or accordions
- product page has payment/COD reassurance
- product page has related product sections
- product page remains responsive on mobile/tablet/desktop

Recommended test files:

- `test/frontendBehavior.test.js`
- `test/pageShell.test.js`
- `test/catalog.test.js`, only if product data fields are added

## Best Recommendation

Yes, we can make the Maria Clara product page follow the Richboyz product-page style closely.

I recommend we do it in this order:

1. Build the Richboyz-inspired product page layout.
2. Keep Maria Clara branding, header, product photos, and COD/J&T checkout messaging.
3. Add product info tabs.
4. Add related product sections.
5. Upgrade the shared footer after the product page design is approved.

This gives the product page a premium streetwear ecommerce feel without breaking the current cart, checkout, admin products, or J&T export workflow.
