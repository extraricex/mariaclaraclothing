# Maria Clara Clothing SEO Implementation Report

Report date: 2026-07-17
Website: https://mariaclaraclothing.com

## Overall Status

**Not Ready**

The site has a valuable server-injected SEO foundation, live product/offer markup, canonical URLs, a sitemap, robots file, and a Merchant feed. It is not ready for production SEO sign-off because the verified live/public pipeline drops custom SEO and product facts, the Tees collection is empty but indexable, unknown collections are soft 404s, known legacy URLs return 404, client metadata can remain stale after SPA navigation, several product facts/image alts conflict, Merchant apparel attributes are incomplete, requested admin UI is incomplete, and the full production regression suite has not passed.

This report does not count uncommitted worktree drafts as implemented.

## Architecture

- Frontend: React 18, React Router 6, Vite 6
- Backend: Express; PostgreSQL production persistence with JSON fallback
- Rendering method: client-side React plus database-backed initial HTML injected into the Vite shell through nginx SSI
- SEO implementation method: Express route descriptor generates initial title, description, robots, canonical, OG/Twitter, JSON-LD, and a crawlable fallback body; React subsequently renders the interactive page
- Deployment: Caddy HTTPS/compression and preferred-domain redirect; nginx static/route layer; Docker Compose web/API/PostgreSQL
- Preferred domain: https://mariaclaraclothing.com; www permanently redirects to apex
- Hosting note: no .openai/hosting.json exists

The SSI approach places Product data in initial HTML, which is valuable for price and stock. It should be extended and kept synchronized rather than replaced by a broad architecture rewrite. Vite development alone does not process SSI, so SEO tests must use the production nginx/Docker path.

## Changes Implemented

### Verified existing/live behavior

- Initial HTML has route-specific title, meta description, robots, canonical, Open Graph, Twitter, and JSON-LD.
- Homepage emits OnlineStore and WebSite structured data.
- Product initial HTML contains Product/Offer with numeric price, PHP currency, and stock-derived availability.
- Product public handles are stable and prior product aliases permanently redirect to the current canonical.
- Sitemap, robots.txt, and Merchant XML endpoints are public.
- Sitemap includes active product URLs and product images and excludes private cart/checkout/admin/account routes.
- Caddy redirects www to apex and compresses responses with zstd/gzip.
- Product grids and related product cards use crawlable links.
- Primary product/hero imagery gets early priority; below-fold imagery is generally lazy loaded; responsive source handling and route splitting exist.
- Web Vitals RUM collection exists in the admin analytics area.
- Product Editor has basic SEO title, meta description, public handle, per-image alt, product facts, product-page details, size chart, shipping content, variants, and review flags.

### Worktree drafts observed but not counted as implemented

The shared git worktree contained uncommitted/untracked SEO drafts affecting:

- catalogRepository and catalogPresenter field forwarding
- a new product SEO resolver
- a new SEO audit/CSV service and admin API endpoints
- Product/ProductGroup/review structured-data generation
- Merchant feed attribute handling
- sitemap and robots changes
- collection SEO storage and URL aliases
- a new collection route resolver
- nginx legacy plural-product, collection, and selected static redirects

These drafts had not completed build, full tests, Rich Results validation, feed validation, mobile/browser regression, checkout regression, or production deployment verification. They remain **worktree draft — unverified**.

The snapshot still lacked a centralized React SEO component, a wired Admin > Marketing > SEO screen, complete Product Editor/Collection SEO UI, breadcrumb parity, initial support-page content, automatic empty-collection sitemap exclusion, and directly selectable variant URLs needed for ProductGroup eligibility.

## Homepage SEO

- Current live title: Maria Clara Clothing — Premium Philippine Streetwear
- Current live meta description: Oversized and crop-box 240 GSM cotton shirts. Cash on delivery nationwide. Free shipping on 2+ items.
- Recommended reviewed title: Maria Clara Clothing | Filipino Streetwear & Premium T-Shirts
- Recommended description direction: include oversized, regular-fit, and crop-box 240 GSM cotton T-shirts, Philippine origin, and nationwide online ordering only while each claim remains current in settings/catalog data
- Canonical: https://mariaclaraclothing.com/
- Structured data: OnlineStore and WebSite are present in initial HTML
- Internal links: homepage links product/collection content through crawlable components; priority collection and guide links should be reviewed against actual product/traffic priority
- H1: a primary Maria Clara Clothing heading exists in the initial fallback and responsive page structure

The current description includes COD/free-shipping claims. Those are acceptable only while checkout and shipping settings continue to support them; runtime-derived copy is safer than static fallback claims.

## Product SEO

- Products updated by this documentation task: 0 production records; no database writes were authorized or performed
- Live active storefront products audited: 18
- Live merchandising state: 17 sale, 1 sold out
- Inventory-derived availability: 16 products have at least one in-stock variant; 2 have zero total stock. Bahala is marked sale while all variants are zero, so its merchandising label and inventory-derived availability conflict.
- Live public SEO fields: 18 of 18 returned an empty SEO object
- Live public metafields: 18 of 18 returned an empty metafields object
- Live public update times: 18 of 18 returned an empty updatedAt value
- Title framework: recognizable design name, color/fit and one confirmed material/GSM differentiator; separate customer, SEO, marketplace, and feed titles
- Description framework: unique opening; product details; fit/sizing; fabric/GSM; design; owner-approved care; current shipping; size guide; collection/related links
- Metadata: live titles were 65–93 characters; live descriptions were 162–320 characters, with 15 exactly 320 and some cut mid-sentence
- Structured data: baseline price, PHP, availability, brand, condition, category, and SKU exist; confirmed facts/custom descriptions are blocked by the projection defect

### Products requiring owner confirmation or correction

| Product | Required action |
|---|---|
| ABOT KAMAY WHITE | Replace description duplicated with Bahala; approve artwork/care details |
| BAHALA BLACK | Replace duplicate description; reconcile sale merchandising state with zero total stock; decide restock/indexing alternatives |
| CURIOSITY BLACK | Approve unique design/placement wording and angle alts |
| CURIOSITY OFF-WHITE | Normalize name and verify differences from black colorway |
| DARUMA OFF-WHITE | Description says 3XL while live variants stop at 2XL; remove “Copy” alt artifacts |
| HAWAK WHITE | Description says 3XL while live variants stop at 2XL |
| IMPERIAL CHOCO TEE | Confirm color/max size; only two gallery images |
| INFINITE POSSIBILITIES BLACK | Confirm crop-box measurements and care |
| KAMALAYAN BLOOM BLACK | Approve design wording; complete angle alts |
| KAMALAYAN EYE BLACK | Approve design wording; only two gallery images |
| MANDALA BLACK V1 | Gallery says Mandala White; description says 3XL while variants stop at 2XL |
| MANDALA WHITE V1 | Description says 3XL while variants stop at 2XL; complete angle alts |
| MARIACLARA ORANGE | Confirm 100% cotton/GSM, care, measurements, shipping, and sold-out indexing; structured size/details are incomplete |
| MARIACLARA ROCKSTAR | Critical color conflict: narrative says gray while product facts say red; gallery says Wanna Gray |
| MC ACID BLACK | Approve design/care wording; only two gallery images |
| MC ACID OFF-WHITE | Approve differences from black; only two gallery images |
| THE GOOD TIME OFF-WHITE | Fix “The THE” grammar; populate structured detail/shipping fields |
| WANNA GRAY | Gallery says The Good Time; populate structured detail/shipping fields |

Detailed unique title, metadata, keyword, URL, description, image, link, and schema recommendations for all 18 products are in PRODUCT_SEO_DEEP_RESEARCH_AND_AUDIT.md.

## Collection SEO

- Collections audited: 3
- Freedom of Mind: 10 active members; indexable; live title “Freedom of Mind | Maria Clara Clothing”; short 63-character description
- New Arrivals: 8 active members; indexable; live title “New Arrivals | Maria Clara Clothing”; 192-character description
- Tees: 0 active members; currently HTTP 200, indexable, canonical, linked, and in sitemap
- Metadata: baseline collection title/description/canonical and CollectionPage/ItemList exist
- Content: visible collection page has a short introduction and product grid; full custom SEO/intro/supporting controls are not verified end to end
- Indexing: Tees must receive real members or be noindex and excluded from sitemap/navigation
- Routing: unknown collection returns HTTP 200 noindex instead of a true 404 in verified live behavior

## Image SEO

- Alt text: no live image record was empty, but 17 of 18 products repeated gallery alt text
- Wrong-product alts: Mandala Black names Mandala White; MariaClara Rockstar names Wanna Gray; Wanna Gray names The Good Time; Daruma includes “Copy”
- Size chart: MariaClara Orange’s size-chart image uses only the generic product title
- Image optimization: local upload pipeline supports WebP and responsive derivatives; Shopify images get responsive width handling
- Remaining performance issue: /uploads/products/oranges-mcc-box-tee-1781162364372-494817ca92b258.png is 877,301 bytes and has no matching responsive WebP derivative
- Loading: primary product image uses high priority; later/card images are generally lazy; collection hero needs complete responsive/loading/dimension treatment

No live file should be renamed or removed without preserving its URL or adding a migration. Alt text must be based on visual inspection, not inferred from array position alone.

## Technical SEO

- Sitemap: public HTTP 200 XML; includes HTTPS canonical routes and image entries; currently includes empty Tees; product lastmod is absent because timestamps are dropped publicly; malformed image URL can fail the whole sitemap
- Robots.txt: public HTTP 200; allows rendering resources and public pages; disallows major private routes; the live response includes Cloudflare content-signal rules before application rules
- Canonicals: initial public pages use clean HTTPS apex URLs without query strings; client navigation lifecycle is not centralized
- Redirects: product internal/old handles use permanent 308; plural legacy product route and old static page mappings are not verified live
- Noindex: private direct loads are protected; empty collection and SPA navigation state need correction
- Broken links/legacy: known /products/oranges-mcc-box-tee and /pages/terms-of-use are live 404s
- Unknown routes: unknown product returns true 404; unknown collection is a 200 soft 404
- Rendering: SSI gives initial product/collection content; FAQ/shipping/terms/size fallback contains only headings and requires JavaScript for substantive sections
- Headings: major pages generally have one H1; product tab panels need stronger semantic H2 section structure
- HTTPS/preferred domain: verified through live canonical and Caddy configuration

## Structured Data

- Product: present in initial HTML
- Offer: present with numeric price and real stock state
- Currency: PHP verified
- Availability: InStock/OutOfStock derived from variants
- AggregateRating: none found across the 18 live products; reviews are globally disabled
- Review: not publicly emitted in the verified live sample
- Breadcrumb: present, but product/collection UI and schema hierarchies differ
- Organization: OnlineStore present on homepage
- WebSite: present on homepage
- FAQPage: not present; only appropriate if identical Q&A is visibly rendered
- SearchAction: should not be added for sitelinks search; Google retired that feature
- Variant status: baseline emits a parent Product/Offer; worktree ProductGroup draft is not approved because directly selectable variant URLs have not been verified
- Validation result: initial JSON-LD parsed successfully in read-only inspection, but no external Rich Results/Schema.org release validation was completed after pending changes

## Google Merchant Center

- Feed endpoint: https://mariaclaraclothing.com/merchant-feed.xml
- Feed status: functional XML, not submission-ready
- Live variant item count: 97
- Present fields: ID, item group, title/description/link, images, availability, PHP price, condition, brand, product type/category, size
- Missing across feed: color, material, gender, age group
- Required manual setup: business verification; target destinations; shipping/returns account settings; scheduled fetch; owner-confirmed apparel facts; Merchant diagnostics review
- Remaining issues: public fact projection; required apparel attributes; landing-page/variant selection parity; cache/stock mismatch review; syntax/account validation; no GTIN/MPN invention

The existing XML/scheduled-feed approach is appropriate for the current catalog size. It should not be published to Merchant Center until product and account data agree.

## Admin SEO Controls

### Verified product fields

- SEO title
- Meta description
- Public handle and product alias history
- Per-image alt text
- Product color/material/fit/fabric weight/model facts
- Product description, details, shipping, sections, size chart
- Variants/SKUs/stock
- Review visibility flags

### Missing or incomplete product controls

- Main keyword and secondary keywords
- Same-origin canonical override
- Index/noindex
- OG title, description, image
- Marketplace/feed title
- Full search-result preview
- Duplicate title/description/slug warning
- Wrong/repeated alt warning
- Clear custom-versus-fallback state
- SEO Content Completeness score in the editor

### Missing or incomplete collection controls

- SEO title/meta description
- Intro and below-grid supporting copy
- Canonical override
- Index/noindex
- OG image
- Keyword fields
- Search preview
- Previous URL slugs
- Empty-collection indexing warning

### Dashboard/export

- Existing admin analytics includes product content readiness, but it is not the requested SEO dashboard.
- Worktree API drafts for SEO audit/CSV were observed but no complete routed React dashboard was verified.
- Secure CSV must include Product ID, SKU, name, current URL, SEO title, meta description, main/secondary keywords, alt, index status, completeness, structured-data status, and last updated, with spreadsheet-formula escaping.

## Performance

- Verified strengths: responsive image logic, primary-image priority, below-fold lazy loading, route-level lazy imports, stable aspect containers, font display swap, Caddy zstd/gzip, asynchronous Meta loading, and RUM collection
- Existing built asset snapshot: main JavaScript approximately 260 KB raw and main CSS approximately 104 KB raw; route chunks are split
- Live issue: 877 KB MariaClara Orange PNG
- Mobile result: responsive architecture/code inspection only; required 320/360/390/430/tablet/desktop interaction suite not completed
- Remaining issues: measure real LCP/INP/CLS/TTFB; collection hero optimization; intrinsic dimensions where available; third-party/review effects when enabled; API/render timing

No Lighthouse, CrUX, or RUM score is claimed in this report because a controlled current measurement was not performed.

## Tests Performed

### Read-only live checks completed

| Check | Result |
|---|---|
| Homepage | HTTP 200; indexable canonical; OnlineStore and WebSite JSON-LD |
| Shop | HTTP 200; indexable canonical; crawlable fallback product links |
| Freedom of Mind | HTTP 200; 10 live active members |
| New Arrivals | HTTP 200; 8 live active members |
| Tees | HTTP 200, indexable, in sitemap, 0 active members — fail |
| Unknown collection | HTTP 200 noindex soft 404 — fail |
| Mandala White product | HTTP 200; Product/Breadcrumb JSON-LD parsed; PHP 649.00 and InStock in inspected response |
| Product alias | /product/oranges-mcc-box-tee returns permanent 308 to current MariaClara Orange canonical |
| Legacy plural product | /products/oranges-mcc-box-tee returns 404 — fail |
| Legacy terms page | /pages/terms-of-use returns 404 — fail |
| sitemap.xml | HTTP 200; includes products/collections/images; includes empty Tees — fail |
| robots.txt | HTTP 200; sitemap directive and private-route disallows present |
| Merchant feed | HTTP 200; 97 items; all have size/price/availability, none have color/material/gender/age group — not ready |
| Product public API | 18 products; 17 sale, 1 sold out; all public SEO/metafields/timestamps empty — fail |
| Review markup | Global reviews disabled; no AggregateRating found across 18 product initial responses |
| Image alts | 0 empty, but 17 products have repeated values and several wrong-product references — fail |
| Large local product image | HTTP 200 PNG, content length 877,301 bytes — needs optimization |

### Repository inspection completed

- Framework, routes, nginx SSI, Caddy/deployment, data repository/presenter, product/collection admin, SEO descriptor, schema, reviews, sitemap, robots, feed, image normalizer, responsive images, headings, internal links, tests, and CI were reviewed.
- No .openai/hosting.json was found.

### Not completed in this documentation pass

- Browser runtime limitation: no interactive signed-in production browser session was used, so client-side route transitions, tap behavior, add-to-cart, checkout, payment, and account flows were not runtime-tested here
- Production build after current uncommitted changes
- Full API/web unit/integration suite
- Docker/nginx end-to-end suite
- Playwright checkout and SEO navigation suite
- 320/360/390/430/tablet/desktop browser matrix
- Automated broken-link crawl of the final build
- Google Rich Results Test and Schema.org Validator on final deployed output
- Merchant Center fetch/diagnostics
- Search Console live URL/index inspection
- Lighthouse/PageSpeed/field Core Web Vitals baseline
- Lint and type checks are not configured as project scripts and must not be reported as passing

## Files Changed

### Files changed by this reporting task

- PRODUCT_SEO_DEEP_RESEARCH_AND_AUDIT.md
- PRODUCT_SEO_IMPLEMENTATION_PLAN.md
- SEO_IMPLEMENTATION_REPORT.md

### Other worktree changes

The repository already contained numerous modified and untracked files from other active work, including SEO drafts and unrelated Meta/Pancake/PayMongo work. They were preserved. This documentation task did not author, approve, or verify those code changes, and this report does not list them as completed implementation.

## Remaining Manual Content

- Owner confirmation of MariaClara Rockstar color
- Owner reconciliation of stated 3XL ranges versus 2XL live variants
- Product-specific design/print-placement copy for all 18 products
- Approved garment care instructions
- Visual review and angle-specific alt text for every image
- Confirmation of color, material, gender, and age group for Merchant Center
- Tees membership or noindex decision
- Sold-out product indexing/restock policy
- MariaClara Orange 100% cotton/GSM/measurement/shipping confirmation
- Legacy redirect inventory from prior platform/Search Console/analytics
- Collection SEO positioning and copy approval
- Search Console and Merchant Center account configuration

## Final Recommendation

**Not ready for production SEO sign-off.**

Before release, complete and test the product fact pipeline, centralized route SEO lifecycle, empty/unknown collection behavior, verified legacy redirects, product contradictions and image alts, sitemap/index consistency, review visibility rules, admin controls, and Merchant apparel data. Then run the full production build, API/web tests, Docker/Playwright regression, mobile matrix, structured-data validation, feed validation, and checkout/payment/inventory/Pancake/review/Meta regression suite.
