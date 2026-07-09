# Deployment Readiness Audit - 2026-07-09

## Summary

Maria Clara Clothing is close to deployable for live customers. The storefront checkout, admin dashboard, persisted settings, and Pancake POS sync code paths are implemented and covered by automated tests.

This audit added the missing admin-editable homepage hero text feature. The Website Content admin page now controls the homepage hero copy and CTA links through persisted store settings, and the customer homepage reads those values from `/api/storefront-settings`.

## Changes Completed

- Added persisted `website.hero` settings:
  - small banner text
  - main title
  - highlighted text
  - subtitle
  - primary button text/link
  - secondary button text/link
- Exposed hero settings through the public storefront settings endpoint.
- Added `HeroTextEditor` to Admin > Website content.
- Updated the homepage to render hero copy and buttons from settings instead of hard-coded text.
- Updated e2e checks to match the current intended behavior:
  - checkout blocks empty carts
  - page transition duration is 420ms
  - mobile offer prompt appears immediately

## Verified Areas

- Customer storefront:
  - homepage banner loads and uses responsive image-ratio sizing
  - product listing/product cards render
  - product page add-to-cart flow works
  - cart drawer checkout path works
  - checkout V2 submits server-backed quote orders
  - thank-you page shows real order details
  - mobile menu and cart drawer accessibility pass
  - mobile offer prompt is visible and inside viewport

- Admin:
  - mobile admin login works with local `admin` password
  - dashboard, orders, products, customers, discounts, website content, settings, and Pancake pages fit a 390px viewport
  - Website Content page loads the new hero editor
  - hero text saved in admin appears on the customer homepage

- Pancake POS:
  - auto-sync worker starts when mode/API key config allow it
  - catalog import, inventory reconciliation, order shadow build, and live order export paths are covered by API tests
  - local Docker logs showed Pancake auto-sync completing with the current local environment

## Production Requirements Before Going Live

- Use PostgreSQL in production. Do not use JSON file persistence overrides.
- Set strong production secrets:
  - `ADMIN_PASSWORD`
  - `ADMIN_TOKEN`
  - `CUSTOMER_AUTH_SECRET`
  - `ORDER_CONFIRMATION_SECRET`
  - `POSTGRES_PASSWORD`
- Configure Pancake POS env values for live sync:
  - `PANCAKE_MODE=live`
  - `PANCAKE_API_KEY`
  - `PANCAKE_SHOP_ID`
  - `PANCAKE_WAREHOUSE_ID`
  - `PANCAKE_ORDER_SOURCE_ID`
  - `PANCAKE_AUTO_SYNC_ENABLED=true`
- Keep `PANCAKE_API_BASE_URL=https://pos.pages.fm/api/v1` in production.
- Run database migrations before first production start.
- Put the app behind HTTPS with a real domain before public launch.

## Verification Commands

Run before deployment:

```bash
npm test -w apps/api
node --test apps/web/test/*.test.js
npm run build:web
npx playwright test -c apps/web/playwright.config.js
docker compose ps
curl -I http://localhost:8081
git diff --check
```

## Current Recommendation

The codebase is deploy-ready after production secrets, database, domain/HTTPS, and Pancake live credentials are configured on the server. Do not launch publicly with local defaults or a local Docker `.env`.
