# Orders Page

## Route
- `/admin.html#orders`

## Source Files
- `public/admin.html`
- `public/js/admin.js`
- `src/routes/admin.js`
- `src/orders/orderRepository.js`
- `public/styles.css`

## Purpose
The Orders page lets staff review COD orders, confirmation status, fulfillment progress, delivery information, and internal notes.

## Main Sections
- Page heading with order count.
- Export button.
- View store link.
- Summary cards.
- Filter tabs:
  - All
  - Today
  - Pending
  - Unfulfilled
  - Paid
  - Cancelled
- Search and status filter toolbar.
- Orders table/list.
- Order detail editor.

## Data and Behavior
- Orders are loaded from `/api/admin/orders`.
- Order details are loaded from `/api/admin/orders/:orderNumber`.
- Order updates use `PATCH /api/admin/orders/:orderNumber`.
- Requires Bearer admin token.

## Editable Fields
- Payment status.
- Fulfillment status.
- Delivery status.
- Delivery method.
- Tracking number.
- Notes and tags.

## Notes
- Orders are created by the customer checkout page through `POST /api/orders`.
