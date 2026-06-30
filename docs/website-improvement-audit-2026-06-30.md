# Maria Clara Clothing Website Improvement Audit

Date: 2026-06-30  
Scope: Active React storefront, checkout, customer account pages, and React admin  
Constraint: Improve quality without materially changing the approved UI, typography, color theme, or page structure

## Executive Summary

The website already has a solid responsive foundation. The storefront uses consistent spacing and breakpoints, product media is contained correctly, buttons have clear interaction states, admin tables are protected by horizontal scrolling, and the project has broad API and source-level regression coverage.

The next work should focus on behavior and delivery quality rather than a redesign. The highest-value improvements are:

1. Make the cart drawer and mobile navigation fully keyboard and screen-reader accessible.
2. Darken secondary `text-clay` copy slightly so normal-size text meets WCAG contrast guidance.
3. Optimize product and banner images with responsive sources and explicit dimensions.
4. Add route-specific SEO metadata, especially for product pages.
5. Split the storefront and admin JavaScript bundles by route.
6. Improve mobile admin table usability without replacing the table UI.
7. Reduce admin dashboard API fan-out and split oversized components internally.

These changes can be completed without changing the website’s visual direction.

## What Is Already Working Well

- The approved `#202020` and `#F1F1F1` theme is centralized in `apps/web/src/index.css`.
- Storefront content has mobile, tablet, and desktop breakpoints.
- Product photos use contained frames and background blending consistently.
- Button and text-link hover, active, disabled, focus, and reduced-motion rules are shared.
- Admin tables use horizontal containment instead of forcing page-level overflow.
- Checkout uses server-authoritative quotes and idempotency protection.
- API tests currently pass: 177 passed and 2 intentionally skipped.
- Web source tests currently pass: 89 passed.
- Docker health checks confirm the API and storefront are running.

## Priority 1: Accessibility and Interaction

### 1. Make the cart drawer a real accessible dialog

Current evidence:

- `apps/web/src/components/Shell.jsx` renders the cart drawer as a fixed container and `<aside>`.
- The closed state uses `aria-hidden`, but the open drawer does not use `role="dialog"` or `aria-modal="true"`.
- There is no focus trap, Escape-key close behavior, focus restoration, or body scroll lock.

Recommended improvement:

- Add dialog semantics and connect the drawer heading with `aria-labelledby`.
- Move focus to the drawer when it opens.
- Trap keyboard focus inside the open drawer.
- Close it with Escape.
- Restore focus to the control that opened it.
- Lock background scrolling while open.
- Mark the inactive drawer content as inert when closed.

UI impact: None. This is behavior-only.

### 2. Improve secondary-text contrast

Current evidence:

- `--color-clay` is a 58% mix of `#202020` with `#F1F1F1`.
- Its calculated contrast against `#F1F1F1` is approximately 3.91:1.
- It is used frequently for 10–13px labels and supporting text.
- WCAG AA guidance for normal text is 4.5:1.

Recommended improvement:

- Increase the dark component of `--color-clay` from 58% to approximately 65%.
- Keep `--color-ink-soft` as-is; its contrast is approximately 7.37:1.
- Recheck footer text on the inverse background separately.

UI impact: Very small. Secondary copy becomes slightly darker without changing the theme.

### 3. Give the hero carousel pause and reduced-motion behavior

Current evidence:

- `apps/web/src/pages/Home.jsx` advances banners with `setInterval` every five seconds.
- Slide dots allow manual selection, but there is no pause control.
- CSS reduced-motion rules do not stop the JavaScript timer.

Recommended improvement:

- Stop automatic rotation when `prefers-reduced-motion: reduce` is active.
- Pause rotation while the carousel or its controls have keyboard focus or pointer hover.
- Add a small pause/play control with an accessible label.
- Keep the existing visual layout and slide dots.

UI impact: One small control near the existing dots.

### 4. Strengthen keyboard focus coverage

Current evidence:

- Shared focus styles cover buttons, role buttons, and the new text-action class.
- Some interactive cards and table rows depend primarily on hover or click behavior.

Recommended improvement:

- Ensure clickable dashboard cards and admin table actions show a clear focus-visible state.
- Avoid clickable `<tr>` elements unless they also support keyboard activation and an accessible name.
- Keep semantic `<Link>` or `<button>` elements as the actual interaction target.

UI impact: Focus rings appear only during keyboard navigation.

## Priority 1: Performance and Loading

### 5. Add responsive image delivery

Current evidence:

- Product, banner, logo, cart, and checkout images generally use a single `src`.
- No active React image uses `srcSet` or `sizes`.
- Most images do not declare intrinsic `width` and `height`.
- The home hero renders every banner image immediately, including hidden slides.

Recommended improvement:

- Generate or serve small, medium, and large variants for uploaded media.
- Add `srcSet` and `sizes` to product cards, product galleries, cart thumbnails, and banners.
- Add intrinsic dimensions or `aspect-ratio` metadata to reduce layout shift.
- Load the first hero image eagerly with `fetchpriority="high"`.
- Defer non-active banners and preload only the next slide.
- Keep product-card images lazy-loaded below the fold.

UI impact: None. Pages load faster and move less during image loading.

### 6. Split JavaScript by route

Current evidence:

- `apps/web/src/App.jsx` imports every storefront and admin page eagerly.
- The production JavaScript bundle is approximately 425 KB before gzip and 113 KB after gzip.
- Storefront visitors currently download admin page code they never use.

Recommended improvement:

- Use `React.lazy` and `Suspense` for admin routes, checkout, account pages, and large editors.
- Keep the home shell and core storefront path in the initial bundle.
- Prefetch likely next routes, such as product and cart, after the initial page becomes idle.

UI impact: None beyond a short existing-style loading state when opening a cold route.

### 7. Replace plain loading text with stable skeleton blocks

Current evidence:

- Several pages return plain `Loading…` text while data is fetched.
- Product and admin layouts can change height significantly after data arrives.
- Some optional requests silently fail and render empty content.

Recommended improvement:

- Use simple monochrome skeleton blocks matching existing product cards, headings, and tables.
- Reserve the final content dimensions to reduce layout shift.
- Add a compact retry action for primary request failures.
- Keep optional-content failures quiet but log them consistently.

UI impact: Small and temporary; no change after content loads.

## Priority 1: SEO and Discoverability

### 8. Add page-specific metadata

Current evidence:

- `apps/web/src/lib/storeSettings.js` sets one global title, description, and optional `og:image`.
- Product, FAQ, shipping, terms, cart, and account routes reuse the global metadata.
- Canonical URL, Open Graph title/description/URL, and Twitter card tags are not managed.

Recommended improvement:

- Set a unique title and description for every public route.
- Use product name, description, price, and primary image on product pages.
- Add canonical URL, `og:title`, `og:description`, `og:url`, and Twitter card metadata.
- Mark login, account, checkout, thank-you, and admin routes as `noindex`.
- Add `robots.txt` and an XML sitemap for indexable routes and products.

UI impact: None.

### 9. Improve crawler access to product metadata

Current evidence:

- The storefront is a client-rendered single-page application.
- Product metadata is available only after JavaScript and API requests run.

Recommended improvement:

- Pre-render public product and information routes during deployment, or inject route metadata at the web server layer.
- Add JSON-LD product structured data with price, currency, availability, image, and brand.

UI impact: None.

## Priority 2: Mobile Admin Usability

### 10. Improve wide-table navigation on phones

Current evidence:

- Orders uses a minimum table width of 1180px.
- Cart sessions uses 940px.
- Products and discounts use 920px.
- Other admin tables use minimum widths between 640px and 760px.
- Horizontal scrolling prevents page overflow, but important identity and action columns can move off-screen.

Recommended improvement:

- Make the first identity column sticky on the left.
- Make the primary action column sticky on the right where practical.
- Add a subtle edge fade or “Swipe to see more” hint only when overflow exists.
- Preserve the existing desktop tables; do not convert them into a new card design.
- Automatically scroll the active admin mobile-nav item into view.

UI impact: Minimal and limited to narrow screens.

### 11. Increase the smallest touch targets

Current evidence:

- Several icon, quantity, carousel-dot, and compact text controls are visibly smaller than the recommended 44×44 CSS-pixel touch area.

Recommended improvement:

- Increase invisible padding or use pseudo-element hit areas around small controls.
- Keep the visible icon and dot sizes unchanged.
- Prioritize carousel dots, quantity controls, close actions, and mobile admin navigation.

UI impact: None visually if hit areas are expanded invisibly.

## Priority 2: Admin Performance and Reliability

### 12. Replace dashboard request fan-out with one summary endpoint

Current evidence:

- `apps/web/src/admin/Dashboard.jsx` fetches the order list.
- It then loads details for up to 25 orders with `Promise.all` to calculate top products.
- This creates many requests each time the dashboard opens.

Recommended improvement:

- Add one admin dashboard-summary endpoint returning totals, status counts, top products, inventory alerts, and trend data.
- Keep dashboard cards and charts visually unchanged.
- Cache the summary briefly and invalidate it after order/product mutations.

UI impact: None. The dashboard becomes faster and more stable.

### 13. Add consistent request states and cancellation

Recommended improvement:

- Use `AbortController` when route changes make a pending request irrelevant.
- Standardize loading, empty, error, retry, and success states.
- Prevent stale requests from overwriting newer search/filter results.
- Debounce admin search inputs before making requests.

UI impact: None, except fewer flashes and stale results.

## Priority 2: Security and Session Handling

### 14. Move authentication tokens out of local storage

Current evidence:

- Admin and customer tokens are stored in `localStorage`.
- JavaScript-accessible tokens increase the impact of any future cross-site scripting issue.

Recommended improvement:

- Move sessions to Secure, HttpOnly, SameSite cookies.
- Add CSRF protection for state-changing requests.
- Keep the current login and account UI unchanged.
- Continue sanitizing admin-authored rich HTML and audit all `dangerouslySetInnerHTML` use.

UI impact: None.

### 15. Add production security headers

Recommended improvement:

- Add a restrictive Content Security Policy.
- Add `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and frame protection.
- Restrict external image and analytics origins explicitly.
- Keep secrets server-side and verify production environment validation at startup.

UI impact: None.

## Priority 3: Maintainability

### 16. Split oversized components without changing markup

Current evidence:

- `OrderDetail.jsx`: approximately 786 lines.
- `ProductEditor.jsx`: approximately 682 lines.
- `Checkout.jsx`: approximately 531 lines.
- `Discounts.jsx`: approximately 524 lines.
- `Dashboard.jsx`: approximately 434 lines.
- `Shell.jsx`: approximately 423 lines.

Recommended improvement:

- Extract focused sections, state hooks, and request helpers.
- Keep the rendered markup and CSS classes identical during extraction.
- Prioritize checkout calculations, cart drawer behavior, order editing, product media editing, and discount forms.

UI impact: None.

### 17. Add rendered behavior and visual regression tests

Current evidence:

- The project has strong API coverage and many fast source-pattern tests.
- Source-pattern tests confirm code text, but they do not prove actual browser layout or keyboard behavior.
- Browser coverage is currently concentrated on checkout.

Recommended improvement:

- Add Playwright coverage for home, product, cart drawer, mobile menu, checkout, and core admin pages.
- Test 375px, 768px, and 1440px widths.
- Add keyboard-only drawer/menu tests.
- Add screenshots for stable layout regions, not dynamic order data.
- Add automated accessibility checks to CI.

UI impact: None.

### 18. Centralize repeated status and formatting rules

Recommended improvement:

- Consolidate order, fulfillment, delivery, payment, stock, and discount status mappings.
- Reuse shared date, money, badge, empty-state, and error components.
- Keep the existing labels and visual treatments unless a separate design change is approved.

UI impact: None.

## Recommended Delivery Order

### Phase 1: Small changes with high impact

1. Accessible cart drawer and mobile menu behavior.
2. Darker `text-clay` contrast token.
3. Carousel reduced-motion and pause behavior.
4. Route-specific metadata and `noindex` rules.
5. Touch-target expansion.

### Phase 2: Performance

1. Route-level code splitting.
2. Responsive images and banner loading strategy.
3. Stable loading skeletons.
4. Dashboard summary endpoint.

### Phase 3: Admin and engineering quality

1. Sticky mobile table identity/action columns and overflow hints.
2. Request cancellation, debouncing, and standard states.
3. Component extraction without markup changes.
4. Browser accessibility and visual regression coverage.
5. Cookie-based sessions and security headers.

## Definition of Done

The improvement program should be considered complete when:

- No active route creates page-level horizontal overflow at 375px, 768px, or 1440px.
- All normal-size text meets at least 4.5:1 contrast.
- Cart drawer and mobile navigation are usable entirely by keyboard.
- Reduced-motion users do not receive automatic carousel movement.
- Key touch targets provide an effective 44×44px hit area.
- Public routes have unique metadata and products expose structured data.
- Storefront users do not download the complete admin bundle initially.
- Responsive image sources are used for product and banner media.
- Core storefront and admin routes have browser-level responsive tests.
- Existing typography, layout direction, theme colors, and overall visual identity remain intact.

## Suggested First Implementation

Start with the accessible cart drawer, contrast adjustment, carousel motion behavior, and touch-target expansion. They provide the largest immediate usability improvement, require no redesign, and can be delivered as a small isolated change with regression tests.
