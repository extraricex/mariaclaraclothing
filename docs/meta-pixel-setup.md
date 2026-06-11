# Meta Pixel Setup

The customer website is prepared for Meta Pixel browser tracking.

## Enable Tracking

1. In Meta Events Manager, create or open your web Dataset/Pixel.
2. Copy the Pixel ID.
3. Open `public/js/meta-pixel-config.js`.
4. Replace the blank value:

```js
window.MARIA_CLARA_META_PIXEL_ID = 'YOUR_PIXEL_ID';
```

Tracking is disabled while this value is blank.

## Events Prepared

- `PageView` on all customer pages.
- `ViewContent` on product pages.
- `AddToCart` after an item is added to cart.
- `InitiateCheckout` from the cart checkout action and checkout page.
- `Purchase` after an order is placed or confirmed on the thank-you page.

Admin pages do not load Meta Pixel.

## Before Running Ads

Use Meta Events Manager Test Events or the Meta Pixel Helper extension to confirm:

- `PageView` fires on the home, product, cart, checkout, and thank-you pages.
- `Purchase` fires once per order and includes the order value in PHP.
- `AddToCart` and `InitiateCheckout` appear during a test shopping flow.

For stronger reporting later, add Meta Conversions API server-side events and deduplicate them with browser Pixel events.
