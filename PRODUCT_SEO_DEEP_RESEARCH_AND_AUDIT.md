# Maria Clara Clothing Product SEO Deep Research and Audit

Audit date: 2026-07-17
Website: https://mariaclaraclothing.com
Overall status: **Not Ready**

This audit combines current public-site observations, repository inspection, live public API data, official search and Merchant documentation, established ecommerce research, and fashion-site pattern analysis. No keyword volumes, traffic estimates, ranking positions, or competitor sales claims are invented.

No production product, collection, inventory, review, order, or settings data was mutated during this audit.

## Evidence Boundary and Browser Limitations

- Public web search and direct HTTP inspection were available. Homepage, product, collection, sitemap, robots, feed, API, metadata, status codes, and initial HTML were inspected on 2026-07-17.
- The live public product API returned 18 active storefront products. The repository seed contained 15, so the live database is authoritative for the production product list.
- Authenticated Google Search Console, Merchant Center, Google Analytics, Keyword Planner, Google Trends account data, server logs, and private production administration were not available. Query demand and actual ranking changes must therefore be validated after deployment in those systems.
- Public competitor pages were observed for repeatable patterns only. They were not treated as permanent ranking or bestseller evidence, and no competitor wording, images, titles, or branding is copied.
- Browser runtime limitation: no interactive signed-in production browser session or physical-device checkout was used in this research pass. Client-side route transitions, tap behavior, add-to-cart, payment, and the full 320/360/390/430/tablet/desktop matrix therefore remain release tests. Responsive behavior was inspected from code and public initial HTML only.
- The shared worktree now contains the SEO implementation described below and has passed the documented local checks. It has not been deployed or reverified against the production database, so this report distinguishes **implemented in code/local validation** from **verified on the live site**.

## Research Sources

### Google Search and web platform sources

- [Google: Ecommerce SEO best practices](https://developers.google.com/search/docs/specialty/ecommerce)
- [Google: Help Google understand ecommerce site structure](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure)
- [Google: Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Google: Merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Google: Product variant structured data](https://developers.google.com/search/docs/appearance/structured-data/product-variants)
- [Google: Review snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [Google: Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google: Title link guidance](https://developers.google.com/search/docs/appearance/title-link)
- [Google: Search snippet guidance](https://developers.google.com/search/docs/appearance/snippet)
- [Google: Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: Sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: Robots introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Google: Robots meta directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: Dynamic rendering is a workaround](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
- [Google: Mobile-first indexing](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing)
- [Google: Image SEO](https://developers.google.com/search/docs/appearance/google-images)
- [Google: Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [Google: Pagination and incremental loading](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Google: Faceted navigation crawling](https://developers.google.com/crawling/docs/faceted-navigation)
- [Google: FAQ rich-result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Google: Sitelinks search box retirement](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)
- [web.dev: Optimize LCP](https://web.dev/articles/optimize-lcp)
- [web.dev: Optimize INP](https://web.dev/articles/optimize-inp)
- [web.dev: Image performance](https://web.dev/learn/performance/image-performance)

### Google Merchant Center sources

- [Merchant Center product data specification](https://support.google.com/merchants/answer/7052112?hl=en)
- [Merchant title requirements](https://support.google.com/merchants/answer/6324415?hl=en)
- [Apparel and accessories practices](https://support.google.com/merchants/answer/7348545?hl=en)
- [Product image requirements](https://support.google.com/merchants/answer/6324350?hl=en)
- [Landing-page requirements](https://support.google.com/merchants/answer/4752265?hl=en)
- [Product data sources](https://support.google.com/merchants/answer/15624855?hl=en)
- [Free listings requirements](https://support.google.com/merchants/answer/13889434?hl=en)

### Schema.org sources

- [Schema.org Product](https://schema.org/Product)
- [Schema.org ProductGroup](https://schema.org/ProductGroup)
- [Schema.org Offer](https://schema.org/Offer)
- [Schema.org AggregateRating](https://schema.org/AggregateRating)
- [Schema.org BreadcrumbList](https://schema.org/BreadcrumbList)

### Established ecommerce research and case studies

- [Ahrefs: Ecommerce category-page SEO](https://ahrefs.com/blog/seo-ecommerce-category-pages/)
- [Baymard: Product-page UX research](https://baymard.com/research/product-page)
- [Semrush: Ecommerce product-page SEO](https://www.semrush.com/blog/ecommerce-product-page-seo/)
- [Search Engine Journal: Similar-product thin content](https://www.searchenginejournal.com/ask-an-seo-how-do-you-fix-thin-content-across-similar-product-pages/566266/)
- [web.dev Farfetch case study](https://web.dev/case-studies/farfetch)
- [web.dev Nuvemshop case study](https://web.dev/case-studies/nuvemshop)

The Farfetch and Nuvemshop outcomes are case-specific, not forecasts for Maria Clara Clothing. They support prioritizing faster product rendering and image delivery, but no conversion uplift is promised.

### Fashion and marketplace pages observed

- [Nike Philippines product page](https://www.nike.com/ph/t/sportswear-essentials-t-shirt-yhyUZydg/IH1122-100)
- [H&M Philippines product page](https://www2.hm.com/en_ph/productpage.1272340008.html)
- [Mango Philippines product page](https://shop.mango.com/ph/en/p/27041264?c=32)
- [Uniqlo Philippines material editorial](https://www.uniqlo.com/ph/masterpiece/008-supima-cotton-crew-neck-t-shirt.html)
- [MN+LA oversized-tee collection](https://mn-la.com/collections/oversized-tee?page=1)
- [MN+LA product page](https://mn-la.com/products/oversized-lite-tee-in-charcoal-grey)
- [Team Manila product page](https://shop.teammanilalifestyle.com/products/team-manila-wps-oversized-pocket-tee-black)
- [LOOKGOOD product page](https://lookgoodglobal.com/products/starscript-oversized-tee)
- [Manila Streetwear product page](https://manilastreetwear.com/products/3-stars-and-a-sun)
- [Zalora Philippines T-shirt category](https://www.zalora.com.ph/c/men/clothing/t-shirts/c-96/scat-97?page=4)
- [Lazada 240 GSM oversized-shirt results](https://www.lazada.com.ph/tag/240gsm-shirt-cotton-oversized/)

## Successful Ecommerce SEO Patterns

| Observed pattern | Why it works | Suitable for Maria Clara | Recommended implementation | Main risk | Benefit | Priority |
|---|---|---|---|---|---|---|
| Product name plus product type, fit, color, and one differentiating fact | Clarifies query relevance and purchase context without relying on a vague design name | Yes | Keep the design name recognizable; use only confirmed fit, color, cotton, or GSM facts; create separate customer, SEO, marketplace, and feed titles | Long titles and keyword repetition | SEO and conversion | P1 |
| Unique opening copy followed by scannable specifications | Gives search engines product-specific text while letting shoppers compare quickly | Yes | Retain original design narrative, then expose fit, fabric, GSM, color, sizes, care, origin, and delivery in structured sections | Templated filler can make pages near-duplicates | SEO and conversion | P1 |
| Initial-HTML Product and Offer data | Makes price and availability available before delayed JavaScript rendering; Google explicitly recommends initial HTML for shopping markup | Yes; the SSI architecture already supports it | Keep server-injected JSON-LD and make it use the same price, stock, canonical, and review visibility as the page | Server/client schema drift | SEO | P0 |
| ProductGroup and variant data when variants are directly addressable | Helps Google understand grouped size/color offers | Conditionally | Use only after each marked-up variant can be preselected by a stable URL and displays matching price, image, availability, and add-to-cart state | Invalid or misleading variant markup if all variants point to an indistinguishable page | SEO and Merchant | P2 |
| Real, visible review content near the purchase decision | Adds shopper confidence and unique product-specific language | Yes, when reviews are enabled | Publish only moderated, public reviews; match visible average/count exactly; omit all private order data | Hidden, pending, imported, or fake review markup violates policy | SEO and conversion | P1 |
| Multiple high-quality product angles with accurate alt text | Reduces uncertainty and helps image understanding/discovery | Yes | Front, back, print detail, model, fabric, packaging, and size-chart labels must describe the actual image | Guessing angles or repeating keywords | SEO and conversion | P1 |
| Size guidance beside size selection | Reduces fit uncertainty and returns | Yes | Keep the modal but add a crawlable link to the public size guide and product-specific garment measurements | Generic charts can mislead across fits | Conversion | P1 |
| Delivery, returns, availability, and payment context near the buy box | Answers objections before cart and aligns landing pages with feed data | Yes | Pull current settings into concise product information; link to complete shipping/returns policy | Hard-coded claims become stale | Conversion and Merchant | P1 |
| Visible, linked breadcrumbs that match BreadcrumbList | Reinforces hierarchy and offers a mobile-friendly path back to collections | Yes | Use Home > Shop > selected collection > product consistently in UI and JSON-LD | Schema/UI mismatch | SEO and conversion | P1 |
| Crawlable category grid with useful filters and product count | Supports broad commercial discovery while preserving product links | Yes | Use real anchor links, product count, sort, and filters; keep nonvaluable filter combinations out of the index | Infinite parameter combinations | SEO and conversion | P1 |
| Short useful category introduction above products, supporting copy below | Establishes topic without pushing products down the page | Yes | Approximately one short paragraph above; only add longer, genuinely useful content below | Long generic copy harms UX | SEO and conversion | P1 |
| Related products selected by collection, fit, and stock | Creates crawl paths and keeps shoppers exploring | Already mostly suitable | Same collection, fit, type, then in-stock fallback; exclude current and inactive products | Random or irrelevant recommendations | SEO and conversion | P1 |
| Stable canonical URLs and permanent redirect history | Consolidates signals and protects old links | Yes | Preserve current canonical handles; record old product and collection slugs; redirect in one hop | Redirect chains and incorrect mappings | SEO | P0 |
| Variant-level Merchant data with synchronized price and stock | Makes listings eligible and reduces mismatch/disapproval risk | Yes after factual attributes are complete | Export one item per size SKU with group ID, title, link, images, PHP price, stock, color, gender, age group, and material when confirmed | Unsupported attributes and cache-related mismatches | SEO, Merchant, conversion | P1 |
| Fast, stable primary imagery and lazy gallery loading | Improves LCP/CLS without sacrificing product quality | Yes | Preload/high-priority only the likely LCP image; responsive WebP/AVIF; dimensions; lazy-load later images | Over-preloading or excessive compression | SEO and conversion | P1 |

## Competitor and Best-Seller Findings

These are pattern observations, not copied content and not claims that a page will remain highly ranked or bestselling.

| Site/page | Useful observed strategy | SEO benefit | Conversion benefit | Suitability | Recommended original adaptation | Caution | Priority |
|---|---|---|---|---|---|---|---|
| Nike Philippines | Multi-image gallery; fit, model, material, care, origin, SKU, size, delivery, and related products | Dense entity/specification signals | Strong comparison and trust | High | Use the same information architecture with Maria Clara’s confirmed facts and original language | Do not imitate Nike naming or copy | P1 |
| H&M Philippines | Fit-led H1, structured material/style data, delivery details, and category links | Clear taxonomy and product attributes | Fast scanning | High | Put fit, fabric, color, and care in labeled sections and link the parent collection | Large-retailer depth must not encourage invented details | P1 |
| Mango Philippines | Angle/detail imagery, measurements, care, and fit context | Image and specification relevance | Lower fit uncertainty | High | Expand genuine angle coverage and product-specific measurements | Requires real photographs and measurements | P1 |
| Uniqlo Philippines editorial | Original material education connected to products | Builds informational authority | Explains value before purchase | High | Publish an original 240 GSM guide linked to relevant products | Avoid claiming properties not verified for Maria Clara fabric | P2 |
| MN+LA collection | H1, count, filter/sort controls, crawlable product grid | Broad category targeting and discovery | Faster product finding | High | Populate real fit collections before indexing them | Empty or duplicative collections create thin pages | P1 |
| MN+LA product | GSM, fit, specifications, and shipping | Long-tail relevance | Trust and clarity | High | Expose confirmed GSM/fit in concise structured sections | Repeated alt text observed; do not repeat that weakness | P1 |
| Team Manila | Gallery, breadcrumbs, product attributes | Hierarchy and product understanding | Familiar local-store UX | High | Use local-brand context and consistent breadcrumb links | Repeated alt text observed | P1 |
| LOOKGOOD | GSM and measurements in compact page copy | Long-tail fit/fabric relevance | Comparison help | Medium | Keep concise but add unique design and trust context | Thin narrative is not enough for near-identical products | P1 |
| Manila Streetwear | Related products and trust information | Internal discovery | Confidence | Medium | Link real related products and current policies | A visible color contradiction was observed; Maria Clara already has similar conflicts to correct | P0 |
| Zalora | Deep taxonomy, filters, commercial category copy | Category query coverage | Large-catalog discovery | Medium | Use only the taxonomy depth justified by 18 products | Avoid long above-grid copy and unnecessary categories | P2 |
| Lazada result pages | Attribute-heavy marketplace titles | Can match detailed shopping queries | Quick scanning | Low as a storefront pattern | Keep a separate marketplace/feed title field | Keyword-stuffed titles are an anti-pattern for customer-facing pages | P1 |

## Actual Project Inspection

### Architecture

- Frontend: React 18, React Router 6, and Vite 6.
- Backend: Express with PostgreSQL in production and JSON repository fallback.
- Rendering: client-side React plus database-backed initial HTML injected through nginx SSI.
- Deployment: Caddy terminates HTTPS and compresses responses; nginx serves the Vite bundle and routes SEO fragments to Express; Docker Compose runs web, API, and PostgreSQL.
- Preferred origin: HTTPS apex domain. Caddy permanently redirects www to the apex.
- There is no .openai/hosting.json file.

### Public routes

- Homepage: /
- Shop: /shop
- Products: /product/:slug
- Collections: /collections/:slug
- Guides: /guides/240-gsm-shirts, /guides/t-shirt-fit-guide, /guides/payment-and-shipping
- Public support: /faq, /shipping-returns, /terms, /contact, /size-chart
- Private/nonindexable areas include cart, checkout, thank-you, login/account, and admin routes.

### Data and administration

- Products are persisted in product, image, variant, alias, SEO JSON, and metafield structures.
- Product handles have redirect history; the internal product slug should remain stable because cart/order flows use catalog-derived identifiers.
- Collections are stored inside settings JSON and support name, slug, description, concise introduction, below-grid supporting copy, SEO metadata, canonical/index controls, Open Graph image, visibility, placement, order, membership aliases, and prior URL slugs.
- Product Editor now exposes SEO title, meta description, main/secondary keywords, canonical/index controls, Open Graph fields, feed/marketplace titles, main/per-image alt text, search preview, product facts, variants, size chart, shipping copy, and review flags.
- Admin > Marketing > SEO is routed and backed by authenticated audit/CSV endpoints; it reports product/collection warnings and labels its checklist score “SEO Content Completeness,” not a ranking score.
- The live public catalog returned 18 products; the seed JSON is not production-authoritative.

## Current Website SEO Status

| Area | Current state | Status |
|---|---|---|
| Technical SEO | Initial HTML and a centralized React SEO owner now cover title, description, canonical, robots, OG/Twitter, price fields, and keyed JSON-LD. Product/collection aliases, true 404 collection routing, known legacy redirects, query noindex, sitemap safeguards, and private-route rules are implemented in code. Production deployment and browser/nginx reverification remain. | Implemented locally; release validation pending |
| Product SEO | The catalog projection now preserves SEO, metafields, category/type/vendor/tags, and timestamps without changing cart-facing IDs. Readable, unique, word-safe fallbacks and channel-specific titles are implemented; no live product record was rewritten, and the 18 production records still need owner review and post-deployment verification. | Implemented locally; content review pending |
| Collection SEO | Collection metadata/admin controls, concise and supporting content, empty-collection noindex/sitemap/navigation suppression, URL aliases, redirects, and breadcrumbs are implemented. The live Tees membership decision and final collection-route collision regression remain. | Implemented locally; owner/release review pending |
| Image SEO | All live records have some alt text and product imagery is responsive in major components. Seventeen products repeat gallery alt text; several name the wrong product; one live PNG is 877,301 bytes. | Not ready |
| Structured data | Product/ProductGroup, size-level Offers, numeric PHP prices, actual stock, seller, confirmed nonconflicting facts, public-review gating, and matching BreadcrumbList are implemented server/client. Variant links preselect `?size=` while canonicalizing to the clean product route. External Rich Results and Schema.org validation remain. | Implemented locally; external validation pending |
| Internal linking | Product grids, stock-aware related products, visible/schema breadcrumbs, parent collection, size-guide, shipping, guide, FAQ, and Shop links are crawlable in current code. | Implemented locally; crawl/browser review pending |
| Mobile SEO | Responsive design serves the same route/content. Breadcrumb component wraps and image containers are stable. Required viewport and interaction testing has not been completed. | Unverified |
| Performance | Route splitting, responsive images, primary-image priority, lazy loading, font swap, compression, and RUM are present. No new Lighthouse/field scores were measured; an 877 KB gallery PNG remains. | Partial |

## Critical Problems

### P0-1 — Deploy and reverify the repaired product-fact pipeline

The repository/presenter projection now forwards the complete SEO contract, product facts, category/type/vendor/tags, and timestamps while preserving the existing `catalog-[internal slug]` cart identifier. Local tests cover the boundary, but the production snapshot observed before deployment still exposed empty public SEO/metafields/timestamps. Deploy, fetch all 18 live records, and compare API, initial HTML, schema, feed, and sitemap before sign-off.

### P0-2 — Reverify centralized metadata through real SPA navigation

`SEO.jsx` and `lib/seo.js` now own title, description, canonical, robots, Open Graph/Twitter, price fields, and keyed JSON-LD across route changes, with route defaults for private and unknown pages. The focused SEO tests passed, but the required production nginx/browser sequence and mobile interaction matrix remain release checks.

### P0-3 — Resolve production collection membership and index state

Current code automatically noindexes empty collections and removes them from the sitemap, Homepage, Shop filters, and navigation. The observed production Tees record had zero members and was previously indexable; the owner must either assign verified products or intentionally keep it excluded after deployment.

### P0-4 — Complete collection-route collision protection and deploy redirects

Current code gives collection current slugs HTTP 200, recorded URL aliases one-hop 308 redirects, and unknown collection slugs a real 404. Update paths and normalized settings reject route collisions, but the new-collection create path still needs equivalent current-slug/alias collision regression coverage before release.

### P0-5 — Complete the verified legacy redirect inventory

Code now resolves general legacy `/products/:slug` routes through the product alias map and includes one-hop mappings for `/products/oranges-mcc-box-tee`, `/pages/terms-of-use`, and `/collections/all`. Search Console, the old sitemap, analytics, and platform exports are still required to identify additional legitimate historical URLs; unrelated missing URLs must remain 404.

### P0-6 — Product-content contradictions can mislead customers and feeds

Examples include MariaClara Rockstar described as gray in one sentence and red in its product facts, size copy that says 3XL while several live variant lists stop at 2XL, Bahala marked with a sale merchandising state while all variants have zero stock, and alt text that names other products. These facts require owner confirmation before publication or feed use.

## Keyword Strategy

No search volumes or ranking positions are asserted. Candidate phrases were observed in current search results and must be validated with Search Console queries, Merchant Center, Keyword Planner, Trends, and conversion data.

### Intent and page ownership map

| Page | Primary topic/keyword candidate | Secondary candidates | Intent | Cannibalization rule |
|---|---|---|---|---|
| Homepage | Filipino streetwear brand Philippines | Maria Clara Clothing T-shirts; local clothing brand Philippines; premium streetwear Philippines | Branded and commercial | Own the broad brand/entity topic; qualify “Maria Clara” with streetwear/T-shirts because the phrase is also associated with historic Filipiniana clothing |
| Shop | shop premium T-shirts Philippines | oversized, regular-fit, crop-box T-shirts; 240 GSM shirts | Transactional | Own “shop all” intent; do not duplicate a populated Tees collection’s primary category phrase |
| Freedom of Mind | Freedom of Mind streetwear collection | Maria Clara Freedom of Mind shirts | Branded commercial | Do not target generic oversized shirts because the collection contains mixed fits |
| New Arrivals | new streetwear T-shirts Philippines | new Maria Clara Clothing shirts | Commercial | Own recency; products retain design/color terms |
| Tees, only after populated | premium cotton T-shirts Philippines | Filipino streetwear T-shirts; 240 GSM tees | Commercial category | While empty, noindex. Once populated, let Tees own the broad category and narrow Shop to “shop all” navigation intent |
| Individual products | design name + color + fit + T-shirt | 240 GSM, cotton, local/made in Philippines when confirmed | Product-specific transactional | Each color/design page owns its exact combination; do not assign a generic collection keyword as its primary keyword |
| 240 GSM guide | what does 240 GSM mean for a T-shirt | heavyweight T-shirt guide; thick cotton shirt | Informational | Guide owns the question; products use transactional design/fit terms |
| Fit guide | oversized vs regular fit T-shirt | crop-box fit; how oversized shirts fit | Informational/commercial | Guide explains comparison; fit collections own shopping intent only if created with real inventory |
| Size chart | Maria Clara Clothing size guide | how to choose T-shirt size; shirt measurements | Informational/support | Product pages link here but retain product-specific sizing language |
| Shipping page | Maria Clara Clothing shipping Philippines | delivery times; shipping fees; COD | Branded support/transactional | Keep current settings authoritative; avoid repeating detailed policy copy on every product |
| FAQ | Maria Clara Clothing FAQ | sizing, payment, availability, returns | Branded informational | Answer support intent and link to the authoritative page for each topic |

### Product keyword clusters

| Product | Primary keyword candidate | Secondary candidates |
|---|---|---|
| ABOT KAMAY WHITE | Abot Kamay White oversized T-shirt | white oversized shirt; 240 GSM cotton T-shirt Philippines |
| BAHALA BLACK | Bahala Black oversized T-shirt | black oversized shirt; 240 GSM cotton T-shirt |
| CURIOSITY BLACK | Curiosity Black oversized T-shirt | black streetwear shirt; 240 GSM oversized T-shirt |
| CURIOSITY OFF-WHITE | Curiosity Off-White oversized T-shirt | off-white oversized shirt; 240 GSM cotton tee |
| DARUMA OFFWHITE | Daruma Off-White oversized T-shirt | off-white streetwear shirt; 240 GSM oversized tee |
| HAWAK WHITE | Hawak White oversized T-shirt | white oversized cotton shirt; 240 GSM tee |
| IMPERIAL CHOCO TEE | Imperial Choco oversized T-shirt | chocolate brown oversized shirt; 240 GSM tee |
| INFINITE POSSIBILITIES BLACK | Infinite Possibilities crop-box T-shirt | black crop-box shirt; 240 GSM boxy tee |
| KAMALAYAN BLOOM BLACK | Kamalayan Bloom Black oversized T-shirt | black Filipino streetwear tee; 240 GSM shirt |
| KAMALAYAN EYE BLACK | Kamalayan Eye Black oversized T-shirt | black oversized cotton shirt; 240 GSM tee |
| MANDALA BLACK V1 | Mandala Black V1 oversized T-shirt | black Mandala shirt; 240 GSM cotton tee |
| MANDALA WHITE V1 | Mandala White V1 oversized T-shirt | white Mandala shirt; 240 GSM cotton tee |
| MARIACLARA ORANGE | MariaClara Orange crop-box T-shirt | orange crop-box shirt; 240 GSM cotton tee |
| MARIACLARA ROCKSTAR | MariaClara Rockstar regular-fit T-shirt | regular-fit 240 GSM shirt; color pending confirmation |
| MC ACID BLACK | MC Acid Black oversized T-shirt | black oversized streetwear tee; 240 GSM cotton shirt |
| MC ACID OFF-WHITE | MC Acid Off-White oversized T-shirt | off-white streetwear tee; 240 GSM shirt |
| THE GOOD TIME OFF-WHITE | The Good Time Off-White regular-fit T-shirt | regular-fit cotton tee; 240 GSM off-white shirt |
| WANNA GRAY | Wanna Gray regular-fit T-shirt | gray 240 GSM shirt; regular-fit cotton tee |

## Product Title Framework

Customer-facing title:

    [Recognizable design name] — [Fit] [confirmed GSM/material] T-Shirt

SEO title:

    [Design name] [color] [fit] [one differentiator] T-Shirt | Maria Clara Clothing

Marketplace/feed title:

    [Brand] [design] [color] [fit] [material/GSM] T-Shirt [size or variant only where channel rules require]

Rules:

- Preserve the design name.
- Use one consistent spelling for Off-White, Regular-Fit, Crop-Box, T-Shirt, and GSM.
- Do not force every attribute into every title.
- Use confirmed facts only.
- Store customer, SEO, marketplace, and feed titles separately.
- Treat character counts as editorial warnings, not Google ranking limits; Google truncates by layout and can rewrite titles.

## Product Description Framework

1. A unique, product-specific opening that describes the design and intended style.
2. Short key benefits derived from confirmed facts.
3. Product details: color, neckline, design placement, and origin.
4. Fit and sizing: actual cut, current variant range, garment measurements, and size-guide link.
5. Fabric and quality: material wording and GSM only when confirmed.
6. Care instructions sourced from approved owner/manufacturer guidance.
7. Current shipping summary pulled from store settings and a link to the full policy.
8. Customer-confidence content: real availability, public reviews when enabled, and support contact.
9. Parent collection and genuinely related products.

Do not duplicate the same generic opening across designs. Visual design details and care instructions require owner approval where the current data does not state them.

## Metadata Framework

| Page type | Recommended title approach | Description approach |
|---|---|---|
| Homepage | Maria Clara Clothing &#124; Filipino Streetwear & Premium T-Shirts | State oversized, regular-fit, and crop-box 240 GSM cotton T-shirts, Philippine origin, and nationwide online ordering only while those claims remain current |
| Shop | Shop Premium T-Shirts Philippines &#124; Maria Clara Clothing | Explain real fits, size availability, and delivery without repeating the homepage entity wording |
| Collection | [Collection] [commercial category] &#124; Maria Clara Clothing | One useful sentence describing who/what the collection is for and the actual products present |
| Product | [Design] [color] [fit] [differentiator] T-Shirt &#124; Maria Clara Clothing | Unique product summary using real color, fit, fabric/GSM, size guidance, and current availability without hard-coded urgency |
| Guide | [Question or task] &#124; Maria Clara Clothing | Promise the exact useful answer and link context |
| Support | [Topic] &#124; Maria Clara Clothing | Describe the policy/help content using current settings |

Every indexable page needs one self-referencing HTTPS canonical. Tracking, sort, and nonvaluable filter parameters should canonicalize to the clean route; permanent URL changes require one-hop redirects and updated internal links/sitemaps.

## Reusable Product SEO Template

| Field | Required content |
|---|---|
| Customer-facing title | Recognizable design name plus confirmed product type/fit; preserve brand language |
| SEO title | Unique design/color/fit query phrase plus Maria Clara Clothing |
| Meta description | Unique, factual summary; no fake urgency or unsupported claims |
| Product URL | Current stable /product/[public-handle] canonical |
| Main keyword | One exact design/color/fit transactional phrase |
| Secondary keywords | Closely related GSM, fabric, style, or Philippine-intent phrases; no volume claims |
| Product summary | Original 1–3 sentence design and use-case introduction |
| Product details | Color, neckline, design placement, origin, product type |
| Fit details | Confirmed fit, real size variants, garment measurements, size-guide link |
| Fabric details | Confirmed material wording and GSM; unknown percentage remains blank |
| Care instructions | Owner-approved care only |
| Shipping details | Runtime/current settings summary plus public policy link |
| Image filenames | Short product-design-color-angle filename for future uploads; do not break existing URLs |
| Image alt text | Visible product, color, fit, and exact angle/detail; size-chart images labeled as size charts |
| Structured values | Name, description, images, SKU/variant ID, brand, URL, PHP price, stock-derived availability, condition, color/material/size when confirmed |
| Related products | Same collection, design family, fit, type, and in-stock alternatives |
| Related collection | One real parent collection |
| FAQ ideas | Product-specific sizing, fabric weight, care, and delivery questions only when answers are visible and verified |
| Unknowns | Explicit “Owner confirmation required”; never fill with assumptions |

## Product Structured Data

### Current status

- Initial HTML contains Product or Offer information with numeric PHP price and stock-derived InStock/OutOfStock state.
- Home emits OnlineStore and WebSite data.
- BreadcrumbList exists but does not match all visible breadcrumb paths.
- Public product facts are lost through the catalog projection.
- Reviews are currently disabled publicly and no AggregateRating was found across the 18 live products.

### Required fixes

- Use one server/client resolver for name, description, canonical, images, price, stock, and facts.
- Add top-level product URL, seller, confirmed color/material, and supported size data.
- Include reviews only when published, visible, and allowed by global and product flags; visible count and average must match.
- Use ProductGroup only after each marked-up size/color variant has a directly preselectable URL and matching landing state, as required by Google’s variant guidance.
- Do not add fake GTIN, MPN, review, or stock values.

### Validation

- Parse every emitted JSON-LD block in automated tests.
- Compare visible price/stock to JSON-LD and feed values.
- Validate deployed product examples in Google Rich Results Test and Schema.org Validator.
- Inspect Search Console enhancement reports after recrawl.

## Image SEO

### Filename system

For new uploads: design-color-fit-view.ext, for example mandala-white-v1-oversized-front.webp. Existing URLs should remain stable; generate optimized derivatives or redirect migrated assets.

### Alt-text system

- Front: Maria Clara [design] [color] [fit] cotton T-shirt, front view.
- Back: same identity, back view.
- Detail: exact visible print or fabric detail.
- Model: model wearing [product], only when that is visibly true.
- Size chart: [fit] T-shirt size chart with garment measurements.
- Decorative hover duplicate: empty alt only when genuinely redundant.

### Current issues

- Seventeen products repeat alt text across angles.
- Mandala Black names Mandala White; Rockstar names Wanna Gray; Wanna Gray names The Good Time; Daruma includes “Copy”.
- MariaClara Orange’s size-chart image uses generic product alt text.
- A MariaClara Orange PNG is 877,301 bytes and lacks the responsive WebP derivative pattern.

## Collection SEO

### Freedom of Mind

- Live count: 10 active products.
- Primary intent: branded collection shopping, not a generic fit category.
- Recommended title: Freedom of Mind Streetwear Collection &#124; Maria Clara Clothing.
- Keep a concise original introduction above the grid; add product count, sort, breadcrumbs, and links to the fit/240 GSM guides.

### New Arrivals

- Live count: 8 active products.
- Primary intent: new streetwear T-shirts in the Philippines.
- Recommended title: New Streetwear T-Shirts Philippines &#124; Maria Clara Clothing.
- Keep freshness factual; no fake urgency or invented launch dates.

### Tees

- Live count: 0 active products.
- Current state: indexable, internally linked, and in sitemap.
- Immediate action: assign real products or noindex and remove it from sitemap/navigation.
- Once populated, it can own the broad “premium cotton T-shirts Philippines” commercial cluster. Do not create separate oversized/regular/crop collections until real membership and unique value justify them.

## Technical SEO

- Preserve SSI-injected initial HTML; it gives crawlers metadata, Product data, and fallback content without waiting for React.
- Centralize client metadata so SPA transitions cannot retain prior canonical, robots, OG/Twitter, or JSON-LD state.
- Return real 404 responses for missing collections and empty invalid filter combinations.
- Record collection URL history separately from collection-name membership aliases.
- Proxy legacy plural product handles directly to the existing product alias resolver.
- Build a verified legacy /pages and collection redirect map; do not redirect every missing URL to the homepage.
- Keep only canonical, indexable pages in sitemap. Invalid image URLs must be skipped rather than fail the entire XML response.
- Continue allowing CSS, JavaScript, images, products, and collections. Prevent crawl waste on private/API/search/filter routes where appropriate.
- Render actual FAQ, shipping, terms, and size-guide content in initial fallback HTML, not just headings.
- Keep one H1 and use real H2 sections for product details, fit/sizing, shipping, reviews, and related products.

## Google Merchant Center

### Current readiness

- Feed endpoint: /merchant-feed.xml.
- Live feed count: 97 size-variant items.
- Present: ID/SKU, item group, size, price in PHP, availability, condition, brand, category/type, primary and additional images.
- Missing across live items: color, material, gender, and age group.
- Current public facts pipeline prevents confirmed metafields from reaching the feed.

### Recommended delivery method

The existing scheduled XML feed is suitable for 18 products and 97 variants. It is simpler than an API integration at this scale. Merchant Center account shipping/returns settings, business verification, destination setup, and fetch schedule remain manual. If stock changes frequently enough to create mismatches, shorten caching or add supplemental/API updates after operational review.

### Required work before submission

- Confirm color, gender, and age group for every apparel offer; material where known.
- Keep each size SKU unique and grouped under the stable item group.
- Ensure feed and landing page titles, selected variant, price, currency, stock, and URL agree.
- Provide directly selectable variant state before claiming variant-specific landing behavior.
- Validate feed syntax and inspect Merchant Center Needs Attention; do not invent GTIN/MPN.

## Content Opportunities

| Topic | Intent | Natural destination links | Required factual input | Priority |
|---|---|---|---|---|
| What Does 240 GSM Mean for a T-Shirt? | Informational | 240 GSM products, Tees collection when populated | Confirm what 240 GSM means; avoid claiming exact durability or climate performance | P2 |
| Oversized Fit vs Regular Fit vs Crop-Box | Informational/commercial | Fit guide, size chart, relevant products | Real cut definitions and garment measurements | P2 |
| How to Choose Your Maria Clara Shirt Size | Support/commercial | Size chart and products | Product-specific measurement tables | P1 |
| How to Care for Premium Cotton Shirts | Informational | Cotton products | Owner/manufacturer-approved care instructions | P2 |
| Filipino Streetwear Styling Guide | Informational/commercial | Collections and products | Original styling photography and brand voice | P2 |
| How to Style an Oversized Shirt | Informational/commercial | Oversized products | Original outfits and photography | P2 |

Do not mass-publish thin articles. Draft unverified care/fabric claims in Admin until approved.

## Product-by-Product Recommendations

All recommended URLs intentionally retain the current live canonical. Changing a stable URL solely to shorten it is not worth the redirect and signal-migration risk. If an owner later approves a URL change, record the prior handle and redirect it permanently in one hop.

### Titles, metadata, URLs, and keyword ownership

| Live product/status | Recommended customer title | Recommended SEO title | Recommended meta description | Recommended URL | Main keyword |
|---|---|---|---|---|---|
| ABOT KAMAY WHITE — Premium Oversized 240 GSM Cotton Shirt; sale | ABOT KAMAY WHITE — Premium Oversized 240 GSM Cotton T-Shirt | Abot Kamay White Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Shop Abot Kamay White, an oversized 240 GSM cotton T-shirt made in the Philippines. Check the size chart, live availability, and delivery details. | /product/abot-kamay-white-premium-oversized-240-gsm-cotton-shirt | Abot Kamay White oversized T-shirt |
| BAHALA BLACK — Premium Oversized 240 GSM Cotton T-Shirt; sale merchandising state, zero total stock | Retain current title | Bahala Black Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Explore Bahala Black, an oversized 240 GSM cotton T-shirt made in the Philippines. View current sizes, stock, measurements, and delivery details. | /product/bahala-black-premium-oversized-240-gsm-cotton-t-shirt | Bahala Black oversized T-shirt |
| CURIOSITY BLACK — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | Curiosity Black Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Shop Curiosity Black, a relaxed oversized 240 GSM cotton T-shirt in black. Compare garment measurements, current sizes, and delivery information. | /product/curiosity-black-premium-oversized-240-gsm-cotton-t-shirt | Curiosity Black oversized T-shirt |
| CURIOSITY OFFWHITE — Premium Oversized 240 GSM Shirt; sale | CURIOSITY OFF-WHITE — Premium Oversized 240 GSM Cotton T-Shirt | Curiosity Off-White Oversized T-Shirt &#124; Maria Clara Clothing | Explore Curiosity Off-White, a relaxed oversized 240 GSM cotton T-shirt. Check the size chart, live availability, and nationwide delivery details. | /product/curiosity-offwhite-oversized-240-gsm-shirt | Curiosity Off-White oversized T-shirt |
| DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt; sale | DARUMA OFF-WHITE — Premium Oversized 240 GSM Cotton T-Shirt | Daruma Off-White Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Shop Daruma Off-White, an oversized 240 GSM cotton T-shirt with a crew neck. Review garment measurements, live sizes, and delivery details. | /product/daruma-offwhite-premium-oversized-240-gsm-cotton-t-shirt | Daruma Off-White oversized T-shirt |
| HAWAK WHITE — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | Hawak White Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Explore Hawak White, a white oversized 240 GSM cotton T-shirt made in the Philippines. Compare measurements, availability, and shipping information. | /product/hawak-white-oversized-240-gsm-shirt | Hawak White oversized T-shirt |
| IMPERIAL CHOCO TEE — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | Imperial Choco Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Shop Imperial Choco Tee, a chocolate-brown oversized 240 GSM cotton T-shirt. Check current sizes, garment measurements, and delivery details. | /product/imperial-choco-tee | Imperial Choco oversized T-shirt |
| INFINITE POSSIBILITIES BLACK — Premium Crop Box 240 GSM Cotton T-Shirt; sale | INFINITE POSSIBILITIES BLACK — Premium Crop-Box 240 GSM Cotton T-Shirt | Infinite Possibilities Black Crop-Box T-Shirt &#124; Maria Clara Clothing | Explore Infinite Possibilities Black, a 240 GSM cotton crop-box T-shirt with a wide, shorter silhouette. Check sizes and delivery details. | /product/infinite-possibilities-black-crop-box-240-gsm-shirt | Infinite Possibilities crop-box T-shirt |
| KAMALAYAN BLOOM BLACK — Oversized 240 GSM Shirt; sale | KAMALAYAN BLOOM BLACK — Premium Oversized 240 GSM Cotton T-Shirt | Kamalayan Bloom Black Oversized T-Shirt &#124; Maria Clara Clothing | Shop Kamalayan Bloom Black, a relaxed oversized 240 GSM cotton T-shirt in black. Compare current sizes, measurements, and delivery information. | /product/kamalayan-bloom-black-oversized-240-gsm-shirt | Kamalayan Bloom Black oversized T-shirt |
| KAMALAYAN EYE BLACK — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | Kamalayan Eye Black Oversized T-Shirt &#124; Maria Clara Clothing | Explore Kamalayan Eye Black, a black oversized 240 GSM cotton T-shirt made in the Philippines. View live sizes, measurements, and delivery details. | /product/kamalayan-eye-black-oversized-240-gsm-shirt | Kamalayan Eye Black oversized T-shirt |
| MANDALA BLACK V1 — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | Mandala Black V1 Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Shop Mandala Black V1, a relaxed oversized 240 GSM cotton T-shirt in black. Check the size chart, current availability, and delivery details. | /product/mandala-black-v1-premium-oversized-240-gsm-cotton-t-shirt | Mandala Black V1 oversized T-shirt |
| MANDALA WHITE V1 — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | Mandala White V1 Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Explore Mandala White V1, a white oversized 240 GSM cotton T-shirt made in the Philippines. Compare measurements, live sizes, and shipping details. | /product/mandala-white-v1-oversized-240-gsm-shirt | Mandala White V1 oversized T-shirt |
| MARIACLARA ORANGE — CROP BOX 240 GSM Shirt; sold out | MARIACLARA ORANGE — Crop-Box 240 GSM Cotton T-Shirt | MariaClara Orange Crop-Box 240 GSM T-Shirt &#124; Maria Clara Clothing | View MariaClara Orange, a crop-box 240 GSM cotton T-shirt with a crew neck. Check the product-specific size guide and current availability. | /product/mariaclara-orange-crop-box-240-gsm-shirt | MariaClara Orange crop-box T-shirt |
| MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt; sale | MARIACLARA ROCKSTAR — Premium Regular-Fit 240 GSM Cotton T-Shirt | MariaClara Rockstar Regular-Fit T-Shirt &#124; Maria Clara Clothing | Explore MariaClara Rockstar, a regular-fit 240 GSM cotton T-shirt made in the Philippines. Check measurements, live sizes, and delivery information. | /product/mariaclara-rockstar-premium-regular-fit-240-gsm-cotton-t-shirt | MariaClara Rockstar regular-fit T-shirt |
| MC ACID BLACK — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | MC Acid Black Oversized 240 GSM T-Shirt &#124; Maria Clara Clothing | Shop MC Acid Black, a relaxed oversized 240 GSM cotton T-shirt in black. Compare garment measurements, current sizes, and delivery details. | /product/mc-acid-black-oversized-240-gsm-shirt | MC Acid Black oversized T-shirt |
| MC ACID OFF-WHITE — Premium Oversized 240 GSM Cotton T-Shirt; sale | Retain current title | MC Acid Off-White Oversized T-Shirt &#124; Maria Clara Clothing | Explore MC Acid Off-White, a relaxed oversized 240 GSM cotton T-shirt. Check current size availability, measurements, and shipping information. | /product/mc-acid-offwhite-oversized-240-gsm-shirt | MC Acid Off-White oversized T-shirt |
| THE GOOD TIME OFF-WHITE — Premium Regular Fit 240 GSM Cotton T-Shirt; sale | THE GOOD TIME OFF-WHITE — Premium Regular-Fit 240 GSM Cotton T-Shirt | The Good Time Off-White Regular-Fit T-Shirt &#124; Maria Clara Clothing | Shop The Good Time Off-White, a regular-fit 240 GSM cotton T-shirt. Review garment measurements, current sizes, and nationwide delivery details. | /product/the-good-time-offwhite-regular-fit-240-gsm-shirt | The Good Time Off-White regular-fit T-shirt |
| WANNA GRAY — Premium Regular Fit 240 GSM Cotton T-Shirt; sale | WANNA GRAY — Premium Regular-Fit 240 GSM Cotton T-Shirt | Wanna Gray Regular-Fit 240 GSM T-Shirt &#124; Maria Clara Clothing | Explore Wanna Gray, a gray regular-fit 240 GSM cotton T-shirt made in the Philippines. Check the size chart, live availability, and delivery details. | /product/wanna-gray-premium-regular-fit-240-gsm-cotton-t-shirt | Wanna Gray regular-fit T-shirt |

The SEO titles above are editorial recommendations, not guarantees of the exact title Google will display. Current admin limits and pixel/layout testing should be applied before publication.

### Content, image, internal-link, and owner-review actions

| Product | Description recommendation | Image recommendation | Internal links | Structured-data status | Owner confirmation/issues |
|---|---|---|---|---|---|
| ABOT KAMAY WHITE | Replace the description shared with Bahala with an original design-specific opening; retain confirmed oversized, cotton, 240 GSM, crew-neck, Philippine-origin, size, and delivery facts | Six images share one alt; identify front, back, design detail, model, fabric, or packaging after visual review | Freedom of Mind; Hawak White; size guide; shipping | Partial: public price/stock works; custom SEO/facts blocked by projection | Confirm visible artwork/placement and approved care instructions |
| BAHALA BLACK | Create unique black-design narrative instead of the Abot duplicate; retain confirmed facts; use inventory-derived unavailable state and show active alternatives while all variants are at zero | Six images use two repeated alts; label real angles/details | Freedom of Mind; active black oversized alternatives; size guide; shipping | Partial | Reconcile sale merchandising status with zero stock; confirm design details; do not hard-code sold-out wording in metadata |
| CURIOSITY BLACK | Keep factual rich copy but remove generic template phrasing where possible and describe actual Curiosity artwork after approval | Seven images use one alt; add angle/detail labels | New Arrivals; Curiosity Off-White; black oversized alternatives | Partial | Confirm visual design details; current variants reach 3XL |
| CURIOSITY OFF-WHITE | Keep factual copy, normalize Off-White spelling, and ensure its visual description differs from the black colorway | Five images use two alts; identify angles | New Arrivals; Curiosity Black; off-white alternatives | Partial | Confirm visual differences beyond color |
| DARUMA OFF-WHITE | Keep confirmed fit/fabric/origin; replace generic styling template with Daruma-specific design text | All six images say “Copy”; remove that artifact and label angles | Freedom of Mind; other off-white oversized products; guides | Partial | Description says Small–3XL while live variants stop at 2XL; reconcile |
| HAWAK WHITE | Retain confirmed product facts and add original Hawak visual/design narrative | Six images use two repeated alts | Freedom of Mind; Abot Kamay White; size guide | Partial | Description says Small–3XL while live variants stop at 2XL; reconcile |
| IMPERIAL CHOCO TEE | Retain chocolate-brown, oversized, cotton, 240 GSM facts; add product-specific artwork description | Only two images and one repeated alt; add real detail/model imagery if available | Freedom of Mind; oversized collection when real; size guide | Partial | Description says Small–3XL while live variants stop at 2XL; confirm color naming and size copy |
| INFINITE POSSIBILITIES BLACK | Strongest fit differentiation; retain crop-box silhouette and current shipping caveats; remove payment copy from static product details if runtime methods can change | Six images use two alts; distinguish front/back/fit/detail | Freedom of Mind; MariaClara Orange; fit guide; size guide | Partial | Confirm care and the exact crop-box measurements; variants reach 3XL |
| KAMALAYAN BLOOM BLACK | Retain confirmed facts and add actual Bloom design description | Four images already distinguish lifestyle/model partly; finish front/back/detail labels | New Arrivals; Kamalayan Eye; black oversized products | Partial | Description says Small–3XL and variants reach 3XL; confirm design wording |
| KAMALAYAN EYE BLACK | Retain facts but add an original Eye design narrative | Only two images with one alt; add detail or model photo if real | Freedom of Mind; Kamalayan Bloom; size guide | Partial | Description says Small–3XL and variants reach 3XL; confirm visual wording |
| MANDALA BLACK V1 | Keep confirmed facts and add V1/black design-specific copy | Six images incorrectly say Mandala White; correct immediately, then label angles | New Arrivals; Mandala White V1; black oversized alternatives | Partial | Description says Small–3XL while live variants stop at 2XL; reconcile |
| MANDALA WHITE V1 | Retain factual copy and add original Mandala placement/detail text | Six images use two repeated alts; distinguish views | New Arrivals; Mandala Black V1; white oversized alternatives | Partial | Description says Small–3XL while live variants stop at 2XL; reconcile |
| MARIACLARA ORANGE | Preserve original copy for review; rebuild structured details, shipping, and size-chart fields from verified data; avoid static free-shipping claims | Eight images use one alt; size-chart image must say size chart; optimize the 877 KB PNG | Freedom of Mind; Infinite Possibilities; crop-box fit guide | Partial; current OutOfStock is correctly derivable | Confirm 100% cotton, 240 GSM, size measurements, care, shipping copy, and whether/when it should remain indexable while sold out |
| MARIACLARA ROCKSTAR | Stop publication of contradictory color wording until resolved; retain regular fit, cotton, 240 GSM, origin after confirmation | Five images incorrectly say Wanna Gray; correct product identity and angles | Freedom of Mind; Wanna Gray; The Good Time; regular-fit guide | Partial | Critical: narrative says gray while product facts say red. Owner must confirm visible color |
| MC ACID BLACK | Keep confirmed facts and add actual Acid artwork/placement description | Only two images with one alt; add real detail/model image if available | New Arrivals; MC Acid Off-White; black oversized products | Partial | Confirm design wording and care; variants reach 3XL |
| MC ACID OFF-WHITE | Keep confirmed facts, normalize Off-White, and differentiate design copy from black variant | Only two images with one alt | New Arrivals; MC Acid Black; off-white oversized products | Partial | Confirm visual differences and care; variants reach 3XL |
| THE GOOD TIME OFF-WHITE | Fix “The THE” grammar; move confirmed details and current shipping text into structured productPage fields | Only two images with one alt; add real detail/model imagery | Freedom of Mind; Wanna Gray; Rockstar; regular-fit guide | Partial | detailsText and shippingText are empty; live variants stop at 2XL |
| WANNA GRAY | Retain rich confirmed copy but populate structured detail/shipping fields | Six images incorrectly say The Good Time; correct identity and label angles | Freedom of Mind; The Good Time; Rockstar; size guide | Partial | detailsText and shippingText are empty; live variants stop at 2XL |

### Description preservation workflow

For every product, retain the existing database description as revision history. Store the proposed rewrite separately, review it with the owner against product photography and manufacturing data, then publish intentionally. Do not bulk overwrite descriptions or factual fields.

## Changes Implemented

### Verified pre-existing/live behavior

- Database-backed title, description, canonical, robots, OG/Twitter, and JSON-LD are injected into initial HTML through nginx SSI.
- Product pages expose PHP price and stock-derived availability in Product/Offer markup.
- Homepage includes OnlineStore and WebSite structured data.
- Product routes use stable public handles and permanent alias redirects.
- Canonical URLs use the HTTPS apex domain; www permanently redirects to apex.
- sitemap.xml, robots.txt, and merchant-feed.xml are public.
- Sitemap excludes private routes and includes product image entries.
- Private customer/admin/cart/checkout routes are marked or routed as nonindexable.
- Product grids and related products use crawlable links.
- Responsive Shopify/local image handling, below-fold lazy loading, primary-image priority, route-level JavaScript splitting, font swap, Caddy compression, and Web Vitals RUM exist.
- Product admin has basic SEO title, meta description, public handle, per-image alt, product facts, size/chart/shipping content, variants, and review settings.

### Uncommitted worktree drafts not counted as implemented

At audit time the shared worktree contained draft changes for catalog field forwarding, a product SEO resolver, ProductGroup/review markup, feed fields, SEO audit/export APIs, collection SEO storage, collection route resolution, robots API disallow, sitemap changes, and selected legacy redirects. These changes were uncommitted and had not completed build, regression, rich-result, feed, mobile, or production validation. They remain “worktree draft — unverified,” not “done.”

Notably still absent or incomplete in that snapshot:

- A centralized React SEO component used by every route.
- A wired Admin > Marketing > SEO screen; an API draft alone does not satisfy the dashboard requirement.
- Full product SEO fields in Product Editor and complete collection SEO fields in the Collections UI.
- Automatic exclusion of the empty Tees collection from the sitemap.
- Visible/schema breadcrumb parity.
- Initial HTML containing actual FAQ, shipping, terms, and size-guide sections.
- Verified directly selectable variant URLs needed for ProductGroup eligibility.
- Complete 18-product production content updates and owner approvals.

## Remaining Manual Work

- Confirm MariaClara Rockstar’s real color and correct all copy/images accordingly.
- Reconcile every stated size range with current variants; several pages say 3XL while ending at 2XL.
- Approve product-specific artwork, print-placement, and care wording for all 18 products.
- Correct angle-specific alt text after visually reviewing every gallery image.
- Confirm apparel gender, age group, color, and material for Merchant Center; do not infer.
- Decide how long sold-out products remain indexable and what alternatives appear.
- Approve collection introductions, primary keywords, and product membership, especially Tees.
- Obtain legacy URL inventory from Search Console, analytics, old sitemap, and prior platform records.
- Configure and verify Search Console and Merchant Center, including business, shipping, returns, and feed schedule.
- Capture baseline and post-release search clicks/impressions, product views, add-to-cart, checkout, sales, and Core Web Vitals without attributing causality prematurely.

## Priority Roadmap

### P0 — Immediate

1. Fix catalog projection and prove custom SEO/metafields/timestamps reach public API, initial HTML, schema, feed, and sitemap.
2. Centralize route metadata and remove stale schema/robots/canonical behavior during SPA navigation.
3. Noindex/remove empty Tees or assign verified members before keeping it indexable.
4. Return true 404 for unknown collections and preserve old collection slugs with one-hop redirects.
5. Restore verified legacy Shopify product/page/collection redirects.
6. Resolve Rockstar color, wrong-product alt text, and size-range contradictions.
7. Gate review markup by the exact public visibility rules.

### P1 — First 30 Days

1. Publish reviewed unique metadata and descriptions for all 18 production products.
2. Complete product and collection SEO editor fields, warnings, preview, dashboard, and secure CSV export.
3. Make visible and structured breadcrumbs identical; add parent collection, size, and shipping links.
4. Fix sitemap/noindex consistency and invalid-image resilience.
5. Complete Product/Offer facts without premature ProductGroup markup.
6. Correct all gallery alt text and optimize the large PNG while preserving its old URL.
7. Populate or suppress Tees and add useful collection introductions/product counts.
8. Render actual support-page content in initial HTML.
9. Validate and complete the Merchant feed with owner-confirmed apparel data.

### P2 — Next 60–90 Days

1. Publish original 240 GSM, fit, size, care, and styling content after factual review.
2. Add real moderated reviews and customer photos only when operations are ready.
3. Create fit collections only when inventory and unique content justify them.
4. Test ProductGroup/variant URLs after direct variant selection is implemented.
5. Use Search Console and Merchant query data to refine titles and page ownership.
6. Run performance experiments using field data; optimize genuine LCP/INP/CLS bottlenecks.

### P3 — Future

1. Automate internal-link suggestions using real collection, fit, and stock data with editorial review.
2. Build a richer content hub only when original expertise and photography are available.
3. Consider international SEO only after shipping, currency, language, and operations support it.
4. Run title/collection-copy experiments with conversion and search measurements; do not create doorway/city pages.

## Final Status

**Not Ready.** The production site has a meaningful SEO foundation, but the public product-fact pipeline, SPA metadata lifecycle, empty collection indexability, soft 404s, legacy redirects, content contradictions, gallery alt quality, Merchant apparel attributes, admin controls, and full release validation remain incomplete.
