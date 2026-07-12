# Final Full System Audit Report

Audit date: 2026-07-12 (Asia/Manila)  
Deployed production commit: `357d4a3`  
Customer site: https://mariaclaraclothing.com  
Admin site: https://admin.mariaclaraclothing.com/admin/login

## Overall Status

**Not Ready** for the complete requested feature set.

The deployed COD storefront and its core commerce path are operational. Checkout,
orders, stock enforcement, admin order management, Pancake live sync, Meta browser
events, issue reports, HTTPS, Docker, and responsive layouts passed. Two external
launch requirements remain: Google/Facebook OAuth credentials are not configured,
and no off-server backup repository is configured.

## Customer Website

Checked:

- Homepage, carousel, navigation, mobile drawer, collections, product cards,
  product details/gallery/swipe, size chart, cart/drawer, checkout, Thank You,
  FAQ, Terms, Shipping and Returns, Contact, login/register/account, footer,
  Messenger, social links, and Report Issue.
- Official Instagram URL is used and customer pages contain no Pancake/POS internals.
- Thank You uses the saved order and the approved packing/shipping message.

Fixed:

- Added complete customer, subtotal, discount, shipping, item, and total details to
  the private Thank You confirmation.
- Replaced the 26 MB primary hero with a visually equivalent 220,930-byte image.
- Split customer/admin routes into lazy chunks; initial JavaScript fell from about
  529 KB to 258 KB before gzip.

Remaining issues:

- Google and Facebook login are hidden because their production provider
  credentials are absent. Email/password customer accounts continue to work.

## UI / Design

Checked:

- Product/card alignment, image fitting, controls, cart badge, forms, admin panels,
  tables, text wrapping, fixed controls, and interactive states.
- Final production build has no oversized JavaScript chunk warning.

Fixed:

- Optimized the hero without changing its composition.
- Route loading no longer forces all admin/customer screens into the first bundle.

Remaining issues:

- No blocking design defects found.

## Mobile Responsiveness

Checked:

- 145 isolated customer/admin page checks across 360x640, 430x932, 768x1024,
  1366x768, and 1600x1000.
- 60 live customer-page checks across the same five viewport classes.

Fixed:

- Verified stable lazy-route loading and responsive hero rendering.

Remaining issues:

- None. Both sweeps reported zero horizontal overflow, broken images, console
  errors, or server errors.

## Checkout Flow

Checked:

- Empty-cart guard, authoritative quote, required-field errors, focus/scroll to the
  first invalid field, structured Cavite address, COD order submission, private
  confirmation, idempotent retry, saved admin order, and real Thank You content.
- `crypto.randomUUID` fallback remains covered.

Fixed:

- Added missing Thank You customer and discount breakdown fields.

Remaining issues:

- None for COD checkout. GCash/bank transfer remain instruction-based methods, not
  automatic payment gateways.

## Inventory / Stock Limit

Checked:

- A stock-one size stopped product and cart quantity at one.
- Backend rejected oversell and aggregates duplicate variant lines.
- Successful checkout deducted once; two concurrent cancellation requests restored
  exactly once and wrote one movement.

Fixed:

- Made admin cancellation, order status, stock restoration, movement recording,
  and status history atomic under a PostgreSQL row lock.

Remaining issues:

- None found.

## Admin Dashboard

Checked:

- Login/session/CSRF tests, dashboard, orders, products, inventory, customers,
  discounts, content, banners, settings, collections, issue reports, Pancake, Meta
  settings, and mobile table behavior.
- Production admin hostname redirects to Cloudflare Access before the app login.

Fixed:

- Admin order Save no longer sends immutable line items and therefore saves valid
  status, contact, address, note, and tracking changes correctly.

Remaining issues:

- The app has one shared admin account with no app-level MFA or roles. Cloudflare
  Access is the production outer control.
- Final inner production login should be manually checked with an authorized
  Cloudflare Access identity after each Access policy change.

## Admin Order Details

Checked:

- Order/customer/address/item/SKU/variant/quantity/pricing/discount/shipping/COD,
  payment, courier, tracking, statuses, notes, Pancake ID, sync state, timestamps,
  and safe error diagnostics.

Fixed:

- Fixed immutable-item save rejection.
- Preserved inbound and outbound Pancake timestamps instead of clearing the other
  direction during link upserts.

Remaining issues:

- None found in the tested fields or layouts.

## Pancake POS Sync

Checked:

- Official REST endpoints and OpenAPI field/status contracts.
- Website order links, inbound status/tracking, outbound status/tracking, duplicate
  protection, timestamps, retry queue, catalog mapping, and inventory reconciliation.
- Live DEMO round trip: signed webhook accepted, outbound event succeeded, provider
  callback arrived, tracking appeared locally, and both direction timestamps remained.
- Correct incremental polling completed in 614 ms instead of scanning about 4,800
  historical Pancake orders every cycle.

Fixed:

- Replaced unsupported `updated_since` with Pancake's documented `updateStatus`,
  `startDateTime`, `endDateTime`, and last-updated sorting parameters.
- Replaced outbound status names with documented numeric codes.
- Added official `partner.extend_code` tracking handling.
- Added a secret-authenticated order webhook plus five-minute recovery polling.
- Added deterministic `PNK-<id>` imports for Pancake-native orders without a website ID.
- Preserved direction-specific link timestamps and made worker status logs explicit.

Remaining issues:

- Pancake's documented main status enum has no direct `Failed`, `Unreachable`, or
  arbitrary `Other` value. Those local-only states are safely blocked from outbound
  mutation with a diagnostic code rather than mapped incorrectly.

Unmapped SKU count: **0** (`82/82` active variants verified, `0` conflicts)  
Live sync status: **Enabled and verified**; inventory `82` checked, `0` conflicts;
all recorded inbound/outbound events are succeeded and all six links are synced.

## Meta Pixel

Checked:

- Real Meta script and pixel configuration requests returned HTTP 200 in production.
- Pixel `595813035761213` loaded immediately with consent state `grant` and no saved
  Privacy Choices interaction.
- Live PageView, ViewContent, AddToCart, and InitiateCheckout each fired once with
  PHP values and product/variant IDs.
- Controlled completed checkout fired Purchase once with an order event ID; refresh
  fired zero additional Purchase events.

Fixed:

- No additional Pixel fix was required in this audit; duplicate protections passed.

Remaining issues:

- Meta Conversions API is disabled because no server access token is configured.
  Browser Pixel tracking is operational; CAPI is optional hardening.

Events tested: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase.  
Duplicate event check: **Passed**.

## Report Issue Feature

Checked:

- Customer form creation, database persistence, admin visibility, status update,
  admin note, private screenshot access contract, and responsive dialog.

Fixed:

- No functional defect found.

Remaining issues:

- Reports save and appear in admin, but email notification delivery is disabled
  until an email provider/API key is configured.

## Security

Checked:

- Cookie sessions, CSRF, rate limits, secure production config, admin/customer route
  guards, CORS/same-origin behavior, upload normalization, private issue screenshots,
  secret redaction, Cloudflare Access, HTTPS, and response headers.
- `deploy/production.env` is ignored by Git and has mode `600` on the VPS.
- Root and API production dependency audits report zero vulnerabilities.

Fixed:

- Upgraded SheetJS from vulnerable `xlsx` 0.18.5 to official 0.20.3.
- Exported Restic/B2 variables correctly to child processes in the off-site script.
- Production live Pancake mode now requires a 32+ character webhook secret.

Remaining issues:

- CSP is currently report-only. Enforce it after reviewing production violation logs.
- Application-level admin MFA and roles are not implemented.

## Deployment Readiness

Checked:

- API tests: `332` total, `330` passed, `2` PostgreSQL-only tests skipped when
  `TEST_POSTGRES_URL` was absent; real PostgreSQL checkout/cancellation was exercised
  in the isolated Docker acceptance flow.
- Frontend source tests: `169/169` passed.
- Browser suite: `16` passed, `1` intentionally skipped because no temporary
  collection name was supplied.
- Vite production build, clean Docker builds, migrations, HTTPS, customer/admin DNS,
  optimized assets, API health, container health, and live logs passed.
- Daily local VPS backup succeeded at 02:00; pre-deploy backup
  `20260712T065731Z` completed before release.

Fixed:

- Deployed commit `357d4a3` through `codex-edits` -> `main` -> VPS.
- Installed the corrected off-site backup helper.

Remaining issues:

- Restic is installed, but the off-server repository config, password file, and
  off-site cron entry do not exist.
- Google/Facebook OAuth applications and secrets are not configured.

## Critical Issues

No critical code-level commerce defect remains. These external launch blockers
prevent a full **Ready** result:

1. Google and Facebook customer login cannot work until real provider credentials
   and exact production callback URLs are configured.
2. The VPS has no independent/off-server backup. Because Hostinger automatic
   backups were not purchased, a VPS loss could also remove every current backup.

## Manual Setup Needed

1. Create Google and Facebook OAuth apps, register the exact callback URLs from
   `DEPLOYMENT_GUIDE.md`, add the four secrets to `deploy/production.env`, rebuild,
   and test both providers on phone and desktop.
2. Create a Backblaze B2, Cloudflare R2-compatible, or other Restic repository;
   create the Restic password/config files, run `restic init`, add the 02:30 cron,
   and complete a restore test.
3. Optional: configure Resend/Semaphore for issue/order notifications.
4. Keep J&T in `dry_run` unless an official Philippine booking API contract and
   credentials are obtained; current fulfillment can continue through Pancake/manual
   courier operations.

## Final Recommendation

**Not ready to declare the entire requested feature set complete.**

The deployed COD storefront is suitable for controlled real-customer ordering now,
with close launch monitoring. Do not advertise Google/Facebook login, and do not
consider the business data protected, until the two manual blockers above are
completed. After those two configurations and their smoke tests pass, the status
can be changed to **Ready to deploy** without further core-commerce code changes.
