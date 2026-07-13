# Defect Log — mariaclara

- **App / project:** `mariaclara` · https://mariaclaraclothing.com/
- **Original scan:** 2026-07-12 · **remediated and re-verified:** 2026-07-13
- **Original scan details:** the referenced `scan-report.md` was not included with
  this repository; the original evidence and reproduction notes are retained below.

> **Historical note:** The 2026-07-12 scan found D1, D2, and D10 open. The collection,
> routing, accessibility, and authentication code has changed since that scan.
>
> **Current re-verification (2026-07-13):** D1, D2, D3, D5, D6, D7, D8, D9, and
> D10 are resolved. D4 was verified in source and was never a defect. D7 was
> completed through a separate public-handle and alias migration; internal product
> identifiers connected to inventory, orders, images, and Pancake were not renamed.

## Summary

| ID | Severity | Area | Status | Defect |
|---|---|---|---|---|
| D1 | **High** | Navigation | **Resolved** | Freedom of Mind is a real managed collection, homepage section, and collection route |
| D2 | **Medium** | Routing / error handling | **Resolved** | Unknown routes and product handles return HTTP 404 and render noindex recovery pages |
| D10 | **Medium** | Navigation | **Resolved by redesign** | Category navigation uses `/collections/:slug`; delayed homepage hashes also scroll correctly |
| D3 | Low | Accessibility | **Resolved** | Issue control has one explicit accessible name: `Report an issue` |
| D5 | Low | Consistency | **Resolved** | Category URLs use the admin-managed collection slug |
| D6 | Low | Consistency | **Resolved** | Logged-out desktop and mobile account links both say `Log in` |
| D7 | Low | SEO / cosmetic | **Resolved** | Clean public handles are separate from internal product IDs; old URLs permanently redirect |
| D8 | Low | Accessibility | **Resolved defensively** | Contact and product-card links now provide explicit accessible names |
| D4 | Info | Auth (source review) | **Verified, not a defect** | React intercepts submit and sends credentials with POST requests |
| D9 | Info | Content | **Resolved** | Best Seller remains available internally but is hidden from homepage collections |

## Remediation evidence

- Automated browser regressions: `apps/web/e2e/defect-regressions.spec.js`
- Source regressions: `apps/web/test/defectRegressionsSource.test.js`
- Valid product route: HTTP 200
- Invalid product route: HTTP 404 plus `Product not found` and `noindex, nofollow`
- Invalid general route: HTTP 404 plus `Page not found` and recovery links
- Freedom of Mind direct hash and `/collections/freedom-of-mind` navigation: verified
- Report Issue and logged-out mobile account names: verified through the accessibility tree
- Legacy product URL: HTTP 308 to its name-based public handle
- Canonical product URL: HTTP 200 with a matching canonical link
- Product URL collisions: rejected before save with HTTP 409

## Recommendations

1. Keep the new defect regression tests in CI so blank routes, soft 404s, and
   collection navigation cannot regress.
2. Keep public handles separate from internal product IDs. The Admin product editor
   may change a public handle, while previous handles remain permanent aliases.
3. Retain the collision and redirect regressions in CI so an Admin edit cannot
   reuse another product's current or historical URL.
4. Continue treating SKUs, Pancake product IDs, Pancake variant IDs, and historical
   order item identifiers as immutable integration data.

---

## Detailed findings

### D1 — "Freedom of Mind" navigation targets a section that does not exist  ·  Severity: High
- **Status (2026-07-13): Resolved.** Freedom of Mind is an admin-managed visible
  collection with linked products, a homepage section with id `freedom-of-mind`,
  and a working `/collections/freedom-of-mind` page. The hero hash is re-applied
  after asynchronous collection data renders.
- **Pages:** Every page (header category nav) **and** homepage hero.
- **Elements:**
  - Header category nav: link **"Freedom of Mind"** → `/#freedom-of-mind`
  - Homepage hero: link **"Freedom of Mind"** → `#freedom-of-mind`
- **Expected:** Clicking scrolls to / lands on a "Freedom of Mind" collection section.
- **Actual:** No element with id `freedom-of-mind` exists on the homepage. The page has only three collection sections: **New Arrivals** (`#new-arrivals`), **Tees** (`#catalog`), **Best Seller** (`#best-sellers`). The link changes the URL hash but nothing scrolls/renders — a dead end for a prominently promoted category.
- **Evidence:** Waiting for `#new-arrivals`, `#catalog`, and `#best-sellers` each succeeded; waiting for `#freedom-of-mind` timed out (7 s) even though `#best-sellers` (later in the DOM) had already rendered.
- **Repro:** Load `/` → click "Freedom of Mind" in the top category bar (or the hero button). Nothing happens.
- **Fix suggestion:** Either add the missing "Freedom of Mind" section/collection, or repoint the link to an existing section, or remove the link.

### D2 — No 404 handling: invalid URLs return HTTP 200 with no not-found page  ·  Severity: Medium
- **Status (2026-07-13): Resolved.** The React catch-all renders a useful noindex
  page. Nginx returns HTTP 404 for unknown routes and performs an internal product
  API existence check so invalid product handles also return HTTP 404. Valid
  product, checkout, account, collection, and admin routes remain HTTP 200.
Two distinct broken behaviors, both returning **HTTP 200** for resources that don't exist:
- **Invalid product URL** (e.g. `/product/this-product-does-not-exist-404`): `main` stays on **"Loading…"** indefinitely (product `h1` never appears within 12 s) — a perpetual spinner with no error.
- **Invalid non-product URL** (e.g. `/asdf-nonexistent-route`): `main` renders **completely empty** — a blank white content area, no message.
- **Expected:** A "not found" page (ideally HTTP 404) with a message and a way back to the shop.
- **Impact:** Broken deep links / typos give users a dead screen; soft-404s (200 for a missing resource) also mislead search crawlers.
- **Repro:** Navigate to `/product/anything-invalid` (spinner) or `/anything-invalid` (blank).
- **Fix suggestion:** Add a catch-all route that renders a proper 404 state; detect unknown product handles and render not-found instead of an endless loading shell.

### D10 — Category anchor links don't scroll to their section when clicked from another page  ·  Severity: Medium
- **Status (2026-07-13): Resolved by redesign.** Site-wide category navigation no
  longer uses homepage anchors; it opens canonical collection routes. Homepage
  hero hashes are handled after collection rendering for direct and same-page use.
- **Pages:** Any non-homepage (reproduced from a product detail page; the header "Shop categories" nav is present site-wide).
- **Elements:** category nav links **"New"** (`/#new-arrivals`), **"Tees"** (`/#catalog`), **"Best Seller"** (`/#best-sellers`).
- **Expected:** Clicking (e.g.) "Best Seller" from a product page navigates to the homepage **and scrolls to the Best Seller section**.
- **Actual:** The browser navigates to the homepage and the URL correctly becomes `…/#best-sellers`, **but the page does not scroll** — it stays at the top of the homepage. Sections below the fold ("Tees" / "Best Seller") are therefore unreachable via these links from another page. This matches the user report ("clicking Best Seller just redirects to the home page, not the Best Seller section").
- **Note on "New":** the `#new-arrivals` case *passes* the scroll check, but only because that section sits directly below the hero and is already within the viewport at scroll-top — not because a scroll actually happened. So it is not evidence the feature works.
- **Root cause (likely):** SPA/client-side routing updates the location hash but does not run scroll-to-anchor when the route changes (a common React-Router hash bug). Same-page clicks on the homepage itself are unaffected; the bug is specific to **cross-page** navigation.
- **Evidence / repro:** Automated Playwright spec `projects/mariaclara/regression/cross-page-anchor-nav.spec.ts` — from a product page it clicks each category link and asserts the target section is scrolled into view. Result: **`New` passes, `Tees` and `Best Seller` fail** with `toBeInViewport()` → *viewport ratio 0* (the `#catalog` / `#best-sellers` `<section>` exists but is off-screen), while the URL hash assertion passes (so the hash updates but no scroll occurs).
- **Manual repro:** Open any product page → click "Tees" or "Best Seller" in the top category bar → you land at the top of the homepage, not the section.
- **Fix suggestion:** On route/hash change, scroll the element matching `location.hash` into view (e.g. a scroll-restoration/`hashchange` handler, or `element.scrollIntoView()` after navigation). Fixing this also makes D1's "Freedom of Mind" link viable once its section exists.

### D3 — "Report Issue" control has a malformed accessible name  ·  Severity: Low (a11y)
- **Status (2026-07-13): Resolved.** The responsive visible labels remain, while
  the button exposes the single explicit accessible name `Report an issue`.
- **Pages:** All.
- **Observed:** The control's accessible name resolves to **`"Issue?Report Issue"`** (visible label reads cleanly as "Report Issue").
- **Impact:** Screen-reader users hear a garbled, duplicated label.
- **Caveat:** This widget appears globally and may be an injected support/QA overlay rather than core site markup — confirm ownership before filing against the storefront.
- **Fix suggestion:** Give the button a single clean accessible name (e.g. `aria-label="Report an issue"`).

### D5 — Category anchor ids don't match their labels  ·  Severity: Low
- **Status (2026-07-13): Resolved.** Category navigation is generated from the
  admin-managed collection slug, such as `/collections/tees`.
- Nav **"Tees"** → `/#catalog` (section id is `catalog`, not `tees`); **"New"** → `/#new-arrivals` (heading "New Arrivals"). Links work, but the id/label drift is fragile and confusing to maintain. Align ids with labels (`#tees`, `#new`) or vice-versa.

### D6 — Account link label differs across breakpoints  ·  Severity: Low
- **Status (2026-07-13): Resolved.** Logged-out desktop and mobile links both use
  `Log in`; authenticated links use `Account`.
- Desktop header shows **"Log in"** (`/login`); the mobile navigation drawer shows **"Account"**. Same destination, inconsistent wording. Pick one label.

### D7 — Product vanity slugs don't match product names  ·  Severity: Low (SEO/cosmetic)
- **Status (2026-07-13): Resolved.** Products now have a unique, editable
  name-based `public_handle`; existing `products.slug` primary keys remain intact.
  The migration stores every old slug in `product_url_aliases`, storefront links use
  the canonical handle, and Nginx returns a permanent HTTP 308 redirect for old
  handles. Admin handle changes retain the former handle as another alias, and
  cross-product route collisions are rejected.
- Example: tile **"KAMALAYAN BLOOM BLACK"** → `/product/oversized-fit-shirt-mc-curiosity-offwhite-…-copy`; tile **"CURIOSITY BLACK"** → `/product/…mc-eye-black-…-copy-copy-copy`. **The links resolve to the correct product** (verified — the PDP `h1` matched the tile in both cases), so this is not a broken path. It's leftover Shopify duplicate-handle noise (`-copy`, `-copy-copy`) that hurts URL readability/SEO.

### D8 — Concatenated accessible names on Contact & product-card links  ·  Severity: Low (a11y) *(low confidence)*
- **Status (2026-07-13): Resolved defensively.** Contact links now expose
  `Label: value`; product cards expose an explicit product-and-price link name.
- Contact links expose names like `"MessengerMessage us on Messenger"`, `"Emailmariaclaraclothing@gmail.com"`; product cards expose `"…Shirt₱649.00 PHP₱929.00 PHP"`.
- **Confidence caveat:** this is largely a **snapshot-representation artifact** — the tool's flat `interactiveElements` strings concatenate nested text, while the ARIA *tree* shows these as normally-nested link names with spacing. Full-text product-card links (name + prices) are also a standard pattern. Worth a quick manual screen-reader spot-check, but likely not a real defect. Included for completeness only.

### D4 — Login/register form submit mechanism unverified  ·  Severity: Info *(dev source review, not a confirmed defect)*
- **Status (2026-07-13): Verified, not a defect.** Both forms call
  `event.preventDefault()` and the customer client sends JSON to login/register
  API endpoints using `method: 'POST'`.
- **URLs:** `/login`, `/register`.
- **Context:** An earlier hypothesis was that these forms submit via GET (which would leak credentials in the URL). **That is not supported by the evidence.** The snapshot tool reports every form on the site as `{action:null, method:"get", fields:[]}` — including forms whose Email/Password/etc. textboxes clearly render — so it is failing to parse form internals. `action:null` + `method:"get"` is exactly what a React `<form>` with a JS `onSubmit` handler and no explicit `method` reports (the HTML default), *not* evidence of a real GET submission.
- **Status:** Cannot be confirmed black-box without submitting real credentials (out of scope on a live site). **Recommend the dev team verify in source** that credentials are POSTed (or sent via an intercepted handler), never GET. No user-facing defect observed.

### D9 — "Best Seller" repeats "New Arrivals" items  ·  Severity: Info
- **Status (2026-07-13): Resolved.** Best Seller is hidden from homepage and shop
  collection navigation by default without deleting its ranking logic.
- The "Best Seller" collection ("ranked from successful orders") lists CURIOSITY OFFWHITE / CURIOSITY BLACK, which also appear in New Arrivals. May be intended seeding, but worth confirming the ranking is real data.
