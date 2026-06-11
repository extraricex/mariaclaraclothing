# Admin Login Page

## Route
- `/admin-login.html`

## Source Files
- `public/admin-login.html`
- `public/js/admin.js`
- `public/styles.css`

## Purpose
The admin login page protects the Maria Clara admin dashboard. It uses a minimal Shopify Accounts-inspired layout without social login buttons.

## Main Sections
- Centered Maria Clara logo.
- Heading: `Log in to Maria Clara`.
- Password input.
- Continue button.
- Authorized staff note.
- Status message for login errors.

## Data and Behavior
- Login form uses `data-admin-login-form`.
- Password is submitted to `POST /api/admin/login`.
- Successful login stores the admin token in local storage.
- The user is redirected to `/admin.html` after login.

## Notes
- No social login providers are shown.
- Existing admin authentication hooks are preserved.
