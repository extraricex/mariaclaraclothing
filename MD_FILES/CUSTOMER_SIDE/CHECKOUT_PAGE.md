# Checkout Page

## Route
- `/checkout.html`

## Source Files
- `public/checkout.html`
- `public/js/checkout.js`
- `public/js/cart.js`
- `public/js/api.js`
- `public/styles.css`
- `public/data/philippines-addresses.json`

## Purpose
The checkout page collects customer contact, delivery address, shipping method, and COD payment confirmation. It uses a focused Shopify-style checkout shell with an order summary and upsell products.

## Main Sections
- Maria Clara logo and checkout breadcrumbs.
- Return to cart link.
- Contact section for COD mobile number.
- Delivery address form.
- Province, city/municipality, and barangay dropdowns.
- Shipping method section.
- COD payment section.
- Billing address section.
- Place COD order button.
- Right-side order summary with editable item quantities.
- Upsell section: Complete your order.

## Data and Behavior
- Cart data comes from local storage.
- Address dropdowns use `public/data/philippines-addresses.json`.
- Shipping fee is calculated automatically:
  - Metro Manila and Cavite: PHP 80
  - Luzon outside Metro Manila and Cavite: PHP 120
  - Visayas and Mindanao: PHP 180
  - Free shipping when cart has at least 2 items.
- Order creation uses `POST /api/orders`.
- After successful order creation, checkout redirects to `/thank-you.html?order=<order-number>`.

## Notes
- Shipping fee stays hidden/calculated until the required address fields are complete.
- Upsell items can be added without leaving checkout.
