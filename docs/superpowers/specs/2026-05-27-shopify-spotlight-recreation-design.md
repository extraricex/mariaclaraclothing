# Maria Clara Clothing Shopify Spotlight Recreation Design

Date: 2026-05-27

## Purpose

Recreate the current `mariaclaraclothing.com` Shopify storefront as closely as practical inside the existing custom Maria Clara Clothing web app. The target is the current Shopify Spotlight storefront look and behavior while keeping the project frontend-first: static pages, lightweight Express APIs, in-project catalog data, browser cart state, and demo checkout confirmation.

The recreation should feel like the current public site to customers: same section order, same campaign assets, same product-grid rhythm, same sale/sold-out merchandising style, and similar mobile-first Shopify interactions.

## Source Reference

The live site inspected on 2026-05-27 is a Shopify store using the `Spotlight` theme, schema version `15.3.0`.

Observed reference sources:

- Home page: `https://mariaclaraclothing.com/`
- Product catalog JSON: `https://mariaclaraclothing.com/products.json`
- Shopify CDN assets under `https://cdn.shopify.com/s/files/1/0781/7979/5224/files/`

The Shopify catalog JSON exposes the product names, handles, variants, size availability, sale prices, compare-at prices, product descriptions, and image URLs needed for the custom recreation.

## Recommended Approach

Build a Shopify Spotlight-style clone inside this custom site.

Considered approaches:

- Visual-only match: fastest, but would not feel exact because Shopify drawer, search, card hover, badges, and section rhythm would remain simplified.
- Shopify Spotlight-style clone inside this custom site: best fit because it recreates the customer-facing experience while keeping the codebase simple for frontend and design work.
- Actual Shopify theme rebuild: closest to Shopify internals, but it moves work away from this repository and conflicts with the existing custom commerce backend direction.

The selected approach is the Shopify Spotlight-style clone inside the custom Express app.

## Goals

- Match the current public storefront's layout and visual hierarchy.
- Use the current Maria Clara logo, banner, video, and product assets from Shopify CDN.
- Replace temporary catalog imagery with real Shopify product images.
- Recreate Shopify-like product cards with square media, hover image swap, Sale/Sold out badges, title, compare-at price, and sale price.
- Recreate the current homepage section order: announcement, header, slideshow, image banner, New Arrivals, Freedom of Mind, vertical video, About Us, footer.
- Keep product detail, cart, and checkout interactions working from local project files.
- Keep the site mobile-first and responsive.

## Non-Goals

- Reimplement Shopify Liquid.
- Connect to Shopify checkout.
- Build a full Shopify operations dashboard.
- Add payment gateways beyond the current custom checkout direction.
- Clone Shopify analytics, customer accounts, captcha, Shop Pay, or app embeds.
- Guarantee pixel-perfect parity with every Shopify CSS rule. The target is a close customer-visible recreation.

## Existing Project Context

The current repository is a custom Express storefront with static public pages and JSON APIs.

Relevant files:

- `src/app.js`: Express app, static file serving, API routes.
- `public/index.html`: current home page.
- `public/styles.css`: global storefront styling.
- `public/js/storefront.js`: product grid and product detail rendering.
- `src/products/catalogSeed.js`: fallback catalog data.
- `src/products/catalogPresenter.js`: converts seed products into storefront API shape.
- `public/product.html`, `public/cart.html`, `public/js/cart.js`: product and cart flows.

The current homepage already has a custom storefront structure, but it does not yet match the live Shopify site closely. It uses a different hero, different header, trust sections not present on Shopify, and several temporary Unsplash product images.

## Homepage Design

### Announcement Bar

Add a full-width announcement bar above the header.

Content:

`BUY 2 ITEMS TO GET FREE SHIPPING FEE`

Behavior:

- Stays visible at the top of the page.
- Uses compact uppercase text.
- Matches Shopify's simple announcement presentation.

### Header

Recreate the current Shopify header:

- Left hamburger icon button.
- Center Maria Clara logo image from Shopify CDN: `Design_1_Front_copy.png`.
- Right-side icon buttons for search, account, and cart.
- Cart icon includes the existing cart count.
- White background, thin divider, clean spacing.
- Mobile-first layout with the same simple icon structure on desktop unless a full menu is added later.

Interactions:

- Hamburger opens a drawer menu.
- Search opens a search overlay or drawer.
- Cart icon links to the existing cart page.
- Account icon should be shown for visual parity but disabled with `aria-disabled="true"` because custom accounts are out of scope.

### Drawer Menu

The drawer menu should behave like a Shopify mobile menu:

- Opens from the left.
- Uses a dimmed backdrop.
- Has a close button.
- Contains links to New Arrivals, Freedom of Mind, About Us, Cart, FAQ, Shipping, Returns, and Terms.
- Closes on backdrop click, close button, or Escape key.
- Traps obvious focus targets enough for basic keyboard usability.

### Search Overlay

The search overlay should mimic Shopify search behavior without implementing full predictive search in the first pass.

Required behavior:

- Opens from the search icon.
- Shows a search input.
- Filters currently loaded products by name.
- Shows matching product names, prices, and thumbnails.
- Links results to the custom product detail page.
- Shows an empty state when no product matches.

### Hero Slideshow

Recreate the Shopify slideshow section with full-width campaign images.

Assets:

- `dwa.jpg`
- `webstore.jpg`

Observed CTAs:

- `SHOP NEW ARRIVALS`
- `SHOP NOW`

Behavior:

- Full-width image slides.
- Uses responsive `img` sizing and object-fit cover.
- Includes overlay content and CTA buttons where present on the Shopify reference.
- Can auto-advance slowly, but must include stable layout and not cause text overlap.
- CTA targets scroll to `#new-arrivals`.

### Secondary Image Banner

Place a wide banner section immediately after the slideshow and before product collections.

Asset:

- `banner1.jpg`

Behavior:

- Full-width image banner.
- Maintains the current Shopify-like shallow banner ratio on desktop.
- Crops cleanly on mobile.

### New Arrivals Collection

Render a collection section titled `NEW ARRIVALS`.

Initial product order should match the live Shopify section as closely as available from the observed page and catalog:

- `KAMALAYAN BLOOM BLACK -- Oversized 240 GSM Shirt`
- `CURIOSITY OFFWHITE -- Oversized 240 GSM Shirt`
- `CURIOSITY BLACK -- Oversized 240 GSM Shirt`
- `KAMALAYAN EYE BLACK -- Oversized 240 GSM Shirt`
- `MC ACID OFFWHITE -- Oversized 240 GSM Shirt`
- `MC ACID BLACK -- Oversized 240 GSM Shirt`
- `ICONIC MARIACLARA ORANGE -- CROP BOX 240 GSM Shirt`
- `MANDALA WHITE V1 -- Oversized 240 GSM Shirt`

Product card requirements:

- Square image area.
- First image as primary card image.
- Second image as hover image when available.
- Product title below image.
- Sale price in PHP.
- Compare-at price crossed out when present.
- `Sale` badge when compare-at price is greater than sale price and at least one variant is available.
- `Sold out` badge when all variants are unavailable.
- Card links use the format `product.html?slug=SHOPIFY_HANDLE`, with each Shopify handle as the canonical local slug.

Responsive grid:

- Mobile: 2 columns.
- Tablet: 3 columns.
- Desktop: 4 columns.

### Freedom Of Mind Collection

Render a second collection titled `FREEDOM OF MIND`.

Initial product order should match the live Shopify section as closely as available:

- `ICONIC MARIACLARA ORANGE -- CROP BOX 240 GSM Shirt`
- `IMPERIAL CHOCO TEE`
- `BAHALA BLACK -- Oversized 240 GSM Shirt`
- `INFINITE POSSIBILITIES BLACK -- CROP BOX 240 GSM Shirt`
- `ABOT KAMAY WHITE -- Oversized 240 GSM Shirt`
- `HAWAK WHITE -- Oversized 240 GSM Shirt`

Use the same card component as New Arrivals.

### Video Section

Add a vertical campaign video section after the product collections.

Observed Shopify media:

- Poster: `preview_images/bf4b5ae3359e4fe79f69b374135e7835.thumbnail.0000000000.jpg`
- MP4: `shop/videos/c/vp/bf4b5ae3359e4fe79f69b374135e7835/bf4b5ae3359e4fe79f69b374135e7835.HD-1080p-4.8Mbps-50988614.mp4`

Behavior:

- Show poster first.
- Show centered play button.
- On click, replace poster with the video.
- Video plays inline, loops, and shows controls.
- Maintain a tall vertical ratio similar to the Shopify page.

### About Section

Add the Shopify-like rich text section after the video.

Heading:

`ABOUT US`

Copy:

`At Maria Clara Clothing, we blend classic Filipino elegance with everyday style. Inspired by tradition, made for the modern soul, our pieces are crafted to make you feel confident, comfortable, and proud of your roots. Wear culture. Wear confidence.`

Also include:

`stay in Peace of Mind`

Presentation:

- Centered text.
- White background.
- Generous vertical spacing.
- No card container.

### Footer

Keep the footer minimal and Shopify-like.

Required content:

- Copyright: `© 2026, Maria Clara`
- Footer links: FAQ, Shipping and Returns, Terms of Use, Contact.
- Social links should be omitted until real brand URLs are available.

Do not add large promotional footer blocks because the current Shopify footer is sparse.

## Product Data Design

The custom catalog should be updated to reflect the live Shopify catalog.

Fields to capture for each product:

- Shopify product ID.
- Title.
- Handle.
- Local slug.
- Body or short description.
- Collection assignment for homepage display.
- Sale price.
- Compare-at price.
- Product status from variant availability.
- Variant size names.
- Variant SKUs.
- Variant stock availability.
- Image list with primary and secondary image ordering.

The first pass keeps this data in `src/products/catalogSeed.js`.

## Product Detail Design

The product detail page should remain custom but visually align more closely with Shopify:

- Large image gallery using real product images.
- Product title exactly as the Shopify title.
- Sale price and compare-at price.
- Size selector from real variants.
- Disabled unavailable sizes.
- Add to Cart and Buy Now buttons.
- Product description from a cleaned version of Shopify `body_html`.
- Size chart image when present in the product image list or description.
- Sticky mobile purchase bar may remain because it supports conversion, but it should not conflict visually with the Shopify-like styling.

## Cart And Checkout Design

Keep the existing custom cart and checkout behavior.

Visual updates should make cart and checkout consistent with the recreated Shopify styling:

- White background.
- Black text.
- Yellow or black primary buttons consistent with Shopify theme variables.
- Product thumbnails from real product images.
- Clear sale pricing.
- Free-shipping message when quantity is two or more.

Checkout continues creating local orders through the existing API.

## Styling System

Use a restrained theme based on observed Shopify variables:

- Background: white.
- Text: near-black.
- Secondary surface: light gray.
- Primary Shopify button accent: yellow `#fce477`.
- Dark button: near-black.
- Product media radius: approximately 16px.
- Global media radius: approximately 4px.
- Typography: Inter.

Typography:

- Body font: Inter.
- Headings: Inter, regular to medium weight, uppercase for section titles where Shopify does this.
- Letter spacing remains `0`.

Avoid unrelated decorative elements, gradients, oversized marketing cards, and non-Shopify sections that would make the custom site diverge from the current public site.

## Accessibility Requirements

- Icon buttons need accessible labels.
- Drawer and search overlay need close buttons and Escape behavior.
- Product images need meaningful alt text.
- Badges should not be the only signal for sold-out products; unavailable product pages and size buttons should also reflect state.
- Slideshow should not advance too quickly.
- Buttons and links must be keyboard reachable.
- Text must not overlap images or other controls on mobile.

## Implementation Boundaries

Expected files to update during implementation:

- `public/index.html`
- `public/styles.css`
- `public/js/storefront.js`
- `public/js/cart.js` if cart count or icon behavior needs adjustment.
- `public/product.html`
- `public/cart.html`
- `src/products/catalogSeed.js`
- `src/products/catalogPresenter.js`
- Existing tests for catalog behavior.

Avoid adding persistence services or operational integrations during the frontend/design phase.

## Testing And Verification

Minimum verification:

- Run `npm test`.
- Run the local server.
- Verify the homepage loads without console errors.
- Verify mobile and desktop responsive layouts.
- Verify header drawer opens and closes.
- Verify search overlay filters products.
- Verify product cards show real images, hover image swap, Sale/Sold out badges, and prices.
- Verify product detail pages load from the new slugs/handles.
- Verify add-to-cart and cart count still work.
- Verify cart and checkout still create orders as before.

Visual verification:

- Compare the custom homepage against `https://mariaclaraclothing.com/` section by section.
- Check at least mobile width around 390px, tablet around 768px, and desktop around 1440px.
- Confirm no text or UI overlap.

## Open Decisions For Implementation

- Whether to cache Shopify CDN images locally or keep remote CDN URLs in the seed catalog. The recommended first pass is to keep remote Shopify CDN URLs for speed and fidelity.
- Whether the account icon should eventually open custom account pages. The first pass keeps it disabled for visual parity.
- Whether slideshow auto-advance is required. The recommended first pass is to include manual/accessible slides first, then add auto-advance only if it does not harm usability.

## Acceptance Criteria

- The homepage visually follows the current Shopify section order and layout.
- The product catalog uses real Shopify product images and current product names/prices.
- The header, menu drawer, search overlay, product cards, badges, video section, and about section feel like the current Shopify storefront.
- The existing custom product, cart, checkout, and order flows continue to work.
- Tests pass.
- The implementation remains scoped to the custom storefront and does not introduce Shopify checkout or Liquid dependencies.
