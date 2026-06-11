# Maria Clara Product Page Reference Analysis

Reference URL inspected: https://mariaclaraclothing.com/products/oversized-fit-shirt-mc-curiosity-offwhite-maria-clara-clothing-oversized-fit-100-cotton-copy

Date inspected: June 4, 2026

## Goal

Rebuild the customer product detail page so it visually matches the current Maria Clara Clothing Shopify product page as closely as possible. The target is a minimal Shopify product page with white background, clean black typography, large product media, compact purchase controls, simple footer, and mobile-first responsive behavior.

This document is for approval before implementation.

## Reference Page Summary

The live page uses Shopify's Spotlight/Dawn-style product template. The main product section is a two-column layout on desktop and a stacked layout on mobile.

Desktop structure:

1. Announcement bar
2. Header navigation
3. Product media column on the left
4. Sticky product information column on the right
5. Product description inside the product information column
6. Share control
7. Minimal footer

Mobile structure:

1. Announcement bar
2. Header
3. Product image slider
4. Product title, price, size, quantity, add to cart
5. Pickup availability
6. Description and size chart image
7. Share control
8. Footer

## Exact Reference Content

Announcement bar:

`BUY 2 ITEMS TO GET FREE SHIPPING FEE`

Header links:

- FAQ
- Shipping and Returns
- Terms of Use
- NEW ARRIVALS

Header actions:

- Search
- Log in
- Cart

Product title:

`KAMALAYAN BLOOM BLACK — Oversized 240 GSM Shirt`

Vendor/store text:

`Maria Clara`

Price:

- Compare-at price: `₱929.00 PHP`
- Sale price: `₱649.00 PHP`
- Sale badge: `Sale`
- Sold out badge exists but should only show when the selected variant is unavailable

Sizes:

- Small - Unavailable
- Medium
- Large
- XLarge
- 2XLarge - Unavailable
- 3XLarge - Unavailable

Default selected size on the live page:

`Medium`

Pickup availability:

- `Couldn't load pickup availability`
- `Refresh`

Description heading:

`OVERSIZED FIT SHIRT | KAMALAYAN BLOOM | BLACK | MARIA CLARA CLOTHING | OVERSIZED FIT | 100% COTTON`

Description paragraph:

`This oversized fit crew neck tee offers a premium quality thread 240 GSM cotton fabric. It's designed for comfort and style, ensuring you feel alive wherever you go. Peace for mind and clarity of thoughts are just a wear away. Hand wash only for longevity.`

Second description block:

`Why you’ll love it:`

The reference page presents the benefit list as line-separated text with check marks:

- Premium 240 GSM cotton
- Oversized streetwear fit
- Proudly made in the Philippines
- COD available
- Ships nationwide
- Easy size exchange within 7 days

Shipping heading:

`Shipping & Style:`

Shipping paragraph:

`Enjoy FREE SHIPPING NATIONWIDE on orders of minimum 2. Bring your style anywhere with the Maria Clara Premium Shirt. Check the OVERSIZE CHART for the perfect fit.`

Size chart:

The reference page displays the size chart as an image inside the product description, not as a separate size-guide table section.

Footer copyright:

`© 2026, Maria Clara`

## Product Media Reference

The live product page uses 5 media items, not 3.

Reference media order:

1. Main Bloom Black product image
2. Second Bloom Black product image
3. Oversized shirt size chart image
4. Lifestyle/model image
5. Lifestyle/model image

Media behavior:

- Desktop uses a stacked Shopify-style media gallery on the left.
- Mobile uses a slider-style media list.
- Mobile shows image count like `1 / 5`.
- Clicking/tapping media opens a modal/lightbox.
- Product media uses a clean square image presentation where possible.

## Layout Requirements

Desktop:

- Main product area uses a centered page container.
- Product grid has no large gap between columns by default.
- Left media column is approximately 65% width.
- Right product information column is approximately 35% width.
- Product information column has left padding around `4rem` on large screens.
- Product information column should be sticky with top offset around `3rem`.
- Product information content max width should be around `60rem`.

Tablet/mobile:

- Product media stacks above product details.
- Image gallery should not cause horizontal page scrolling.
- Controls should fit the viewport without clipped text.
- Product title, price, selector, quantity, and buttons should keep the Shopify-like spacing.

## Component Match Checklist

### Announcement Bar

Reference behavior:

- Full-width bar
- Centered text
- Minimal styling

Recommended change:

- Change our current announcement from `LIMITED STOCKS ONLY GET IT NOW` back to the live reference text if the goal is exact matching.

### Header

Reference behavior:

- Simple text links
- White background
- Clean spacing
- Search, Log in, and Cart actions
- No heavy decorative UI

Recommended change:

- Keep the header minimal and Shopify-like.
- Remove any underline by default.
- Only show underline/hover treatment on pointer hover.

### Product Gallery

Reference behavior:

- Large stacked product images on desktop.
- Slider behavior on mobile.
- Image counter on mobile.
- Modal/lightbox on image click.

Recommended change:

- Use 5 product media items.
- Use Shopify-like gallery classes and spacing.
- Remove generic ecommerce card styling around media.

### Product Information

Reference behavior:

- Vendor/store text appears above the product title.
- Product title is prominent but not oversized.
- Price block shows compare-at price with strikethrough, sale price, and sale badge.
- Product controls are compact and vertically spaced.

Recommended change:

- Match the live product information order:
  1. Vendor/store text
  2. Product title
  3. Price
  4. Size selector
  5. Quantity selector
  6. Add to cart
  7. Pickup availability
  8. Description
  9. Share

### Size Selector

Reference behavior:

- Shopify dropdown selector.
- Label is `Size`.
- Unavailable options show `- Unavailable`.
- Dropdown is not full-page wide on desktop.

Recommended change:

- Keep dropdown size selection.
- Style it closer to Shopify's `select__select` control.
- Default selected size should be the first available variant, which is `Medium` for this reference product.

### Quantity Selector

Reference behavior:

- Label `Quantity`.
- Stepper has minus button, number input, plus button.
- Current cart quantity text appears as `(0 in cart)` when applicable.
- Quantity cannot go below 1.

Recommended change:

- Match Shopify-like stepper dimensions and spacing.

### Add To Cart

Reference behavior:

- Large full-width button.
- Simple rectangular Shopify button style.
- No decorative gradient.
- Opens cart notification/drawer after adding.

Recommended change:

- Use simple black/white button styling depending on availability.
- Keep cart notification with:
  - `Item added to your cart`
  - View cart
  - Check out
  - Continue shopping

### Pickup Availability

Reference behavior:

- Text says `Couldn't load pickup availability`.
- A `Refresh` button/link appears under it.

Recommended change:

- Keep this exact simple block for visual matching.

### Product Description

Reference behavior:

- Description appears in the product information column.
- The size chart image is part of the description.
- Text spacing is simple and Shopify-like.

Recommended change:

- Replace our current separate key-features layout with the live reference description order.
- Preserve line breaks and spacing from the database/admin product description.
- Show the size chart image inside the description block.

### Share Control

Reference behavior:

- Simple `Share` control.
- Copy-link UI appears when opened.
- Includes close and copy-link actions.

Recommended change:

- Keep a simple Shopify-like share dropdown/modal.
- Avoid large social-share button groups.

### Footer

Reference behavior:

- Minimal footer.
- Payment methods area exists but appears visually minimal.
- Copyright text is simple.

Recommended change:

- Keep footer minimal for product page.
- Use `© 2026, Maria Clara`.

## Current Website Gaps To Fix

Our current custom product page is close in functionality, but it does not yet match the live Shopify reference exactly.

Main differences:

- Our announcement text currently differs from the live reference.
- Our product media currently limits the gallery to 3 images, while the live reference uses 5.
- Our page still has Bootstrap/custom ecommerce layout classes that make it look more like a generic template than the Shopify reference.
- Our product description structure differs from the live page.
- Our separate size-guide section/table should be removed from the product page if exact matching is required.
- Our spacing and column widths need to be tuned to the Shopify ratios.
- Our mobile gallery should show the same slider/count behavior as the reference.
- Any extra upsell or sticky mobile purchase UI should be removed from this page if it is not visible in the reference.

## Recommended Implementation Plan

1. Update the product page shell to use Shopify-like product section class names and structure.
2. Update the customer product renderer to output the product blocks in the exact reference order.
3. Update the gallery to support 5 media items, desktop stacked layout, mobile slider count, and lightbox.
4. Update the size selector to match the Shopify dropdown styling and unavailable option labels.
5. Update price rendering to match the sale/compare-at/badge layout.
6. Move size chart image into the product description area.
7. Remove or hide product-page-only UI that is not present in the reference page.
8. Add CSS breakpoints matching the reference product column ratios and mobile behavior.
9. Update tests for the new expected Shopify-style structure.
10. Verify desktop, tablet, and mobile layouts with the local dev server.

## Approval Decisions

Before implementation, confirm these decisions:

1. Exact reference match means the announcement bar should use `BUY 2 ITEMS TO GET FREE SHIPPING FEE`, not `LIMITED STOCKS ONLY GET IT NOW`.
2. Exact reference match means the gallery should show 5 product media items, not only 3.
3. Exact reference match means the separate size-guide section should be removed from the product page and the size chart should appear inside the description.
4. Exact reference match means any extra upsell/sticky product UI not visible on the live reference page should be removed from this product page.

## Acceptance Checklist

The product page is correct when:

- Desktop layout matches the live reference with media left and product information right.
- Mobile layout stacks media first and product information second.
- The product image gallery has the same clean Shopify-style behavior.
- Size selector is a dropdown with unavailable labels.
- Price, sale badge, and sold-out behavior match the reference.
- Add to cart opens a Shopify-like cart notification/drawer.
- Description appears in the same order and keeps the same spacing.
- Size chart image appears inside the description.
- Footer is minimal and matches the reference tone.
- No horizontal scrolling appears on mobile or desktop.
- Text fits inside all buttons and controls.

