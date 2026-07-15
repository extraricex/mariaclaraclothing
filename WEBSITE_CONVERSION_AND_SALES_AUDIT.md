# Maria Clara Clothing Website Conversion and Sales Audit

Audit date: 2026-07-15
Audited customer site: `https://mariaclaraclothing.com`
Audited source: the current workspace and live public configuration

## Overall Status

**Not Ready**

## Approved Implementation Follow-up — 2026-07-15

The numbered item 3 in the audit's P0 Priority Roadmap is **“Decide and configure Meta consent with privacy/legal approval.”** It was intentionally skipped at the owner's instruction. The existing `requireConsent` value and all consent behavior remain unchanged.

The other approved safe implementation work is now in the workspace:

- permanent per-order Meta Purchase IDs, database-backed browser claims, unique CAPI dispatch, verified-paid PayMongo gating, historical-order replay lock, and removal of four scattered/obsolete browser Purchase paths;
- corrected COD/PayMongo policy and payment guidance, verified OFFWHITE color copy, and the two identified trailing `Copy` product names through an additive migration;
- real Shop search/filter/sort, server-backed free-shipping progress, cancellation recovery, and payment-aware trust copy;
- active-hero-only loading, delayed next-slide preload, mobile benefit copy, product/collection metadata and real-review-only schema;
- order sales aggregation that no longer loads full customer orders for the catalog endpoint;
- the sitemap, HSTS/cache, checkout accessibility, modal, upsell, recommendation, and mobile obstruction fixes described below;
- an admin-only Meta delivery/deduplication panel.

Verification completed locally and in production: full API and storefront suites passed, the production Vite build passed, the dependency audit found zero vulnerabilities, both new migrations were dry-run and then applied, and all production containers are healthy. A controlled live COD order passed the one-browser/one-server Purchase test plus refresh and reopen deduplication, then was cancelled with stock restored. A successful post-fix PayMongo payment and Meta Test Events UI confirmation remain release gates, so the overall status correctly remains **Not Ready** at this point.

The core commerce implementation is unusually strong for a custom storefront: totals are authoritative, stock writes are transactional, duplicate checkout is guarded, PayMongo waits for a verified payment, Pancake uses durable synchronization, Meta Purchase is deduplicated, customer accounts support stock-checked reordering, and the review system is database-backed and moderated.

The remaining release gates are not speculative design preferences. The live Terms page says all orders are Cash on Delivery while PayMongo is enabled; an OFFWHITE product says its color is black; Meta tracking currently starts without consent; the current fixes are not yet deployed; and this audit intentionally did not create a live order or charge a payment. These items must be resolved or explicitly approved and verified before the site is called ready.

## Executive Summary

The storefront already has a clean, premium visual direction, a clear 240 GSM product proposition, visible pricing, real stock states, a two-item free-shipping offer, a separate review-and-payment step, COD and PayMongo, useful account features, and a real admin system. Across 60 live route/viewport combinations, all tested pages returned HTTP 200, no page-level horizontal overflow appeared, product images had alternative text, and no customer-facing JavaScript exception was observed.

The largest conversion opportunities are:

1. Correct contradictory or inaccurate production content before launch.
2. Publish and feature only real moderated reviews; the complete review system exists but is globally disabled and the live catalog has no published rating evidence.
3. Reduce image transfer. The live mobile homepage transferred about 3.62 MB in one isolated run, of which about 3.31 MB was images.
4. Add product-specific search/share metadata and structured data. The live app is a client-rendered SPA with generic initial metadata and no live sitemap before this patch.
5. Add search and lightweight collection filtering as the catalog grows.
6. Add first-party funnel reporting so decisions are based on product-view, cart, checkout, payment-failure, and completion rates rather than only Meta delivery.

Safe fixes implemented during this audit:

- Mobile promotional cards no longer cover product content; mobile keeps a compact Messenger icon and moves Report Issue to the footer.
- Checkout and account forms now expose visible labels and accessible errors.
- Disabled OAuth controls no longer look like broken sign-in options when providers are not configured.
- Product recommendations exclude sold-out items and prioritize shared collections.
- Cart upsells require an explicit in-stock size selection.
- Size-chart and Report Issue dialogs trap focus, close with Escape, and restore focus.
- Customer-facing empty collection and missing-size-chart copy no longer exposes configuration language.
- A real, database/catalog-driven XML sitemap route was added.
- Hashed frontend assets receive long-lived caching, and production nginx adds HSTS.
- A React product-image attribute warning was removed.

## Audit Scope and Actual Architecture

| Area | Actual implementation found |
| --- | --- |
| Frontend | React 18, React Router, Vite, Tailwind/custom customer and admin design systems |
| Backend | Node.js CommonJS with Express 4 |
| Database | PostgreSQL in production; isolated JSON repositories only for development/tests |
| Routing | Customer SPA routes in `apps/web/src/App.jsx`; API routers in `apps/api/src/app.js`; nginx serves known routes and product canonical redirects |
| Products | Products, variants, images, public handles, collection membership, per-size stock, page content, size charts, review settings, and Pancake mappings |
| Cart | Browser cart plus server cart-session synchronization and abandoned/draft state |
| Checkout | Server quote, separate information and review/payment pages, stable idempotency key, transactional order/inventory writes |
| PayMongo | Hosted Checkout V2, pending-payment reservation, signed webhook verification, amount/currency validation, expiration/recovery worker |
| Pancake POS | Catalog import/mapping, inventory reconciliation, order export, inbound polling/webhook, outbound retry queues, conflict/audit records |
| Meta | Browser PageView/ViewContent/AddToCart/InitiateCheckout/AddPaymentInfo/Purchase; server Purchase through a durable CAPI outbox |
| Reviews | Database reviews, published-only aggregation, images, verified-order matching, moderation/audit, safe XLSX preview/import, global and per-product controls |
| Authentication | Customer email accounts and optional real OAuth; secure cookie/CSRF admin and customer sessions; Cloudflare Access in front of production admin |
| Notifications | Durable post-commit admin-order email outbox with retry and protected manual resend |
| Production | Docker Compose, PostgreSQL, Express API, nginx web container, Cloudflare/Caddy edge, migrations, backups and workers |

## Current Customer Journey

1. The homepage opens with Maria Clara Clothing campaign imagery, brand name, collection CTAs, the real two-item free-shipping proposition, COD, and 240 GSM positioning.
2. Customers browse New Arrivals, Tees, and Freedom of Mind. Freedom of Mind resolves correctly and active collections contain real products.
3. Shared product cards show image, name, price, sale comparison, real availability, and published ratings only when those records exist.
4. A product page provides a swipeable gallery, thumbnails, price, size choices, real per-size stock, quantity, size chart, editable product details, shipping copy, reviews when enabled, and recommendations.
5. Add to Cart runs only after an available variant and valid quantity are accepted. The cart drawer refreshes a server quote.
6. The cart supports quantity updates, stock caps, removal, subtotal/discount state, free-shipping state, and size-explicit recommendations after this audit.
7. Checkout collects customer and hierarchical Philippine delivery data, saves a resumable draft/cart session, validates fields, focuses the first error, and requests an authoritative quote.
8. The separate review page revalidates the quote, shows products, address, subtotal, discount, shipping, total, payment choices, and stable in-stock recommendations with required variant selection.
9. COD creates the order only on final confirmation. The database transaction consumes the quote, writes snapshots, deducts inventory, claims discount usage, creates notification/sync/Meta outbox work, and completes idempotency.
10. PayMongo creates a pending-payment order/reservation and redirects to hosted checkout. A signed paid webhook with matching PHP amount is required before paid status, Meta Purchase, and the admin email are released.
11. The Thank You page retrieves a private confirmation with a token, displays real order snapshots and customer-safe status, and offers Messenger support. Refresh does not create another browser Purchase.
12. Admin receives the order, notification status, stock movements, payment status, Pancake sync status, and operational actions. Pancake failures are retained for retry and do not erase the local order.
13. Returning customers can save an address, see order history/tracking, and use Buy Again with current stock validation.

## Critical Issues

| ID | Problem | Customer impact | Recommended solution | Expected impact | Effort | Files/admin area | Fixed | Test/result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0-01 | Live Terms says “All orders are Cash on Delivery” while PayMongo is enabled. | Customers may question online payment legitimacy; policy and checkout contradict each other. | Owner must update Terms and FAQ in Admin > Settings with approved COD and PayMongo wording. Do not invent legal copy. | High trust and payment completion | Low | Admin info pages; `storeSettingsRepository.js` fallback | No—owner content approval required | Confirmed in live `/api/storefront-settings` |
| P0-02 | `CURIOSITY OFFWHITE` describes a “black color” and lists `Color: Black`. | Wrong product expectations, returns, complaints, and chargeback risk. | Correct the actual product description/details in Admin > Products and verify images/SKU/variant color. | High product trust and lower returns | Low | Admin product editor/catalog record | No—production product content must be owner-verified | Confirmed against live product data and page |
| P0-03 | Current safe fixes and sitemap exist locally; live `/sitemap.xml` still returns 404 and live responses lack HSTS. | Search discovery remains weaker and security/UI fixes are not active. | Deploy this changeset through the existing backup/migration/health workflow, then verify the sitemap and headers. | Medium conversion; high release hygiene | Low | nginx, API sitemap route, frontend files | Code fixed; deployment pending | Local sitemap HTTP 200; live pre-deploy sitemap 404 |
| P0-04 | This audit did not place a real production COD order or charge PayMongo. | Final edge/provider behavior cannot be certified solely from unit tests. | After deployment, use controlled staff details and real in-stock test SKUs; observe database total, stock, email, Pancake, Meta, and Thank You exactly once. Cancel/restock only through normal admin policy. | Critical transaction confidence | Medium | Checkout, PayMongo, Pancake, Meta, email/admin | No—deliberately not fabricated | Automated coverage passed; live destructive test not run |
| P0-05 | Live Meta setting has `requireConsent: false`; tracking starts immediately and the choice dialog is available only from the footer. | Privacy expectations and legal basis may be unclear, lowering trust and creating compliance risk. | Owner/privacy counsel must approve the basis. The conservative option is enabling required consent and adding a visible Privacy Choices entry. | High risk reduction; possible analytics volume tradeoff | Low | Admin > Settings > Meta Pixel; privacy terms | No—requires business/legal decision | Confirmed in live public settings |

## Homepage

### Issues

- The core proposition is clear, but the mobile hero hides its descriptive subtitle; first-screen understanding relies on imagery, ticker text, and the CTA.
- Both homepage banner slides are rendered immediately. Images dominate page transfer.
- Trust content strongly explains COD but does not explain PayMongo even though online payment is enabled.
- No real published review excerpts or customer photos are available because reviews are off.
- The final “You pay at the door” section is COD-specific and can make PayMongo feel secondary.

### Fixes

- Removed the mobile floating offer/report cluster that covered the product journey; the same shared shell also improves homepage obstruction.
- Kept the real free-shipping message in the ticker and commerce pages without fake urgency.
- Added immutable caching for hashed Vite assets.

### Recommendations

- Test a one-line mobile benefit under the hero title: product type + 240 GSM + delivery confidence.
- Load the active hero first, preload only the next slide, and generate mobile/desktop responsive derivatives.
- Add a short, configuration-driven “COD or secure online payment through PayMongo” trust line after owner approval.
- Publish a real review/photo strip only after moderated records exist.

## Product Discovery

### Issues

- There is no customer search interface, price/availability/size filter, or collection sort control.
- This is manageable for roughly 18 live products but will become a discovery problem as the catalog grows.
- Two customer-facing names contain `Copy`, which looks like unfinished catalog data:
  - `DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt Copy`
  - `MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt Copy`
- Collection empty-state copy previously exposed implementation language.

### Fixes

- Freedom of Mind and canonical collection routes were verified.
- Empty collections now say no pieces are currently available instead of saying products were not linked.
- Product recommendations now exclude the current product, sold-out products, and zero-stock products; shared collections rank first.

### Recommendations

- P1: remove unintended `Copy` suffixes through Admin after verifying they are not deliberate names.
- P1: add a compact search entry in the mobile/desktop header using name, SKU, collection, tags, color, and fit.
- P2: add client-side availability, size, and price filtering first; move server-side only when catalog volume warrants it.
- P2: add sort by Newest, Price, and Availability. Use sales-based Best Sellers only from valid non-cancelled orders.

## Product Pages

### Issues

- One OFFWHITE item has wrong color copy (P0-02).
- Product-specific SEO records are absent and the initial HTML remains generic.
- Some live products have only two images while others have richer galleries.
- Fit/fabric copy is present but model height/size is not available as structured real data.
- The main image and recommendation/gallery images are not delivered with responsive `srcset` variants.
- The size chart exists, but product-specific measurement completeness must be reviewed in admin.

### Fixes

- Sold-out recommendations are excluded and same-collection items are preferred.
- Size-chart modal now traps keyboard focus, supports Escape, locks background scroll, and restores focus.
- Missing size data now directs the customer to message the store instead of exposing “not configured” text.
- React no longer emits the product image `fetchPriority` attribute warning.
- Mobile promotional cards no longer cover the title, price, size, or Add to Cart controls.

### Recommendations

- P1: audit every product in Admin for color, fit, material, 240 GSM applicability, care, image order, and size rows.
- P1: require at least front/back/detail imagery before publishing when real media exists; do not fabricate assets.
- P1: add product-specific server-rendered title, description, canonical, Open Graph image, Product/Offer schema, and published-only AggregateRating schema.
- P2: add admin fields for model height and worn size; show only when supplied.
- P2: test a sticky mobile Add to Cart bar only after measuring whether the current control falls below typical first-session scroll depth.

## Cart

### Issues

- Cart recommendations previously selected the first available size without a customer decision.
- Cart product recommendations are catalog-order fallback rather than collection/type relevance.
- Shipping is correctly “calculated at checkout” until an address exists, but the free-shipping progress line can be more specific.

### Fixes

- Upsell customers must now select an in-stock size; Add to Cart remains disabled until they do.
- Cart stock caps and specific low-stock messages remain intact.
- The backend remains the source of subtotal, discounts, shipping eligibility, and final quote.

### Recommendations

- P1: use the exact real message “Add 1 more item to unlock FREE shipping” for one remaining item, sourced from the server quote/config.
- P2: rank recommendations by shared collection/product type, then in-stock fallback; exclude products already in cart.
- P2: add a “Save cart” account action before adding marketing recovery.

## Checkout

### Issues

- Phone, email, house/street, address selects, and notes previously relied on placeholders without visible labels.
- Disabled Google/Facebook buttons appeared even though live OAuth status reports both providers off.
- The former CTA “Continue to Checkout” was ambiguous because the customer was already on checkout.

### Fixes

- Every field now has a persistent visible label, relevant autocomplete/input mode, `aria-invalid`, associated error text, and mobile-friendly layout.
- Validation still scrolls/focuses the first invalid field and preserves draft data.
- Disabled social buttons are hidden; real OAuth buttons render only when the backend reports an enabled provider.
- CTA is now “Review order.”
- Guest checkout remains available and no account is forced.

### Recommendations

- P1: add an explicit short privacy/use line near phone/email submission, linked to approved policy copy.
- P2: consider making email required only if the business commits to email confirmations; otherwise keep it optional as it is now.
- P2: add an address summary preview before leaving the page only if customer testing shows address-entry errors.

## Payment

### Issues

- Live Terms and FAQ are COD-centric and PayMongo method instructions are blank.
- No payment channel should be named until it is confirmed enabled for the live PayMongo account.
- The latest safe code was not exercised with a new live paid transaction in this audit.

### Fixes

- Existing code creates PayMongo as `pending_payment`, validates the signed webhook, requires `PHP`, requires the exact authoritative centavo amount, and blocks failed/pending/cancelled events from Purchase.
- Duplicate sessions/webhooks are idempotent; reservation expiry closes provider checkout before stock release.
- COD and PayMongo buttons have loading guards and order creation happens only on final action.

### Recommendations

- P0: correct approved Terms/FAQ/payment instructions.
- P0: run one controlled production PayMongo flow after deployment and verify success, cancellation, pending recovery, and duplicate webhook behavior.
- P1: show only provider channels returned/approved by the account configuration; do not hardcode marketing claims.
- P1: add concise recovery copy for cancelled/session-expired payment with a return-to-review action.

## Thank You Page

### Issues

- No customer-visible internal Pancake IDs were found.
- A production completion page was not generated during this audit to avoid a fake order.

### Fixes

- Existing implementation uses private confirmation tokens and real order snapshots.
- COD and paid PayMongo messages are differentiated.
- Browser Purchase uses the server event ID and persistent browser guard, so refresh does not re-send.
- Product names, images, sizes, quantities, subtotal, discount, shipping, total, payment state, customer/address, and Messenger support are present in source/tests.

### Recommendations

- P0: visually verify the post-deploy page using the controlled COD and PayMongo orders.
- P2: add an order-status/account CTA for logged-in customers and a clear “save this order” path for guests without exposing the confirmation token.

## Trust and Reviews

### Issues

- Reviews are globally disabled in production and every public product summary currently reports zero published reviews.
- Therefore the storefront has no real rating, review count, customer photo, or verified-purchase proof.
- Terms/payment contradiction and product-copy defects reduce first-time trust.
- Google and Facebook OAuth are both off; email login works, but password reset is absent.

### Fixes

- Disabled OAuth controls no longer resemble broken buttons.
- Official Facebook, Messenger, and `@mariaclaraclothingshop` Instagram links were verified in live settings.
- Report Issue remains available on mobile from the footer and on desktop as a fixed control; its dialog now has proper modal focus behavior.
- Review code remains real-record-only, published-only, privacy-safe, moderated, and verified only against delivered matching orders.

### Recommendations

- P1: moderate/import real reviews, correct product assignments, remove private information, then enable reviews and ratings in Admin.
- P1: add password-reset email flow with short-lived one-time tokens before promoting accounts heavily.
- P1: add approved PayMongo explanation and consistent payment copy across FAQ, Terms, checkout, account, and homepage.
- P2: configure real Google/Facebook OAuth only if the owner will maintain production credentials; otherwise email login is sufficient.

## Mobile Experience

### Issues

- Before the audit fix, Offer, Issue, and Chat controls covered the product title/price around the first 320 px viewport.
- Some secondary text links and gallery controls are smaller than the ideal 44 px touch target.
- Product/checkout pages are long; fixed controls must stay minimal.

### Fixes

- Tested 320, 360, 390, 430, 768, and 1440 px widths across ten customer routes: no page-level horizontal overflow.
- Mobile promotion cards are hidden; the free-shipping value remains in real page content.
- Messenger is a compact accessible icon; Report Issue is a footer link on mobile.
- Checkout labels, error association, size chart focus, and report dialog focus passed a 320 px post-fix Playwright run.

### Recommendations

- P1: raise remaining small icon/gallery touch targets to at least approximately 44×44 CSS pixels where layout permits.
- P2: run device testing on Safari iOS and Chrome Android, including keyboard-open checkout and PayMongo return behavior; Chromium emulation is not a substitute for both engines.

## Performance

These are single-run lab measurements from isolated fresh Chromium contexts against production, not field Core Web Vitals:

| Viewport/page | TTFB | DOM loaded | LCP | Transfer | Image transfer |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mobile 390 homepage | 235 ms | 894 ms | 1,596 ms | 3.62 MB | 3.31 MB |
| Mobile 390 collection | 246 ms | 926 ms | 1,356 ms | 1.88 MB | 1.58 MB |
| Mobile 390 product | 177 ms | 871 ms | 1,952 ms | 1.94 MB | 1.62 MB |
| Desktop homepage | 258 ms | 908 ms | 1,788 ms | 3.79 MB | 3.48 MB |
| Desktop collection | 184 ms | 887 ms | 1,760 ms | 1.96 MB | 1.65 MB |
| Desktop product | 216 ms | 865 ms | 1,036 ms | 2.03 MB | 1.71 MB |

### Issues

- Images account for most transferred bytes.
- Homepage renders both large hero slides immediately.
- Product cards and galleries do not provide width-specific `srcset` candidates.
- `/api/products` is marked `no-store`, returns the complete catalog, and calculates best-seller counts by reading orders on each request; this will scale poorly.
- Several product images depend on the Shopify CDN rather than the store's managed media pipeline.

### Fixes

- Hashed `/assets/` files now receive one-year cache headers at nginx.
- Route chunks are already code-split. The production build main chunk is about 285.85 kB raw / 88.08 kB gzip; route chunks remain separate.
- Uploaded customer/review/product media already has bounded validation and WebP normalization in the backend.

### Recommendations

- P1: generate responsive WebP/AVIF variants for hero, collection, card, and product-detail breakpoints; set width/height to prevent layout shift.
- P1: render/preload the active hero and only the next slide rather than fetching every slide immediately.
- P1: replace order-table scanning in the product list with an indexed aggregate/materialized count updated after valid order transitions.
- P1: use short safe catalog cache/revalidation plus explicit invalidation after product, stock, review, or collection writes.
- P2: migrate remaining external product media into the managed upload/CDN pipeline.

## Search Engine and Share Preview

### Issues

- Live `/sitemap.xml` returned 404 before this patch.
- Product routes set title/canonical in the browser, but social crawlers initially receive generic HTML metadata.
- No Product, Offer, Breadcrumb, or published-only AggregateRating JSON-LD was found.
- Collection/info pages largely use the generic site title/description.
- Cloudflare manages `robots.txt`; it does not yet advertise the new sitemap.

### Fixes

- Added a dynamic sitemap based on real public product handles and visible collection definitions; cart, checkout, account, and admin routes are excluded.
- Existing canonical public handles and 308 legacy redirects prevent duplicate product slugs.
- The Maria Clara favicon/manifest is present; no default globe favicon was observed.

### Recommendations

- P1: add server/edge HTML metadata injection or SSR for product and collection routes.
- P1: add structured data only from public product price/availability and real Published reviews.
- P1: add `Sitemap: https://mariaclaraclothing.com/sitemap.xml` through the Cloudflare robots configuration after deployment.
- P1: submit sitemap and inspect canonical/index coverage in Google Search Console.

## Meta Pixel and Analytics

### Issues

- Consent is not required in the live setting (P0-05).
- Meta provides advertising funnel delivery, but there is no complete first-party conversion dashboard for route exits, device split, stock failures, or payment failures.

### Fixes/verified behavior

- PageView: customer routes only, SPA duplicate suppression, no monetary value by design.
- ViewContent: real selected/default variant ID and numeric PHP price.
- AddToCart: fires only after accepted cart mutation; value is unit price × quantity.
- InitiateCheckout: waits for a finalizable backend quote with discount and shipping.
- AddPaymentInfo: selected real method and final quote.
- Purchase: COD only after committed order; PayMongo only after verified paid state.
- Browser and CAPI use `Purchase` plus the same deterministic `purchase_<orderNumber>` ID.
- Invalid/zero/string monetary values are rejected at browser builder, CAPI builder, outbox, and transport guard.
- Meta CAPI is enabled in production; prior Test Events accepted numeric PHP values for one item plus shipping and two items with free shipping.

### Recommendations

- P0: approve and configure the privacy/consent mode.
- P1: add privacy-safe first-party funnel aggregates for ViewContent → AddToCart → Checkout → Payment → Purchase, device class, product, method, failure code, and exit route.
- P1: monitor Meta Diagnostics, Event Match Quality, and deduplication after new real orders; historical warnings can persist after a fix.

## Pancake POS

### Issues

- No destructive live Pancake test was performed in this audit.
- Provider availability and mapping drift remain operational risks even with correct code.

### Fixes/verified behavior

- Order creation commits locally before immediate Pancake export; a provider failure does not delete the order.
- Deterministic outbox/link records prevent duplicate provider orders and preserve retry state.
- Catalog/SKU mapping, inventory reconciliation, order export, inbound polling/webhook, tracking/status/payment mapping, and stale-update protection have automated coverage.
- Existing production audits report complete catalog/inventory cycles, no active mapping conflicts, and synchronized linked orders.
- Customer pages do not expose Pancake IDs, errors, API endpoints, or credentials.

### Recommendations

- P0: for the controlled post-deploy orders, verify exactly one Pancake order, correct item/SKU/size/quantity, COD or prepaid state, grand total, and inventory.
- P1: alert the owner on blocked/failed outbox events, mapping conflicts, or stale inventory cycles.
- P1: keep periodic recovery polling even when the authenticated webhook is active.

## Error States and Recovery

### Issues

- Payment instructions are blank, so provider cancellation/retry confidence depends mostly on runtime error copy.
- Password recovery is missing.
- External media failure remains possible for Shopify-hosted product images.

### Fixes

- Customer errors are sanitized; stack traces, database errors, PayMongo secrets, and Pancake provider details are not returned.
- Stock errors identify the product/size/quantity rather than exposing internal variant IDs.
- Empty collection and missing-size-chart messages are now customer-facing.
- Duplicate-submit, stale quote, changed cart, expired checkout, sold-out upsell, and changed total have guarded recovery paths.
- Admin email failure does not cancel the order and has a protected resend action.

### Recommendations

- P1: add approved payment-cancelled/session-expired recovery text and retain the review draft.
- P1: add password reset.
- P2: add a product-image fallback with Messenger/contact action when all real images fail.

## Accessibility and Usability

### Issues

- Checkout/auth placeholders previously served as labels.
- Size-chart and Report Issue modals previously lacked the shared focus trap.
- Some secondary links and compact gallery controls remain smaller than ideal touch targets.

### Fixes

- Visible form labels, autocomplete, input modes, error association, first-error focus, dialog focus trap, Escape close, background scroll lock, and focus restoration were added/verified.
- No audited image lacked `alt`; decorative gallery thumbnails use empty alternative text appropriately.
- No 320–1440 px document overflow was observed.

### Recommendations

- P1: run axe/WCAG checks in CI and manually test VoiceOver/TalkBack.
- P2: increase remaining compact touch targets and confirm focus contrast on every customer/admin action.
- P2: honor reduced motion for ticker, carousel, and page transitions if not already covered globally.

## Admin Editability

Implemented admin controls include banners, hero text/CTAs, collection definitions/order/visibility, logos, social links, info pages, contact data, shipping rates/free-shipping threshold, payment method visibility, Meta settings, authentication provider toggles, product content/size chart/review settings, reviews/import/moderation, discounts, inventory threshold, orders, customers, payments, Pancake, and issue reports.

Remaining gaps:

- Recommendation ranking/placement has no dedicated admin control.
- Responsive image crops/derivatives are not administered.
- Product/collection SEO fields are not fully rendered to initial HTML.
- Funnel reporting and experiment assignment are absent.

## Recommended New Features

| Feature | Expected impact | Difficulty | Risk | Required admin controls | Backend/third party |
| --- | --- | --- | --- | --- | --- |
| Product search + availability/size filters | High as catalog grows | Medium | Low | Search visibility, filter order | Search endpoint/index eventually |
| Responsive image pipeline | High mobile speed | Medium | Medium | Crop/focal point, alt text | Image transform/storage service or Sharp jobs |
| Real review highlights/photo strip | High trust | Low after content exists | Low if published-only | Select/feature real published reviews | Existing review DB |
| Password reset | High account retention | Medium | Medium security | Email templates/status | SMTP/Resend + signed expiring tokens |
| Back-in-stock alerts | Medium | Medium | Consent/spam | Per-product alert toggle/log | Email/SMS provider, dedupe |
| Recently viewed | Medium | Low | Privacy/storage | Global toggle | Local/session storage; no third party |
| Saved cart | Medium | Medium | Stale stock/prices | Expiry and restore controls | Customer/cart session DB |
| Abandoned checkout email | Medium | Medium | Consent/spam/privacy | Consent, delay, frequency, disable | Email provider + durable outbox |
| Better related products | Medium | Medium | Bad relevance | Ranking/fallback/exclusions | Product metadata; order aggregates later |
| Wishlist | Low–medium | Medium | Account complexity | Enable/disable | Customer DB |
| Bundles/complete the look | Medium | High | Wrong discount/stock | Bundle products, price, eligibility | Authoritative quote/order changes |
| Delivery estimate by region | Medium | Medium | Promise accuracy | Region SLA/calendar | Existing region data; optional courier feed |
| First-party funnel dashboard | High decision quality | Medium | Privacy | Retention/consent | Event aggregate store |
| Loyalty/referrals | Unproven | High | Fraud/liability | Full program controls | New ledger/provider |

## Priority Roadmap

### P0 — Before Deployment

1. Correct Terms/FAQ/payment instructions for real COD + PayMongo rules.
2. Correct CURIOSITY OFFWHITE color content and verify all product facts.
3. Decide and configure Meta consent with privacy/legal approval.
4. Deploy this changeset after backup; verify sitemap, HSTS, asset caching, health, and mobile fixes.
5. Run one controlled COD and one controlled PayMongo order; verify database totals, inventory, admin email, Thank You, Pancake, Meta event ID/value, and no duplicate on retry/refresh.
6. Run nginx container validation in the deployment environment; the local Docker daemon was unavailable during this audit.

### P1 — First 30 Days

1. Remove unintended `Copy` names and complete product content/image/size audits.
2. Add approved PayMongo/payment-recovery content.
3. Moderate real reviews and enable published reviews/ratings when evidence exists.
4. Build responsive images and defer inactive hero media.
5. Add product/collection SEO, OG, sitemap robots declaration, and real structured data.
6. Replace product-list order scans with an indexed aggregate and safe cache invalidation.
7. Add search and lightweight filters.
8. Add password reset.
9. Add first-party funnel and provider-failure monitoring.
10. Enforce CSP only after reviewing report-only violations and adapting the Meta bootstrap with a nonce/hash.

### P2 — Next 60–90 Days

1. Recently viewed and saved cart.
2. Back-in-stock notifications with explicit consent and deduplication.
3. Better related-product ranking and admin controls.
4. Mobile sticky Add to Cart experiment.
5. Customer photo/review gallery after real content volume exists.
6. Real OAuth setup if the business will maintain provider credentials.
7. iOS Safari/Android device regression suite and automated accessibility checks.

### P3 — Future Tests

1. Wishlist if returning-customer usage justifies it.
2. Bundles/complete-the-look after authoritative bundle pricing/stock design.
3. Loyalty or referral program only with a fraud-resistant ledger and clear terms.
4. Advanced personalization only after consented event volume and an experiment platform exist.

## Prioritized Recommendation Ledger

| Priority | Problem | Customer impact | Solution | Conversion impact | Effort | Affected files/components | Fixed | Test result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Terms contradict PayMongo | Payment distrust | Owner-approved content update | High | Low | Admin Settings/info pages | No | Live contradiction confirmed |
| P0 | OFFWHITE says black | Returns/distrust | Correct verified product copy | High | Low | Admin Product Editor | No | Live content confirmed |
| P0 | Consent mode unapproved | Privacy/trust risk | Approve lawful mode; preferably gate optional Meta until consent | Risk reduction | Low | Meta settings, privacy UI | No | Live `requireConsent:false` |
| P0 | Current patch not deployed | Fixes absent live | Backup/deploy/smoke | High | Low | Deployment stack | No | Live sitemap 404; local 200 |
| P0 | No new destructive live checkout test | Provider edge uncertainty | Controlled COD + PayMongo test | Critical | Medium | Full commerce stack | No | Automated only |
| P1 | Mobile floating cluster obscured content | Product CTA/title obstruction | Hide mobile offer dock, compact chat, footer issue link | High | Low | Shell, ReportIssueWidget | Yes | 320 px Playwright passed |
| P1 | Checkout/auth labels missing | Errors/autofill/accessibility | Persistent labels and described errors | High | Low | Checkout, CustomerAuth | Yes | Source + browser passed |
| P1 | Disabled OAuth looked broken | Trust/friction | Render only enabled provider links | Medium | Low | Checkout, CustomerAuth | Yes | Live providers off; source passed |
| P1 | Sold-out product recommendations | Dead-end upsell | Filter real stock, rank related collection | Medium | Low | Product | Yes | Source test passed |
| P1 | Cart upsell picked size silently | Wrong item/abandonment | Require in-stock size selection | High | Low | Cart | Yes | Source/build passed |
| P1 | Modal focus incomplete | Keyboard/mobile usability | Shared focus trap/restore | Medium | Low | Product, ReportIssueWidget | Yes | Browser focus passed |
| P1 | Live sitemap missing | Index discovery | Dynamic real-data sitemap | Medium | Low | API, nginx | Code fixed | API test 200; deploy pending |
| P1 | HSTS/assets caching absent | Security/repeat speed | HSTS + immutable hashed assets | Medium | Low | nginx | Code fixed | Source test; deploy pending |
| P1 | Product/collection initial SEO generic | Weak search/share CTR | SSR/edge metadata + real schema | Medium–high | High | nginx/API/React head | No | Source/live inspection |
| P1 | Images dominate transfer | Slow mobile data | Responsive variants, active hero first | High | Medium | Home, ProductCard, Product, media backend | No | 1.6–3.5 MB image transfer measured |
| P1 | Catalog endpoint scans orders/no-store | Scales poorly | Indexed sales aggregate + invalidated cache | Medium | Medium | products route/repositories | No | Source inspection |
| P1 | Reviews off/zero | No social proof | Publish only real moderated reviews | High | Content-dependent | Admin Reviews/settings | No | Live settings/data confirmed |
| P1 | Password reset missing | Locked-out customers | Secure email reset | Medium | Medium | customer auth/email | No | Route/source search |
| P1 | Search absent | Product discovery friction | Search + compact filters | Medium now, high later | Medium | Shell, Collection, API | No | Source/browser inspection |
| P1 | CSP report-only | Reduced exploit protection | Review reports, nonce/hash inline bootstrap, enforce | Security | Medium | nginx/index | No | Live header confirmed |
| P1 | Payment explanations blank | PayMongo hesitation | Approved method/cancel/retry copy | High | Low | Admin settings/CheckoutReview | No | Live settings confirmed |
| P1 | Product `Copy` names | Unfinished-store signal | Verify/rename in admin | Medium | Low | Product records | No | Live data confirmed |
| P2 | Recently viewed absent | Lost rediscovery | Session/local recent list | Medium | Low | Product/Shell | No | Source inspection |
| P2 | Back-in-stock absent | Lost demand | Consent-based alerts | Medium | Medium | Product/admin/notifications | No | Source inspection |
| P2 | Recommendation controls absent | Relevance ceiling | Admin ranking/exclusion controls | Medium | Medium | Admin settings/recommendation lib | No | Source inspection |
| P2 | Abandoned email absent | Unrecovered intent | Consent, durable delayed outbox, dedupe | Medium | Medium | Cart sessions/admin/email | No | Draft tracking exists |
| P2 | Social OAuth off | More login typing | Configure real providers or keep hidden | Low–medium | Medium/manual | OAuth settings/env | UI fixed | Live status both false |
| P3 | No experiment assignment | Cannot attribute UI variants | First-party stable assignment + event metrics | Enables learning | Medium | Analytics/admin | No | Source inspection |
| P3 | Loyalty/referral absent | Unknown repeat impact | Test only after baseline data | Unknown | High | New services | No | Not recommended yet |

## Changes Implemented

- `apps/api/src/routes/sitemap.js` — generates XML from real public product handles and visible collection definitions; excludes private/transactional routes.
- `apps/api/src/app.js` — mounts `/sitemap.xml`.
- `apps/api/test/health.test.js` — verifies real sitemap content, headers, and route exclusions.
- `apps/web/nginx.conf` — proxies sitemap, adds HSTS, and caches hashed assets for one year.
- `apps/web/src/components/Shell.jsx` — removes the obstructive mobile offer dock, makes Messenger icon-only on mobile, and adds mobile footer Report Issue access.
- `apps/web/src/components/ReportIssueWidget.jsx` — supports an inline mobile trigger and shared accessible modal focus handling.
- `apps/web/src/pages/Checkout.jsx` — adds visible labels/errors, hides unconfigured OAuth methods, and changes CTA to “Review order.”
- `apps/web/src/pages/CustomerAuth.jsx` — displays only configured OAuth providers and adds visible email/password/registration labels.
- `apps/web/src/pages/Product.jsx` — filters/ranks real in-stock recommendations, fixes dialog focus, improves missing-chart copy, and removes the React image attribute warning.
- `apps/web/src/pages/Cart.jsx` — requires an explicit in-stock size for recommended add-ons and removes COD-only upsell copy.
- `apps/web/src/pages/Account.jsx` — replaces COD-only account reminder with payment-neutral delivery/status copy.
- `apps/web/src/pages/Collection.jsx` — replaces internal empty-collection language.
- `apps/web/src/pages/SizeChart.jsx` — replaces internal configuration language with a customer support action.
- `apps/web/test/cartUpsellSource.test.js` — covers size-explicit upsells.
- `apps/web/test/customerMobilePolishSource.test.js` — covers checkout labels, sold-out recommendation filtering, and size-chart focus wiring.
- `apps/web/test/customerOAuthSource.test.js` — rejects fake/disabled provider presentation.
- `apps/web/test/customerThankYouCheckoutSource.test.js` — covers the clearer checkout CTA.
- `apps/web/test/issueReportsSource.test.js` — covers inline mobile trigger and modal focus.
- `apps/web/test/securityHeadersSource.test.js` — covers HSTS and hashed-asset caching.
- `apps/web/test/storefrontCollections.test.js` — covers customer-safe empty collection copy.
- `apps/web/test/storefrontEnhancements.test.js` — covers compact support and non-obstructive offer behavior.
- `WEBSITE_CONVERSION_AND_SALES_AUDIT.md` — this audit and roadmap.
- `SALES_EXPERIMENT_PLAN.md` — controlled test plan; no competing variants were implemented.

## Tests Performed

- API suite: **445 total; 443 passed; 0 failed; 2 skipped** because `TEST_POSTGRES_URL` is not configured.
- Frontend source/unit suite: **203 passed; 0 failed** in the final verification run.
- Vite production build: passed. Main shared JS approximately **285.85 kB raw / 88.09 kB gzip**.
- Production dependency audit: `npm audit --omit=dev --audit-level=high` reported **0 vulnerabilities**.
- Backend syntax: modified CommonJS files passed `node --check`; Express has no compile step.
- Live responsive browser matrix: 10 routes × 6 widths (320, 360, 390, 430, 768, 1440), HTTP 200, no page-level horizontal overflow, no broken visible images, and no page exceptions.
- Live customer path: homepage → product → size chart → Add to Cart → cart → checkout validation. No live order/payment was created.
- Post-fix 320 px Playwright: mobile offers hidden, compact chat, checkout labels visible, phone error described, first invalid field focused, size-chart focus trapped/restored, local sitemap populated, zero console errors.
- Live performance: isolated mobile/desktop home, collection, and product measurements shown above.
- Live public checks: health 200; Google/Facebook OAuth both disabled; COD and PayMongo enabled; reviews disabled; correct official social links; sitemap pre-deploy 404; robots 200; CSP report-only.
- Docker/nginx runtime validation: **not run locally because the Docker daemon was not running**. The Vite build and nginx source tests passed; deployment must run container `nginx -t`/health checks.
- Lint/typecheck: no lint or TypeScript/type-check scripts are defined in this JavaScript project.

Automated coverage includes one/multi-item COD, quantities, discounts, shipping/free shipping, PayMongo paid/pending/failed/cancelled, stock failure/sold-out, idempotency, inventory movements, Pancake failures/retries, Meta values/deduplication, reviews with/without records, admin permissions, customer accounts, and email notification failure. The two skipped tests are the optional real-PostgreSQL concurrency/outbox integrations; production PostgreSQL paths have separate historical deployment evidence but should be included in CI through `TEST_POSTGRES_URL`.

## Remaining Manual Setup

1. Owner-approved corrections for Terms, FAQ, PayMongo instructions, OFFWHITE color content, and unintended `Copy` names.
2. Privacy/legal decision for Meta consent; configure `requireConsent` accordingly.
3. Deploy with the standard production backup, migration, and rollback workflow.
4. Verify `/sitemap.xml`, HSTS, `/assets/` cache headers, robots sitemap declaration, canonical domain, and Cloudflare behavior.
5. Run container/nginx validation because local Docker was unavailable.
6. Complete controlled COD and PayMongo production orders and compare:
   - checkout/admin/Thank You/database grand total;
   - inventory movement and current stock;
   - one admin email;
   - exactly one Pancake order with correct payment/items;
   - one deduplicated Meta Purchase with numeric PHP value;
   - no duplicate after refresh/retry/webhook repeat.
7. Configure `TEST_POSTGRES_URL` in CI so the two optional PostgreSQL integration tests run on every release.
8. Moderate and publish real reviews before enabling customer-facing review/rating toggles.
9. Review CSP violation telemetry before enforcing CSP.
10. Configure Search Console and submit the sitemap after deployment.

## Final Recommendation

**Not ready to deploy as-is.**

The application code is close and the safe conversion fixes are implemented. Deploy only after P0 content/privacy decisions are complete and the controlled production COD/PayMongo acceptance flow passes. If those gates pass, there is no known critical checkout, totals, inventory, Pancake, Meta Purchase, or mobile-layout defect in the audited implementation.
