# Maria Clara Website Functional Roadmap

Date: 2026-06-03

This document recommends the next work needed to make the Maria Clara website fully functional as a real ecommerce operation. The current website already has a strong customer-facing flow: product browsing, product carousel, cart editing, checkout address dropdowns, automatic shipping fees, COD checkout, and thank-you confirmation. The next priority is production functionality: persistent data, admin tools, order management, customer communication, deployment, and monitoring.

## Recommended Direction

Build the website into a real store in phases, starting with the parts that protect daily operations:

1. Persist orders and inventory.
2. Add admin login and order management.
3. Add product and stock management.
4. Add real customer notifications.
5. Add discounts, analytics, and marketing controls.
6. Prepare deployment, backups, security, and launch checks.

This is better than immediately building a large admin system all at once. Orders, inventory, and customer confirmation are the highest-risk parts of a live COD store, so they should come first.

## Phase 1: Real Order Persistence

### Current State

Checkout can create demo orders and the thank-you page can fetch the order number during the current server session. This is good for testing, but not enough for real customers because demo orders are not stored permanently.

### Recommendation

Add a database-backed order system.

Minimum order fields:

- order number
- customer name
- mobile number
- email, optional
- full delivery address
- province, city, barangay
- shipping region
- shipping fee
- subtotal
- discount total
- total
- payment method
- payment status
- fulfillment status
- COD confirmation status
- ordered items snapshot
- internal notes
- timestamps

Recommended order statuses:

- received
- confirmed
- packed
- shipped
- delivered
- cancelled

### Acceptance Criteria

- Orders remain available after server restart.
- Thank-you links work from another browser using the order number.
- Admin can view every order.
- Order item prices and sizes are stored as a snapshot so later product edits do not change old orders.

## Phase 2: Admin Login And Order Dashboard

### Current State

The project already has admin roadmap documents and admin-ready order payload fields, but no working admin interface yet.

### Recommendation

Create a private admin area first focused only on orders.

Minimum admin features:

- secure admin login
- order list
- order detail page
- status update controls
- COD confirmation update
- cancellation reason
- fulfillment notes
- customer mobile number copy/open action
- filter by status
- search by order number, customer name, or phone

### Acceptance Criteria

- Only authenticated admin users can access admin pages.
- Admin can mark an order as confirmed, packed, shipped, delivered, or cancelled.
- Admin changes are saved permanently.
- Customer-facing pages cannot access admin APIs.

## Phase 3: Product, Variant, And Inventory Management

### Current State

Products are currently managed through project data files. This is workable during development but not practical for daily stock changes.

### Recommendation

Build product admin after order admin.

Minimum product features:

- create product
- edit product name, slug, description, collection, price, compare-at price
- upload or select product images
- reorder product images
- manage variants by size
- edit stock quantity per size
- set product status: active, draft, sold out
- show low-stock warning

Inventory rules:

- Checkout must reject sold-out variants.
- Cart and checkout should re-check stock before placing order.
- Placing an order should reserve or reduce stock depending on the chosen operational workflow.

Recommended workflow:

- When order is placed: reserve stock.
- When order is cancelled: return reserved stock.
- When order is delivered: convert reserved stock to sold stock.

### Acceptance Criteria

- Admin can update stock without editing code.
- Product pages reflect updated stock.
- Low-stock and sold-out labels update automatically.
- Checkout cannot oversell a selected size.

## Phase 4: Customer Notifications

### Current State

The website tells customers that they will be texted, but no automatic message is sent.

### Recommendation

Add notification support for the COD workflow.

Recommended first channel:

- SMS if the business will confirm by mobile number.
- Messenger integration if most customers communicate through Facebook.
- Email can be secondary because COD confirmation depends on phone.

Minimum notification events:

- order received
- COD confirmation request
- order confirmed
- order shipped
- order cancelled

### Acceptance Criteria

- Customer receives an order confirmation message after checkout.
- Admin can see whether a message was sent.
- Failed messages are logged.
- Admin can resend a confirmation message.

## Phase 5: Discounts And Promotions

### Current State

The inactive discount code UI was removed from checkout to avoid customer confusion.

### Recommendation

Add discounts only when the rules are ready to work end to end.

Minimum discount features:

- promo code
- fixed amount discount
- percentage discount
- free shipping discount
- start and end dates
- active/inactive status
- usage limit
- minimum order quantity or amount

### Acceptance Criteria

- Checkout validates discount codes.
- Invalid codes show a clear message.
- Valid discounts update subtotal, shipping, and total.
- Discount details are saved with the order.
- Admin can see which discount was used.

## Phase 6: Customer Accounts Or Guest-Only Decision

### Recommendation

Stay guest-only for the first live version. COD ecommerce can work well without customer accounts, and accounts add complexity.

Add customer records behind the scenes instead:

- name
- mobile number
- email
- addresses
- order history
- notes

Add customer login later only if customers need repeat-order history, loyalty rewards, or saved addresses.

### Acceptance Criteria

- Repeat customers can be recognized by phone number in admin.
- Admin can view customer order history.
- Customers can still place orders without creating an account.

## Phase 7: Analytics And Store Reporting

### Current State

The storefront now has lightweight funnel tracking hooks.

### Recommendation

Connect analytics to real reporting.

Track these events:

- product view
- size selected
- add to cart
- cart checkout click
- checkout address completed
- order placed
- order cancelled
- order delivered

Admin reports to add:

- total orders
- total revenue
- pending COD confirmations
- best-selling products
- best-selling sizes
- low-stock products
- abandoned checkout signals

### Acceptance Criteria

- Owner can see daily orders and revenue.
- Owner can identify which sizes need restocking.
- Owner can see where customers drop off before ordering.

## Phase 8: Marketing Content Management

### Current State

Homepage campaign content and images are in static files.

### Recommendation

Add marketing controls after core operations are stable.

Minimum marketing features:

- announcement bar text
- homepage carousel images
- featured collections
- campaign sections
- homepage video/poster
- SEO title and description per page

### Acceptance Criteria

- Admin can update homepage content without editing HTML.
- Admin can publish or hide campaigns.
- Storefront remains fast and responsive after content changes.

## Phase 9: Shipping And Fulfillment Operations

### Current State

Shipping fee calculation works by location:

- Metro Manila and Cavite: PHP 80
- Luzon provinces except Metro Manila and Cavite: PHP 120
- Visayas and Mindanao: PHP 180
- free shipping for 2 or more items

### Recommendation

Move shipping rules into store settings so rates can change without code edits.

Admin shipping settings:

- Metro Manila and Cavite fee
- Luzon fee
- Visayas and Mindanao fee
- free shipping rule
- delivery estimate per region
- courier notes

### Acceptance Criteria

- Admin can update shipping fees.
- Checkout uses the latest active shipping rules.
- Old orders keep the shipping fee that was charged at checkout.

## Phase 10: Security, Deployment, And Backups

### Recommendation

Before public launch, prepare production basics.

Required:

- production database
- HTTPS domain
- secure environment variables
- admin password hashing
- admin session security
- rate limiting for checkout and login
- input validation
- order data backup
- image storage backup
- error logging
- uptime monitoring

Recommended deployment flow:

- staging environment for testing
- production environment for customers
- automated tests before deploy
- manual checkout test after deploy

### Acceptance Criteria

- Admin credentials are not stored in code.
- Customer orders are backed up.
- Server errors are logged.
- Website can recover from restart without losing orders.

## Recommended Build Order

### Sprint 1: Real Orders

Build database persistence for orders, keep thank-you page backed by order number, and preserve order snapshots.

Why first: without this, live orders can be lost.

### Sprint 2: Admin Orders

Build admin login, order list, order detail, and order status updates.

Why second: the business needs a reliable way to process COD orders.

### Sprint 3: Inventory

Build product and variant stock management, then connect stock to checkout.

Why third: stock accuracy prevents overselling and wrong-size orders.

### Sprint 4: Notifications

Add SMS, Messenger, or email notifications for order confirmation and status changes.

Why fourth: COD depends on customer confirmation.

### Sprint 5: Discounts And Settings

Add real discount behavior and editable shipping/store settings.

Why fifth: discounts and settings are useful, but less critical than orders and inventory.

### Sprint 6: Analytics And Marketing Admin

Add reporting and homepage content management.

Why sixth: these improve growth after operations are stable.

## What Not To Build First

Avoid building these before real orders and admin order handling:

- customer login
- loyalty points
- complex promo campaigns
- advanced product filters
- full CMS
- multiple payment gateways
- large dashboard charts

These are useful later, but they do not matter if the store cannot reliably receive, confirm, fulfill, and track orders.

## Immediate Next Recommendation

Start with `Sprint 1: Real Orders`.

The current best next technical task is:

1. Choose the production database.
2. Create permanent order storage.
3. Store every checkout order.
4. Fetch thank-you confirmations from stored orders.
5. Add tests proving orders survive beyond in-memory demo storage.

After that, build the admin order dashboard.

## Success Definition

The website should be considered functionally ready when:

- customers can place real orders
- orders are permanently saved
- admin can manage orders
- inventory cannot oversell
- COD confirmation is operational
- shipping fees and totals are accurate
- customers receive confirmation
- owner can see order and stock reports
- production deployment is secure and backed up

