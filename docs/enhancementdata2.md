# Enhancement Data 2: Synchronized Promo, Cart, Checkout, Orders, and Inventory Roadmap

Status: planning document only. No implementation has been applied from this file yet.

## Goal

Build one synchronized customer website and admin website flow for:

- Promo notifications
- Admin-controlled discounts and promos
- Add to cart
- Cart totals
- Checkout validation and review
- Order creation
- Inventory deduction
- Admin order management
- Order status updates

The implementation must reuse the current project structure and data sources. Do not create duplicate frontend-only systems when backend/database persistence already exists.

## Current Project Findings

### Customer Website

- Product pages use `apps/web/src/pages/Product.jsx`.
- Cart state uses `apps/web/src/lib/cart.js` and localStorage key `maria-clara-cart`.
- Cart changes sync to the backend through `PUT /api/cart-sessions/:sessionId`.
- Cart page uses `apps/web/src/pages/Cart.jsx`.
- Checkout page uses `apps/web/src/pages/Checkout.jsx`.
- Checkout currently calls `POST /api/orders` through `createOrder()` in `apps/web/src/lib/api.js`.
- Checkout validates customer and address data before submit.
- Checkout already supports province, city/municipality, and barangay selectors.
- Checkout currently has no dedicated final review step. The summary exists beside the form, but the customer can place the order directly after filling the form.
- Add to cart currently shows an inline success message and links, but it does not automatically open a cart drawer/modal or redirect to cart.
- Free shipping and "Buy 2" promo text are currently hardcoded in customer UI in several places.

### Backend/API

- Public products are served through existing product/catalog routes.
- Public site content exists through `GET /api/site-content`.
- Public discount validation exists through `POST /api/discounts/validate`.
- Public order creation exists through `POST /api/orders`.
- Public cart sessions exist through `PUT /api/cart-sessions/:sessionId`.
- Backend order creation checks product, variant, price, and stock availability.
- Backend order creation does not currently deduct inventory after a successful order.
- Backend order creation currently trusts the frontend-provided shipping fee.

### Database and Persistence

The current schema already has real tables for:

- `products`
- `product_images`
- `product_variants`
- `orders`
- `discount_codes`
- `cart_sessions`

The API repositories also support file-based data fallbacks for local/dev mode.

Important existing columns:

- `product_variants.stock_quantity`
- `orders.discount_code`
- `orders.discount_total_cents`
- `orders.shipping_fee_cents`
- `orders.free_shipping_unlocked`
- `orders.admin_editable_totals`
- `cart_sessions.status`
- `cart_sessions.converted_order_number`

### Admin Website

- Admin layout already includes Discounts and Website content.
- Admin discounts use `apps/web/src/admin/Discounts.jsx` and `apps/web/src/admin/DiscountDetail.jsx`.
- Admin discount APIs exist:
  - `GET /api/admin/discounts`
  - `POST /api/admin/discounts`
  - `PATCH /api/admin/discounts/:code`
  - `DELETE /api/admin/discounts/:code`
- Current discount backend supports only percentage and fixed discount codes.
- Admin orders use `apps/web/src/admin/Orders.jsx` and `apps/web/src/admin/OrderDetail.jsx`.
- Admin order APIs exist:
  - `GET /api/admin/orders`
  - `GET /api/admin/orders/:orderNumber`
  - `PATCH /api/admin/orders/:orderNumber`
- Admin cart sessions already support Draft and Abandoned Checkout views from real cart session data.
- Anonymous customer fallback already exists in `cartSessionSummary()`.
- Admin inventory exists in `apps/web/src/admin/Inventory.jsx` and reads real product stock.

## Main Gaps

1. Promo notification is not yet controlled by an active promo or admin-controlled site content.
2. Buy More Save More logic is currently hardcoded in the customer UI.
3. Cart and checkout totals are not calculated by one shared backend authority.
4. Checkout has no separate final review step.
5. Orders save discount code and discount amount, but not a full promo snapshot such as promo name, promo type, applied rules, or free shipping rule.
6. Inventory is checked at checkout, but stock is not deducted after order creation.
7. Admin discount model does not yet support Buy More Save More, free shipping, bundle rules, notification text, terms, start date, or rule tiers.
8. Admin order details need clearer promo/discount display.
9. Admin order list does not yet provide inline status updates.
10. Current status labels do not exactly match the requested admin labels.

## Recommended Architecture

Use the existing backend as the source of truth.

Do not add a second cart, promo, order, or inventory system. The new work should extend these existing modules:

- `apps/api/src/discounts/discountRepository.js`
- `apps/api/src/routes/discounts.js`
- `apps/api/src/routes/orders.js`
- `apps/api/src/routes/admin.js`
- `apps/api/src/products/catalogRepository.js`
- `apps/api/src/orders/orderRepository.js`
- `apps/api/db/schema.sql`
- `apps/web/src/lib/cart.js`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/admin/Discounts.jsx`
- `apps/web/src/admin/DiscountDetail.jsx`
- `apps/web/src/admin/Orders.jsx`
- `apps/web/src/admin/OrderDetail.jsx`
- `apps/web/src/admin/Inventory.jsx`

Recommended new backend module:

- `apps/api/src/promos/promoEngine.js`

This module should become the shared calculation engine for cart, checkout, and order creation.

## Recommended Promo Model

The current `discount_codes` table should be extended instead of replaced. This keeps existing discount pages, checkout validation, and order data compatible.

Recommended new or extended fields:

- `name`
- `description`
- `method`: `automatic` or `code`
- `type`: `buy_more_save_more`, `percentage`, `fixed`, `free_shipping`, `bundle`
- `value`
- `status`: `active` or `disabled`
- `starts_at`
- `ends_at`
- `minimum_quantity`
- `minimum_subtotal_cents`
- `banner_text`
- `terms`
- `rules` as JSONB

Recommended Buy More Save More `rules` shape:

```json
[
  {
    "minimumQuantity": 2,
    "discountType": "percentage",
    "discountValue": 10,
    "freeShipping": false
  },
  {
    "minimumQuantity": 3,
    "discountType": "fixed",
    "discountValueCents": 30000,
    "freeShipping": true
  }
]
```

Exact behavior:

- Only active promos can apply.
- Expired promos must not apply.
- Future scheduled promos must not apply.
- Automatic promos apply without a code.
- Code promos apply only when the customer enters the code.
- If multiple automatic promos match, apply the best customer savings unless the admin later adds stacking controls.
- The first implementation should not stack multiple promos.
- If a promo gives free shipping, shipping fee becomes zero and the quote response must say free shipping was applied.
- The order must save the exact promo snapshot used at checkout so old orders do not change when the promo changes later.

## Recommended Promo Notification Behavior

Customer website should show a small clean notification when an active promo has `banner_text`.

Exact behavior:

- Text should come from the active promo `banner_text`.
- Fallback text can be `Buy More Save More Promo` only when the admin-created promo exists but has no custom banner text.
- Do not show the notification if there is no active eligible promo.
- Do not show expired, disabled, or future promos.
- Show as a compact top banner or bottom toast, not a blocking modal.
- On mobile, keep it one or two lines with a close button.
- If the customer closes it, hide it for the current browser session.
- The banner should link to cart or collection only if the admin promo has a configured call-to-action later.

Recommended source:

- Prefer active promo records for promo notification text.
- Keep existing site content for homepage images and logo.
- If promo notification needs to be manually editable outside promo records, extend `site-content` with a `promoNotification` object, but the visibility still needs to respect active/expired promo rules.

## Recommended Backend Quote Flow

Add a new quote endpoint:

- `POST /api/discounts/quote`

Request should include:

- Cart items
- Optional discount code
- Shipping region or delivery address context

Response should include:

- Validated items
- Subtotal
- Promo name
- Promo code if applicable
- Promo type
- Discount amount
- Free shipping applied
- Shipping fee
- Final total
- User-friendly warnings/errors

Exact behavior:

- Cart and checkout should call the quote endpoint instead of calculating promo/free shipping locally.
- Order creation should call the same promo engine internally before saving.
- Frontend totals should be treated as display values only.
- Backend totals should be authoritative.
- If price or stock changed, return a clear error and block checkout.

## Recommended Checkout Flow

Checkout should become a two-step flow:

1. Details
2. Review and place order

Details step requires:

- Full name
- Contact number
- Complete address or house/street
- Province
- City/Municipality
- Barangay
- Payment method if available
- Order notes if available

Review step shows:

- Customer full name
- Contact number
- Complete delivery address
- Ordered items
- Product names
- Sizes/variants
- Quantities
- Subtotal
- Promo name/code if applied
- Discount amount
- Shipping fee
- Final total

Exact behavior:

- Customer cannot reach Review until required fields are valid.
- Customer cannot place final order until Review is visible.
- If quote changes while moving to Review, show the updated quote.
- If stock is insufficient, block final checkout and tell the customer which item needs adjustment.
- After successful checkout, clear the cart, mark cart session converted, and show order confirmation.

## Recommended Add to Cart Flow

After every successful Add to Cart:

- Show the cart immediately.

Recommended implementation:

- Add a customer cart drawer controlled from `Shell.jsx`.
- Reuse existing `useCart()` from `apps/web/src/lib/cart.js`.
- Product pages call `addToCart()` and dispatch/open the drawer.

Fallback if a drawer is too large for the first implementation:

- Redirect to `/cart` after successful Add to Cart.

Preferred behavior:

- Product remains on page.
- Cart drawer opens.
- Drawer shows product name, image, size, quantity, price, subtotal, discount, shipping, and final total.
- Quantity update and remove item actions continue to use the existing cart helpers.
- Quote endpoint refreshes totals after quantity changes and removals.

## Recommended Order Creation and Inventory Deduction

Order creation should remain in `POST /api/orders`, but it must become inventory-safe.

Exact behavior:

- Validate customer fields.
- Validate address fields.
- Validate each product and variant.
- Validate price at time of checkout.
- Validate stock.
- Calculate totals using the shared promo engine.
- Save order with promo snapshot.
- Deduct inventory.
- Mark cart session converted.
- Increment promo usage count.
- Return order confirmation.

Postgres recommendation:

- Use a database transaction.
- Deduct variant stock with a guarded update:
  - `UPDATE product_variants SET stock_quantity = stock_quantity - qty WHERE id = variant_id AND stock_quantity >= qty`
- If any update affects zero rows, rollback and return insufficient stock.
- Do not deduct parent product stock when a variant/size exists.

File store recommendation:

- Add a repository helper that loads products, verifies all stock, applies all deductions in memory, then writes the product file once.
- If any item fails, do not write any stock changes.

Restock behavior:

- Do not automatically restock cancelled or returned orders in the first implementation.
- Add a clear manual restock action later, or leave a code TODO near the status update flow.
- Admin must intentionally restock to avoid accidental double stock returns.

## Recommended Order Snapshot

Add a permanent discount/promo snapshot to orders.

Recommended shape:

```json
{
  "promoId": "BMSM-2026",
  "code": "",
  "name": "Buy More Save More Promo",
  "type": "buy_more_save_more",
  "discountType": "fixed",
  "discountAmountCents": 30000,
  "freeShippingApplied": true,
  "rulesApplied": [
    {
      "minimumQuantity": 3,
      "discountType": "fixed",
      "discountValueCents": 30000,
      "freeShipping": true
    }
  ]
}
```

Recommended schema:

- Add `orders.discount_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb`.
- Keep existing `discount_code` and `discount_total_cents` for compatibility.

Admin order details should show:

- Original subtotal
- Promo name
- Promo code if any
- Discount type
- Discount amount
- Free shipping status
- Shipping fee
- Final total
- Customer details
- Order items
- Status history if available

## Recommended Admin Discounts and Promos Behavior

Extend the current Discounts pages instead of creating a separate Promos section.

Admin should be able to:

- Create promo
- Edit promo
- Enable promo
- Disable promo
- Delete promo

Supported promo types:

- Buy More Save More
- Percentage discount
- Fixed amount discount
- Free shipping
- Bundle discount

Fields:

- Promo name
- Promo description
- Method: automatic or code
- Promo code when method is code
- Promo type
- Discount value
- Minimum quantity
- Minimum order amount
- Start date
- End date
- Active/Inactive status
- Promo banner/notification text
- Terms or notes
- Buy More Save More tier rules

Exact behavior:

- Save all admin promo changes to backend persistence.
- Admin list should display promo name, code/method, type, status, usage count, start/end date, and created date.
- Delete should not change old orders because orders store promo snapshots.
- Disable should immediately stop customer application and notification display.

## Recommended Admin Orders Behavior

Keep existing `Orders.jsx` and `OrderDetail.jsx`.

Order statuses requested by admin UI:

- Pending
- Packing
- Shipped
- Delivered
- Cancelled
- Returned

Recommended mapping to current backend values:

- Pending -> `received`
- Packing -> `packed`
- Shipped -> `shipped`
- Delivered -> `delivered`
- Cancelled -> `cancelled`
- Returned -> use `deliveryStatus = returned` for now

Recommendation:

- Keep the backend enum stable first.
- Show friendly labels in the UI.
- If main `status = returned` is required later, add it as a deliberate migration.

Exact behavior:

- Admin can change status from order detail.
- Add inline status dropdown on the order list.
- Status change must save through `PATCH /api/admin/orders/:orderNumber`.
- Admin order detail must show the promo snapshot and exact saved totals.
- Customer and admin must read the same order data source.

## Recommended Error Handling

Customer side should show friendly messages for:

- Failed add to cart
- Failed cart quote
- Failed checkout
- Missing required customer fields
- Invalid contact number
- Missing address fields
- Insufficient stock
- Price changed since item was added to cart
- Promo expired or disabled
- Failed order creation

Admin side should show friendly messages for:

- Failed promo save
- Failed promo delete
- Invalid promo rule
- Failed status update
- Failed order item edit
- Failed inventory update

Backend should return stable error messages with proper HTTP status codes:

- `400` for invalid input
- `404` for missing product/order/promo
- `409` for stock or price conflicts
- `500` for unexpected server errors

## Recommended Implementation Phases

### Phase 1: Backend Promo Engine and Quote API

Status: Finished. Backend promo model, quote engine, quote API, order promo snapshot persistence, and schema additions are implemented. Syntax checks, direct promo engine verification, API smoke verification, and `node --test apps/api/test/adminCustomersDiscounts.test.js` passed.

Files likely changed:

- `apps/api/src/discounts/discountRepository.js`
- `apps/api/src/routes/discounts.js`
- `apps/api/src/routes/orders.js`
- `apps/api/db/schema.sql`

New file likely created:

- `apps/api/src/promos/promoEngine.js`

Deliverables:

- Extend discount/promo model.
- Add quote endpoint.
- Use the quote engine in order creation.
- Keep old discount validation compatible.

### Phase 2: Checkout Review and Customer Cart Totals

Files likely changed:

- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/lib/api.js`

Deliverables:

- Cart uses backend quote totals.
- Checkout adds Details and Review steps.
- Final order submit uses backend-calculated totals.

### Phase 3: Add to Cart Drawer

Files likely changed:

- `apps/web/src/components/Shell.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/lib/cart.js`

Deliverables:

- Add to Cart opens the cart immediately.
- Drawer supports quantity update and remove.
- Drawer displays promo/discount/shipping/final total.

### Phase 4: Inventory Deduction

Files likely changed:

- `apps/api/src/products/catalogRepository.js`
- `apps/api/src/routes/orders.js`
- `apps/api/db/schema.sql` if inventory audit is added

New file optional:

- `apps/api/src/inventory/inventoryRepository.js`

Deliverables:

- Atomic stock deduction after order creation.
- Correct variant/size deduction.
- Insufficient stock blocks checkout.
- Admin inventory reflects updated stock.

### Phase 5: Admin Promos and Admin Order Promo Display

Files likely changed:

- `apps/web/src/admin/Discounts.jsx`
- `apps/web/src/admin/DiscountDetail.jsx`
- `apps/web/src/admin/Orders.jsx`
- `apps/web/src/admin/OrderDetail.jsx`
- `apps/api/src/routes/admin.js`

Deliverables:

- Promo CRUD supports all required promo fields.
- Buy More Save More rules can be edited.
- Admin order list supports inline status changes.
- Admin order detail shows promo snapshot.

### Phase 6: Promo Notification

Files likely changed:

- `apps/web/src/components/Shell.jsx`
- `apps/web/src/lib/api.js`
- `apps/api/src/routes/discounts.js` or `apps/api/src/routes/siteContent.js`

Deliverables:

- Active promo notification appears on customer website.
- Inactive, expired, and future promos do not show.
- Notification can be closed for the current browser session.

## Expected API Changes

Add:

- `POST /api/discounts/quote`
- `GET /api/discounts/active-notification` or include notification in quote/site-content response

Update:

- `POST /api/orders`
- `GET /api/admin/discounts`
- `POST /api/admin/discounts`
- `PATCH /api/admin/discounts/:code`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:orderNumber`
- `PATCH /api/admin/orders/:orderNumber`

Keep:

- `POST /api/discounts/validate` for compatibility, even if checkout moves to quote.

## Expected Database Changes

Recommended:

- Extend `discount_codes` for promo metadata and rules.
- Add `orders.discount_snapshot jsonb`.

Optional later:

- Add `order_status_events` for full status history.
- Add `inventory_movements` for stock audit trail.

No Dockerfile or docker-compose changes are expected.

## Full Flow Testing Instructions After Implementation

1. Open the customer website.
2. Confirm the active promo notification shows `Buy More Save More Promo` or the admin banner text.
3. Disable the promo in admin and confirm the notification disappears.
4. Re-enable the promo and confirm the notification returns.
5. Open a product page.
6. Add one item to cart.
7. Confirm the cart opens immediately.
8. Confirm cart shows product name, image, size, quantity, price, subtotal, shipping, and final total.
9. Increase quantity to meet the Buy More Save More rule.
10. Confirm discount/free shipping applies in the cart.
11. Remove an item and confirm totals recalculate.
12. Proceed to checkout.
13. Try to continue with missing required fields and confirm validation blocks progress.
14. Fill full name, contact number, house/street, province, city/municipality, barangay, and payment method if shown.
15. Continue to Review.
16. Confirm review shows customer details, address, items, subtotal, promo, discount, shipping, and final total.
17. Place the final order.
18. Confirm the success page or order confirmation appears.
19. Open admin Orders.
20. Confirm the new order appears.
21. Open admin Order Detail.
22. Confirm customer details, address, items, promo snapshot, discount amount, shipping, final total, and status are visible.
23. Change status to Packing and confirm it saves.
24. Change status to Shipped and confirm it saves.
25. Change status to Delivered and confirm it saves.
26. Change status to Cancelled or Returned and confirm it saves according to the chosen status mapping.
27. Open admin Inventory.
28. Confirm the purchased variant/size stock decreased by the ordered quantity.
29. Create a new promo in admin Discounts.
30. Enable the promo and confirm customer cart/checkout can apply it.
31. Disable the promo and confirm customer cart/checkout no longer applies it.
32. Set an expired end date and confirm customer website does not show or apply it.

## Docker Note

No Docker rebuild is needed for this document.

After the actual implementation, Docker may need a rebuild because frontend and backend source files will change. Use:

```sh
docker compose up --build -d
```

If only database schema changes are added and the running API already mounts source code, also run the project's existing database migration command after confirming the current Docker database name and environment.

## Recommendation Summary

Build the promo and discount work around one backend quote engine, then use that same engine in cart, checkout, and order creation. Extend the existing discount system instead of creating a separate promo system. Store exact promo snapshots on orders, deduct inventory in the backend after successful checkout, and keep admin order/status changes tied to the existing order APIs.
