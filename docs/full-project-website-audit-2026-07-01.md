# Maria Clara Clothing Full Project Website Audit

**Audit date:** 2026-07-01  
**Scope:** React customer website, React admin, Express API, PostgreSQL and JSON persistence, uploads, checkout, customer accounts, promotions, inventory, J&T operations, Meta tracking, tests, CI, Docker, and project documentation.  
**Constraint:** Recommendations preserve the current visual identity and avoid a broad UI redesign.  
**Repository rule for this audit:** No Git operations and no application behavior changes.

## Executive Summary

The project has advanced beyond a visual prototype. It has a credible commerce core: server-authoritative quotes, transactional checkout, stock deduction, idempotency, private guest confirmations, customer accounts, product administration, collections, promotions, inventory movements, Meta outboxes, notification outboxes, PostgreSQL migrations, and CI coverage.

The website is not yet ready for unrestricted public production traffic. The remaining blockers are concentrated in authentication, admin order/inventory consistency, J&T status semantics, privacy/retention, deployment hardening, and media ownership. These can be fixed without materially changing the approved UI.

### Recommended order

1. Harden production authentication, secrets, sessions, and abuse controls.
2. Make admin order edits, cancellation, inventory, and audit writes atomic.
3. Stop treating J&T workbook generation as proof that an order shipped.
4. Define privacy, retention, consent, backup, and restore operations.
5. Remove the legacy public frontend and harden the reverse proxy/API boundary.
6. Fix delivery performance: route splitting, compression, caching, and responsive media.
7. Add route-level SEO and improve customer discovery/confidence.
8. Reduce large modules, brittle tests, and documentation drift.

## Current Architecture

| Layer | Current implementation | Assessment |
|---|---|---|
| Customer and admin UI | One React 18/Vite/Tailwind SPA | Consistent and responsive, but ships all customer and admin routes in one bundle |
| Web delivery | Nginx container on port 8081 | Functional proxy; missing production headers, compression, and asset caching |
| API | Express application on port 3000 | Broad, tested API; also serves a second legacy static frontend |
| Primary data | PostgreSQL 16 | Good relational foundation with checkout transactions and useful indexes |
| Local/test fallback | JSON files under `apps/api/data` | Useful for tests, unsafe as a production fallback for transactional workflows |
| Media | Docker upload volume, repository media, and Shopify CDN URLs | Fragmented ownership and no complete lifecycle cleanup |
| Commerce | Stored quote plus transactional final checkout | Strong foundation and no longer browser-authoritative |
| Operations | Docker Compose, workers in API process | Suitable for local/small deployment; incomplete production health, backup, and monitoring controls |
| CI | Node 20/22, PostgreSQL, API/web tests, build, Playwright | Strong baseline; missing lint, type checking, audit policy, and deployment checks |

## Verified Strengths To Preserve

- Final checkout uses a server-stored quote and revalidates prices, stock, address hierarchy, shipping, and promotions.
- Checkout stock deduction, order creation, movements, promo claim, cart conversion, Meta outbox, quote consumption, and idempotency completion run in one PostgreSQL transaction.
- Idempotency keys are hashed and bound to a canonical request hash.
- Guest confirmation details require a private confirmation token; public order lookup returns only a minimal status summary.
- Product image uploads accept common raster formats, validate real image bytes, resize, and normalize to WebP.
- Products, collections, customer accounts, discounts, settings, carts, orders, and inventory are connected to admin workflows.
- The cart drawer has dialog semantics, focus management, Escape behavior, focus restoration, and scroll locking.
- Reduced-motion behavior, responsive layouts, keyboard focus styles, touch-target rules, and mobile overflow protections exist.
- CI runs PostgreSQL migrations and commerce integration tests on Node 20 and 22.
- The API uses structured 5xx logs and graceful HTTP/worker/database shutdown.
- Product image auditing currently finds no missing or unused local upload references.

## Evidence Snapshot

- Application source inventory: approximately 280 files excluding dependencies/build output.
- Test inventory: 47 API test files, 36 web unit/source test files, and 6 Playwright specifications.
- Largest active React modules include `OrderDetail.jsx` (about 786 lines) and `ProductEditor.jsx` (about 763 lines).
- `apps/api/src/routes/admin.js` is about 1,615 lines and combines many unrelated domains.
- Production JavaScript response: 435,663 bytes, delivered without gzip/Brotli and without a cache policy.
- API product-list response is about 44.8 KB for the current catalog and is always `no-store`.
- `apps/api/public` is about 310 MB. Several source photographs are 19–32 MB each.
- Seed-catalog image references: 39 Shopify CDN images and one local upload.
- Current favicon URL returns HTTP 404.
- Current production dependency audit: one direct high-severity `xlsx` finding with no npm auto-fix.
- Live proxied media uses `Cache-Control: public, max-age=0`.
- Runtime-style JSON data under `apps/api/data` includes nonempty order, notification, and movement records.

## Priority Matrix

| Priority | Recommendation | Impact | Effort | UI impact |
|---|---|---:|---:|---:|
| P0 | Production sessions, secrets, and abuse controls | Critical | High | None |
| P0 | Atomic admin order and inventory service | Critical | High | Small workflow clarification |
| P0 | Correct J&T export/shipment state model | Critical | Medium/High | Small status wording changes |
| P0 | Privacy, consent, retention, and tracked-data cleanup | Critical | Medium | Optional consent control |
| P0 | Backup/restore and production deployment boundary | Critical | Medium | None |
| P1 | Replace/isolate vulnerable `xlsx` | High | Medium | None |
| P1 | Security headers and proxy hardening | High | Medium | None |
| P1 | Media ownership, cleanup, and responsive variants | High | Medium/High | None |
| P1 | Route splitting, compression, and caching | High | Medium | Loading state only |
| P1 | SEO/prerendering/structured data | High | Medium | None |
| P1 | Customer account recovery and verification | High | Medium/High | Small account forms |
| P2 | Admin API pagination and dashboard aggregation | Medium | Medium | None |
| P2 | Customer discovery and buying-confidence improvements | Medium | Medium | Small additions |
| P2 | Module decomposition and test modernization | Medium | Medium | None |
| P3 | Documentation and repository cleanup | Low/Medium | Low | None |

# P0 — Required Before Public Production

## 1. Replace browser-readable bearer tokens with real sessions

### Current evidence

- Admin and customer tokens are stored in `localStorage`.
- The admin uses a shared long-lived bearer token rather than a server-side user session.
- Customer HMAC tokens last 30 days and use `CUSTOMER_AUTH_SECRET`, but Docker Compose does not provide that secret, so the code falls back to `local-customer-auth-secret`.
- Admin password/token also have known local defaults.
- Production startup validates the checkout confirmation secret, but it does not reject all known local authentication defaults.

### Recommendation

- Create server-side admin and customer sessions stored in PostgreSQL.
- Send only opaque Secure, HttpOnly, SameSite cookies.
- Add CSRF tokens for state-changing requests after moving to cookies.
- Add session expiry, rotation after login/password change, revocation, logout-all, and an admin actor ID.
- Fail startup in production when any local default secret/password/token is active.
- Store password hashes with a deliberate work factor and record credential-update timestamps.

### Acceptance gate

- Frontend JavaScript cannot read session credentials.
- A rotated/revoked session stops working immediately.
- Production cannot start with `admin`, `local-admin-token`, or `local-customer-auth-secret`.

## 2. Expand rate limiting and configure proxy trust correctly

### Current evidence

- Only admin login and checkout/order POST routes are rate-limited.
- Customer login/register, quote creation, cart-session writes, public order lookup, admin uploads, and password changes are not independently limited.
- The limiter is in-memory and appropriate only for a single API instance.
- Nginx sends `X-Forwarded-For`, but Compose does not set `TRUST_PROXY`; Express can therefore see the proxy container rather than the real customer IP.

### Recommendation

- Set the exact trusted proxy hop count in deployment.
- Add separate IP/account limits for customer login, registration, password actions, quote creation, cart writes, order lookup, uploads, and admin security endpoints.
- Move limiter state to Redis or PostgreSQL before running more than one API replica.
- Add temporary account lock/backoff for repeated credential failures without enabling account enumeration.
- Add request timeouts and total upload quotas.

## 3. Make admin order edits and inventory changes atomic

### Current evidence

- Admin order update runs `updateOrder`, cancellation restock, inventory movement insertion, status-event insertion, and delivered-notification enqueue as separate operations.
- A failure after `updateOrder` can leave the order changed without stock, movements, history, or notifications matching it.
- Editing order items/quantities does not compute and apply stock deltas.
- Independent status fields permit contradictory combinations.
- There is no optimistic version check for two admins editing the same order.

### Recommendation

- Introduce an `adminOrderService` using one PostgreSQL transaction.
- Lock the order and affected product variants.
- Compute old-versus-new line deltas, validate SKU/catalog identity, and reserve/release stock accordingly.
- Save the order, movements, audit event, and notification outbox changes atomically.
- Replace unrestricted status field editing with explicit commands and an allowed transition table.
- Require reasons for cancellation, refund, manual price overrides, re-export, and inventory corrections.
- Add an `updated_at` or version precondition and return HTTP 409 on stale edits.

### Acceptance gate

- Injected failure leaves order, stock, movements, events, and notifications unchanged.
- Concurrent edits cannot silently overwrite each other.
- Impossible status combinations are rejected.

## 4. Separate J&T workbook generation from shipment

### Current evidence

- Downloading the workbook sets orders to `shipped` and `out_for_delivery` immediately.
- Generating a spreadsheet only means “prepared for upload”; it does not prove J&T accepted or collected the parcel.
- Explicitly selected orders bypass the default eligibility filter.
- Multiple order status writes are not one batch transaction.
- The tracking-notification button records a log entry but does not send the tracking message.

### Recommendation

- Introduce `export_prepared`, `submitted_to_jnt`, `accepted_by_jnt`, `picked_up`, `in_transit`, `delivered`, and failure/return states.
- Store a durable export batch with checksum, orders, operator, timestamp, status, errors, and re-export reason.
- Workbook download should only mark `export_prepared`.
- Enforce the same eligibility validation for bulk and explicit selections.
- Update shipment state only after an acceptance/import result or a deliberate verified admin action.
- Distinguish “record notification” from “send notification”; connect the action to the existing outbox/providers.

## 5. Define privacy, consent, and retention controls

### Current evidence

- Meta Pixel is enabled by default in Compose and initializes without a consent decision.
- Privacy text discloses Meta tracking, but there is no consent/opt-out control.
- Public cart-session writes can store customer PII under a client-chosen session ID.
- Cart sessions, quotes, idempotency records, notification records, Meta identifiers, and guest orders do not have a complete documented retention/erasure schedule.
- Runtime-like order/notification data is present in repository JSON files.

### Recommendation

- Obtain legal/privacy review for the Philippines and any other served market.
- Gate nonessential Meta browser tracking behind the required consent standard and provide withdrawal.
- Define retention periods and scheduled purge/anonymization jobs for abandoned carts, expired quotes, idempotency records, notification payloads, Meta identifiers, logs, and account data.
- Use server-issued cryptographic cart-session IDs and signed ownership tokens.
- Minimize PII stored in abandoned-cart records and validate all field lengths.
- Remove real/runtime PII from tracked files; keep only explicit synthetic fixtures.
- Document data export, correction, and deletion procedures.

## 6. Establish production deployment, backup, and recovery

### Current evidence

- Compose explicitly describes local defaults but is currently the only deployment definition.
- API and legacy frontend are exposed directly on host port 3000.
- Only PostgreSQL has a container health check.
- There are no restart policies, resource limits, readiness checks, or documented media/database restore drill.
- Uploaded media lives in a Docker volume; PostgreSQL and media need coordinated backups.

### Recommendation

- Create a separate production deployment configuration with TLS termination and only the web gateway publicly reachable.
- Do not publish the API host port in production.
- Add API readiness that checks required configuration and database connectivity; add web/API health checks and restart policies.
- Run the API as a non-root user with a read-only filesystem except for required temporary/upload paths.
- Schedule encrypted PostgreSQL and media backups with retention and off-site copies.
- Perform automated restore drills into a disposable environment.
- Document rollback, secret rotation, failed checkout, failed worker, low disk, and media recovery runbooks.

# P1 — High-Value Reliability, Security, and Delivery

## 7. Replace or tightly isolate `xlsx`

The 2026-07-01 production audit reports one direct high-severity dependency: `xlsx` 0.18.5, affected by prototype-pollution and ReDoS advisories. npm reports no automatic fix.

Recommended action:

- Evaluate a maintained workbook library that preserves the required J&T template.
- If template fidelity requires SheetJS, obtain a supported fixed build and pin it explicitly.
- Until replacement, never accept customer-provided workbooks, enforce strict row/string/time/memory limits, and run export in an isolated worker process.
- Add dependency scanning to CI with a documented exception owner and expiry date.

## 8. Add security headers and reduce fingerprinting

### Current evidence

- Normal successful responses have no application-wide Content Security Policy.
- HSTS, Referrer-Policy, frame protection, and a Permissions-Policy are not configured.
- Responses expose Nginx and `X-Powered-By: Express`.
- External fonts, Shopify images, Facebook Pixel, and possible Meta APIs require a deliberate allowlist.

### Recommendation

- Disable Express `x-powered-by` and Nginx version tokens.
- Add a tested CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame restrictions, and HSTS at the HTTPS boundary.
- Set `X-Forwarded-Proto` and the correct host/proxy headers.
- Roll CSP out in report-only mode first because external fonts, Shopify CDN, and Meta scripts are active.

## 9. Remove the legacy static frontend and split API media from application code

### Current evidence

- Express still serves legacy HTML, CSS, and JavaScript from `apps/api/public`.
- Port 3000 exposes that second storefront/admin surface.
- The API Docker image copies the entire 310 MB public tree.

### Recommendation

- Confirm every active route is owned by the React app.
- Remove legacy HTML/JS/CSS and the `/collections/all` static fallback.
- Keep only API-required datasets and media, preferably outside the application image.
- Serve media through object storage/CDN or a dedicated media service.
- Redirect any historical legacy URLs at Nginx.

## 10. Create one complete media lifecycle

### Current evidence

- Product uploads are normalized, but banner/logo uploads still rely mainly on MIME metadata and size limits.
- Deleting a product image or product removes database references but does not remove the physical uploaded file.
- Product updates can orphan previous media.
- The seed catalog relies on 39 Shopify CDN URLs that the project does not fully control.
- Repository source photographs are far larger than browser delivery requires.

### Recommendation

- Reuse one signature-validating Sharp pipeline for products, banners, logos, and SEO images.
- Generate responsive AVIF/WebP variants and record width, height, format, checksum, and ownership.
- Add reference-aware cleanup or delayed garbage collection after product/banner deletion.
- Migrate active Shopify-hosted catalog media into owned storage/CDN.
- Keep original masters outside the deploy image; serve optimized derivatives only.
- Add upload rate limits, per-admin quotas, total-request caps, and decompression-bomb protections.

## 11. Split the JavaScript bundle by route

### Current evidence

- `App.jsx` imports every customer and admin page eagerly.
- A shopper downloads admin editors, reports, and settings code.
- The live JavaScript response is 435,663 bytes before transfer compression.

### Recommendation

- Use `React.lazy`/`Suspense` for all admin routes, checkout, accounts, and large customer pages.
- Keep the shell/home core in the initial chunk.
- Prefetch product/cart chunks after idle or intent.
- Add a bundle-size budget to CI.

Suggested budget:

- Initial customer JavaScript: under 170 KB uncompressed and under 60 KB compressed.
- No single lazy route chunk above 150 KB uncompressed without an explicit review.

## 12. Enable compression and immutable asset caching

### Current evidence

- The hashed JavaScript asset is returned without gzip/Brotli even when requested.
- Hashed JS/CSS have no explicit cache policy.
- Proxied media returns `max-age=0`.
- HTML correctly uses `no-store`, but all resources currently pay unnecessary repeat-transfer cost.

### Recommendation

- Enable Brotli/gzip for HTML, JS, CSS, JSON, SVG, and text datasets.
- Serve hashed assets with `Cache-Control: public, max-age=31536000, immutable`.
- Give versioned/hashed media a long cache lifetime and mutable API/settings responses `no-store`.
- Add ETag/Last-Modified revalidation only where immutable naming is unavailable.

## 13. Add responsive media behavior

- Add `srcset`/`sizes` to product cards, gallery, cart, checkout, banner, and logo images.
- Include intrinsic dimensions/aspect metadata to reduce layout shift.
- Load the first hero image eagerly with high priority; defer hidden banners.
- Lazy-load gallery thumbnails and below-fold recommendations.
- Avoid downloading full 6000×6000 assets into small thumbnails.

## 14. Add route-level SEO and crawler-readable product pages

### Current evidence

- One global title/description is reused across routes.
- Only `og:image` is updated dynamically.
- There is no canonical management, sitemap, robots file, Twitter metadata, or JSON-LD.
- The current favicon path `/brand/maria-clara-logo.png` returns 404.
- Product content and metadata require client-side JavaScript.

### Recommendation

- Fix the favicon reference immediately.
- Add unique title, description, canonical, Open Graph, and Twitter metadata for every public route.
- Add Product JSON-LD with PHP price, availability, image, SKU, brand, and canonical URL.
- Mark admin, login, account, cart, checkout, and thank-you routes `noindex`.
- Generate `robots.txt` and a sitemap from active products and public content.
- Pre-render or server-render home, product, collection, and policy pages.

## 15. Improve customer account security and lifecycle

- Add password reset, password change, email change with verification, and account deletion/export.
- Rate-limit login/register/reset by IP and account.
- Verify phone ownership before linking historical orders by phone.
- Add session/device management and login notification for sensitive admin/customer accounts.
- Handle duplicate registration races as a clear conflict rather than a generic 500.

# P2 — Product, UX, Admin, and Scale Improvements

## 16. Bound quantity by selected variant stock

The product page allows quantity to increase without a stock ceiling. Checkout correctly rejects excess stock, but customers discover the problem late.

Recommendation:

- Cap the quantity selector at selected-variant stock.
- Reset/clamp quantity when size changes.
- Display the exact available count only below the configured low-stock threshold.

## 17. Strengthen buying confidence without redesigning the product page

- Add a “View size guide” anchor beside size selection.
- Put the fit/material/care summary near the decision controls.
- Show region-aware delivery estimates before checkout when possible.
- Show the exchange-window summary with a policy link.
- Add an obvious support contact on product, checkout, and thank-you pages.
- Keep claims such as free shipping sourced from settings rather than hardcoded text.

## 18. Add real collection browsing and search

Custom collections currently become homepage sections but do not have dedicated customer routes.

Recommendation:

- Add `/collections/:slug` pages with canonical metadata.
- Link collection names/breadcrumbs to those pages.
- Add customer search across name, collection, tags, description, color/style terms, and available sizes.
- Add filter/sort controls only when catalog size justifies them.
- Preserve the current homepage visual layout.

## 19. Improve loading, error, and offline states

- Replace plain `Loading…` text with stable monochrome skeletons.
- Add retry actions for primary request failures.
- Use `AbortController` so stale route/search requests cannot overwrite newer state.
- Do not silently swallow failures that affect buying or admin operations.
- Provide an explicit checkout recovery path for expired/changed quotes.

## 20. Add server pagination and aggregate endpoints

### Current evidence

- Product and order lists are loaded in full and filtered in application memory in several paths.
- The dashboard loads all orders, then requests up to 25 order details with `Promise.all`.
- The public product endpoint returns the entire catalog.

### Recommendation

- Add one dashboard-summary endpoint for totals, status counts, top products, trends, and inventory alerts.
- Add server pagination/search/sort for orders, customers, products, carts, and discounts.
- Debounce admin searches and cancel superseded requests.
- Add a lightweight storefront product-card projection separate from full product details.

## 21. Complete collection administration

The new collection registry works. The next safe additions are:

- Description and SEO fields.
- Explicit ordering for homepage sections.
- Draft/visible state.
- Safe deletion only when unassigned, or an explicit migration target.
- Collection image/hero only if the business needs dedicated collection pages.

## 22. Improve admin destructive actions

- Replace native `window.confirm` dialogs with one accessible confirmation dialog component.
- Require typed confirmation or reason for high-impact operations such as product deletion, order cancellation, discount deletion, and re-export.
- Show the consequences: media cleanup, inventory effect, and customer visibility.

## 23. Add audit history beyond statuses

Record actor, timestamp, old/new values, and reason for:

- Customer/contact/address changes.
- Order item/price changes.
- Product inventory corrections.
- Discount/settings changes.
- Admin credential/security changes.
- Media and collection changes.

Make audit records append-only and queryable by entity and actor.

# P2 — Maintainability and Test Quality

## 24. Split large modules along domain boundaries

Recommended decomposition:

- `routes/admin.js` → products, orders, inventory, customers, discounts, settings, media, collections.
- `OrderDetail.jsx` → customer, address, line items, statuses, parcel, notifications, history.
- `ProductEditor.jsx` → details, media, variants, organization, SEO, product-page content.
- `Checkout.jsx` → contact/address, quote review, payment, order submission hooks.
- `Shell.jsx` → header, mobile navigation, cart drawer, footer, promo notification.

Keep rendered markup/classes stable during extraction.

## 25. Reduce dual-persistence risk

- Make PostgreSQL mandatory whenever checkout/order/admin mutation features are enabled.
- Keep JSON persistence explicitly test/demo-only.
- Prevent accidental production startup in JSON mode.
- Stop keeping module-load snapshots such as initial catalog arrays where they can drift from the active store.
- Give every test that mutates data its own temp file/schema and cleanup.

## 26. Make builds deterministic

### Current evidence

- API Docker build uses an app-local lock file.
- Root development uses a workspace lock file.
- Web Docker build runs `npm install` without copying a lock file.

### Recommendation

- Use the root workspace lock consistently for local, CI, API Docker, and web Docker builds.
- Use `npm ci` in every build.
- Pin base image versions/digests and use dependency update automation.
- Add a lockfile-consistency CI check.

## 27. Add linting, typing, and stronger behavior tests

- Add ESLint, formatting checks, and either TypeScript or `checkJs`/JSDoc types.
- Add coverage reporting for business-critical services.
- Replace high-value regex/source-text tests with rendered component/browser assertions.
- Add axe-core checks for home, product, cart, checkout, account, admin login, products, orders, and settings.
- Add visual regression screenshots at phone/tablet/desktop widths.
- Add tests for upload cleanup, stale admin edits, worker retries, backup migration, and production configuration.
- Keep the existing red/green API and Playwright journeys.

## 28. Improve CI gates

Add:

- Lint and formatting.
- Type checking.
- Production dependency audit with approved time-limited exceptions.
- Docker image build and vulnerability scan.
- Production environment validation test.
- Migration from the previous release against realistic data.
- Backup/restore smoke test.
- Bundle-size and image-size budgets.
- Playwright artifacts and Docker logs on failure.

# P3 — Documentation and Repository Hygiene

## 29. Repair current documentation drift

### Current evidence

- README says the API suite has 54 tests; the suite has grown substantially.
- README links to missing `docs/ENHANCEMENT_PROPOSALS.md`.
- README still presents the legacy frontend as a normal surface.
- Old audit documents describe issues that have since been fixed.

### Recommendation

- Update README commands, architecture, test counts, routes, secrets, and production warnings.
- Mark historical audits/specs as completed, superseded, or still active.
- Maintain one current launch checklist and one current operations handbook.
- Keep generated plans separate from operator documentation.

## 30. Separate source assets, seed data, runtime data, and generated output

- Store large source photography outside the runtime image.
- Keep only optimized web derivatives in deployable storage.
- Move runtime orders, notifications, and customer data out of tracked seed files.
- Keep explicit synthetic fixtures under a test-fixtures directory.
- Document which J&T workbook is canonical and remove redundant copies after verification.

# Phase-by-Phase Roadmap

## Phase 1 — Production Security and Data Boundary

**Goal:** Prevent credential compromise, abuse, and privacy leakage.

Deliverables:

- Mandatory production secrets and config validation.
- HttpOnly admin/customer sessions and CSRF protection.
- Correct trusted-proxy configuration and expanded rate limiting.
- Security headers in report-only, then enforcing mode.
- Privacy/consent decision and tracked runtime PII cleanup.
- PostgreSQL required for production mutations.

Exit criteria:

- No known local credentials can start production.
- No browser-readable auth token exists.
- Abuse tests return 429 per real client identity.
- Security/privacy review has documented owners and decisions.

## Phase 2 — Order, Inventory, and J&T Correctness

**Goal:** Make operational state trustworthy.

Deliverables:

- Transactional admin order service and optimistic concurrency.
- Enforced order state machine.
- Inventory deltas for line-item edits and cancellation/reversal.
- J&T export batches and non-shipping `export_prepared` state.
- Real tracking notification send action and audit events.

Exit criteria:

- Fault-injection tests prove atomic rollback.
- Workbook generation never marks shipment.
- Every stock-changing admin action has one matching audit trail.

## Phase 3 — Deployment, Media, and Performance

**Goal:** Make the site fast, recoverable, and operationally safe.

Deliverables:

- Production deployment boundary, readiness, health checks, and restart policies.
- Database/media backups plus restore drill.
- Legacy frontend removal.
- Owned media storage, variants, and orphan cleanup.
- Route splitting, compression, immutable caching, and bundle budgets.
- `xlsx` replacement/isolation.

Exit criteria:

- Restore drill succeeds.
- Only the gateway is publicly reachable.
- Initial storefront bundle meets budget.
- Active catalog no longer depends on third-party Shopify ownership.

## Phase 4 — SEO and Customer Confidence

**Goal:** Improve discovery and conversion without redesigning the site.

Deliverables:

- Product/collection routes with route-specific metadata and JSON-LD.
- Sitemap, robots, canonical URLs, noindex rules, and fixed favicon.
- Quantity stock cap, size-guide anchor, delivery estimate, returns/support summary.
- Search and collection browsing.
- Stable skeletons and retry states.

Exit criteria:

- Product metadata is crawler-readable without waiting for client API calls.
- Every indexable route has unique canonical metadata.
- Customers cannot select more units than visible stock.

## Phase 5 — Scale and Engineering Quality

**Goal:** Reduce change risk and support growth.

Deliverables:

- Dashboard summary API and paginated admin/public projections.
- Large module decomposition.
- Deterministic workspace Docker builds.
- Lint/type/coverage/axe/visual CI gates.
- Current README, launch checklist, and operations handbook.

Exit criteria:

- No customer request downloads admin code.
- Admin list performance stays bounded as records grow.
- Critical behaviors are tested through rendered behavior, not only source patterns.

# Recommended First Implementation Batch

The best first batch is entirely behavior/infrastructure focused and does not alter the visual design:

1. Add production environment validation for every secret and database requirement.
2. Set `TRUST_PROXY=1` for the Docker proxy path and add customer auth/quote/cart lookup limits.
3. Add report-only CSP and baseline security headers.
4. Fix the favicon URL.
5. Enable gzip/Brotli and immutable caching for hashed assets.
6. Change web Docker builds from `npm install` to lockfile-backed `npm ci`.
7. Create the transactional admin-order design and failure tests before changing order behavior.
8. Stop J&T export from marking orders shipped.

This batch removes immediate risk and waste while keeping the approved UI intact.

## Final Assessment

The project is technically substantial and has several unusually strong foundations for a small-store build, especially authoritative checkout, idempotency, database transactions, image normalization, CI, and accessible interaction behavior. The next phase should not be another visual redesign. It should make authentication, admin operations, shipment state, privacy, media, and deployment as reliable as the checkout core already is.
