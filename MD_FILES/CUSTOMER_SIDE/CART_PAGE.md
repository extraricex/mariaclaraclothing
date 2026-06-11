# Cart Page

## Route
- `/cart.html`

## Source Files
- `public/cart.html`
- `public/js/cart.js`
- `public/js/shell.js`
- `public/styles.css`

## Purpose
The cart page lets customers review selected products before checkout. It follows the Maria Clara Shopify cart reference with a simple cart title, continue shopping link, item list, and checkout footer.

## Main Sections
- Shopify-style customer header.
- Cart title: `Your cart`.
- Continue shopping link to `/collections/all`.
- Empty cart state.
- Filled cart item list.
- Quantity stepper per cart item.
- Remove item button.
- Estimated total footer.
- Checkout button.
- Minimal footer.

## Data and Behavior
- Cart items are stored in local storage under `maria-clara-cart`.
- Quantity changes and removals update local storage immediately.
- Checkout button is disabled when the cart is empty.
- Checkout button redirects to `/checkout.html` when items exist.

## Notes
- `/collections/all` is routed by the Express app to the homepage so Continue shopping works locally.
