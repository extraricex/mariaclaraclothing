# Maria Clara Website Customer UX Audit

Date: 2026-06-03

This audit reviews the current storefront from a customer friendliness perspective. It is based on the existing website files and customer flow: homepage, product page, cart, checkout, thank-you page, search, mobile menu, and order handling. It is not a substitute for live customer testing, but it identifies the highest-value improvements before launch.

## Overall Assessment

The site is in a strong UI state for a small ecommerce store. The main buying path is present: customers can browse products, inspect product photos in a carousel, choose size and quantity, add to cart, edit cart quantities, complete a COD checkout, and see a thank-you confirmation. The checkout also has Philippine province/city/barangay selectors and location-based shipping, which is a major trust and usability win.

The next improvements should focus less on visual polish and more on reducing customer uncertainty. Customers need to quickly understand fit, delivery, payment, stock, return rules, and what happens after placing a COD order.

## Priority 1: Improve Buying Confidence

### 1. Add clearer size guidance near size selection

The size guide exists on the product page, but customers choose size higher up in the product form. Add a small link or helper text near the size selector such as `View size guide below` or `Oversized fit. Check measurements before ordering.`

Why this matters: customers may choose a size before they ever reach the table, especially on mobile. Better size confidence reduces wrong-size orders and exchanges.

Recommended implementation:

- Keep the full size guide table below the product content.
- Add a small anchor link near the size buttons that scrolls to the size guide.
- Add a short fit note near size selection: `Oversized fit. Measurements are in inches.`

### 2. Make stock urgency more specific

The current `Limited pieces` label is useful, but it can be stronger if it reflects the selected size. For example: `Limited pieces in Medium`.

Why this matters: customers understand the urgency applies to the size they selected, not the whole product.

Recommended implementation:

- Update the label when selected size changes.
- Keep it red, but do not overuse urgency labels across every product if stock is normal.
- Consider a lower threshold later, such as 3 to 5 pieces, when real inventory data is available.

### 3. Clarify product material and care instructions

Product pages mention cotton and GSM, but customers may still wonder about wash care, shrinkage, fabric feel, and fit.

Recommended implementation:

- Add compact product detail rows below price or after size selector:
  - `240 GSM cotton`
  - `Oversized fit`
  - `Cash on Delivery available`
  - `Ships nationwide`
- Add care instructions in the description:
  - `Wash cold`
  - `Do not bleach`
  - `Hang dry recommended`

## Priority 2: Reduce Checkout Friction

### 4. Make delivery timing visible before checkout

Customers currently see shipping fee behavior, but not estimated delivery time. Add delivery expectations on product, cart, and checkout.

Recommended implementation:

- Product page: `Estimated delivery: Metro Manila/Cavite 2-4 days, Luzon 3-6 days, Visayas/Mindanao 5-8 days.`
- Checkout page: show the same estimate once address is complete.
- Thank-you page: show what happens next: `We will text you to confirm before shipping.`

Why this matters: COD customers often need reassurance before placing an order.

### 5. Improve checkout contact validation guidance

The checkout asks for `Email or mobile phone number`, but COD confirmation likely depends on phone. If mobile number is required operationally, make it explicit.

Recommended implementation:

- Change label to `Mobile number for COD confirmation`.
- Keep email optional only if the business truly uses it.
- Add helper text: `We will text or call before delivery.`

### 6. Remove inactive discount code until it works

The checkout shows a discount code field and Apply button, but there is no visible discount behavior in the current flow.

Why this matters: a non-working discount box can frustrate customers and make them search for coupons instead of completing checkout.

Recommended implementation:

- Hide the discount field until discount logic is implemented.
- Or add clear behavior: invalid code message, valid code discount, and admin order payload support.

## Priority 3: Strengthen Navigation And Discovery

### 7. Improve mobile menu labels

The mobile drawer has key links, but `SHIPPING` could be clearer as `SHIPPING & RETURNS`, matching the desktop nav.

Recommended implementation:

- Use consistent labels across desktop nav, drawer nav, and footer:
  - `New Arrivals`
  - `Freedom of Mind`
  - `About Us`
  - `FAQ`
  - `Shipping & Returns`
  - `Terms`
  - `Cart`

### 8. Add product filtering or quick category navigation

The homepage currently has product sections, but no filter by size availability, collection, or stock.

Recommended implementation:

- Add simple category links at the top of product grids.
- Add `Available in your size` filtering later when inventory is stable.
- At minimum, show sold-out states clearly on product cards.

### 9. Improve search result usefulness

Search currently matches product names. Customers may search for size, color, collection, or style terms.

Recommended implementation:

- Match against product name, collection, description, and available sizes.
- Show availability text in search results, such as `Available sizes: M / L`.
- Add a clearer empty state: `No products found. Try "orange", "mandala", or "oversized".`

## Priority 4: Trust And Customer Support

### 10. Make COD process more reassuring

The checkout and thank-you page mention texting customers. This is good, but it can be more specific.

Recommended implementation:

- Add a small COD trust note near the payment section:
  - `No online payment needed. Please keep your phone active for confirmation.`
- On thank-you page:
  - `Step 1: We confirm by text`
  - `Step 2: We pack your order`
  - `Step 3: Courier delivers and you pay on delivery`

### 11. Add customer support contact in checkout and thank-you

Footer has email, but during checkout customers may need immediate help.

Recommended implementation:

- Add `Need help? Contact us` near checkout footer.
- Include the active support channel: Messenger, email, or phone.
- If Messenger is the real sales support channel, prioritize it over email.

### 12. Strengthen returns and exchange visibility

Customers buying clothing care about wrong size, exchange windows, and return rules. Existing policy pages help, but the product page and checkout should summarize key points.

Recommended implementation:

- Product page: `7-day size exchange available. See policy.`
- Checkout page: `Please confirm size before placing COD order.`
- Thank-you page: link to `Shipping & Returns`.

## Priority 5: Technical And Operational Improvements

### 13. Add real discount code behavior or remove the UI

If discounts are planned, implement them through the order payload so admin and customer totals match. If not planned soon, remove the discount field.

### 14. Add order confirmation persistence beyond session storage

The thank-you page reads recent order data from session storage. That works for the current browser session, but customers may refresh later or open the confirmation link elsewhere.

Recommended implementation:

- Show order confirmation from the backend by order number.
- Keep session storage as a fallback only.

### 15. Add analytics for funnel drop-off

Once the UI is stable, track where customers stop:

- Product view
- Size selected
- Add to cart
- Cart checkout click
- Checkout address completed
- Order placed

Why this matters: customer-friendly changes should be driven by real behavior, not only assumptions.

## Suggested Implementation Order

1. Hide or implement discount codes.
2. Add delivery timing and COD reassurance on product, checkout, and thank-you pages.
3. Add size-guide anchor/helper near the size selector.
4. Make `Limited pieces` include the selected size.
5. Improve search matching and empty state.
6. Add customer support contact on checkout and thank-you.
7. Add backend-backed order confirmation lookup.
8. Add analytics events for the purchase funnel.

## Current Strengths To Keep

- Responsive checkout and thank-you pages.
- Product photo carousel instead of stacked images.
- Complete Philippine province/city/barangay dropdowns.
- Automatic shipping fee by location.
- Shipping hidden until address is complete.
- Editable cart and checkout quantities.
- COD payment flow with thank-you confirmation.
- Clear mobile menu and consistent header/footer shell.

## Bottom Line

The UI is ready enough to feel credible, but the site can become more customer-friendly by adding reassurance at decision points. The best next work is not a major redesign. It is clearer guidance around size, stock, delivery, COD confirmation, support, and checkout expectations.
