# Responsive React Website And Two-Tone Theme Design

## Goal

Make the active React storefront and admin usable from 320px through 2560px without changing their information architecture, functionality, content, or typography. Apply an approved two-tone interface theme using `#202020` and `#F1F1F1`.

The work is a targeted responsive audit, not a redesign. Existing desktop layouts remain the visual and structural reference unless a layout must wrap, stack, resize, or scroll locally to stay usable at narrower widths.

## Approved Scope

The active React application in `apps/web` is in scope:

- Storefront shell and routes: home, product, cart, checkout, thank-you, customer login and registration, account, account settings, FAQ, shipping and returns, and terms.
- Admin shell and routes: login, dashboard, orders, order detail, draft carts, abandoned checkouts, products, product editor, product countdown, collections, inventory, customers, discounts, discount detail, website content, and settings.
- Shared theme tokens and responsive component rules.
- Source regression tests, browser viewport checks, the complete web test suite, the production web build, and backend regression tests.

The legacy static frontend in `apps/api/public` is excluded. API behavior, persistence, commerce rules, authentication, and admin operations are excluded except for regression verification.

## Approved Visual Direction

### Theme

The interface uses two approved theme endpoints:

- `#202020`: primary text, primary actions, active navigation, dark navigation surfaces, and footer surfaces.
- `#F1F1F1`: page backgrounds, cards, form fields, light surfaces, and text placed on `#202020`.

Muted text, disabled states, dividers, hover states, and subtle surfaces may use opacity or `color-mix()` values derived only from these two endpoints. They must not introduce another brand hue.

Operational success, warning, and error colors remain permitted only where color conveys functional status. These colors are not part of the brand theme and must not expand into general interface decoration.

### Typography

Typography remains unchanged:

- Existing display headings continue to use the current `Clash Display` / `Archivo Black` stack.
- Existing body content continues to use the current `Switzer` / `Helvetica Neue` stack.
- No heading level receives a new font, capitalization rule, weight, letter spacing, or line-height solely as part of this work.

## Responsive Contract

The implementation must satisfy these conditions from 320px through 2560px:

- No document-level horizontal overflow.
- No clipped or overlapping text, controls, navigation, dialogs, drawers, media, or actions.
- Images and videos retain their intended aspect ratios and are not distorted.
- Long product names, customer names, addresses, order identifiers, promotion labels, and validation messages wrap without widening the document.
- Touch controls remain usable and keyboard focus remains visible.
- Dense tables remain tables and may scroll horizontally inside an explicit table container; they must not force the document itself to scroll horizontally.
- Content must not be hidden merely to satisfy an overflow check.
- Existing desktop information architecture and multi-column layouts remain intact when sufficient width exists.

Representative verification widths are 320, 375, 768, 1024, 1440, and 2560 pixels. Browser acceptance also covers mobile and tablet portrait and landscape behavior. These widths exercise the layout continuum; the implementation must use fluid sizing and breakpoints rather than device-specific user-agent rules.

## Component Behavior

### Shared Storefront Shell

- Keep the current header, navigation destinations, cart drawer, account entry, ticker, footer, and mobile menu behavior.
- Constrain the brand mark, navigation actions, cart badge, and drawer content so they cannot widen the viewport.
- Preserve the current desktop navigation and existing mobile navigation breakpoint.
- Allow long drawer item content to shrink and wrap while keeping image, quantity, price, and removal controls usable.

### Storefront Routes

- Preserve the current two-column mobile product grids unless an individual component cannot remain usable at 320px.
- Keep product media and product information stacked below the existing desktop breakpoint; thumbnail and detail-tab overflow stays locally contained.
- Keep cart items, upsells, customer account cards, and information-page content within their route containers.
- Keep checkout stacked at narrow and intermediate widths and retain the current desktop split view.
- Allow checkout fields, address values, order-summary content, and actions to wrap or stack without changing checkout behavior.
- Preserve the current cart and checkout product-image aspect-ratio rules.

### Shared Admin Shell

- Preserve the desktop sidebar at the current large-screen breakpoint.
- Preserve the horizontal mobile admin navigation and contain its scrolling within the navigation bar.
- Keep the admin shell and main outlet shrinkable with `min-width: 0` and no document-level horizontal overflow.
- Do not replace the existing navigation model with a new drawer or menu system.

### Admin Routes

- Stack page headers, actions, filters, summaries, forms, and detail sidebars only where the existing row or grid no longer fits.
- Keep current desktop grids and sidebars at their existing wide breakpoints.
- Keep orders, products, inventory, customers, discount, draft-cart, and editor tables in locally scrollable containers.
- Ensure toolbar controls, date inputs, search fields, status selectors, product media, order items, charts, and summary cards can shrink or wrap without clipping.
- Keep all current actions, route destinations, status controls, and data fields available at every supported width.

## Implementation Boundaries

Expected production changes are limited to:

- Theme tokens and narrowly scoped shared responsive rules in `apps/web/src/index.css`.
- Responsive utility classes in affected `apps/web/src` React components.
- No component rewrite unless a source-level audit proves the current component cannot satisfy the responsive contract through containment or reflow.

No generated `apps/web/dist` assets are edited by hand. They are produced only by the verified build.

## Error And Edge-State Handling

- Existing loading, empty, validation, API-error, authentication, success, warning, and disabled states retain their behavior.
- Functional error, warning, and success colors remain distinguishable from the two-tone theme.
- Loading and empty-state text must wrap within its container.
- Validation messages and long server error strings must not widen forms or pages.
- Missing or unusually shaped media must remain contained without distortion.
- If content is intrinsically wide, use an explicit local scroll container rather than clipping, hiding, or shrinking it below usability.

## Testing Strategy

Implementation follows test-driven development:

1. Add one focused failing source or browser assertion for the responsive or theme requirement being addressed.
2. Run it and confirm it fails for the intended missing behavior.
3. Apply the smallest production change that satisfies the assertion.
4. Run the focused test and the complete relevant suite.
5. Repeat for the next behavior.

Automated coverage includes:

- Exact approved theme endpoints and unchanged font-stack assertions.
- An inventory assertion covering every active storefront and admin route.
- Document-overflow checks at 320, 375, 768, 1024, 1440, and 2560 pixels.
- Assertions that designated wide tables scroll inside their own containers.
- Visibility and operability checks for critical navigation and route actions.
- Existing focused source tests and the complete web source test suite.
- Production `npm run build:web` verification.
- Root backend `npm test` regression verification.

Browser acceptance includes:

- Mobile and tablet portrait and landscape layouts.
- Standard and wide desktop layouts.
- Header, mobile menu, cart drawer, checkout forms, customer account views, admin navigation, filters, tables, detail pages, and dialogs.
- Long-content fixtures for names, addresses, order identifiers, and validation messages.
- Keyboard navigation and visible focus.
- Media aspect ratio and containment.
- Browser console checks for new runtime errors.

## Acceptance Criteria

- Every active React storefront and admin route satisfies the responsive contract from 320px through 2560px.
- The interface uses `#202020` and `#F1F1F1` as its only brand-theme endpoints.
- Existing heading and body typography is unchanged.
- No commerce, authentication, API, persistence, or admin-operation behavior changes.
- Dense data remains accessible through local table scrolling.
- Focused tests, the complete web suite, the production web build, backend regression tests, and browser acceptance checks pass.

## Non-Goals

- No legacy static frontend changes.
- No new navigation model, page structure, component library, or visual redesign.
- No new font or font-file integration.
- No content, product-media, API, database, pricing, inventory, checkout, order, analytics, notification, or authentication changes.
- No device-specific user-agent detection.
