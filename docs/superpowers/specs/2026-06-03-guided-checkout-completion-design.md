# Guided Checkout Completion Design

Date: 2026-06-03

## Goal

Finish the checkout page by keeping the existing Shopify-style guided checkout structure and improving both presentation and order flow quality.

The checkout should support a complete Cash on Delivery order path:

1. Customer reviews cart items and totals.
2. Customer enters contact and delivery details.
3. Checkout calculates region-based shipping and free-shipping eligibility.
4. Customer confirms COD payment.
5. Storefront submits an admin-ready order payload.
6. Customer sees a clear order confirmation state.

## Approved Direction

Use the guided checkout direction.

Keep the current two-column checkout layout:

- Left side: contact, delivery, shipping, payment, billing, and submit flow.
- Right side: order summary, discount field shell, totals, and related product offer.

This fits the current codebase because `public/checkout.html`, `public/js/checkout.js`, `src/routes/orders.js`, and the existing tests already support a demo COD checkout flow. The implementation should refine and complete that flow rather than replace it.

## Existing Context

Current checkout files:

- `public/checkout.html`
  - Checkout page markup.
  - Uses `public/js/checkout.js`.
  - Includes shared storefront shell elements.

- `public/js/checkout.js`
  - Reads cart data from local storage through `public/js/cart.js`.
  - Loads Philippine PSGC province, city, municipality, and barangay data with fallbacks.
  - Calculates shipping by selected province/region.
  - Unlocks free shipping when cart quantity is at least 2.
  - Renders related products from the catalog API.
  - Submits orders through `createOrder(payload)`.

- `src/routes/orders.js`
  - Accepts `POST /api/orders`.
  - Validates customer, phone, structured address, and cart items.
  - Validates product availability and item price against the shared catalog.
  - Returns a demo order number and COD/admin status fields.

- `public/styles.css`
  - Contains the current checkout layout, form, summary, total, and related product styles.

## Checkout UX Requirements

### Layout

Keep a guided one-page checkout:

- Header and store shell remain consistent with the rest of the site.
- Main checkout form stays visually dominant.
- Order summary stays easy to scan on desktop.
- On mobile, the summary toggle remains available without crowding the form.
- Cards and form sections should stay compact, readable, and professional.

### Form Sections

The form should include:

- Contact
  - Email or mobile phone number.
  - Optional login link can remain disabled for now.

- Delivery
  - Country locked to Philippines.
  - First name and last name.
  - House number, street, building, or unit.
  - Province.
  - City or municipality.
  - Barangay.
  - Phone number.

- Shipping method
  - Region-based standard shipping.
  - Metro Manila and Cavite: PHP 80.
  - Luzon: PHP 120.
  - Visayas and Mindanao: PHP 180.
  - Free shipping when cart quantity is at least 2.

- Payment
  - Cash on Delivery only for this pass.
  - Copy should make clear the customer pays when the order arrives.

- Billing address
  - Same as shipping address for this pass.

### Validation

Validation should be clearer than a generic browser error:

- Empty cart blocks checkout and keeps the user on checkout with a clear message.
- Missing structured address fields list what is missing.
- Province and city changes clear dependent selections.
- Barangay remains disabled until a city or municipality is selected.
- Server errors from `/api/orders` appear in the checkout status area.

### Order Confirmation

After a successful COD order:

- Clear the cart.
- Reset checkout form state.
- Show the returned order number.
- Explain that the store will text the customer to confirm COD delivery.
- Keep the user from accidentally submitting the same order twice.

This can be an inline confirmation state on `checkout.html` for now. A separate `thank-you.html` page is out of scope unless requested later.

### Checkout Upsell

The order summary should actively offer other available items before the customer places the order. When the cart has fewer than 2 total items, the related-products message should emphasize the free-shipping incentive. Product cards should include an `Add` button that adds the first available variant directly to checkout and a product-page link for customers who want to choose a specific size.

After an upsell item is added, checkout should update through the existing cart module, rerender totals immediately, refresh free-shipping messaging, update the header cart count, and remove the added product from the visible suggestions.

## Data Contract

The checkout payload should remain admin-ready and include:

- `customer.fullName`
- `customer.phone`
- `customer.email`
- `address.addressLine`
- `address.houseAddress`
- `address.barangay`
- `address.city`
- `address.province`
- `address.country`
- `address.postalCode`
- `shippingRegion`
- `shippingRegionLabel`
- `freeShippingUnlocked`
- `shippingFeeCents`
- `discountTotalCents`
- `items`
- `cartSnapshot`
- `checkoutChannel: 'storefront_checkout'`
- `paymentMethod: 'cash_on_delivery'`
- `adminEditableTotals`

The server response should continue returning:

- `orderNumber`
- `syncStatus`
- `checkoutChannel`
- `paymentMethod`
- `shippingRegion`
- `freeShippingUnlocked`
- `status`
- `fulfillmentStatus`
- `paymentStatus`

## Visual Direction

The checkout should feel like a refined ecommerce checkout, not a marketing page.

Use:

- Clean section hierarchy.
- Compact field spacing.
- Clear form labels.
- Visible but restrained status messages.
- A readable summary column.
- Strong primary COD submit button.
- Lightweight offer messaging for free shipping.

Avoid:

- Large hero sections.
- Decorative gradients.
- Unrelated promotional cards.
- Extra payment methods that are not wired up.
- Multi-step routing before the current order flow is complete.

## Files To Update During Implementation

1. `public/checkout.html`
   - Refine section copy and status/confirmation markup.
   - Add any needed hooks for improved validation and submit state.

2. `public/js/checkout.js`
   - Improve client-side validation messages.
   - Add submit pending state.
   - Improve success confirmation behavior.
   - Let related product cards add the first available variant directly to checkout.
   - Keep the existing shipping and admin payload contract.

3. `public/styles.css`
   - Polish checkout layout, fields, summary, related product offer, and mobile behavior.

4. `test/frontendBehavior.test.js`
   - Cover checkout markup and script contract changes.

5. `test/health.test.js`
   - Keep order API validation coverage aligned with the checkout payload.

## Out Of Scope

- Real payment gateway integration.
- User accounts and login checkout.
- Persistent database order storage.
- Admin order management UI.
- Promo code calculation.
- Separate thank-you page.
- International shipping.

## Acceptance Checklist

- Checkout page is visually polished on desktop and mobile.
- Empty cart checkout is blocked with a clear message.
- Address validation explains missing fields.
- Shipping fee updates from the selected delivery region.
- Free shipping applies when cart quantity is at least 2.
- Related products still render when available.
- Related product cards can add an available item directly from checkout.
- Adding an upsell item rerenders totals and free-shipping messaging.
- COD order submission returns an order number.
- Cart clears after successful order submission.
- Confirmation message is visible and specific.
- Payload remains admin-ready.
- `npm test` passes.
- `node --check public/js/checkout.js` passes.
