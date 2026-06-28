# Responsive Cart And Checkout Product Images Design

## Goal

Show each complete product photo without cropping in the cart drawer and checkout order summary, while keeping both layouts stable and responsive across mobile and desktop widths.

## Root Cause

The cart page already renders item photos with `object-contain`, so the complete product remains visible. The cart drawer in `Shell.jsx` and order summary in `Checkout.jsx` use `object-cover`, which fills the thumbnail by cropping wide or tall source images.

The `data-new-gr-c-s-check-loaded` attribute is injected on the document body by the Grammarly browser extension. It is not part of the application source and is unrelated to product image rendering.

## Approved Design

- Use `object-contain` for product photos in the cart drawer and checkout order summary.
- Use responsive `4:5` thumbnail frames instead of unrelated fixed width and height pairs.
- Keep the existing neutral `bg-cream` frame so unused space around differently shaped source photos looks intentional.
- Keep `overflow-hidden` and `shrink-0` so images cannot overflow or compress adjacent product information.
- Use a smaller frame on narrow screens and a slightly larger frame at the `sm` breakpoint.
- Render images as block elements that fill the frame dimensions without distortion.
- Preserve the checkout quantity badge, product link, lazy loading, alternative text, controls, totals, and all commerce behavior.

## Components

### Cart Drawer

Update the product thumbnail in `apps/web/src/components/Shell.jsx`. The frame remains a link to the product and closes the drawer when selected. Only its responsive dimensions and image fitting change.

### Checkout Order Summary

Update the product thumbnail in `apps/web/src/pages/Checkout.jsx`. The quantity badge remains positioned on the frame. Only its responsive dimensions and image fitting change.

### Cart Page

No production change is required in `apps/web/src/pages/Cart.jsx` because it already uses `object-contain`. Its existing behavior is the reference pattern.

## Testing

- Add a failing source regression test that requires `object-contain` in both the cart drawer and checkout order summary.
- Require responsive `4:5` frames in both components.
- Ensure item photos in those locations no longer use `object-cover`.
- Run focused web tests and the complete web test suite.
- Run a production web build with the configured Meta Pixel values.
- Rebuild and restart Docker.
- Use browser acceptance at mobile and desktop viewports to confirm the complete image is visible, frames do not overflow, checkout remains usable, and no page errors occur.

## Non-Goals

- No changes to product image uploads or source image files.
- No changes to product, cart, quote, checkout, order, pricing, inventory, Meta Pixel, or Meta Conversions API behavior.
- No attempt to remove or manage Grammarly-injected attributes.
- No changes to admin product imagery.
- No Git staging, commit, merge, push, restore, or cleanup operations.

## Acceptance Criteria

- Cart drawer photos show the entire product without cropping.
- Checkout summary photos show the entire product without cropping.
- Thumbnail frames preserve a consistent `4:5` ratio and adapt at the `sm` breakpoint.
- Product text, quantity controls, price, and checkout layout remain readable without horizontal overflow.
- The checkout quantity badge remains visible.
- Focused tests, full web tests, production build, Docker rebuild, and browser checks pass.
