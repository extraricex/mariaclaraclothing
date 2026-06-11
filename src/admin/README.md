# Admin

Admin order management is now available as the first operational admin slice.

Current admin entry points:

- Page: `/admin.html`
- Login API: `POST /api/admin/login`
- Order list API: `GET /api/admin/orders`
- Order detail API: `GET /api/admin/orders/:orderNumber`
- Order update API: `PATCH /api/admin/orders/:orderNumber`

Authentication:

- The admin password is read from `ADMIN_PASSWORD`.
- The local fallback password is `admin`.
- Successful login returns a bearer token.
- The local fallback token is `local-admin-token`.

Current admin capabilities:

- list orders
- search by order number, customer name, phone, or address
- filter by order status
- view order details
- update order status
- update fulfillment status
- update payment status
- update COD confirmation status
- save internal notes

Current simplified navigation:

- Dashboard
- Orders
- Products
- Customers
- Discounts
- Website Content
- Shipping Settings
- Settings

Removed for now:

- Drafts
- Abandoned Checkouts
- Marketing
- Markets
- Analytics
- Online Store
- Point of Sale
- Facebook & Instagram
- TikTok
- Apps

The removed sections can return later when those workflows are implemented.

Future admin work should add roles, password hashing, activity logs, and separate admin user records before production launch.
