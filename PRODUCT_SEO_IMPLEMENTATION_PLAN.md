# Maria Clara Clothing Product SEO Implementation Plan

Plan date: 2026-07-17
Release status: **Not Ready**

## Status Definitions

- **Verified existing**: observed in the live site and committed baseline behavior.
- **Worktree draft — unverified**: uncommitted code exists in the shared worktree, but it is not counted complete and may change.
- **Not started**: no complete implementation was verified.
- **Owner input required**: publication is blocked by missing or contradictory business/product facts.
- **Release blocked**: must pass before production SEO sign-off.

SEO Content Completeness is an internal checklist label only. It is not a Google ranking score.

## P0 — Immediate

### SEO-001 — Preserve product SEO and facts through the public catalog pipeline

- Priority: P0
- Status: Worktree draft — unverified; release blocked
- Page/product affected: all 18 products, product API, initial HTML, schema, sitemap, Merchant feed
- Owner: Backend developer
- Effort: Medium
- Problem: the public repository projection drops SEO, metafields, category/type/vendor/tags, and timestamps before the presenter reads them.
- SEO impact: custom metadata and confirmed structured attributes do not reach crawlers; sitemap last-modified is empty.
- Conversion impact: storefront and shopping listings cannot consistently use the same facts shoppers see.
- Suggested solution: forward additive fields through the repository-to-presenter boundary while preserving the existing catalog-derived public ID used by cart/order flows.
- Developer work: update projection/presenter, both JSON and PostgreSQL modes, fallback resolution, and regression coverage.
- Content work: none until the pipeline passes; then review the live database values.
- Required data: one product fixture with custom SEO, color, material, fit, GSM, gender, age group, and timestamps.
- Files affected: apps/api/src/products/catalogRepository.js; apps/api/src/products/catalogPresenter.js; related catalog, SEO, sitemap, and feed tests.
- Admin changes required: none for the pipeline itself.
- Expected benefit: makes every later product metadata, schema, feed, audit, and freshness feature functional.
- Validation method: assert repository > presenter > public API > SSI > JSON-LD/feed/sitemap preservation in JSON and PostgreSQL tests; run checkout regression to confirm product IDs are unchanged.

### SEO-002 — Centralize all client-route metadata

- Priority: P0
- Status: Not started; release blocked
- Page/product affected: every public, private, product, collection, guide, support, and 404 route
- Owner: Frontend developer
- Effort: Large
- Problem: Product, Collection, Guide, NotFound, and store settings independently mutate incomplete portions of the document head; old Product schema and robots/canonical values can persist after navigation.
- SEO impact: rendered DOM may describe the previous page or leave an indexable page noindex.
- Conversion impact: incorrect social previews and titles reduce trust when URLs are shared.
- Suggested solution: create one SEO component/service owning title, description, canonical, robots, OG, Twitter, product price fields, page image, and keyed JSON-LD.
- Developer work: implement the component, share resolver rules with server SEO, migrate every route, and remove restore-previous cleanup behavior.
- Content work: provide page-specific fallback copy where absent.
- Required data: route metadata matrix and canonical/index rules.
- Files affected: new apps/web/src/components/SEO.jsx or equivalent; apps/web/src/pages/*.jsx; apps/web/src/components/Shell.jsx; apps/web/src/lib/storeSettings.js.
- Admin changes required: custom fields must override fallbacks.
- Expected benefit: correct metadata during direct loads and SPA transitions.
- Validation method: Playwright navigate public > product > collection > cart > product > 404 and assert exactly one current title, description, canonical, robots, OG/Twitter set, and correct schema scripts at each step.

### SEO-003 — Remove the empty Tees collection from the index until populated

- Priority: P0
- Status: Not started; owner decision required; release blocked
- Page/product affected: /collections/tees, Shop navigation, sitemap
- Owner: Ecommerce owner and backend developer
- Effort: Small
- Problem: Tees is HTTP 200, indexable, self-canonical, linked, and in the sitemap with zero products.
- SEO impact: empty/thin indexable category and conflicting broad keyword target.
- Conversion impact: shoppers land on an empty grid.
- Suggested solution: either assign the correct products or automatically noindex, remove from sitemap, and suppress from navigation until at least one active member exists.
- Developer work: central collection indexability resolver used by page descriptor, sitemap, navigation API, and audit.
- Content work: approve membership and collection copy before indexing.
- Required data: owner-approved Tees product membership and target keyword.
- Files affected: apps/api/src/seo/storefrontSeo.js; apps/api/src/routes/sitemap.js; apps/web/src/lib/storefrontCollections.js; Shop/Shell collection navigation.
- Admin changes required: show product count and an “empty collections are excluded” warning.
- Expected benefit: eliminates a thin landing page and protects the broad Tees topic for a useful page.
- Validation method: zero-member collection returns noindex and is absent from sitemap/navigation; populated collection returns index/follow and appears once.

### SEO-004 — Give collections true 404s and permanent slug history

- Priority: P0
- Status: Worktree draft — unverified; release blocked
- Page/product affected: every /collections/:slug route
- Owner: Backend/deployment developer
- Effort: Medium
- Problem: unknown collections return HTTP 200 noindex; changed collection slugs have no verified production redirect history.
- SEO impact: soft 404s and lost URL signals.
- Conversion impact: stale links show an unavailable page rather than the correct collection.
- Suggested solution: route collections through a resolver like products; current slug renders, recorded prior slug redirects in one hop, missing slug returns 404.
- Developer work: collection resolver, distinct URL aliases, nginx routing, status tests, duplicate-route validation.
- Content work: none beyond approving intentional slug changes.
- Required data: current and prior collection slugs.
- Files affected: apps/api/src/routes/collections.js; apps/api/src/app.js; apps/api/src/settings/storeSettingsRepository.js; apps/web/nginx.conf; collection route tests.
- Admin changes required: display previous URL slugs and warn before changing the current slug.
- Expected benefit: preserves authority and eliminates soft 404s.
- Validation method: current slug 200; prior slug one permanent redirect; unknown slug 404; no redirect chains; query tracking does not enter canonical.

### SEO-005 — Restore verified legacy Shopify URLs

- Priority: P0
- Status: Partial worktree draft — unverified; owner/search-data input required
- Page/product affected: old /products, /pages, and collection URLs
- Owner: SEO lead and deployment developer
- Effort: Medium
- Problem: known indexed URLs /products/oranges-mcc-box-tee and /pages/terms-of-use return 404.
- SEO impact: inbound links and historical signals are lost.
- Conversion impact: returning users and shared links hit errors.
- Suggested solution: proxy plural product handles directly to the existing alias resolver; maintain a reviewed static/data redirect map for old pages and collections.
- Developer work: one-hop plural route; versioned redirect map; loop/chain protection.
- Content work: map each old page to the closest equivalent, never the homepage by default.
- Required data: Search Console indexed/not-found URLs, prior sitemap, analytics landing pages, old platform exports.
- Files affected: apps/web/nginx.conf and/or a dedicated redirect configuration/service; redirect tests.
- Admin changes required: optional read-only redirect inventory/status screen.
- Expected benefit: recovers qualified legacy traffic and links.
- Validation method: every approved source returns 301/308 once to an HTTP 200 canonical; unrelated URLs remain 404.

### SEO-006 — Enforce public-review visibility in review schema

- Priority: P0
- Status: Worktree draft — unverified; release blocked before reviews are enabled
- Page/product affected: all products with reviews
- Owner: Backend developer and review moderator
- Effort: Medium
- Problem: baseline schema adds AggregateRating from published summaries without all global/product visibility gates.
- SEO impact: rating markup can exist when the rating is hidden, violating structured-data policy.
- Conversion impact: visible and search-displayed ratings can disagree.
- Suggested solution: one predicate requiring global reviews enabled, product-page display enabled, product reviews enabled, summary enabled, published/public reviews, and an exact visible average/count.
- Developer work: use the predicate in SSI, client schema, product API, and review UI; serialize only safe public fields.
- Content work: moderate reviews; verify product assignment and ratings.
- Required data: published status, rating, public name/text/date, display flags; never email, phone, address, order ID, or private social data.
- Files affected: apps/api/src/seo/storefrontSeo.js; product SEO resolver; review repository/routes; apps/web/src/pages/Product.jsx; ProductReviews.
- Admin changes required: clear moderation and visibility status.
- Expected benefit: compliant real review enhancements and consistent shopper trust.
- Validation method: toggle every flag; hidden/pending/deleted reviews never appear; visible UI average/count exactly matches JSON-LD.

### SEO-007 — Resolve factual contradictions before feed/schema publication

- Priority: P0
- Status: Owner input required; release blocked for affected records
- Page/product affected: MariaClara Rockstar, Daruma, Hawak, Imperial, Mandala Black/White, The Good Time, Wanna Gray, and any product with conflicting facts
- Owner: Ecommerce owner/content lead
- Effort: Medium
- Problem: Rockstar says gray and red in different fields; several pages claim 3XL while live variants end at 2XL; some gallery alts name another product.
- SEO impact: contradictory entity data weakens relevance and can cause Merchant mismatch.
- Conversion impact: customers can receive the wrong color/size expectation.
- Suggested solution: verify product against real photos, variants, and manufacturing records; correct all visible, structured, feed, and image fields together.
- Developer work: add contradiction/wrong-product-alt/size-range warnings and block feed attributes when conflicting.
- Content work: owner approval and corrected copy.
- Required data: product photos, physical color name, real variant range, material/GSM records, approved care.
- Files affected: product database/admin content; SEO audit service; Merchant feed resolver.
- Admin changes required: “needs owner confirmation” state and warnings.
- Expected benefit: accurate product discovery and fewer customer/merchant errors.
- Validation method: product page, public API, JSON-LD, feed, admin, and image alt all agree.

### SEO-008 — Establish a release-blocking SEO regression suite

- Priority: P0
- Status: Not started as a complete gate
- Page/product affected: homepage, Shop, three collections, representative products, support pages, sitemap, robots, feed, private routes, redirects
- Owner: QA/developer
- Effort: Large
- Problem: individual source/tests exist, but there is no complete release gate for the requested SEO and transaction matrix.
- SEO impact: metadata/index/schema defects can ship unnoticed.
- Conversion impact: SEO changes could break cart, checkout, payments, inventory, reviews, Pancake, or Meta tracking.
- Suggested solution: add unit/integration/route/Playwright/XML/link/mobile tests and make them required in CI.
- Developer work: cover source HTML and post-navigation DOM; compare price/stock/feed; crawl links; test 320/360/390/430/tablet/desktop.
- Content work: provide expected metadata fixtures.
- Required data: product with/without reviews, in/out stock, variants, oversized/regular/crop, old aliases.
- Files affected: apps/api/test; apps/web/test; apps/web/e2e; CI workflow.
- Admin changes required: none.
- Expected benefit: safe deployment with measurable evidence.
- Validation method: all tests and production build pass twice against the Docker/nginx stack; no type/lint pass may be claimed because those scripts are not configured.

## P1 — First 30 Days

### SEO-009 — Publish reviewed metadata and unique content for all 18 products

- Priority: P1
- Status: Not started in production; owner input required
- Page/product affected: all live products listed in the audit
- Owner: Content lead with ecommerce owner approval
- Effort: Large
- Problem: current titles/descriptions are often too long for common layouts, two descriptions are identical, and many openings are templated.
- SEO impact: weak snippet control and limited product-specific relevance.
- Conversion impact: generic copy does not explain the unique design or reduce uncertainty.
- Suggested solution: use the audit’s title/meta recommendations and description framework; preserve originals as revision history.
- Developer work: enable drafts/versioning and ensure saved values reach every channel.
- Content work: write unique visual/design copy, normalize naming, and retain confirmed fit/fabric/GSM/size/origin/shipping facts.
- Required data: product photography, design meaning/placement, real sizes, fabric/GSM, care, origin.
- Files affected: production database/admin; no bulk seed-only update can be considered authoritative.
- Admin changes required: draft/review state, preview, and completeness warnings.
- Expected benefit: clearer long-tail relevance and stronger search-to-product intent.
- Validation method: uniqueness scan; no unsupported facts; title/meta render in initial HTML and client navigation; owner sign-off per product.

### SEO-010 — Complete product SEO fields in Admin

- Priority: P1
- Status: Data-model worktree draft — unverified; UI not started
- Page/product affected: Admin > Products > Product Editor
- Owner: Full-stack developer
- Effort: Large
- Problem: only SEO title, meta description, handle, and image alts are currently editable.
- SEO impact: canonical, index, channel, keyword, and OG controls cannot be intentionally managed.
- Conversion impact: incorrect social/share previews and channel titles can reduce qualified clicks.
- Suggested solution: add main/secondary keywords, canonical override, index/noindex, OG title/description/image, marketplace/feed title, main image alt, and search preview.
- Developer work: normalize plain text, safe same-origin canonical, HTTPS/local image URLs, length warnings, duplicate detection, JSON/PostgreSQL persistence.
- Content work: populate fields from the approved product matrix.
- Required data: approved titles/descriptions/keywords/images.
- Files affected: apps/web/src/admin/ProductEditor.jsx; apps/api/src/routes/admin.js; apps/api/src/products/catalogRepository.js; admin tests.
- Admin changes required: all listed fields plus nonblocking completeness warnings.
- Expected benefit: maintainable channel-specific SEO without code deployments.
- Validation method: save/reload in both storage modes; custom overrides win; empty fields use readable fallbacks; scripts/unsafe HTML rejected.

### SEO-011 — Complete collection SEO fields and introductions

- Priority: P1
- Status: Storage worktree draft — unverified; UI/storefront usage incomplete
- Page/product affected: Admin Collections and three public collections
- Owner: Full-stack developer and content lead
- Effort: Large
- Problem: collection admin lacks SEO title/meta, intro/supporting copy, canonical, index status, OG image, and URL history UI.
- SEO impact: collection snippets and broad keyword ownership cannot be controlled.
- Conversion impact: collections do not consistently orient shoppers.
- Suggested solution: add the fields, separate concise intro from below-grid supporting content, and automatically noindex empty collections.
- Developer work: storage normalization, public API, editor, preview, duplicate warnings, route/sitemap integration.
- Content work: approve Freedom of Mind, New Arrivals, and populated Tees copy.
- Required data: membership, collection positioning, approved images, keyword ownership.
- Files affected: apps/api/src/settings/storeSettingsRepository.js; apps/api/src/seo/storefrontSeo.js; apps/web/src/admin/Collections.jsx; apps/web/src/pages/Collection.jsx.
- Admin changes required: complete collection SEO panel and previous-slug display.
- Expected benefit: useful commercial landing pages and controlled indexability.
- Validation method: save/reload; above-grid intro concise; empty noindex; metadata and OG render server/client; old slug redirects once.

### SEO-012 — Add Admin > Marketing > SEO dashboard and secure export

- Priority: P1
- Status: API worktree draft — unverified; route/UI not wired
- Page/product affected: all products and collections; admin
- Owner: Full-stack developer
- Effort: Large
- Problem: existing content-readiness view misses duplicate metadata, wrong/repeated alt, collection state, canonicals, index status, and structured-data/feed issues.
- SEO impact: defects are hard to find and maintain.
- Conversion impact: incomplete product content remains unnoticed.
- Suggested solution: dashboard filters, direct edit links, technical status, and CSV export with required columns.
- Developer work: audit service, authenticated routes, React screen, navigation, filters, safe CSV formula escaping, tests.
- Content work: resolve flagged records.
- Required data: live editable products and collection settings.
- Files affected: apps/api/src/seo/seoAudit.js; apps/api/src/routes/admin.js; new admin SEO page; App/AdminLayout/nginx route; tests.
- Admin changes required: dashboard and CSV button; score labeled “SEO Content Completeness.”
- Expected benefit: repeatable catalog QA and faster editorial cleanup.
- Validation method: counts match database; wrong-product alts and duplicates detected; CSV contains Product ID, SKU, name, URL, SEO fields, alt, index, score, schema status, updated time; unauthorized access rejected.

### SEO-013 — Complete Product and Offer markup from confirmed data

- Priority: P1
- Status: Worktree draft — unverified
- Page/product affected: all products
- Owner: Backend developer
- Effort: Medium
- Problem: baseline Product lacks top-level URL, seller, confirmed facts, and consistent server/client data.
- SEO impact: reduced merchant-listing understanding.
- Conversion impact: search previews may lack accurate shopping facts.
- Suggested solution: one resolver for Product name/description/images/SKU/brand/url/category and Offer priceCurrency PHP, numeric price, availability, condition, seller; include color/material/size only when confirmed.
- Developer work: initial-HTML schema, safe JSON serialization, client parity, tests.
- Content work: confirm product facts.
- Required data: SKU, stock, price, brand, color/material, actual sizes.
- Files affected: apps/api/src/seo/productSeo.js or equivalent; storefrontSeo; Product page/client SEO.
- Admin changes required: fact completeness warnings.
- Expected benefit: valid, synchronized product understanding.
- Validation method: Rich Results Test, Schema.org Validator, JSON tests, and visible price/stock comparison for in-stock and sold-out products.

### SEO-014 — Align visible and structured breadcrumbs and internal links

- Priority: P1
- Status: Not started
- Page/product affected: Shop, collections, products, guides, size, FAQ, shipping
- Owner: Frontend/backend developer
- Effort: Medium
- Problem: product and collection visible breadcrumbs differ from BreadcrumbList; product support links are modal/noncontextual.
- SEO impact: inconsistent hierarchy and weaker crawl paths.
- Conversion impact: shoppers have fewer clear paths to related categories/help.
- Suggested solution: one breadcrumb resolver using Home > Shop > selected collection > product; add crawlable parent collection, size guide, shipping, and related-product links.
- Developer work: shared resolver/UI/schema; choose deterministic parent collection.
- Content work: approve descriptive link anchors.
- Required data: collection membership/priority.
- Files affected: storefrontSeo; Breadcrumbs; Product; Collection; Shop; support pages.
- Admin changes required: optional primary collection selection if products belong to several.
- Expected benefit: clearer hierarchy, no orphan risk, stronger product discovery.
- Validation method: UI and JSON-LD item names/URLs/positions match exactly at mobile and desktop widths.

### SEO-015 — Correct gallery alt text and optimize remaining heavy media

- Priority: P1
- Status: Owner/visual review required; not completed
- Page/product affected: all 18 products, especially Mandala Black, Rockstar, Wanna Gray, Daruma, MariaClara Orange
- Owner: Content/photo lead and frontend/backend developer
- Effort: Large
- Problem: 17 products repeat alt text; several name the wrong product; one PNG is 877,301 bytes.
- SEO impact: weak or incorrect image understanding.
- Conversion impact: poor accessibility and unnecessary mobile transfer.
- Suggested solution: visually label each angle/detail; correct wrong identity; generate responsive optimized derivative while preserving old URL.
- Developer work: duplicate/wrong-name audit, dimensions/srcset, collection hero loading, upload naming/angle metadata.
- Content work: inspect every image and approve alt; obtain additional real media for products with only two images.
- Required data: actual image contents and photographer/product records.
- Files affected: production image records; image normalizer/audit; responsive components; admin editor.
- Admin changes required: angle/type selector and duplicate warning.
- Expected benefit: better accessibility, image discovery, and mobile performance.
- Validation method: no wrong-product alt; appropriate unique angle alts; decorative duplicates empty; responsive requests verified; no broken old URL.

### SEO-016 — Render support content in initial HTML

- Priority: P1
- Status: Not started
- Page/product affected: FAQ, shipping/returns, terms, size guide
- Owner: Backend/frontend developer
- Effort: Medium
- Problem: initial SSI fallback contains only headings while actual sections require JavaScript.
- SEO impact: crawlers/bots that delay or ignore JS receive thin support pages.
- Conversion impact: slower content visibility on constrained devices.
- Suggested solution: feed current visible settings sections into the same server descriptor/body; optionally emit FAQPage only for identical visible Q&A.
- Developer work: shared content resolver and fallback renderer.
- Content work: review current policy/help wording.
- Required data: live settings content.
- Files affected: apps/api/src/seo/storefrontSeo.js; info-page components/tests.
- Admin changes required: preview of crawlable page content.
- Expected benefit: complete initial HTML and stronger support-query relevance.
- Validation method: fetch source without JS and confirm every visible heading/answer/policy section is present and matches React.

### SEO-017 — Make the Merchant feed submission-ready

- Priority: P1
- Status: Worktree draft — unverified; owner data required
- Page/product affected: 97 live variant items / all 18 products
- Owner: Backend developer, ecommerce owner, Merchant Center administrator
- Effort: Large
- Problem: color, material, gender, and age group are absent; feed/landing synchronization and channel setup are unverified.
- SEO impact: apparel offers may be incomplete or ineligible.
- Conversion impact: mismatched listings create poor landings and disapprovals.
- Suggested solution: add confirmed attributes, stable variant IDs/groups, canonical links, and appropriate caching; configure account shipping/returns.
- Developer work: feed resolver, XML validation, availability/price comparison, noindex exclusion, material support, optional current variant_option support after review.
- Content work: confirm channel title/description, color, material, gender, age group, and product type.
- Required data: all required apparel attributes and Merchant account configuration.
- Files affected: apps/api/src/routes/merchantFeed.js; product SEO resolver; feed tests.
- Admin changes required: feed readiness/warnings per product.
- Expected benefit: eligible, accurate free listings and shopping discovery.
- Validation method: parse XML; compare 97 items to site/API; submit test data source and clear Needs Attention before activation.

### SEO-018 — Improve semantic product sections and complete mobile QA

- Priority: P1
- Status: Not started
- Page/product affected: product and collection templates
- Owner: Frontend developer/QA
- Effort: Medium
- Problem: product tabs are buttons without all logical H2 section headings; requested viewport matrix is untested.
- SEO impact: weaker document outline and unverified mobile parity.
- Conversion impact: content, size selection, breadcrumbs, or add-to-cart may be difficult at small widths.
- Suggested solution: semantic H2 sections/panels, accessible tabs, identical essential content, stable tap targets and images.
- Developer work: markup/CSS/accessibility adjustments and Playwright viewport suite.
- Content work: concise section labels.
- Required data: representative product fixtures.
- Files affected: apps/web/src/pages/Product.jsx; ProductReviews; Collection; CSS; e2e tests.
- Admin changes required: none.
- Expected benefit: readable mobile purchase flow and clearer content structure.
- Validation method: 320/360/390/430/tablet/desktop for titles, gallery, selectors, add-to-cart, reviews, breadcrumbs, related products, and content parity.

### SEO-019 — Measure and improve real performance bottlenecks

- Priority: P1
- Status: Baseline mechanisms verified; measurements/optimization incomplete
- Page/product affected: homepage, Shop, product, checkout
- Owner: Frontend/performance developer
- Effort: Medium to large
- Problem: no current lab/field targets were captured for this release; heavy gallery media remains.
- SEO impact: poor LCP/INP/CLS can reduce page experience.
- Conversion impact: slow product interactions can reduce views, carts, and checkout starts.
- Suggested solution: capture Lighthouse and field p75 first; prioritize LCP discovery/image, main-thread work, stable dimensions, API latency, and third-party timing.
- Developer work: measure, profile, then optimize; keep main image high priority and later gallery lazy.
- Content work: approve visually acceptable compression.
- Required data: PageSpeed/Lighthouse and existing RUM samples by route/device.
- Files affected: responsive images, page components, CSS/assets, API caching as evidence dictates.
- Admin changes required: retain Web Vitals dashboard and route filtering.
- Expected benefit: faster discovery and purchase interactions; no numerical uplift is promised.
- Validation method: before/after controlled lab runs and live p75, with image quality and checkout regression review.

## Product Content Work Queue for SEO-009

| Product | Required content action | Required owner data | Priority/status |
|---|---|---|---|
| ABOT KAMAY WHITE | Replace duplicate generic opening; add real design detail | Artwork/placement and care | P1 — owner input required |
| BAHALA BLACK | Replace duplicate generic opening; reconcile sale status with zero stock; add unavailable-state alternatives | Artwork/placement and restock/index decision | P0/P1 — status conflict |
| CURIOSITY BLACK | Differentiate visual narrative; unique angle alts | Design meaning/placement | P1 — owner input required |
| CURIOSITY OFF-WHITE | Normalize Off-White and differentiate from black | Color/design differences | P1 — owner input required |
| DARUMA OFF-WHITE | Remove Copy artifacts and correct size range | Real max size; design detail | P0/P1 — contradiction |
| HAWAK WHITE | Add Hawak-specific copy; correct size range | Real max size; artwork | P0/P1 — contradiction |
| IMPERIAL CHOCO TEE | Confirm chocolate color and size; add media | Color, max size, real additional photos | P1 — owner input required |
| INFINITE POSSIBILITIES BLACK | Retain crop-box differentiation; confirm measurements/care | Crop measurements and care | P1 — review |
| KAMALAYAN BLOOM BLACK | Complete angle alts and Bloom narrative | Visual wording | P1 — owner input required |
| KAMALAYAN EYE BLACK | Add design/detail media and narrative | Visual wording/photos | P1 — owner input required |
| MANDALA BLACK V1 | Correct White alts; correct size range | Real max size and design detail | P0 — contradiction |
| MANDALA WHITE V1 | Correct size range; unique angle alts | Real max size and design detail | P0/P1 — contradiction |
| MARIACLARA ORANGE | Build details/shipping/size chart; optimize PNG | 100% cotton/GSM/measurements/care/index decision | P0/P1 — incomplete/sold out |
| MARIACLARA ROCKSTAR | Resolve red versus gray; correct Wanna alts | Physical product color and photos | P0 — release blocked |
| MC ACID BLACK | Add design-specific copy and additional media | Artwork/care/photos | P1 — owner input required |
| MC ACID OFF-WHITE | Differentiate from black and add media | Color/design differences/photos | P1 — owner input required |
| THE GOOD TIME OFF-WHITE | Fix grammar; populate structured details/shipping | Current approved shipping and max size | P1 — incomplete fields |
| WANNA GRAY | Correct The Good Time alts; populate structured details/shipping | Approved shipping and photos | P0/P1 — wrong alt/incomplete fields |

## P2 — Next 60–90 Days

### SEO-020 — Publish an original product-support content cluster

- Priority: P2
- Status: Not started
- Page/product affected: guides, products, collections
- Owner: Content lead with owner review
- Effort: Large
- Problem: commercial pages have limited informational support and the current guide set is small.
- SEO impact: fewer opportunities for informational discovery and contextual internal links.
- Conversion impact: shoppers lack deeper fabric, fit, care, and styling education.
- Suggested solution: original 240 GSM, fit comparison, sizing, approved care, and styling guides.
- Developer work: article route/admin draft support, metadata, canonical, Article schema when valid, table of contents, related links.
- Content work: research/write original content and photography.
- Required data: confirmed fabric/fit/care expertise and measurements.
- Files affected: Guide/content models, admin, sitemap, SEO resolver.
- Admin changes required: draft/publish workflow.
- Expected benefit: qualified informational traffic that naturally reaches products.
- Validation method: editorial review, originality check, visible source content, internal-link scan, index/sitemap checks.

### SEO-021 — Enable moderated reviews and customer photos safely

- Priority: P2
- Status: Reviews currently disabled; operational readiness required
- Page/product affected: product pages and review admin
- Owner: Review moderator/customer service
- Effort: Medium
- Problem: real UGC is not publicly active, so it cannot contribute trust or product-specific language.
- SEO impact: no review enhancement or UGC relevance.
- Conversion impact: less social proof.
- Suggested solution: enable only after moderation, verified-order labeling, privacy, photo, and reply workflows are ready.
- Developer work: visibility/schema parity and privacy tests.
- Content work: moderate, reply, and approve images.
- Required data: real submitted reviews and order verification.
- Files affected: review routes/repository/admin/ProductReviews/schema.
- Admin changes required: queue, publication state, verified-label evidence, PII-safe preview.
- Expected benefit: genuine trust and richer product content.
- Validation method: pending/private data never public; aggregate exactly matches; image consent and removal work.

### SEO-022 — Create fit collections only when justified

- Priority: P2
- Status: Not started; owner decision required
- Page/product affected: possible Oversized, Regular-Fit, Crop-Box collections
- Owner: Ecommerce owner/content lead
- Effort: Medium
- Problem: fit demand exists, but these are not current real collections and premature pages would duplicate Shop/Tees.
- SEO impact: potential broad commercial coverage, but also cannibalization/thin pages.
- Conversion impact: useful fit filtering when adequately stocked.
- Suggested solution: create only with enough real products, unique intro/support copy, membership, filters, and links.
- Developer work: collection creation/index checks and canonical/filter rules.
- Content work: unique positioning and guide links.
- Required data: stable inventory and query evidence.
- Files affected: settings/admin/collection pages/sitemap.
- Admin changes required: keyword ownership and duplicate-page warning.
- Expected benefit: stronger commercial discovery without doorway pages.
- Validation method: query/cannibalization review; nonempty grid; unique metadata/copy; links and schema pass.

### SEO-023 — Implement directly selectable variant URLs before ProductGroup

- Priority: P2
- Status: Not started; current ProductGroup worktree draft is not eligible for sign-off
- Page/product affected: every size-variant product
- Owner: Frontend/backend developer
- Effort: Large
- Problem: Google’s single-page variant guidance requires a distinct URL that preselects each variant and displays matching state; current pages do not provide verified direct selection.
- SEO impact: premature ProductGroup markup may be ignored or misleading.
- Conversion impact: Merchant clicks may force customers to reselect the advertised variant.
- Suggested solution: stable variant query/path state with canonical group URL, selected size, price, stock, image, and add-to-cart behavior.
- Developer work: URL/state/router/API/schema/feed integration; avoid separate indexable duplicate pages.
- Content work: none beyond variant facts.
- Required data: variant SKU, size, optional variant price/image, stock.
- Files affected: Product route/page, product SEO resolver, Merchant feed, tests.
- Admin changes required: variant preview URL.
- Expected benefit: accurate variant discovery and landing experience.
- Validation method: each variant URL directly selects the right option; out-of-stock/price/image match; canonical and ProductGroup validate.

### SEO-024 — Establish Search Console and Merchant measurement loop

- Priority: P2
- Status: External setup required
- Page/product affected: entire site
- Owner: SEO/marketing owner
- Effort: Medium ongoing
- Problem: no authenticated query, index, enhancement, or Merchant diagnostics were available for this audit.
- SEO impact: keyword/page ownership cannot be refined with actual impressions/clicks.
- Conversion impact: organic search-to-cart/checkout outcomes are unmeasured by query/page.
- Suggested solution: verify domain, submit sitemap/feed, monitor Pages/Product snippets/Merchant listings/CWV, and join landing-page analytics.
- Developer work: verification token/config and reporting exports if needed.
- Content work: monthly query/content review.
- Required data: Search Console, Merchant Center, analytics, conversion events.
- Files affected: deployment/config only if verification requires it.
- Admin changes required: optional reporting links; no fabricated metrics.
- Expected benefit: evidence-led prioritization.
- Validation method: verified ownership, successful sitemap/feed fetch, no critical enhancement errors, documented monthly baseline.

## P3 — Future

### SEO-025 — Controlled SEO and conversion experiments

- Priority: P3
- Status: Not started
- Page/product affected: high-impression products and collections only
- Owner: SEO/analytics lead
- Effort: Ongoing
- Problem: title/copy decisions should be measured rather than assumed.
- SEO impact: potential CTR/relevance learning.
- Conversion impact: potential product-view/cart learning.
- Suggested solution: run one controlled hypothesis at a time using real query and conversion data.
- Developer work: experiment assignment and measurement without cloaking.
- Content work: reviewed variants.
- Required data: sufficient impressions/sessions and a predeclared metric.
- Files affected: analytics/metadata controls as needed.
- Admin changes required: experiment log, not automated keyword stuffing.
- Expected benefit: incremental evidence-based improvement.
- Validation method: pre/post or controlled comparison with seasonality and sample limitations documented.

### SEO-026 — International SEO only after operational readiness

- Priority: P3
- Status: Not started
- Page/product affected: future markets/languages
- Owner: Business owner
- Effort: Large
- Problem: international pages without shipping, currency, language, and support create misleading search landings.
- SEO impact: premature duplication and hreflang errors.
- Conversion impact: customers may be unable to buy.
- Suggested solution: wait for real market operations, then create localized URLs/content/currency/shipping and hreflang/canonicals.
- Developer work: localization architecture when authorized.
- Content work: human-reviewed localization.
- Required data: supported markets, currencies, logistics, policies, language support.
- Files affected: future architecture.
- Admin changes required: localized content controls.
- Expected benefit: qualified international visibility only when purchasable.
- Validation method: market-by-market crawl, hreflang, checkout, pricing, and policy tests.

## Release Gate

Do not mark this plan complete until:

1. The live authoritative database, not only repository seed data, contains reviewed SEO/content for all 18 active products.
2. All three collections have correct membership/index status and Tees is not an empty indexable page.
3. Initial HTML and post-navigation DOM agree on metadata, canonical, robots, JSON-LD, price, and stock.
4. Known legacy URLs redirect once and unknown product/collection URLs return real 404s.
5. Sitemap, robots, feed, structured data, broken links, social previews, and mobile viewports pass.
6. Build, API/web tests, Docker integration, and Playwright pass without breaking cart, checkout, COD, PayMongo, Pancake, reviews, accounts, inventory, Meta Pixel, or CAPI.
7. Owner-confirmation conflicts are resolved and Merchant Center account/feed validation is complete.
