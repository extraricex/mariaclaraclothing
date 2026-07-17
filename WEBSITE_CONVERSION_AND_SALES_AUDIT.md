# Maria Clara Clothing Website Conversion and Sales Audit

Audit updated: 2026-07-16

Scope: customer storefront, admin dashboard, checkout, PostgreSQL data model, PayMongo, Pancake POS, Meta Pixel and Conversions API, reviews, email, analytics, SEO, accessibility, performance, security, and production configuration.

## Overall Status

**Not Ready for an unrestricted production launch. Code status: launch candidate.**

All automated code, build, security, responsive, checkout, payment-state, inventory, Meta, Pancake, admin, and SEO gates available in this workspace pass. The remaining P0 gates require real provider/account activity or owner-confirmed business facts and therefore cannot be truthfully completed from local code alone.

No production deployment was performed during this audit. No product price, discount, inventory, review, delivery promise, payment method, legal policy, or customer fact was invented.

## Executive Summary

The project has a solid custom-commerce foundation:

- React 18/Vite customer and admin applications with lazy route loading.
- Express 4 and PostgreSQL with migration-controlled schema.
- Server-authoritative products, prices, discounts, shipping, order totals, stock validation, and transactional order creation.
- Strict structured delivery-address validation across checkout, COD, PayMongo, admin status changes, and Pancake export.
- PayMongo pending-payment reservations with signed, idempotent webhook confirmation and paid-amount verification.
- Pancake product mapping, inventory reconciliation, durable order export/import, retries, polling, and admin diagnostics.
- Meta Pixel and CAPI Purchase events with the same permanent order event ID, numeric PHP value, database claims, and refresh/webhook deduplication.
- Database-backed moderated reviews, published-only statistics, secure image handling, and safe XLSX preview/import.
- Privacy-safe first-party funnel and Core Web Vitals analytics with an admin dashboard.
- Search-ready initial HTML, canonical URLs, Product/Offer and collection schema, dynamic sitemap, robots rules, and Merchant Center feed.

The most important remaining sales risks are operational, not hidden code failures:

1. A real successful PayMongo payment has not yet completed the full post-fix live acceptance checklist.
2. Meta Test Events still needs one live COD and one live paid PayMongo order to prove browser/server deduplication against the production dataset.
3. Product-level shipping copy conflicts with the global delivery ranges; the owner must choose the true promise.
4. MARIACLARA ROCKSTAR contains a gray/red color contradiction; recommendation number 3 was intentionally left unchanged, as previously instructed, and no color was guessed.
5. The store has no published reviews to show as real social proof.
6. Physical Android/iPhone payment handoff and keyboard behavior require real-device acceptance.

## Actual Project Architecture

| Area | Verified implementation |
| --- | --- |
| Frontend | React 18, React Router, Vite, customer/admin SPAs, responsive CSS |
| Backend | Node.js CommonJS, Express 4 |
| Database | PostgreSQL 16 production model; isolated JSON repositories for development/tests |
| Products | Products, variants, per-size stock, SKU/POS mapping, images, collections, aliases, SEO, size charts, review controls |
| Cart | Browser cart plus server cart sessions, draft/abandoned/converted state, recovery tokens |
| Checkout | Separate information/review pages, backend quote, confirmation token, idempotency key, transactional stock/order commit |
| Payments | COD and hosted PayMongo pending/paid/cancelled/expired flow |
| Pancake | Catalog mapping, inventory reconciliation, order shadow/export/import, polling, retries, audit log |
| Meta | Browser funnel events plus Purchase CAPI outbox, permanent per-order event ID, server/browser claims |
| Reviews | Moderation, photos, verified-order matching, replies, settings, published-only aggregation, XLSX preview/import |
| Authentication | Secure cookie/CSRF admin and customer sessions; OAuth UI hidden until credentials are complete |
| SEO | Initial crawlable HTML, canonical/aliases, JSON-LD, sitemap, robots, Merchant feed, guides, admin SEO fields |
| Analytics | Privacy-safe first-party funnel events and Web Vitals aggregation; admin dashboard |
| Production | Docker Compose, nginx, migrations, health checks, backups/configuration guides |

## Current Customer Journey

1. Homepage presents the brand, products, collections, COD, and the real configured free-shipping rule.
2. Customers browse Shop/collections, search, and filter by supported product data.
3. Product cards show real images, names, prices, stock state, and ratings only when published reviews exist.
4. Product pages show responsive galleries, product facts, per-size stock, size chart, quantity, reviews when enabled, and in-stock related products.
5. Add to Cart fires only after size, quantity, and stock checks pass; the cart receives a backend quote.
6. Cart quantity/removal changes are stock-capped and totals/free-shipping status remain server-authoritative.
7. Checkout requires first name, last name, valid Philippine mobile, street, barangay, city/municipality, and province. Email and ZIP are optional; Delivery Notes are removed.
8. Review revalidates delivery data, cart, stock, discounts, shipping, and total before showing payment choices.
9. COD creates the order after the transaction commits. PayMongo creates a pending reservation and completes fulfillment effects only after a verified matching paid webhook.
10. Thank You uses a private confirmation token and shows customer-safe order data, images, address, totals, and payment state.
11. Admin receives order, inventory, payment, email, Meta, and Pancake states. Returning customers have order history, saved address, and stock-requoted Buy Again.

## Critical Issues

| ID | Problem | Customer impact | Required solution | Expected impact | Effort | Affected areas | Fixed | Test result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0-01 | No full live paid PayMongo acceptance on the current release | A live account/channel/webhook issue could still block paid checkout | Run one controlled payment and verify amount, signed webhook, paid state, Thank You, email, Pancake, and Meta | Critical | Medium/manual | PayMongo account, webhook, Payments/Orders admin | No; provider test required | Automated success/failure/pending/retry/amount tests pass |
| P0-02 | Production Meta deduplication not yet confirmed in Test Events | Ads could overcount if dataset/account configuration differs | Test one COD and one PayMongo order; confirm identical event IDs and refresh/replay suppression | Critical | Medium/manual | Meta Events Manager, Pixel/CAPI settings | Code fixed; live proof pending | Browser/CAPI payload and claim tests pass |
| P0-03 | ROCKSTAR copy says gray and red | Wrong expectations can cause cancellation/returns | Owner confirms the real color, then correct through Admin | High | Low/manual | Product content | **Intentionally skipped: recommendation 3** | Conflict documented; no fact invented |
| P0-04 | Product shipping copy conflicts with global ranges | Conflicting promises reduce trust and create complaints | Owner approves one accurate set, then update affected products/settings | High | Low/manual | Product Editor, Settings > Shipping | Not silently changed | Conflict audit completed |
| P0-05 | Real-device payment return/keyboard not accepted | Mobile-specific app/browser behavior may only appear on devices | Test physical Android and iPhone end to end | High | Medium/manual | Checkout, PayMongo return, Thank You | Automated widths pass | Browser matrix passes; physical-device gate open |

## Homepage

- **Issues:** Real social proof is absent; hero media remains the largest likely mobile resource; payment confidence cannot claim a live PayMongo result yet.
- **Fixes:** Responsive WebP hero derivatives, first-slide priority, deferred later slides, stable above-fold space, non-blocking privacy choices, admin-editable content, clear CTA, real free-shipping/COD messaging.
- **Recommendations:** Publish a real moderated review/photo strip when records exist; test one CTA only through an experiment mechanism; monitor real-user LCP by device/network.

## Product Discovery

- **Issues:** Several products have limited galleries; back-in-stock notifications are not configured; client filtering will eventually need pagination at a larger catalog size.
- **Fixes:** Supported search/filter/sort, clean canonical handles with aliases, working collection routes, sold-out state, responsive cards, real published-only ratings, related in-stock recommendations, generated product image derivatives.
- **Recommendations:** Add real front/back/detail/on-body media; add consent-aware back-in-stock notifications only after choosing a provider; move filtering server-side when catalog size warrants it.

## Product Pages

- **Issues:** Some product facts/shipping copy need owner review; model details are not consistently structured; no real published review proof exists.
- **Fixes:** Responsive gallery sources and preloading, swipe/keyboard/thumbnail state, stock-capped quantities, accessible 44px controls, size chart, real low-stock state, related products, recently viewed, crawlable Product/Offer metadata, published-review-only rating schema.
- **Recommendations:** Complete a product-content audit for material, fit, GSM, color, measurements, and shipping; populate product-specific size charts and more real media; test sticky mobile Add to Cart only after baseline measurement.

## Cart

- **Issues:** Automated abandoned-cart email is intentionally not enabled without consent/provider configuration.
- **Fixes:** Server quote, stock limits, easy quantity/removal, responsive drawer/page, exact configured free-shipping progress, stable related-product recommendations, duplicate-submit protection, persistent server cart sessions and recovery route.
- **Recommendations:** Enable consent-aware recovery email only after privacy copy, timing, sender, unsubscribe, and duplicate limits are approved.

## Checkout

- **Issues:** Address autocomplete is absent; it is optional and should not weaken structured validation.
- **Fixes:** Field-specific frontend errors, focus/scroll preservation, direct-review guard, strict backend address validation, Philippine mobile normalization, optional email/ZIP, removed Delivery Notes, server quote/total, stock transaction, confirmation token, idempotency, friendly errors.
- **Recommendations:** Keep the structured hierarchy; evaluate an address provider only if it preserves barangay/city/province validation and has acceptable Philippine coverage.

## Payment

- **Issues:** Live PayMongo acceptance and enabled-channel confirmation remain manual.
- **Fixes:** No Purchase or fulfillment for pending/failed/cancelled payment; signed webhook and exact PHP paid amount required; duplicate webhook protection; expiry/release recovery; payment-aware UI and loading states.
- **Recommendations:** Complete the P0 live test; monitor method selection, redirect, cancel/failure, webhook latency, and completion in the first-party funnel dashboard.

## Thank You Page

- **Issues:** Live paid mobile confirmation still needs visual acceptance.
- **Fixes:** Private token, real snapshot names/images/variants/quantities/prices/discount/shipping/total, address/payment state, customer-safe messages, Messenger support, no Pancake/debug/internal details, browser Purchase server-claimed once.
- **Recommendations:** Capture owner-approved Android/iPhone COD and paid screenshots during acceptance.

## Trust and Reviews

- **Issues:** Zero published reviews; review display remains off; Meta consent policy choice must be documented.
- **Fixes:** Official social/contact settings, visible privacy choices, consent-aware Meta loader, database-only reviews, verified-purchase order matching, private-email/order protection, moderation reasons/audit, image safety, settings and per-product toggles, safe XLSX import.
- **Recommendations:** Collect and moderate real reviews; enable display deliberately; choose whether Meta requires consent and document the privacy basis. Never import Messenger data without removing private information and obtaining appropriate rights.

## Mobile Experience

- **Issues:** Physical device/provider handoff remains manual.
- **Fixes:** Tested 320, 360, 390, 430, tablet, laptop, desktop; no audited page-level horizontal overflow; intrinsic media dimensions; accessible menu inert state; labels, focus, modal Escape behavior, star/rating semantics, 44px purchase controls; Home/Shop/Product Lighthouse accessibility 100.
- **Recommendations:** Repeat the critical purchase path on physical Android/iPhone, including keyboard, autofill, PayMongo app/browser return, and slow mobile data.

## Performance

- **Issues:** Local throttled LCP remains above the Core Web Vitals 2.5-second target; production RUM has not accumulated enough data.
- **Fixes:** WebP campaign assets, 320/800 product derivatives, responsive `srcset`, lazy below-fold media, initial image preloads, route/review/admin chunk splitting, stable SEO fallback, reserved layout space, Web Vitals capture/dashboard.
- **Local mobile Lighthouse:** Home 66/100 performance, LCP 6.1s, CLS 0, TBT 100ms; Shop 68, LCP 6.0s, CLS 0, TBT 20ms; Product 62, LCP 6.7s, CLS 0, TBT 180ms. Accessibility/Best Practices/SEO are 100 on these final routes.
- **Recommendations:** Use production Search Console/RUM to identify real LCP assets; optimize source photography and CDN delivery; keep LCP/INP/CLS targets at 2.5s/200ms/0.1 at the 75th percentile.

## SEO and Share Preview

- **Fixes:** Initial crawler-visible titles/descriptions/canonical/Open Graph/Twitter data; Product/Offer/Breadcrumb/Collection schema; aggregate ratings only for real published reviews; clean product handles and legacy aliases; dynamic `/sitemap.xml` with image/lastmod data; `/robots.txt`; `/merchant-feed.xml`; guide pages; noindex private routes; admin SEO fields; branded favicon.
- **Remaining account setup:** Verify the canonical domain in Google Search Console and Bing Webmaster Tools; submit `https://mariaclaraclothing.com/sitemap.xml`; validate representative pages in Google Rich Results Test; create/verify Merchant Center and configure a scheduled fetch of `/merchant-feed.xml`; monitor indexing, duplicate/canonical issues, queries, rich results, Core Web Vitals, and feed diagnostics.
- **Content recommendations:** Write accurate collection introductions, product-specific fabric/fit/care copy, sizing guidance, shipping/payment FAQ, and useful search-led guides. Avoid keyword stuffing, copied manufacturer text, fake reviews, or unsupported delivery claims.
- **Priority keyword themes:** Brand/product names, oversized/heavyweight/240 GSM tees only where accurate, Philippine clothing/streetwear intent, collection names, real colors/designs, size/fit questions, COD/online-payment questions. Validate themes against Search Console rather than assuming volume.

## Meta Pixel and Analytics

- **Fixes:** PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase; numeric peso values; real IDs/quantities; one permanent Purchase ID per order; browser `eventID` equals CAPI `event_id`; PayMongo paid-only; COD committed-order-only; refresh/rerender/webhook idempotency; single Pixel initialization; consent-aware script loading; privacy-safe first-party funnel and Web Vitals analytics.
- **Recommendations:** Complete Test Events for COD/PayMongo, record deduplication status, then monitor product-view-to-cart, cart-to-review, review-to-payment, checkout completion, COD vs PayMongo, device class, stock failures, and payment failures. Ads reporting is not a substitute for the first-party order database.

## Pancake POS

- **Issues:** Live mappings/credentials and real-store acceptance must remain monitored; J&T is dry-run without an official Philippine API specification/credentials.
- **Fixes:** Complete-address gate, catalog/SKU mapping, stock reconciliation, transactional inventory, durable export/import, retry/polling, duplicate/stale protection, admin warnings and diagnostics.
- **Recommendations:** Confirm every production SKU/variant mapping, warehouse, shop, source, and status mapping; test one COD and one paid export; alert on retry exhaustion; keep J&T dry-run until official credentials and contract are available.

## Admin Editability

Admin supports homepage/banner/collections, product copy/media/SEO/size charts/reviews, shipping/free-shipping, payment visibility, contact/social links, orders/address correction, inventory, discounts, analytics, Meta status, Pancake diagnostics, review moderation/import/settings, and email resend. Important production facts do not need to be changed in frontend source.

## Security and Error Recovery

- Enforced CSP, HSTS and security headers; production secret validation; secure cookie/CSRF admin/customer sessions; private confirmation and recovery tokens; rate limits; sanitized logs/errors; upload validation; zero npm audit vulnerabilities.
- Customer messages avoid raw database, PayMongo, Pancake, SMTP, tokens, and stack details.
- Historical incomplete-address orders remain flagged for manual correction; missing facts are never invented.

## Recommended New Features

| Feature | Expected impact | Difficulty | Risk | Required setup |
| --- | --- | --- | --- | --- |
| Real review/photo acquisition | High trust | Medium | Privacy/quality | Consent, moderation workflow, real orders |
| Back-in-stock opt-in | Medium | Medium | Consent/duplicate messages | Provider, unsubscribe/retention policy, admin controls |
| Production image CDN/transformations | High mobile speed | Medium | Image quality/cost | CDN and responsive source policy |
| Automated cart recovery | Medium | Medium-high | Marketing consent/spam | Provider, consent, schedule, suppression/idempotency |
| Wishlist | Low-medium at current catalog size | Medium | Account/privacy complexity | Customer storage and admin analytics |
| Live J&T booking/tracking | Operational | High | Unsupported/private API | Official J&T PH specification and credentials |
| Loyalty/referrals/personalization | Future | High | Margin/privacy/complexity | Business rules, measurement, fraud controls |

## Priority Roadmap

### P0 — Before Deployment

1. Complete and document one live paid PayMongo order.
2. Prove one COD and one paid Purchase are deduplicated in Meta Test Events.
3. Recommendation 3 (ROCKSTAR color) remains intentionally skipped until the owner supplies the true color.
4. Approve and align the real shipping promise.
5. Test the full flow on physical Android and iPhone.
6. Correct the 26 historical incomplete-address orders manually before fulfillment; do not invent values.

### P1 — First 30 Days

1. Submit/monitor Search Console, Bing, Rich Results, Merchant Center, sitemap, feed, and Core Web Vitals.
2. Publish real product content/media and moderated reviews.
3. Monitor first-party funnel, Web Vitals, PayMongo, Meta deduplication, Pancake queues, stock failures, and support issues.
4. Optimize production LCP/image delivery from measured RUM.

### P2 — Next 60–90 Days

1. Consent-aware back-in-stock and cart recovery.
2. Server-side catalog pagination/filtering if product volume grows.
3. Structured model/fit content and stronger collection guides.
4. Evaluate wishlist/reorder prominence from real repeat behavior.

### P3 — Future Tests

Experiment-driven CTA, image order, review placement, size-chart placement, sticky Add to Cart, upsell wording, shipping progress, and payment presentation. Do not ship simultaneous unmeasured variants.

## Changes Implemented

- `apps/web`: responsive/lazy storefront media, route splitting, stable SEO fallback, accessibility fixes, consent-aware Meta, first-party funnel/Web Vitals, analytics admin, SEO guides/breadcrumbs, checkout/cart/customer recovery enhancements.
- `apps/api`: authoritative checkout/order/payment safeguards, cart recovery, analytics, SEO/robots/sitemap/Merchant feed, image derivative generation, email notifications, catalog/admin support, Meta/Pancake protections.
- `apps/api/db`: migrations for analytics, Web Vitals, cart recovery, password reset, SEO copy, and media performance.
- `apps/api/public`: optimized brand media and legacy storefront updates.
- `deploy`, Docker/nginx, environment examples, and setup documentation: production-safe configuration and enforced security headers.
- Tests expanded across storefront, admin, checkout, PayMongo, Meta, Pancake, SEO, security, media, recovery, analytics, and responsive flows.

## Tests Performed

- Web source tests: **218 passed, 0 failed**.
- API tests: **484 passed, 0 failed, 2 skipped** only because optional `TEST_POSTGRES_URL` was unavailable.
- Playwright E2E: **47 passed, 0 failed, 1 skipped** intentionally because the persistent catalog mutation fixture `TEST_COLLECTION_NAME` was not supplied.
- Web production build: passed.
- npm audit (full and production-only): **0 vulnerabilities**.
- Local production-like Docker health and migrations: passed.
- Responsive paths include 320/360/390/430px, tablet, laptop, and desktop; COD/PayMongo states, stock, totals, address bypass, private confirmation, admin, galleries, and upsells are covered.
- No lint or type-check script exists in the repository; build and source/runtime tests are the available static/syntax gates.

## Remaining Manual Setup

- Complete the P0 live provider/device/business-fact gates above.
- Verify SMTP sender/recipient credentials and a real post-commit order email.
- Verify Search Console, Bing, Merchant Center, sitemap/feed, Rich Results, and production RUM.
- Confirm Meta consent/privacy configuration and retain the visible Privacy Choices control.
- Confirm Pancake live shop/warehouse/source/SKU/status mappings and monitor queues.
- Configure uptime/error/log retention plus backup and restore drills for PostgreSQL and uploads.
- Keep J&T dry-run until official production integration details exist.

## Final Recommendation

**Not ready for unrestricted launch yet.** The code is a tested launch candidate. Deploy only after the real PayMongo, Meta deduplication, owner shipping/color facts, physical mobile acceptance, and historical incomplete-address handling are completed and recorded. Once those gates pass without a critical defect, release gradually and monitor orders, payment failures, inventory, Pancake, Meta, email, funnel conversion, and Core Web Vitals daily during the initial launch.
