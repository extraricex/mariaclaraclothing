# Thank You Page

## Route
- `/thank-you.html`
- `/thank-you.html?order=<order-number>`

## Source Files
- `public/thank-you.html`
- `public/js/thank-you.js`
- `public/js/api.js`
- `public/styles.css`

## Purpose
The thank-you page confirms a successful COD order. It is styled like a Shopify checkout confirmation page with customer information and an order summary.

## Main Sections
- Focused checkout-style shell without storefront navigation.
- Maria Clara logo and checkout breadcrumbs.
- Confirmation checkmark and thank-you message.
- Order details card.
- Customer information:
  - Contact information
  - Shipping address
  - Shipping method
  - Payment method
  - Billing address
- What happens next steps.
- Support email.
- Continue shopping and View cart buttons.
- Right-side order summary with product items, subtotal, shipping, and total.
- Empty confirmation fallback if no order is found.

## Data and Behavior
- Tries to load order details from `GET /api/orders/:orderNumber/confirmation`.
- Falls back to `sessionStorage` key `maria-clara-last-order`.
- Renders order items, shipping, and totals dynamically.

## Notes
- The checkout page stores the last order before redirecting here.
