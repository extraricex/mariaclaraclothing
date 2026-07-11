# Customer Storefront Hybrid UI Redesign Design

Date: 2026-07-08
Status: Approved visual direction

## Goal

Polish the customer-facing website with a Hybrid Recommended direction: a premium fashion first impression with sales-focused product cards, cart, and checkout. The work is UI-only and must not change storefront behavior, checkout logic, cart behavior, Pancake POS sync, API contracts, routes, or admin functionality.

## Visual Direction

The customer side should feel more refined and modern while staying practical for COD sales. The design should combine:

- Premium hero and campaign presentation.
- Clean product grids that make item photos, price, size availability, and sales badges easy to scan.
- Clear trust signals for Cash on Delivery, free shipping on 2+ items, J&T delivery, and live Pancake POS order sync.
- shadcn/ui-style primitives: restrained cards, buttons, inputs, badges, separators, sheets/dialog surfaces, and consistent focus states.
- Tailwind CSS utilities and small local React components instead of new business abstractions.

## Non-Goals

- No changes to API routes or payloads.
- No changes to checkout validation, totals, quote creation, idempotency, order placement, Pancake export, or inventory logic.
- No changes to admin pages.
- No new landing page separate from the shop.
- No new commerce feature such as wishlists, reviews, bundles, subscriptions, or online payment.
- No change to product data structure.

## Target Files

Customer UI files:

- `apps/web/src/components/Shell.jsx`
- `apps/web/src/components/ProductCard.jsx`
- `apps/web/src/pages/Home.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/src/pages/InfoPage.jsx`
- `apps/web/src/pages/Account.jsx`
- `apps/web/src/pages/AccountSettings.jsx`
- `apps/web/src/pages/CustomerAuth.jsx`
- `apps/web/src/index.css`

Optional local UI primitives:

- `apps/web/src/components/ui/Button.jsx`
- `apps/web/src/components/ui/Card.jsx`
- `apps/web/src/components/ui/Badge.jsx`
- `apps/web/src/components/ui/Input.jsx`
- `apps/web/src/components/ui/Separator.jsx`

Tests to update only for source/design expectations:

- `apps/web/test/*.test.js`
- E2E selectors must remain compatible with existing checkout tests.

## Architecture

Create lightweight shadcn-inspired UI primitives in `apps/web/src/components/ui/` if they reduce class duplication and improve consistency. These primitives should be purely presentational and accept normal React props/class names. They must not own cart, checkout, auth, or API state.

Existing page components keep their data fetching, event handlers, route structure, local state, and side effects. The redesign changes JSX structure, class names, and presentational grouping only.

## Component Design

### Shell

The shell should keep the existing route outlet, cart drawer, privacy dialog, promo notification, offer dock, support link, ticker, and nav behavior. The visual treatment should become cleaner:

- Header: compact premium bar with brand, nav, account/cart actions, and mobile menu.
- Cart drawer: shadcn-style sheet surface with stronger item hierarchy and totals block.
- Promo/ticker: restrained, readable, not visually noisy.
- Offer dock: keep existing behavior but align with the new card/button style.

### Homepage

The homepage should become the flagship visual page:

- Hero: premium dark or neutral campaign section with strong product imagery, concise value copy, and visible CTA.
- Collection sections: cleaner section headers, product grid, and better spacing.
- Trust strip: COD, 2-item free shipping, J&T, and Pancake synced orders.
- Avoid marketing fluff; keep the shop visible immediately.

### Product Card

Cards should remain clickable links to product pages and preserve current product data usage.

Visual requirements:

- Stable image frame with product photo fully visible.
- Clear sold-out and low-stock badges.
- Stronger product name and price hierarchy.
- Hover state that feels polished without hiding essential information.
- Mobile grid should remain dense and readable.

### Product Page

Preserve current gallery, size selection, quantity, add-to-cart, countdown, tabs, recommendations, and analytics behavior.

Visual requirements:

- More refined gallery and thumbnail presentation.
- Buying area should feel like a focused product panel, especially on desktop.
- Size/quantity controls should be visually consistent with shadcn-style controls.
- Add-to-cart button remains obvious and accessible.
- Product detail tabs remain readable and mobile-safe.

### Cart

Preserve current cart item editing, quote refresh, upsells, and checkout CTA behavior.

Visual requirements:

- Use a clear two-column desktop layout: items and order summary.
- Mobile remains single column.
- Totals, discounts, shipping state, and checkout CTA should be visually stronger.
- Upsell cards should match ProductCard styling.

### Checkout

Preserve the current two-step details/review flow, address data loading, discount logic, quote refresh, idempotency, order submission, customer address save, and thank-you navigation.

Visual requirements:

- Use a structured layout with form panel and order summary.
- Inputs/selects should look consistent and be easy to scan.
- Review step should make totals and COD status very clear.
- Error/status messages remain visible and accessible.
- Existing placeholders and button labels used by E2E tests should remain present.

### Supporting Pages

Thank-you, account, auth, and info pages should receive matching spacing, card, button, and typography treatment without changing behavior.

## Styling Rules

- Use Tailwind CSS v4 and existing CSS entrypoint `apps/web/src/index.css`.
- Introduce CSS variables for customer UI surfaces if needed, separate from admin Grafana variables.
- Keep radius at 8px or less unless a circular icon/button is semantically expected.
- Avoid one-note palettes. Use a neutral base with black/ink, soft paper, and one restrained accent.
- Do not add decorative gradient orbs, bokeh, or abstract SVG hero art.
- Product images must remain visible and inspectable.
- Text must not overlap or overflow on mobile.
- Do not scale font sizes with viewport width.
- Keep letter spacing at 0 except existing uppercase micro-labels where the current code already uses tracking.

## Accessibility

- Preserve semantic links/buttons and accessible names used by tests.
- Keep focus-visible styles on buttons, links, form controls, and cart drawer interactions.
- Maintain dialog/sheet focus behavior in cart drawer and privacy dialog.
- Keep contrast acceptable on dark and light surfaces.
- Ensure touch targets remain at least 44px where practical.

## Testing

Run these after implementation:

```bash
node --test apps/web/test/*.test.js
npm run build:web
npm run test:e2e -w apps/web -- e2e/checkout-v2.spec.js
```

Also verify locally:

```bash
curl -fsS http://localhost:8081/api/health
```

Manual visual checks:

- Homepage desktop and mobile.
- Product page desktop and mobile.
- Cart drawer and cart page.
- Checkout details and review steps.
- Thank-you page.
- Admin routes are not visually regressed by customer CSS changes.

## Rollback

Because this is UI-only, rollback is a git revert of the customer UI commit. No database migration or runtime data change is required.
