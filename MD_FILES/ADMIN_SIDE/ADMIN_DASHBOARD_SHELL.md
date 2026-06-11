# Admin Dashboard Shell

## Route
- `/admin.html`

## Source Files
- `public/admin.html`
- `public/js/admin.js`
- `public/styles.css`

## Purpose
The admin dashboard shell provides protected navigation, global search, profile controls, logout, and page switching for all admin modules.

## Main Layout
- Left sidebar navigation.
- Dark top bar.
- Global admin search input.
- Notification button.
- Store profile button.
- Logout button.
- Main workspace with page sections.

## Sidebar Pages
- Dashboard
- Orders
- Products
- Customers
- Discounts
- Website Content
- Shipping Settings
- Settings

## Data and Behavior
- Admin session is checked through `/api/admin/session`.
- Unauthenticated users are redirected to `/admin-login.html`.
- Sidebar links toggle sections using `data-admin-page`.
- Logout removes the admin token and returns to login.

## Notes
- The dashboard is intentionally simplified to only the pages needed by this website.
