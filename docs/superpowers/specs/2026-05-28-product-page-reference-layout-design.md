# Product Page Reference Layout Design

Date: 2026-05-28

## Goal

Recreate the product page layout from the live Maria Clara Shopify product page while keeping our frontend-only project simple and maintainable.

Reference page:
`https://mariaclaraclothing.com/products/oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1`

## Reference Observations

The live page shows this product-page order:

1. Header/navigation.
2. Announcement bar: `BUY 2 ITEMS TO GET FREE SHIPPING FEE`.
3. Product gallery with three media items and a counter like `1 / of 3`.
4. Product information panel:
   - Product title.
   - Product title link/vendor-style link.
   - Regular price and sale price.
   - `Sale` and `Sold out` badges.
   - Size selector.
   - Quantity selector.
   - Add to cart button.
   - Pickup availability error with refresh.
5. Product description:
   - Long product heading.
   - Product paragraph.
   - `Why you’ll love it` list.
   - `Shipping & Style`.
   - Size chart image.
6. Share/copy link area.
7. Footer/payment area.

## Header Icons

The product page should use the same header icon treatment currently used on the homepage:

- Hamburger menu: Bootstrap `bi-list` SVG.
- Search: Bootstrap `bi-search` SVG.
- Login/account: Bootstrap `bi-person-circle` SVG.
- Cart: Bootstrap `bi-cart4` SVG with the cart count.

This should replace the current product-page text actions:

- `Search`
- `Log in`
- `Cart`

The product page should also include the same Bootstrap Icons CSS link as the homepage currently does. To avoid header drift later, the final implementation should either duplicate the homepage header exactly or move the shared header markup into a reusable pattern later.

## Product Layout

### Desktop

Use a two-column product section:

- Left column: product media gallery.
- Right column: sticky product information panel.

The spacing should be close to Shopify Spotlight:

- Outer product section padding: roughly `36px-56px` on desktop.
- Column gap: roughly `32px-48px`.
- Product info panel width: around `420px-480px`.
- Gallery media should be square or follow source media ratio, with clean white/paper background.

### Mobile

Use a single-column layout:

- Product media first.
- Product information second.
- Description below.

Spacing should be tighter:

- Outer padding around `16px`.
- Gallery media full width.
- Size buttons wrap cleanly without horizontal scrolling.
- Quantity selector and add-to-cart remain easy to tap.

## Product Gallery

Keep the Shopify-like structure already started in `public/js/storefront.js`:

- `.shopify-product-detail`
- `.product-media-list`
- `.product-media-item`
- `.product-media-counter`
- `.product-gallery-thumbs`

Needed refinements:

- Use the same media count behavior as the reference: `1 / of N`.
- Keep thumbnails visible under the media list.
- Do not crop product images aggressively. Product media should look inspectable.

## Product Info Panel

The info panel should include:

- Product title.
- Vendor/title link.
- Sale pricing:
  - Regular price line.
  - Crossed-out compare price.
  - Sale price.
  - Unit price text.
- Badge row:
  - `Sale`.
  - `Sold out` when applicable.
- Size selector.
- Quantity selector.
- Add to cart.
- Pickup availability message.

The page should not add payment/backend logic yet. This remains frontend-only.

## Size Selector

Match the reference behavior:

- All sizes are listed.
- Unavailable sizes remain visible but disabled.
- Disabled size label can include `- Unavailable`.
- Selected size should be visually distinct.

For the reference product, the size sequence is:

`Small`, `Medium`, `Large`, `XLarge`, `2XLarge`, `3XLarge`.

## Description Section

Use the live product page content structure:

- Heading:
  `OVERSIZED FIT SHIRT | MC CURIOSITY | OFFWHITE | MARIA CLARA CLOTHING | OVERSIZED FIT | 100% COTTON`
- Main paragraph about 240 GSM cotton, comfort, style, peace of mind, and hand wash.
- `Why you’ll love it:`
  - Premium 240 GSM cotton.
  - Oversized streetwear fit.
  - Proudly made in the Philippines.
  - COD available.
  - Ships nationwide.
  - Easy size exchange within 7 days.
- `Shipping & Style:`
  - Free shipping nationwide on orders of minimum 2.
  - Reminder to check the oversize chart.
- Size chart image.
- Share/copy link row.

## Files To Update After Approval

1. `public/product.html`
   - Replace header actions with the same icon header used on the homepage.
   - Add Bootstrap Icons CSS link if keeping inline SVG/icon system consistent with homepage.

2. `public/js/storefront.js`
   - Adjust product renderer text/content to match the target reference page.
   - Keep quantity, size selection, add-to-cart, and share behaviors.
   - Ensure product media count and gallery spacing match the reference.

3. `public/styles.css`
   - Add/refine responsive product layout rules.
   - Align product page spacing with the reference page.
   - Style icon header consistently with homepage.
   - Style product media, badges, price, quantity, pickup message, description, and share row.

4. `src/products/catalogSeed.js`
   - Ensure the target product has all expected media, including size chart image.

5. Tests
   - Add/update tests for:
     - Product page uses homepage icon header.
     - Product renderer includes Shopify-style product layout.
     - Product description matches reference content sections.
     - Size selector keeps unavailable sizes visible and disabled.

## Acceptance Checklist

- Product page header uses the same icons as homepage.
- Product page spacing visually matches the linked Shopify product page.
- Product section stacks cleanly on mobile.
- Desktop uses gallery left and sticky info panel right.
- Sale price, compare price, badges, size selector, quantity, and add-to-cart are present.
- Product description and size chart appear below the product detail.
- Tests pass before implementation is considered complete.
