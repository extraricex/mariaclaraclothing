# Admin System Roadmap

This roadmap prepares Maria Clara Clothing for a future admin website while keeping the current customer storefront frontend-first.

## Goal

Build an admin system that can manage store operations from one dashboard without forcing a redesign of the customer-facing website.

## Admin Modules

### Products

Manage product details, product images, collections, featured status, pricing, size variants, SKUs, and inventory.

Current foundation:

- editable product records live in `data/products.json`
- product loading and validation live in `src/products/catalogRepository.js`
- storefront API remains `GET /api/products` and `GET /api/products/:slug`

### Orders

Manage incoming orders, customer checkout details, COD confirmation, fulfillment status, cancellation notes, and order history.

Cart and checkout admin alignment:

- storefront cart items keep product id, variant id, SKU, size, image, unit price, and quantity for future order review
- checkout payloads identify `checkoutChannel` as `storefront_cart`
- order totals are grouped in `adminEditableTotals` so future admins can review discounts, shipping, subtotal, and total without changing storefront code
- future order management can update fulfillment status, payment status, notes, cancellation, and COD confirmation from the same order record

Future order statuses:

- received
- confirmed
- packed
- shipped
- delivered
- cancelled

### Customers

Manage customer profiles, contact details, delivery addresses, customer notes, and order history.

Customers should be created automatically from checkout orders and later editable from the admin.

### Discounts

Manage promo codes, automatic discounts, bundle rules, free shipping rules, start/end dates, and usage limits.

Discounts should calculate through a dedicated service before order creation.

### Analytics

Track revenue, order count, best-selling products, stock movement, conversion signals, and campaign performance.

Analytics should read from orders, products, discounts, and marketing events rather than becoming a separate source of truth.

### Marketing

Manage homepage banners, carousel images, announcements, featured collections, campaign sections, and promotional copy.

Marketing content should be editable without changing HTML files.

### Settings

Manage store contact information, shipping fee rules, payment methods, policy links, announcement text, and default SEO metadata.

### Admin Users

Manage admin login, roles, permissions, and activity logs.

Suggested roles:

- owner
- manager
- fulfillment
- marketing

## Data Strategy

Current phase:

- JSON files act as editable contracts.
- The storefront reads through repository and presenter layers.
- No customer-facing API changes are required.

Future phase:

- replace JSON repositories with database-backed repositories
- add image upload storage
- add authenticated admin APIs
- keep customer storefront responses stable

## Implementation Order

1. Finish customer-facing frontend pages.
2. Add admin authentication and roles.
3. Build product editor and image manager.
4. Persist orders from checkout.
5. Build order management.
6. Add customers and customer history.
7. Add discounts.
8. Add marketing content editor.
9. Add analytics dashboard.
10. Move JSON-backed contracts to database tables and file storage.
