# Maria Clara Clothing Website Conversion and Sales Audit

Audit completed: 2026-07-16

Audited site: https://mariaclaraclothing.com

Deployed application commit: `a1556df`

Pre-deployment backup: `20260716T000457Z`

## Overall Status

**Not Ready**

The customer site is operational, responsive, and materially safer than the pre-audit build. The audited fixes are deployed and production is healthy. It is not yet responsible to call the store ready for unrestricted launch because no successful post-fix PayMongo production payment has been completed, several product pages promise delivery ranges that conflict with the global checkout settings, and one product has an unresolved color contradiction that requires owner confirmation.

## Executive Summary

The application has a strong custom-commerce foundation:

- React 18, React Router, Vite, and a shared customer/admin component system.
- Express 4 with PostgreSQL in production and isolated JSON repositories only for development/tests.
- Server-authoritative quotes and totals, transactional stock deduction, stable checkout idempotency, and strict structured-address validation.
- COD orders are created only after validation and transaction commit.
- PayMongo uses pending-payment reservations, signed webhooks, paid-amount validation, and expiry recovery.
- Pancake POS uses durable mapping, inventory, order export/import, retry, reconciliation, and audit records.
- Meta browser and server Purchase events use a permanent per-order ID and database-backed claims/outbox delivery.
- Reviews are database-backed, moderated, privacy-safe, and support photos and secure XLSX import, although the live store currently has no published reviews and reviews are disabled.
- Admin order email notifications are post-commit, idempotent, retriable, and do not block checkout.

The biggest verified conversion risks are:

1. **PayMongo has no successful post-fix production acceptance result.** Historical PayMongo records predate the current validation/deduplication release.
2. **Shipping promises conflict.** Global checkout settings say Metro Manila/Cavite 2–4 days, Luzon 3–6 days, and Visayas/Mindanao 5–8 days. Most product records still say 2–3, 3–5, and 6–8 days.
3. **One product remains ambiguous.** MARIACLARA ROCKSTAR says “gray” in one paragraph and “Red” in its detail list. This audit did not guess which is correct.
4. **Real social proof is absent.** Production has zero published reviews and the global review display is off.
5. **Privacy/analytics governance is unresolved.** Meta tracking is configured with `requireConsent: false`. The owner should document the approved legal/privacy basis or enable consent.
6. **Performance needs a production lab baseline.** The production bundle is sensibly route-split, but campaign and product images remain the dominant likely transfer cost. Real-user monitoring and Lighthouse traces are not configured.

Safe fixes deployed in this audit:

- Corrected verified CURIOSITY OFFWHITE and MANDALA BLACK product-copy errors.
- Replaced four unrelated cloned public handles with clean canonical handles while preserving all old URLs as aliases.
- Made product free-shipping copy use the real admin-configured enable flag and item threshold.
- Replaced generic Cart recommendations with stable, in-stock, same-collection/type-first recommendations.
- Added 44px product gallery, size, quantity, and cart quantity tap targets.
- Added real order item images to the Thank You page.
- Corrected “Returns address” to the factual “Store location.”
- Fixed admin action-menu keyboard focus so Home/End navigation is not overwritten.
- Added a non-mutating customer route audit across 320, 360, 390, 430, 768, 1024, and 1440px.

No prices, discounts, inventory, shipping rules, legal policies, reviews, or payment availability were invented or silently changed.

## Actual Project and Production Architecture

| Area | Implementation verified |
| --- | --- |
| Frontend | React 18, React Router, Vite, Tailwind/custom CSS, customer and admin SPAs |
| Backend | Node.js CommonJS and Express 4 |
| Database | PostgreSQL 16 production; isolated JSON fallback for development/tests |
| Product model | Products, variants, per-size stock, external POS IDs, images, collections, handles/aliases, editable product-page content, parcel weight, SEO and review controls |
| Cart | Browser cart plus server cart-session synchronization and draft/abandoned/converted state |
| Checkout | Server quote, separate information and review pages, confirmation token, stable idempotency key, one database transaction for order/stock/movements |
| PayMongo | Hosted Checkout, pending reservation, signed webhook, amount/currency verification, expiry/reconciliation worker |
| Pancake POS | Live mapping, catalog/inventory reconciliation, order shadows/export, webhook/polling, retry and audit |
| Meta | Browser PageView/ViewContent/AddToCart/InitiateCheckout/AddPaymentInfo/Purchase and server Purchase CAPI outbox |
| Reviews | Moderation, photos, published-only stats, verified-order matching, visibility settings, secure XLSX preview/import |
| Authentication | Secure cookie and CSRF sessions; customer email accounts; OAuth buttons hidden unless fully configured |
| Admin | Orders, products, inventory, discounts, cart sessions, customers, reviews, settings, Pancake, payments, issues |
| Production | Docker Compose, nginx, PostgreSQL, health checks, migrations, backups, Cloudflare/Caddy edge |

## Current Customer Journey

1. The homepage introduces Maria Clara Clothing, 240 GSM apparel, COD, collections, and the real two-item free-shipping rule.
2. Customers navigate New Arrivals, Tees, Freedom of Mind, Shop, search, and filters.
3. Product cards display real images, names, prices, availability, and ratings only when published reviews exist.
4. Product pages provide gallery navigation, real per-size stock, price, size chart, quantity, details, shipping content, reviews when enabled, and in-stock recommendations.
5. Add to Cart is blocked for unavailable stock/quantity and opens a quote-backed cart drawer after success.
6. Cart supports stock-capped quantity changes, removal, authoritative subtotal/promo state, free-shipping progress, and stable in-stock recommendations.
7. Checkout requires first name, last name, Philippine mobile number, street, barangay, city/municipality, and province. Email and ZIP remain optional. Delivery Notes were intentionally removed in the earlier critical checkout fix.
8. The Review page revalidates delivery data and the server quote, then shows products, address, subtotal, discount, shipping, final total, payment methods, and recommendations.
9. COD creates an order only after the customer confirms and the order/stock transaction commits.
10. PayMongo creates a pending-payment reservation and releases paid-order side effects only after a verified matching webhook.
11. Thank You retrieves a private server confirmation and displays order snapshots, customer-safe status, complete totals, delivery details, product images, and Messenger support.
12. Admin receives the order, inventory movements, email state, payment state, Meta state, and Pancake state.
13. Returning customers can sign in, view order history, save an address, and use stock-validated Buy Again.

## Critical Issues

| ID | Problem | Customer impact | Recommended solution | Expected conversion impact | Effort | Files/components affected | Fixed | Test result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0-01 | No successful PayMongo order has completed the current production flow. | A provider, webhook, return URL, or account-channel problem could appear only during a real payment. | Run one controlled paid order, verify charged PHP amount, paid webhook, one email, one Meta Purchase ID, one Pancake export, Thank You, then process the test order under normal policy. | Critical checkout confidence | Medium | PayMongo account/webhook, `checkout.js`, PayMongo services, Payments admin | No | Automated paid/pending/failure/retry tests pass; live successful payment still required |
| P0-02 | Product shipping text conflicts with global checkout ranges. | Customers may see a faster or different promise before checkout, reducing trust and causing complaints. | Owner must approve one set of ranges, then update affected product Shipping fields or global settings through Admin. | High trust and lower support/returns | Low | Admin Product Editor and Settings > Shipping | No; business promise not silently changed | 13 records use 2–3/3–5/6–8, 2 have similar custom copy, 3 have no product shipping copy |
| P0-03 | MARIACLARA ROCKSTAR copy says gray in one place and red in another. | Wrong-color expectations can cause cancellation, returns, and distrust. | Confirm the real garment color from SKU/images, then correct the product description and detail list in Admin. | High product confidence | Low | Admin Product Editor | No; fact is ambiguous | Confirmed in production API |
| P0-04 | Meta consent is disabled without a documented decision in this repository. | Privacy/legal uncertainty can create launch risk and reduce trust. | Obtain owner/privacy approval. Enable required consent if that is the approved approach; otherwise document the lawful basis and keep Privacy Choices visible. | High risk reduction | Low | Admin Settings > Meta Pixel, privacy copy | Intentionally unchanged | Production setting remains `requireConsent: false` |

## Homepage

### Issues

- There is no real published rating/review proof to support first-time trust.
- Campaign imagery is the likely main mobile transfer cost; no production RUM exists.
- Payment confidence focuses heavily on COD while PayMongo needs a successfully verified live acceptance result.

### Fixes

- The active hero loads first and later slides preload after the critical view.
- Mobile promotional cards stay out of the product viewport; Messenger remains compact.
- Hero, ticker, collection order, CTA, logos, and banners remain admin-editable.
- Public live matrix passed at 320–1440px with no page-level overflow, broken visible image, or page exception.

### Recommendations

- P1: publish a real review/photo strip only after moderated records exist.
- P1: generate responsive hero derivatives and add production Core Web Vitals/RUM.
- P2: test one concise product-benefit line and CTA through the experiment plan.

## Product Discovery

### Issues

- Search/filtering is client-side and downloads the public catalog; acceptable for 18 products but not indefinitely scalable.
- Several products have only two photos, reducing confidence compared with fuller galleries.
- No back-in-stock subscription or wishlist exists.

### Fixes

- Shop search uses real name, description, category/type, collections, tags, SKU, and size data.
- Collection, size, availability, min/max price, and sort controls work without a full-page reload.
- Freedom of Mind and other public collections resolve correctly.
- Canonical product handles are clean, sitemap entries were updated, and all four previous handles still resolve.
- Cart/review recommendations now prefer shared collection, then shared product type/category, with an in-stock random fallback and stable session assignment.

### Recommendations

- P1: add more real front/back/detail/on-body media where available.
- P2: move catalog filtering server-side when volume or response size justifies it.
- P2: add back-in-stock opt-in with consent and duplicate protection.

## Product Pages

### Issues

- Product-specific shipping content is inconsistent with global settings.
- ROCKSTAR color is unresolved.
- Model height/worn size is not stored as dependable structured data.
- Product metadata and schema are client-rendered; crawlers that do not execute JavaScript initially receive generic SPA metadata.

### Fixes

- Corrected CURIOSITY OFFWHITE from Black to Off-white.
- Corrected MANDALA BLACK’s cloned WHITE name/color copy.
- Added 44px gallery arrows, size choices, quantity controls, and size-chart action.
- Free-shipping copy now honors the real enabled flag and configured item threshold.
- Recommendations exclude sold-out/current products.
- Gallery swipe, thumbnails, arrows, keyboard navigation, fallback images, size modal focus, and real stock caps are covered.

### Recommendations

- P1: complete an owner product-content audit for color, material, fit, GSM, measurements, and shipping copy.
- P1: prerender/server-render product title, description, canonical, Open Graph, Product/Offer, and real published-review schema.
- P2: add admin fields for real model measurements and worn size.
- P2: test sticky mobile Add to Cart only after measuring current scroll behavior.

## Cart

### Issues

- Recommendation relevance previously depended on catalog order.
- A browser-only cart can be cleared by storage cleanup, although server cart sessions and drafts already support recovery.

### Fixes

- Recommendations are stable per cart session and prioritize related collection/type.
- Sold-out products and products already in cart are excluded.
- Quantity controls have 44px tap targets and enforce real max stock.
- Free-shipping progress comes from server quote/admin configuration.

### Recommendations

- P1: expose the existing cart-session recovery safely to returning customers.
- P2: add a consent-aware abandoned checkout email only after policy and provider setup.

## Checkout

### Issues

- A live successful PayMongo acceptance is missing.
- There is no address autocomplete; hierarchical selects are accurate but require several taps.

### Fixes

- Required customer/address fields are validated on frontend, Review access, COD, PayMongo session creation, backend order creation, Admin status changes, and Pancake export.
- Invalid requests create no order, stock movement, Pancake export, email, or Meta Purchase.
- Phone formats are normalized; ZIP and email remain optional.
- Delivery Notes are absent from new checkout flows.
- Server quotes determine products, unit prices, discount, shipping, and final total.
- Stable idempotency prevents duplicate checkout submissions.

### Recommendations

- P1: finish the controlled live PayMongo flow.
- P2: evaluate address search only if a reliable Philippine provider can preserve the current validated hierarchy.

## Payment

### Issues

- Enabled PayMongo channels must be confirmed against the live merchant account during acceptance.
- Historical PayMongo orders predate the current tracking/validation flow and cannot prove it.

### Fixes

- Pending orders do not emit Purchase or fulfillment notifications.
- Signed, timely webhooks and matching paid PHP amounts are required.
- Duplicate webhooks are idempotent.
- Payment cancellation/expiry can release reservations without double restocking.
- COD remains available without forcing account creation.

### Recommendations

- P0: perform and document one successful production payment.
- P1: monitor payment method selection, redirect, failure category, cancellation, paid webhook latency, and completion.

## Thank You Page

### Issues

- No live post-fix PayMongo confirmation has been visually accepted.

### Fixes

- Uses private confirmation tokens rather than public PII URLs.
- Displays real order snapshots, totals, delivery details, payment status, and now item images.
- Hides Pancake/debug/internal IDs.
- Browser Purchase is server-claimed once and blocked on refresh/reopen.
- COD and PayMongo messages are payment-aware.

### Recommendations

- P1: capture an owner-approved mobile/desktop screenshot during the controlled PayMongo acceptance.

## Trust and Reviews

### Issues

- Live reviews are enabled in the data model but globally hidden, with zero published reviews.
- No fake reviews or counts are shown, which is correct but leaves a social-proof gap.
- CSP is still Report-Only.
- Cloudflare’s generated `robots.txt` does not advertise the sitemap.

### Fixes

- Official Facebook, Messenger, Instagram `@mariaclaraclothingshop`, email, phone, and store location are configured.
- “Returns address” was corrected to “Store location” to avoid inventing a return policy.
- Reviews expose only Published records; private email/order information is never public.
- Verified Purchase requires a delivered matching order/customer/product.
- Secure XLSX preview/import, moderation reasons, audit trail, visibility toggles, replies, and images are implemented.
- Official favicon, HSTS, noindex not-found behavior, and sitemap are live.

### Recommendations

- P1: collect and moderate real reviews, then enable reviews and ratings deliberately.
- P1: move CSP from Report-Only to enforced after monitoring and resolving violations.
- P1: configure Cloudflare `robots.txt` to include `Sitemap: https://mariaclaraclothing.com/sitemap.xml`.
- P2: implement password reset through a configured transactional email provider.

## Mobile Experience

### Issues

- No real-device keyboard/PayMongo-app handoff was available in this automated environment.

### Fixes

- Public and local route matrices passed at 320, 360, 390, 430, 768, 1024, and 1440px.
- Ten major routes per viewport were checked for HTTP failures, horizontal overflow, broken visible images, page exceptions, and internal-sensitive text.
- Product and cart purchase controls use 44px targets.
- Modal focus, Escape behavior, mobile menu, cart drawer, checkout field focus, and responsive admin actions are covered.

### Recommendations

- P0 acceptance: test one physical Android and one physical iPhone through keyboard, PayMongo app/browser handoff, return URL, and Thank You.

## Performance

### Issues

- No production RUM or current Lighthouse history is stored.
- Product media still includes externally hosted originals and inconsistent gallery depth.
- The main customer bundle is meaningful and should be monitored as features grow.

### Fixes

- Vite route chunks are split; the production build completed successfully.
- Latest build: main JS 287.57 kB raw / 88.63 kB gzip; CSS 100.72 kB raw / 17.47 kB gzip.
- Below-fold media uses lazy loading where appropriate; the active hero is prioritized.
- Hashed assets have cache controls; HTML remains no-store.

### Recommendations

- P1: establish Lighthouse mobile baselines for Home, Shop, a product, Cart, Checkout, and Thank You.
- P1: add Web Vitals/RUM with privacy-safe aggregation.
- P1: generate width-aware WebP/AVIF derivatives for hero and product media while retaining adequate visual quality.

## Search Engine and Share Preview

### Issues

- Product metadata/schema is applied client-side rather than rendered in initial HTML.
- Cloudflare robots lacks a sitemap declaration.

### Fixes

- Live sitemap lists real public collections, info pages, and all 18 current canonical product routes.
- Four bad cloned handles were replaced and their previous URLs retained as aliases.
- Product schema only includes aggregate ratings when real published reviews exist.
- Favicon, canonical link handling, Open Graph fields, price currency, price, and availability logic exist.

### Recommendations

- P1: prerender public product/collection metadata and JSON-LD.
- P1: submit the sitemap in Google Search Console and Bing Webmaster Tools.
- P2: add an admin-editable default Open Graph image and validate Facebook share previews.

## Meta Pixel and Analytics

### Issues

- Meta Test Events UI and Ads reporting require owner-side confirmation; database delivery alone cannot prove Meta’s displayed deduplication.
- Consent governance is unresolved.
- There is no first-party funnel dashboard.

### Fixes

- PageView initializes once; valid route changes do not reinitialize the Pixel.
- ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, and Purchase reject malformed monetary values.
- Values are numeric PHP peso amounts; final Purchase uses stored `order.totalCents / 100`.
- COD Purchase follows committed order creation.
- PayMongo Purchase follows verified paid amount.
- Browser `eventID` and server `event_id` use the permanent `purchase_<orderNumber>` value.
- Database browser claims and a unique server outbox prevent refresh, rerender, concurrent, and webhook duplicates.
- Production contains five unique sent Purchase outbox events; values/currency match stored totals. Three have both browser and server completion timestamps and two are server-only, with no duplicate event IDs.

### Recommendations

- P0: during PayMongo acceptance, confirm one deduplicated Purchase in Meta Test Events.
- P1: build first-party aggregate funnel metrics for product view, cart, checkout, payment attempt/failure, Purchase, device, method, product, and exit page.

## Pancake POS

### Issues

- Twenty-six historical exports are blocked because old orders lack structured delivery data.
- J&T is configured in dry-run/manual export mode, not a live carrier booking integration.

### Fixes

- Production live sync completed every catalog, inventory, inbound/outbound order stage after deployment.
- Current checkout blocks incomplete delivery data before order creation/export.
- Admin warns, filters, and prevents fulfillment-status advancement for incomplete historical orders.
- Existing production evidence shows 602 successful Pancake events and 60 product/order mappings; historical blocks retain their reason and are not silently discarded.

### Recommendations

- P1: manually resolve only historical orders that still require action; do not invent missing customer data.
- P1: confirm the manual J&T export workflow is acceptable for launch.
- P2: add live carrier booking only with an official supported Philippine API and owner-approved credentials.

## Abandoned Checkout and Returning Customers

### Issues

- Cart sessions record abandoned/draft state, but automated recovery is not configured.
- Marketing recovery requires consent, sending policy, unsubscribe handling, and a provider.

### Fixes

- Production has persisted empty/draft/abandoned/converted cart-session states.
- Customer accounts support saved address, order history, and stock-checked Buy Again.
- OAuth buttons remain hidden because Google/Facebook providers are not configured, avoiding fake login controls.

### Recommendations

- P2: provide a safe “continue your cart” link for returning sessions.
- P2: add one consented recovery email with a durable send-once record and unsubscribe.
- P2: configure real OAuth only if the business wants it and production callback credentials are ready.

## Recommended New Features

| Feature | Expected impact | Difficulty | Risk | Required admin controls | Backend changes | Third-party setup |
| --- | --- | --- | --- | --- | --- | --- |
| Real review/photo strip | High trust | Low after reviews exist | Sparse proof or privacy misuse | Published/photo selection | Existing system sufficient | None |
| Back-in-stock alerts | Medium/high recovery | Medium | Consent and duplicate sends | Per-product toggle, queue status | Subscription and send-once outbox | Email/SMS provider |
| Recently viewed | Medium discovery | Low | Storage/privacy clutter | Global toggle | None initially | None |
| Saved-cart return link | Medium checkout recovery | Medium | Token/PII leakage | Expiry and disable controls | Signed resume token | Email only if sent |
| Consent-aware abandoned email | Medium/high | High | Compliance and annoyance | Timing, template, kill switch | Consent, outbox, unsubscribe | Transactional email |
| Product bundles | Medium AOV | High | Stock/discount complexity | Bundle products/pricing/limits | Authoritative quote and inventory bundle rules | None |
| Customer photo gallery | High trust | Medium | Rights, moderation, performance | Publish/order/crop controls | Existing review images plus optimized aggregation | None |
| Delivery estimate by region | Medium confidence | Medium | Overpromising | Approved ranges | Existing region engine; expose carefully | None |
| Wishlist | Medium return visits | Medium | Low usage at current catalog size | Global toggle | Anonymous/account persistence | None |
| Live J&T booking | Operational, indirect conversion | High | Provider/API and label errors | Credentials/mode/retry | Booking/webhook/label workflow | Official J&T PH API |

Product comparison is not recommended for the current small, similar apparel catalog. Loyalty/referrals and advanced personalization should wait until the baseline funnel and repeat-purchase data are reliable.

## Priority Roadmap

### P0 — Before Deployment

The audited release itself is deployed, but public launch readiness still requires:

1. Complete one successful PayMongo production acceptance and verify all downstream systems.
2. Align product shipping promises with the owner-approved global ranges.
3. Confirm and correct MARIACLARA ROCKSTAR’s actual color.
4. Decide and document Meta consent/privacy behavior.
5. Test checkout and PayMongo handoff on one physical Android and one physical iPhone.

### P1 — First 30 Days

1. Publish only real moderated reviews and customer photos.
2. Establish Lighthouse and Web Vitals/RUM baselines.
3. Prerender product/collection metadata and structured data.
4. Enforce CSP after report monitoring.
5. Add sitemap declaration to Cloudflare robots and submit the sitemap.
6. Add first-party funnel/payment-failure reporting.
7. Confirm manual J&T workflow and review blocked historical exports.

### P2 — Next 60–90 Days

1. Back-in-stock opt-in.
2. Saved-cart/abandoned checkout recovery with consent.
3. Recently viewed and wishlist.
4. Product-specific real model sizing data.
5. Transactional password reset.
6. Server-side catalog filtering if catalog growth warrants it.

### P3 — Future Tests

1. Bundles and complete-the-look merchandising.
2. Loyalty and referrals.
3. Advanced recommendation personalization.
4. Carrier API booking.
5. Controlled checkout/CTA/layout experiments from `SALES_EXPERIMENT_PLAN.md`.

## Prioritized Recommendation Register

| Priority | Problem | Customer impact | Recommended solution | Expected impact | Effort | Files/components | Fixed | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | PayMongo acceptance missing | Possible paid-checkout failure | Controlled production payment | Critical | Medium | PayMongo + checkout + admin | No | Automated only |
| P0 | Shipping range contradiction | Trust/support risk | Owner-align product/global copy | High | Low | Product Editor/Settings | No | Production API audit |
| P0 | ROCKSTAR color contradiction | Wrong item expectations | Owner confirm then edit | High | Low | Product Editor | No | Production API audit |
| P0 | Meta consent decision | Compliance/trust risk | Approve and configure | High risk reduction | Low | Meta Settings/Privacy | No | Live setting checked |
| P1 | OFFWHITE/MANDALA bad copy | Wrong product expectations | Correct verified facts | High | Low | SQL migration/products | Yes | Live API verified |
| P1 | Cloned canonical handles | Weak SEO/trust | Clean handles + aliases | Medium/high | Medium | Migration/API/sitemap | Yes | New and four old handles verified |
| P1 | Static free-shipping product copy | Rule could drift | Use admin setting | Medium | Low | `Product.jsx` | Yes | Source/build/E2E |
| P1 | Generic cart upsells | Lower second-item relevance | Stable collection/type ranking | Medium | Low | `checkoutUpsell.js`, `Cart.jsx` | Yes | Unit/E2E |
| P1 | Small tap controls | Mobile mis-taps | 44px targets | Medium | Low | Product/Cart | Yes | 7-viewport matrices |
| P1 | No real reviews | Low trust | Collect/moderate/enable | High | Content operation | Reviews admin | No | Production count 0 |
| P1 | Image/performance baseline absent | Unknown mobile abandonment | RUM/Lighthouse and derivatives | High | Medium | Media pipeline/Home/Product | No | Build sizes only |
| P1 | Client-only SEO | Weaker discovery/share | Prerender metadata/schema | Medium/high | Medium/high | API/nginx/React | No | Source/live HTML audit |
| P1 | CSP report-only | Reduced XSS defense | Monitor then enforce | Risk reduction | Medium | nginx | No | Live headers |
| P1 | Thank You lacks item photos | Less order reassurance | Render real snapshots | Medium | Low | `ThankYou.jsx` | Yes | Source/E2E/build |
| P1 | Ambiguous returns label | Invented policy impression | Use Store location | Medium trust | Low | `Contact.jsx` | Yes | Live build/source |
| P1 | Admin menu focus race | Keyboard moderation friction | Preserve active focus | Medium admin usability | Low | `AdminActionMenu.jsx` | Yes | Full Playwright |
| P2 | No recovery email | Lost carts | Consent-aware send-once recovery | Medium | High | Cart sessions/outbox | No | Architecture evaluated |
| P2 | No back-in-stock alerts | Lost demand | Opt-in alert queue | Medium | Medium | Products/notifications | No | Recommended |
| P2 | No password reset | Account friction | Transactional reset tokens | Medium | Medium | Auth/email | No | Source audit |
| P3 | No experiment assignment | Cannot causally compare CRO changes | First-party persistent assignment | Measurement foundation | Medium | Cart sessions/analytics/admin | No | Plan created |

## Changes Implemented

### Customer and admin behavior

- `apps/web/src/admin/AdminActionMenu.jsx` — preserves keyboard-selected focus when the menu’s delayed initial-focus callback runs.
- `apps/web/src/lib/checkoutUpsell.js` — stable, in-stock recommendations now rank shared collection, then product type/category, and match cart items by ID or slug.
- `apps/web/src/pages/Cart.jsx` — uses the centralized stable recommender and 44px quantity targets.
- `apps/web/src/pages/Contact.jsx` — replaces the unverified “Returns address” label with “Store location.”
- `apps/web/src/pages/Product.jsx` — dynamic free-shipping rule/copy, payment-neutral shipping fallback, 44px gallery/size/quantity/size-chart controls.
- `apps/web/src/pages/ThankYou.jsx` — renders real ordered-product images.

### Database and production content

- `apps/api/db/migrations/20260716_conversion_audit_corrections.sql` — fixes CURIOSITY OFFWHITE and MANDALA BLACK copy; assigns four clean public handles; stores prior handles as aliases; updates SEO handles; guards conflicts.
- `apps/api/test/conversionAuditCorrections.test.js` — validates the migration’s required corrections and alias strategy.

### Automated customer journey coverage

- `apps/web/e2e/conversion-route-matrix.spec.js` — real API-selected product plus ten public routes at seven viewport widths.
- `apps/web/e2e/checkout-upsell-gallery.spec.js` — current phone placeholder and Review action.
- `apps/web/e2e/storefront-offer-dock.spec.js` — verifies unobstructed mobile content and compact support.
- `apps/web/test/adminOrderDetailSource.test.js`
- `apps/web/test/cartUpsellSource.test.js`
- `apps/web/test/checkoutDraft.test.js`
- `apps/web/test/checkoutNamesUpsellSource.test.js`
- `apps/web/test/checkoutUpsell.test.js`
- `apps/web/test/customerMobilePolishSource.test.js`
- `apps/web/test/customerThankYouCheckoutSource.test.js`
- `apps/web/test/phase1AccessibilitySource.test.js`
- `apps/web/test/productPageSource.test.js`
- `apps/web/test/reviewsSystemSource.test.js`
- `apps/web/test/storefrontSettingsSource.test.js`

### Reports

- `WEBSITE_CONVERSION_AND_SALES_AUDIT.md`
- `SALES_EXPERIMENT_PLAN.md`

## Tests Performed

| Test | Result |
| --- | --- |
| Full API suite | 471 tests: 469 passed, 0 failed, 2 skipped because a separate `TEST_POSTGRES_URL` was not supplied |
| Frontend source suite | 208 passed |
| Full local Playwright suite | 48 total: 47 passed, 1 intentionally skipped admin mutation scenario |
| Responsive route matrix, local | 7/7 passed; 70 route/viewport visits |
| Responsive route matrix, production | 7/7 passed; 70 route/viewport visits |
| Viewports | 320, 360, 390, 430, 768, 1024, 1440px |
| Matrix checks | HTTP status, visible body, document/body overflow, broken visible images, page exceptions, internal-sensitive text |
| Production Vite build | Passed; 113 modules |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| SQL migration | Applied in local PostgreSQL and production; schema migration recorded |
| Production health | API, web, and PostgreSQL healthy |
| Production Pancake startup sync | Catalog, inventory, inbound/outbound orders all complete |
| Canonical handles | All four new handles live; all four old handles resolve to the correct product |
| Product corrections | CURIOSITY OFFWHITE no longer says Black; MANDALA BLACK no longer says WHITE |
| Public edge | Health, Shop, product, admin Reviews, HSTS, and sitemap return successfully |

The environment has no dedicated lint or TypeScript script. Syntax/static regressions are covered by Node tests and the Vite production build. The two optional PostgreSQL integration tests were not run against production and were not pointed at the working local database because they require an isolated test database; their repository/unit coverage passed.

No new live customer order or payment was fabricated during this audit. Existing controlled COD evidence was inspected read-only. A new PayMongo success remains a manual acceptance gate.

## Remaining Manual Setup

1. Complete one controlled successful PayMongo production payment and verify:
   - paid amount equals the database grand total;
   - one order, one inventory deduction, one admin email, one Pancake export;
   - browser/server Meta Purchase share one event ID and Meta Test Events marks them deduplicated;
   - refresh/reopen and webhook replay produce no second Purchase.
2. Approve and align all shipping ranges.
3. Confirm ROCKSTAR’s actual color and correct its copy.
4. Decide Meta consent/privacy behavior.
5. Enable Reviews only after real Published records are ready.
6. Configure Cloudflare robots sitemap declaration and submit the sitemap.
7. Run real Android/iPhone checkout and PayMongo handoff.
8. Confirm J&T manual export/dry-run is acceptable for launch.
9. Establish Lighthouse/Web Vitals monitoring.

## Final Recommendation

**Not ready to deploy as an unrestricted public launch.**

The audited software release is deployed and healthy, and no known code-level COD, address, stock, total, Pancake, Meta deduplication, mobile overflow, or dependency vulnerability remains from this audit. Hold the final launch decision until the PayMongo acceptance, shipping-copy alignment, ROCKSTAR fact correction, privacy decision, and physical-device payment test are complete.
