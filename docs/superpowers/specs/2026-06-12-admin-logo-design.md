# Admin Logo Design

## Decision

Use the existing website logo as the admin logo. The admin sidebar and login screen should load `/api/site-content`, read `siteContent.logo`, and render that image when a logo URL is available.

## Scope

- Update the React admin shell at `/admin` so the sidebar brand uses the uploaded logo.
- Update the admin login page so it uses the same uploaded logo.
- Preserve the existing `MariaClara` text wordmark as a fallback if the logo is not available.
- Keep the existing Website content logo uploader as the only place for changing the logo.

## Behavior

The admin layout already checks the admin session before rendering. After session readiness, it should fetch public site content and show the logo in the sidebar. The login page can fetch the same public site content without an admin token.

If the fetch fails or `siteContent.logo.url` is missing, the admin UI should still work and show the current text wordmark. The change should not alter admin authentication, navigation, or homepage banner management.

## Testing

Add lightweight source tests for the web admin components to assert that `AdminLayout` and `Login` fetch `/api/site-content`, render a logo image from `siteContent.logo`, and retain the text fallback.
