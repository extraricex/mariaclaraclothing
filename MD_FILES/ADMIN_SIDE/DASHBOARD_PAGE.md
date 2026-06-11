# Dashboard Page

## Route
- `/admin.html#dashboard`

## Source Files
- `public/admin.html`
- `public/js/admin.js`
- `public/styles.css`

## Purpose
The Dashboard page is the admin overview area for store status, COD activity, unfulfilled orders, and low-stock alerts.

## Current UI
- Page heading: `Dashboard`.
- Placeholder description for store overview, pending COD, unfulfilled orders, and low-stock alerts.

## Recommended Dashboard Direction
The dashboard should work as an operations summary page. Its purpose is to tell staff what needs attention today without requiring them to open every admin module.

## Recommended Sections

### Top Summary Cards
- Total orders today.
- Pending COD confirmation.
- Unfulfilled orders.
- Total sales today.
- Total shipping fee from all placed orders, even if payment is not collected yet.
- Low-stock products.
- Sold-out products.

### Order Status Summary
- Received.
- Confirmed.
- Packed.
- Shipped.
- Delivered.
- Cancelled.

Each status summary should be clickable and should open the Orders page with the matching filter where possible.

### Sales Overview
- Today's sales.
- Last 7 days sales.
- Average order value.
- Total items sold.
- Shipping fee total from all placed orders.
- Free shipping orders.

### Dashboard Graphs
Use visual graphs to make the dashboard easier to understand at a glance:
- Sales trend graph for the last 7 days.
- Order status graph for pending COD, unfulfilled, packed, shipped, delivered, and cancelled orders.
- Inventory health graph for healthy, low-stock, sold-out, and draft/archived products.
- Shipping mix graph for free shipping, Metro Manila/Cavite, Luzon province, Visayas/Mindanao, and other shipping fees.

The first version should use lightweight CSS/HTML charts instead of adding a chart library. This keeps the dashboard fast, responsive, and easier to maintain while the admin analytics are still simple.

### Products Needing Attention
- Low-stock products.
- Sold-out products.
- Draft products.
- Products missing images.
- Products missing variants.
- Products without SEO details.

### Recent Orders
Show the latest 5 to 10 orders with:
- Order number.
- Customer name.
- Total.
- Payment status.
- Fulfillment status.
- Delivery area.
- View action.

### Customer Summary
- Total customers.
- New customers today.
- Repeat customers.
- Customers with pending orders.

### Shipping Summary
- Metro Manila and Cavite orders.
- Luzon orders.
- Visayas/Mindanao orders.
- Orders with free shipping.
- Orders needing delivery confirmation.

### Quick Actions
- Add product.
- View orders.
- Export orders.
- Manage products.
- Update shipping settings.

## First Version Scope
Build these first because they provide the most immediate admin value:
- Top summary cards.
- Sales overview.
- Dashboard graphs.
- Recent orders.
- Products needing attention.
- Quick actions.

## Data Needed
- Orders from `/api/admin/orders`.
- Products from `/api/admin/products`.
- Existing admin token from local storage.
- Existing order and product status fields.

## First Version Behavior
- Dashboard loads after admin authentication.
- Dashboard fetches orders and products using the existing admin API.
- Summary values are calculated in `public/js/admin.js`.
- Graph values are calculated in `public/js/admin.js` from the same order and product API responses.
- Graphs should be responsive and stack cleanly on mobile screens.
- Quick actions navigate to the correct admin page/section.
- Recent order rows open the existing order detail view.
- Product attention rows open the existing product editor.

## Dashboard Change Log
- Added visual dashboard graphs for sales trend, order status, inventory health, and shipping mix.
- Added a top summary card for `Total shipping fee`.
- Shipping fee total means all shipping fees from placed orders, even when payment has not been collected yet.
- Fixed the admin order list API summary to include `shippingFeeCents`, because the dashboard reads the order list response while the order detail page reads the full order response.

## Notes
- This page exists as a section inside `admin.html`.
- It should become the first useful admin home page before adding deeper charts and analytics.
