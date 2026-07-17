# Deployment Readiness Report

Updated: 2026-07-16

## Status

**Not ready for unrestricted production launch. Code status: launch candidate.**

The repository passes its available automated tests, build, dependency audit, local production-like runtime, responsive, accessibility, security, SEO, checkout, payment-state, inventory, Meta, Pancake, reviews, email, and admin gates. Production deployment was not performed during this audit.

Release remains blocked by the manual acceptance gates below. These require real provider/account activity, owner-confirmed business facts, or physical devices and cannot be safely simulated or guessed.

## Release-Blocking Gates

1. Complete one successful live PayMongo order on the current release and verify the exact charged PHP amount, signed paid webhook, paid order status, Thank You data, admin notification, Pancake export, and Meta Purchase.
2. In Meta Test Events, complete one COD and one PayMongo order. Confirm browser `eventID` and server `event_id` are identical, deduplicated, and do not reappear after Thank You refresh/reopen or webhook replay.
3. Approve one accurate shipping-promise set and align conflicting product/global copy.
4. Resolve MARIACLARA ROCKSTAR’s gray/red copy conflict. This was recommendation number 3 in the earlier audit and was intentionally skipped as instructed; no product fact was invented.
5. Test checkout, PayMongo browser/app handoff, return URL, keyboard, autofill, and Thank You on a physical Android phone and iPhone.
6. Manually correct/contact customers for the 26 historical orders flagged with incomplete delivery information before fulfillment.

## Code and Behavior Ready

- Server-authoritative catalog, price, discount, shipping, and final order total.
- Strict frontend/review/backend delivery validation; optional email/ZIP; Delivery Notes removed for new orders.
- Transactional order creation, inventory deduction, stock movements, and idempotent duplicate-submit protection.
- COD dispatch only after committed order creation.
- PayMongo pending reservations, signed webhooks, exact PHP amount verification, paid-only fulfillment effects, expiry/cancel recovery, and duplicate-webhook protection.
- Permanent per-order Meta Purchase ID with same browser/server ID and database-backed claims/outbox.
- Post-commit, idempotent admin order email plus admin-only resend/status handling.
- Pancake mapping, inventory reconciliation, order export/import, polling, retries, diagnostics, and incomplete-address blocking.
- Private Thank You confirmation tokens and customer-safe order snapshots.
- Database-backed review moderation, safe images/XLSX import, verified-purchase matching, and published-only statistics.
- Responsive image derivatives/srcsets, lazy route/review loading, stable initial layout, first-party funnel/Web Vitals dashboard.
- Initial crawlable metadata/schema, canonical aliases, sitemap, robots, Merchant feed, noindex private pages, and admin SEO fields.
- Enforced CSP/security headers, production secret checks, secure cookie/CSRF sessions, private uploads/tokens, sanitized logs and customer errors.

## Verification Results

| Gate | Result |
| --- | --- |
| API/source tests | 484 passed, 0 failed, 2 skipped only because optional `TEST_POSTGRES_URL` was absent |
| Web source tests | 218 passed, 0 failed |
| Playwright E2E | 47 passed, 0 failed, 1 intentionally skipped because `TEST_COLLECTION_NAME` mutation fixture was absent |
| Web production build | Passed |
| npm audit, all dependencies | 0 vulnerabilities |
| npm audit, production dependencies | 0 vulnerabilities |
| Local production-like Docker/API health | Passed |
| Database migrations/startup | Passed |
| Responsive matrix | Passed at 320, 360, 390, 430px, tablet, laptop, and desktop |
| Final Home Lighthouse | Performance 66, Accessibility 100, Best Practices 100, SEO 100; LCP 6.1s, CLS 0, TBT 100ms |
| Final Shop Lighthouse | Performance 68, Accessibility 100, Best Practices 100, SEO 100; LCP 6.0s, CLS 0, TBT 20ms |
| Final Product Lighthouse | Performance 62, Accessibility 100, Best Practices 100, SEO 100; LCP 6.7s, CLS 0, TBT 180ms |

No lint or type-check scripts exist in the monorepo. Production build plus source/API/E2E tests are the available syntax/static/runtime gates.

## Performance Assessment

Layout stability, accessibility, and total transfer size improved substantially, but throttled local LCP is still above Google’s 2.5-second good threshold. The Web Vitals collection/dashboard now supports production measurement. Do not declare performance complete until enough real-user data exists at the 75th percentile by page/device/network.

## SEO Launch Checklist

- Verify the canonical domain in Google Search Console and Bing Webmaster Tools.
- Submit `https://mariaclaraclothing.com/sitemap.xml`.
- Confirm `/robots.txt` advertises the sitemap after deployment/edge configuration.
- Validate Home, a collection, and representative in-stock/sold-out products in Google Rich Results Test.
- Create/verify Google Merchant Center and schedule a fetch of `https://mariaclaraclothing.com/merchant-feed.xml`.
- Confirm Merchant diagnostics agree with visible price, currency, image, URL, and availability.
- Monitor indexing, canonical/redirect issues, schema enhancements, search queries, Core Web Vitals, and crawl errors.
- Publish only accurate, useful collection/product/size/fabric/care/shipping content; no keyword stuffing, copied content, fake reviews, or unsupported claims.

## Production Environment Requirements

Use the safe placeholders in `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`, and `deploy/production.env.example`; never commit the real environment file.

Required core configuration includes:

- `APP_ENV=production`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `TRUST_PROXY`, `CHECKOUT_V2_REQUIRED=true`.
- Unique strong `ADMIN_TOKEN`, `ADMIN_PASSWORD`, `CUSTOMER_AUTH_SECRET`, and `ORDER_CONFIRMATION_SECRET`.
- `FRONTEND_URL=https://mariaclaraclothing.com` so canonical tags, sitemap, robots, Merchant feed, confirmation links, and provider returns use the public origin.
- PayMongo: `PAYMONGO_ENABLED`, public/secret/webhook keys, success/cancel URLs, and only account-enabled payment methods.
- Meta: Pixel ID, CAPI enabled/access token/API version, optional Test Event code during acceptance, and the approved consent setting in Admin.
- Email: `ORDER_NOTIFICATION_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Pancake: start disabled/read-only, then configure official base URL, key, shop, warehouse, order source, mappings, polling/retry settings, and promote only after staged acceptance.
- J&T: keep `JNT_INTEGRATION_MODE=dry_run` until official Philippine production credentials/specification are supplied.

## Operations Required Before Launch

- Back up PostgreSQL and both public/private upload volumes; perform and record a restore drill.
- Verify migrations on a fresh/staging database and take a pre-release production backup.
- Configure HTTPS/DNS/reverse-proxy trust, uptime checks, error alerting, log retention, disk/database monitoring, and queue/worker alerts.
- Verify SMTP delivery without exposing credentials in logs/build/API responses.
- Confirm official social, contact, Messenger, privacy, FAQ, legal, shipping, and payment content in Admin.
- Confirm every production product/SKU/variant/image/stock/price/size chart and Pancake mapping.
- Keep an immediate rollback image/config/database plan and release gradually.

## First 24–72 Hours Monitoring

- Orders created versus successful Thank You confirmations.
- COD/PayMongo selection, redirect, failure/cancel, webhook latency, and paid completion.
- Stock rejections, negative/incorrect inventory, reservation expiry, Pancake queue/retry failures.
- Meta event IDs, deduplication, rejected CAPI responses, and Ads/order count differences.
- Admin order email sent/failed/retry state.
- Checkout/address validation errors and support reports.
- 4xx/5xx rates, API latency, database connections/storage, worker health.
- Real-user LCP/INP/CLS and top slow pages/assets.
- Search crawling/indexing/feed diagnostics after account submissions.

## Known Non-Blocking/Future Work

- Automated back-in-stock and abandoned-cart marketing require provider, consent, unsubscribe, retention, and duplicate controls.
- Wishlist has limited value at the present small catalog and should follow measured demand.
- Server-side catalog pagination becomes useful as the catalog grows.
- OAuth buttons remain hidden until real production credentials are complete.
- J&T live booking remains unavailable without official integration details.
- Experiment variants are not implemented until stable baseline traffic and assignment/reporting exist.

## Final Recommendation

Do not perform an unrestricted launch yet. Complete every release-blocking gate, record the evidence, and rerun the smoke/health checks against the exact production release. If all gates pass, release gradually with active monitoring. The current code is suitable for that final controlled acceptance; it should not be described as fully ready before the provider, device, business-fact, and historical-order checks are complete.
