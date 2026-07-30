# Maria Clara Clothing Website Speed Recommendations

- Audit date: 2026-07-30
- Production URL: <https://mariaclaraclothing.com/>
- Production release audited: `9ca2c40`

## Objective

Make the customer storefront show useful content quickly on mobile connections, especially for customers in the Philippines. The main target is not only a high Lighthouse score; customers should see the hero and New Arrivals quickly, product cards should appear without waiting for duplicate API calls, and scrolling should not trigger unnecessary large downloads.

Google's recommended Core Web Vitals targets, measured at the 75th percentile separately for mobile and desktop, are:

- Largest Contentful Paint (LCP): no more than 2.5 seconds
- Interaction to Next Paint (INP): no more than 200 milliseconds
- Cumulative Layout Shift (CLS): no more than 0.1

Reference: [Web Vitals](https://web.dev/articles/vitals)

## Executive recommendation

Implement the first five recommendations in this order:

1. Deduplicate the homepage catalog and site-content requests.
2. Resize and convert the oversized header, footer, and collection-banner images.
3. Send a small product-card catalog response instead of complete product-page content.
4. Do not download product hover images on touch-only/mobile devices.
5. Load Meta Pixel after the critical visual content while preserving all event IDs and tracking behavior.

These changes address the largest measured costs without redesigning checkout, PayMongo, COD, inventory, Pancake, or the admin system.

## Production baseline

The following numbers are a point-in-time lab baseline, not permanent field data. Lighthouse results vary by network, test location, server cache, and device, so every release should be compared using multiple runs.

| Measurement | Audited result | Recommended direction |
| --- | ---: | ---: |
| Lighthouse mobile performance | 64 | At least 85 initially, then 90+ |
| First Contentful Paint | 3.6 s | Under 1.8 s |
| Largest Contentful Paint | 6.6 s | Under 2.5 s |
| Total Blocking Time | 130 ms | Under 200 ms |
| Cumulative Layout Shift | 0.02 | Under 0.1 |
| Initial transferred data | About 1.53 MiB (1,571 KiB) | Under 1.0 MiB |
| Requests in the Lighthouse run | 46 | Under 35 where practical |
| Main application JavaScript | About 95 KB compressed | Keep at or below 100 KB |
| Main stylesheet | About 19 KB compressed | Keep at or below 20 KB |

A separate unthrottled mobile browser run recorded:

- 29 resource requests and about 1.22 MB transferred after initial load.
- Two `/api/products` requests.
- Two `/api/site-content` requests.
- One `/api/storefront-settings` request.
- A 2.5-second LCP in that warm/fast test.

The difference between the Lighthouse result and the unthrottled result is why the site must be optimized and validated for slower, cold-cache mobile visits.

## What is already working well

Keep these existing optimizations:

- React routes other than the homepage are code-split with `React.lazy`.
- Production assets use hashed filenames and a one-year immutable cache.
- Cloudflare is serving hashed assets and brand images from cache.
- Caddy provides compressed responses using Zstandard or gzip.
- The homepage hero has `fetchPriority="high"` and `loading="eager"`.
- The server-generated SEO fallback exposes and preloads the hero before React runs.
- Product images use `srcset`, `sizes`, WebP derivatives, and lazy loading.
- The product upload pipeline already creates 320 px and 800 px WebP derivatives.
- The application already records anonymous Core Web Vitals.
- Layout stability was good in the Lighthouse run.

Do not remove the server-rendered hero fallback or lazy-load the hero image. Google recommends making the LCP image discoverable in the initial HTML and assigning it high priority. Reference: [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp).

## Priority 0: highest-impact changes

### 1. Deduplicate startup API requests

#### Finding

`Shell.jsx` and `Home.jsx` independently request both the complete product catalog and site content. A production browser trace recorded:

```text
/api/products       2 requests
/api/site-content   2 requests
/api/storefront-settings 1 request
```

The settings request is already deduplicated by `settingsPromise`, but products and site content are not.

The production catalog response contains 18 products and is:

- About 159 KB uncompressed.
- About 14 KB compressed.
- Marked `Cache-Control: no-store`.
- Approximately 250–600 ms per request in the audit.

#### Recommendation

Create the same promise-based request cache already used for storefront settings:

- `loadCatalogProducts()`
- `invalidateCatalogProducts()`
- `loadSiteContent()`
- `invalidateSiteContent()`

Use these loaders in `Shell.jsx`, `Home.jsx`, `Shop.jsx`, `Collection.jsx`, `Cart.jsx`, and other customer routes instead of calling `fetchProducts()` independently.

An alternative is a top-level `StorefrontDataProvider` that loads shared customer data once and supplies it to the shell and active route. Prefer a small loader module first because it is a lower-risk change.

Invalidate the cached promise after an admin changes products, inventory, site content, banners, or logos. Do not cache checkout quotes, carts, orders, payment status, customer data, or admin responses.

#### Files to start with

- `apps/web/src/lib/api.js`
- `apps/web/src/lib/storeSettings.js`
- `apps/web/src/components/Shell.jsx`
- `apps/web/src/pages/Home.jsx`
- `apps/web/src/pages/Shop.jsx`
- `apps/web/src/pages/Collection.jsx`

#### Acceptance criteria

- A cold homepage visit makes exactly one products request.
- A cold homepage visit makes exactly one site-content request.
- Client-side navigation to Shop reuses the settled catalog response.
- Product and site-content admin saves invalidate the relevant loader.
- Cart and checkout still validate current price and inventory on the server.

### 2. Resize and modernize logos and banners

#### Finding

The live page currently downloads files that are much larger than their rendered size:

| Asset | Transferred | Intrinsic size | Mobile rendered size |
| --- | ---: | ---: | ---: |
| Header logo PNG | About 126 KB | 5400 × 1109 | About 205 × 65 |
| Footer logo PNG | About 104 KB | 1999 × 1999 | About 256 × 80 |
| Mobile collection banner WebP | About 227 KB | 1365 × 2048 | About 350 × 525 |
| Mobile hero WebP | About 50 KB | 1200 px source selected | About 390 × 430 |

The header and footer logos alone cost about 230 KB. The footer logo is below the fold but does not declare `loading="lazy"`.

#### Recommendation

Extend the existing Sharp image pipeline to handle logos and banners:

- Generate transparent WebP logo variants at approximately 256 px and 512 px wide.
- Remove transparent whitespace before resizing logos.
- Keep the original upload only for admin editing or future regeneration.
- Add logo `srcset` and accurate `width` and `height`.
- Add `loading="lazy"` and `decoding="async"` to the footer logo.
- Generate collection-banner variants appropriate for mobile, tablet, and desktop.
- Suggested mobile banner widths: 480 px and 768 px.
- Suggested desktop banner widths: 1200 px and 1920 px.
- Use `<picture>` with mobile and desktop sources plus matching dimensions.
- Keep the first hero eager and high priority, but add a 640–800 px mobile hero variant if visual quality remains acceptable.

Suggested budgets:

- Header logo: no more than 20 KB.
- Footer logo: no more than 20 KB.
- Mobile collection banner: no more than 80 KB.
- Mobile hero: no more than 60 KB.
- Product-card image: normally no more than 40 KB at the selected mobile width.

#### Files to start with

- `apps/api/src/routes/admin.js`
- `apps/api/src/images/`
- `apps/web/src/components/Shell.jsx`
- `apps/web/src/components/CollectionBanner.jsx`
- `apps/web/src/lib/responsiveImage.js`

#### Expected benefit

Approximately 190–300 KB can be removed from common mobile page loads, depending on how close the customer scrolls to the collection banner.

### 3. Add a small catalog-card API response

#### Finding

The homepage and shell download complete product-page data even though product cards need only a small subset. Approximate uncompressed contributions inside the current catalog response are:

| Product field | Approximate bytes |
| --- | ---: |
| `productPage` | 56.6 KB |
| `images` | 26.1 KB |
| `variants` | 21.8 KB |
| `description` | 20.0 KB |
| `seo` | 8.8 KB |

The complete response is about 159 KB uncompressed. Much of this data is unused on the homepage.

#### Recommendation

Add a public product-card summary response, for example:

```text
GET /api/products?view=card
```

Each record should contain only what the customer listing UI needs:

```js
{
  id,
  slug,
  publicHandle,
  name,
  priceCents,
  compareAtPriceCents,
  collections,
  category,
  featured,
  isSoldOut,
  merchandisingStatus,
  successfulOrderCount,
  images: firstTwoImages
}
```

Include minimal size and availability data only on routes where filtering by size requires it. Product pages should use the existing single-product endpoint for full descriptions, product-page blocks, SEO data, reviews, size guides, and all media.

For the homepage, consider returning only the products assigned to visible homepage collections. Do not send all 87 catalog images when the card needs at most two.

#### Safety requirement

The card endpoint is display data only. The checkout quote and order creation endpoints must continue to be authoritative for current price, discounts, shipping, and inventory.

#### Acceptance criteria

- Card response is below 60 KB uncompressed and below 10 KB compressed for the current catalog.
- Product detail pages still display every image and content block.
- Shop size filters continue to work.
- Checkout rejects stale or unavailable variants exactly as it does now.

### 4. Do not download hover images on touch-only devices

#### Finding

`ProductCard.jsx` renders both the primary and hover image for every product card. A hover image provides no value on most phones, but the browser may still download it as the customer approaches the card.

The live homepage contains:

- 18 product cards.
- 41 `<img>` elements.
- Two image elements for most product cards.

#### Recommendation

Only render or assign the hover image source when:

```css
(hover: hover) and (pointer: fine)
```

Do not rely only on `display: none`; an image with a populated `src` can still be requested. Use a small reusable hover-capability hook, or use source assignment that occurs only after capability detection. A further option is to preload the hover image only on the first actual pointer entry.

Keep the primary image:

- Eager for the first visible New Arrivals row.
- Lazy for product cards below the initial viewport.
- Responsive with the existing 320 px and 800 px WebP variants.

#### Acceptance criteria

- A mobile/touch homepage trace requests no hover-only product images.
- Desktop hover behavior remains unchanged.
- The first two to four visible product images are not delayed by lazy loading.

Reference: [Browser-level image lazy loading](https://web.dev/articles/browser-level-image-lazy-loading).

### 5. Move Meta Pixel out of the critical visual-loading window

#### Finding

The mobile Lighthouse run downloaded approximately:

- 106 KB for `fbevents.js`.
- 119 KB for the Meta pixel configuration script.

That is about 225 KB of third-party JavaScript. The production configuration currently has Meta Pixel enabled with `requireConsent: false`, so it begins loading for every customer visit. Lighthouse also estimated about 109 KB of unused JavaScript during the initial view.

#### Recommendation

Keep the local `/meta-bootstrap.js` small, but run it with `defer` and delay the remote Meta library until one of these safe points:

1. Immediately after the hero LCP is rendered.
2. `window.load`, followed by `requestIdleCallback`.
3. The first meaningful customer interaction, with a short maximum timeout so PageView is still recorded.

Queue the initial PageView before loading the remote library so it is delivered afterward. Preserve the existing browser/server `event_id` behavior for deduplication. Do not delay or remove the server Conversions API events.

Before release, confirm in Meta Test Events that PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase still arrive as expected.

This recommendation changes loading time, not tracking definitions. It must not:

- Generate new event IDs.
- Send duplicate events.
- Delay a Purchase until it can be lost.
- Re-enable browser Purchase if it is intentionally disabled.
- Change Conversions API payloads.

Third-party scripts add network and execution overhead and should not compete with critical content. Reference: [Third-party JavaScript performance](https://web.dev/articles/third-party-javascript).

## Priority 1: next improvements

### 6. Self-host and reduce web-font files

#### Finding

The initial HTML loads a render-blocking Fontshare stylesheet from another origin. One browser run measured about 883 ms for that stylesheet. It defines seven font files:

- Clash Display: 500, 600, and 700.
- Switzer: 400, 500, 600, and 700.

Although `font-display: swap` is already used, the external stylesheet still adds DNS, TLS, and stylesheet latency.

#### Recommendation

- Confirm the Fontshare license permits self-hosting.
- Download and serve only required WOFF2 weights from the same production origin.
- Prefer variable fonts if their total size is smaller than the individual weights.
- Subset to the characters the storefront needs if the license and tooling permit it.
- Preload only the one font file required by the above-the-fold heading.
- Keep `font-display: swap`.
- If self-hosting is not possible, add a preconnect for `https://cdn.fontshare.com` and load the stylesheet in a non-blocking but visually tested way.

Do not preload all seven fonts; that would compete with the hero and product images.

### 7. Use safe short-lived catalog caching

#### Finding

`/api/products` is public data but currently forces `Cache-Control: no-store`. Every new page load reaches the API and performs product, sales, review, commerce-stat, and settings work.

#### Recommendation

Implement request deduplication first. Then consider one of these approaches:

- A 5–15 second in-process response cache invalidated by product, inventory, order, review, or settings writes.
- Browser/CDN caching such as `max-age=15, stale-while-revalidate=30`, only if display staleness is acceptable.
- ETag revalidation so unchanged responses can return `304 Not Modified`.

Short-lived display caching is safe only because checkout must revalidate current price and stock. Do not apply this policy to:

- Checkout quotes.
- Cart sessions.
- Orders.
- PayMongo endpoints or webhooks.
- Customer account data.
- Admin endpoints.

`stale-while-revalidate` can display a cached response immediately while refreshing it in the background. Reference: [Keeping things fresh with stale-while-revalidate](https://web.dev/articles/stale-while-revalidate).

### 8. Render less homepage content initially

The homepage is approximately 6,582 CSS pixels tall on a mobile viewport and includes 18 product cards. Keep New Arrivals first, but consider:

- Showing four or eight products per homepage collection.
- Linking to the complete collection for the remaining products.
- Applying `content-visibility: auto` and a suitable intrinsic size to sections well below the fold.
- Rendering lower collection sections after the browser is idle if `content-visibility` is not sufficient.

Do not hide content in a way that damages SEO or keyboard navigation. The server-generated SEO content should continue to describe the collection links.

### 9. Split customer and admin CSS

The compressed stylesheet is currently acceptable at about 19 KB, but customer visits receive styles for both the storefront and the admin application.

Recommendation:

- Move admin-only CSS behind the lazy-loaded admin layout.
- Keep the small shell/hero/customer critical styles in the initial customer bundle.
- Preserve Tailwind class discovery so production classes are not accidentally removed.

This is lower priority than images, duplicate data, fonts, and Meta because the current compressed CSS size is already reasonable.

### 10. Add route prefetching after the first screen is stable

After LCP and only on non-data-saver connections:

- Prefetch the Product route chunk when a product card gains pointer focus or enters a near-viewport boundary.
- Prefetch the Shop route chunk when the customer hovers or focuses Shop.
- Do not prefetch every product image or every admin route.
- Respect `navigator.connection.saveData`.

This will make the second customer action feel instant without competing with the initial hero and New Arrivals.

## Priority 2: architecture and infrastructure

### 11. Consider a storefront bootstrap endpoint

After the smaller loaders are working, a single endpoint could return:

```js
{
  settings,
  siteContent,
  homepageProducts
}
```

This would reduce connection and server overhead and provide one consistent data snapshot. It should contain only public customer data, support ETag/versioning, and remain separate from personalized customer/cart/order data.

Because the existing SEO response already knows the homepage hero, an advanced option is to inline a small, safely escaped bootstrap JSON payload for the first four New Arrivals. This should be considered only after the simpler deduplication and card-summary changes are measured.

### 12. Evaluate first-party image delivery

Several catalog images still come from Shopify CDN. That CDN already supplies width-specific files, which is useful. Long term, choose one consistent image pipeline:

- Keep Shopify CDN and enforce `width` parameters everywhere, or
- Import images into the existing first-party Sharp pipeline and generate AVIF/WebP variants.

Do not migrate solely to change domains; measure cache hit rate, image quality, and Philippine latency first.

### 13. Keep HTML dynamic unless a safe caching design is approved

The HTML currently contains:

- Server-side includes for route-specific SEO.
- A per-response Content Security Policy nonce.
- Runtime storefront settings and tracking bootstrap behavior.

Do not enable broad Cloudflare “Cache Everything” for HTML without redesigning those concerns. Continue caching hashed static assets aggressively. If HTML caching is introduced later, use explicit purge/versioning, route exclusions, and security review.

## Measurement and regression prevention

### Performance budgets

Add a CI check or Lighthouse CI configuration with initial budgets:

| Budget | Initial target |
| --- | ---: |
| Mobile Lighthouse performance | 85 minimum |
| LCP | 2.5 s maximum |
| Total Blocking Time | 200 ms maximum |
| CLS | 0.1 maximum |
| Initial transferred data | 1.0 MiB maximum |
| Initial requests | 35 maximum |
| Main application JavaScript | 100 KB compressed maximum |
| Customer CSS | 20 KB compressed maximum |
| Header logo | 20 KB maximum |
| Mobile hero | 60 KB maximum |

Run at least three cold-cache mobile tests and compare the median. Test:

- Homepage.
- Shop.
- A collection.
- A product page.
- Cart.
- Checkout review, without submitting an order.

### Improve real-user monitoring

The project already records FCP, LCP, CLS, INP, and TTFB. Improve the reporting so decisions are based on real customers:

- Report p75 separately for mobile and desktop.
- Group by route type: homepage, shop, collection, product, cart, and checkout.
- Record `effectiveType` and `saveData` without storing personal information.
- Exclude admin routes, automated audits, and development/test sessions.
- Add release commit/version to each performance sample.
- Prefer the official `web-vitals` package or verify the custom INP and CLS implementation against it.
- Keep only aggregated performance data; do not add customer names, emails, phone numbers, addresses, or payment information.

### Automated tests to add

- Homepage requests `/api/products` once.
- Homepage requests `/api/site-content` once.
- Client navigation reuses shared public data.
- Admin updates invalidate the right cached data.
- Mobile/touch mode does not request hover images.
- Header and footer use responsive image variants.
- Footer image is lazy-loaded.
- Hero remains eager, high priority, and preloaded.
- Product-card API excludes full `productPage`, `description`, and SEO content.
- Checkout revalidates price and stock despite display caching.
- Meta PageView still sends after deferred loading.
- Browser/server Meta events retain the same event ID.

## Recommended implementation sequence

### Release A: low-risk quick wins

1. Deduplicate products and site-content loaders.
2. Optimize header and footer logos.
3. Add lazy loading to the footer logo.
4. Prevent mobile hover-image downloads.
5. Add request-count and responsive-image tests.

Expected result: visibly faster repeat navigation and a substantial reduction in transferred image/data bytes.

### Release B: catalog and banner payload

1. Add the product-card summary response.
2. Move homepage, Shop, and Collection to the summary response.
3. Keep product pages on the full single-product endpoint.
4. Generate responsive collection-banner variants.
5. Add safe short-lived server caching or ETag validation.

Expected result: less API work, faster catalog display, and lower memory/parsing cost on budget phones.

### Release C: critical path and monitoring

1. Defer remote Meta Pixel without changing event semantics.
2. Self-host/subset fonts if licensing allows.
3. Split admin-only CSS.
4. Add Lighthouse CI budgets.
5. Improve route/device real-user performance reporting.

Expected result: more consistent cold-cache mobile LCP and reliable protection against future regressions.

## Definition of done

The performance project should be considered successful when:

- A customer sees the hero and useful content quickly on a cold mobile visit.
- Homepage LCP is at or below 2.5 seconds at p75 for real mobile users.
- INP is at or below 200 ms and CLS is at or below 0.1 at p75.
- The homepage makes one catalog request and one site-content request.
- Initial transferred data is below 1 MiB in the agreed mobile test profile.
- New Arrivals remains the first product collection on the homepage.
- Checkout, COD, PayMongo, Pancake, inventory, Meta deduplication, email, and order creation behave exactly as before.
- Performance budgets run automatically on future releases.
