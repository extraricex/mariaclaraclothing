# Maria Clara Clothing Project Review

**Review date:** 2026-06-20  
**Branch reviewed:** `codex-edits` after merge commit `6e31329`  
**Scope:** API, React storefront and admin, persistence, authentication, checkout, inventory, uploads, Docker, CI, tests, documentation, assets, and operational readiness.

## Executive Summary

The project has a credible functional base: a React storefront and admin, PostgreSQL-backed catalog and orders, inventory deduction and restocking, customer accounts, promotions, settings, J&T export, Docker Compose, and broad API tests. It is suitable for continued development and controlled internal use.

It is not ready for unrestricted public production traffic yet. The highest-priority blockers are:

1. An unauthenticated order lookup returns customer and address data using an order number with limited randomness.
2. Checkout accepts the shipping fee and shipping region from the browser instead of calculating them authoritatively on the server.
3. Order creation, stock deduction, inventory movement creation, cart conversion, and discount usage are separate writes rather than one transaction.
4. Login, registration, checkout, quote, and upload endpoints have no rate limiting or abuse controls.
5. Production defaults permit known passwords and secrets, and bearer tokens are stored in browser `localStorage`.
6. The production dependency audit reports two direct high-severity vulnerable packages: `multer` and `xlsx`.

The recommended order of work is: protect customer data, make checkout authoritative and idempotent, make commerce writes atomic, harden authentication and uploads, establish production operations, then reduce duplication and improve maintainability.

## What Is Working Well

- API behavior is covered by a substantial Node test suite, including orders, inventory, discounts, customer accounts, admin settings, J&T export, and maintenance mode.
- Product prices are revalidated against the catalog during checkout rather than trusted blindly from the browser.
- PostgreSQL stock deduction uses a guarded update (`stock_quantity >= quantity`) to block overselling.
- Password hashes use Node's `scrypt` and timing-safe comparison.
- Admin upload routes enforce file count and size limits.
- Admin credentials can be rotated, and changing the password rotates the bearer token.
- Docker Compose provides a reproducible local stack with PostgreSQL health gating.
- CI tests Node 20 and 22, runs API and web tests, and builds the frontend.
- The codebase already has useful domain boundaries for products, orders, discounts, inventory, customers, site content, and settings.

## Priority Findings

### P0: Protect order confirmation data

`GET /api/orders/:orderNumber` is public and returns the customer's name, phone, email, full address, items, notes, and order totals. Order numbers contain a timestamp and only two random bytes, making targeted or opportunistic enumeration realistic.

**Evidence:**

- `apps/api/src/routes/orders.js:15-24`
- `apps/api/src/routes/orders.js:92-123`

**Recommendation:**

- Stop using the order number as the only access credential.
- Return a separate cryptographically random confirmation token at checkout and store only its hash.
- Require either that token or an authenticated customer account that owns the order.
- Return a reduced public confirmation shape and never expose phone, email, or full address unnecessarily.
- Add rate limiting and audit logging to order lookup failures.
- Add tests proving one customer cannot retrieve another customer's order.

### P0: Calculate shipping entirely on the server

Checkout passes `body.shippingFeeCents` directly into the quote engine. The shipping region and label are also accepted from the request. A modified request can submit a zero or incorrect shipping fee without proving the delivery address belongs to that region.

**Evidence:**

- `apps/api/src/routes/orders.js:151-169`
- `apps/api/src/promos/promoEngine.js:22-32`
- `apps/api/src/promos/promoEngine.js:53-67`

**Recommendation:**

- Derive the shipping region from validated province/address data on the server.
- Read the fee and free-shipping policy from store settings inside the checkout service.
- Make public quote requests accept address/region inputs, but never accept a monetary shipping amount.
- Reject unknown province, city, and barangay combinations against the local PSGC/J&T dataset.
- Add tampering tests that submit `shippingFeeCents: 0` for a paid region.

### P0: Make order creation atomic and idempotent

The order route performs stock deduction, order persistence, inventory movement insertion, cart conversion, and discount usage updates as separate operations. A failure after stock deduction can leave stock reduced without an order. A retry can create another order and deduct again.

**Evidence:**

- `apps/api/src/routes/orders.js:30-89`
- `apps/api/src/products/catalogRepository.js:192-205`
- `apps/api/src/orders/orderRepository.js:226-271`

**Recommendation:**

- Introduce a checkout application service that owns the full transaction.
- In PostgreSQL mode, use one database client and one transaction for stock, order, movements, cart session, and promo usage.
- Add an idempotency key generated once per checkout attempt and enforce it with a unique database constraint.
- Lock or atomically claim limited-use discount codes in the same transaction.
- For JSON development mode, write through a serialized repository queue and atomic temp-file rename, or explicitly declare it single-process development-only.
- Add failure-injection tests for every write boundary and retry tests for duplicate submissions.

### P0: Remove production default credentials and secrets

Compose and repository helpers fall back to `postgres`, `admin`, `local-admin-token`, and `local-customer-auth-secret`. Documentation warns about local use, but a missed deployment override produces a publicly known credential set.

**Evidence:**

- `docker-compose.yml:11-35`
- `apps/api/src/routes/admin.js:1044-1048`
- `apps/api/src/customers/customerAccountRepository.js:17-19`

**Recommendation:**

- Fail startup in production when required secrets are absent or match known development defaults.
- Require at least `DATABASE_URL`, `ADMIN_PASSWORD`, `CUSTOMER_AUTH_SECRET`, and an explicit environment name.
- Use Docker secrets or the deployment platform's secret manager.
- Do not configure a permanent admin bearer token through environment variables once credential storage is initialized.
- Add startup configuration validation with actionable errors.

### P0: Address vulnerable production dependencies

`npm audit --omit=dev` on 2026-06-20 reports two direct high-severity vulnerabilities:

- `multer` 2.1.1: denial of service through deeply nested field names and incomplete cleanup of aborted uploads. A fix is available in 2.2.0 or later.
- `xlsx` 0.18.5: prototype pollution and regular-expression denial of service. npm reports no fix in the currently published package line.

**Recommendation:**

- Upgrade `multer` to 2.2.0 or later and rerun upload tests.
- Replace `xlsx` with a maintained spreadsheet writer that supports the required J&T workbook format, or use a supported SheetJS distribution after legal and security review.
- Until replacement, process only the repository-owned template, reject uploaded workbooks, and isolate export generation with time and memory limits.
- Add `npm audit --omit=dev` or a dependency scanning service to CI with a documented exception process.

## Security Recommendations

### P1: Add abuse protection

There is no rate limiting for admin login, customer login/registration, order lookup, order creation, discount quote, or file upload.

- Add IP and account-based limits with stricter policies for authentication and order lookup.
- Add request body, field count, and request duration limits.
- Add exponential backoff or temporary lockout for repeated login failures.
- Put public production traffic behind a managed reverse proxy or WAF.
- Configure Express `trust proxy` correctly before relying on client IPs.

### P1: Replace browser `localStorage` bearer tokens

Admin and customer tokens persist in `localStorage`, so any successful same-origin script injection can steal long-lived credentials.

**Evidence:**

- `apps/web/src/lib/adminApi.js:1-12`
- `apps/web/src/lib/customerAuth.js:1-18`

**Recommendation:**

- Use secure, HTTP-only, `SameSite=Lax` or `Strict` cookies over HTTPS.
- Add CSRF protection for state-changing requests when cookie authentication is introduced.
- Use short-lived sessions with server-side revocation and idle expiration.
- Add customer logout-all-sessions and password-reset flows.
- Add admin session records instead of one global token shared by all sessions.

### P1: Add baseline HTTP security controls

Express and Nginx do not set a content security policy or other standard defensive headers.

- Add Helmet or equivalent explicit headers.
- Define a restrictive Content Security Policy compatible with required fonts, images, and analytics.
- Add HSTS at the HTTPS edge, `X-Content-Type-Options`, `Referrer-Policy`, frame restrictions, and a permissions policy.
- Restrict allowed hosts and configure a production `server_name`.
- Do not expose the API port publicly when Nginx is the intended gateway.

### P1: Harden uploads

Uploads trust the browser-provided MIME type and original extension. Files are written directly into a publicly served directory.

**Evidence:** `apps/api/src/routes/admin.js:59-125`

- Verify file signatures with an image parser rather than trusting MIME metadata.
- Decode and re-encode accepted images to strip embedded content and metadata.
- Generate extensions from detected content.
- Store originals outside the web root and serve generated variants through controlled URLs.
- Add pixel-dimension, decompression-bomb, quota, cleanup, and orphan-file controls.
- Use object storage with versioning and lifecycle rules in production.

### P1: Review customer identity and privacy behavior

- Do not associate historical orders only by matching phone numbers; require explicit ownership or a verified linking flow.
- Add email verification, password reset, credential change, and account deletion/export.
- Establish retention periods for carts, addresses, orders, and tracking notifications.
- Redact personal information from logs and operational exports.
- Document consent and purpose for analytics, Meta Pixel, abandoned-cart data, and marketing contact.

### P2: Make rich content sanitization server-authoritative

The product description is sanitized in the React browser before `dangerouslySetInnerHTML`, which currently reduces risk. Persisted rich HTML should still be validated and sanitized on the server so every future renderer receives safe content.

**Evidence:**

- `apps/web/src/pages/Product.jsx:41-43`
- `apps/web/src/pages/Product.jsx:254-259`
- `apps/web/src/lib/richText.js:1-76`

- Use one reviewed allowlist sanitizer on write and optionally again on render.
- Add malicious payload tests for links, encoded protocols, malformed markup, SVG, and CSS values.

## Commerce And Data Integrity

### P1: Strengthen database constraints

Important domain rules are enforced mainly in JavaScript. Add database checks for non-negative money and stock, valid status values, non-negative discount usage, and internally consistent totals. Add foreign keys where lifecycle semantics are clear.

- Add `CHECK (stock_quantity >= 0)` to variants.
- Add checks for order monetary columns and cart counts.
- Add status checks or reference tables.
- Add a unique idempotency key on orders.
- Consider a foreign key from inventory movements to orders when `order_number` is present.
- Add a foreign key from orders to customer accounts if deletion behavior is explicitly defined.

### P1: Replace ad hoc schema application with versioned migrations

The container applies one growing `schema.sql` file on every start. This cannot reliably express ordered data migrations, rollback strategy, or deployment compatibility.

- Adopt versioned, immutable migrations with a migration history table.
- Run migrations as a release/deploy job, not concurrently in every API replica.
- Back up and test restoration before destructive migrations.
- Add PostgreSQL integration tests that apply migrations from an empty database and from the previous release.

### P1: Define PostgreSQL as the production source of truth

The JSON fallback is useful locally but performs read-modify-write operations without cross-request locking, atomic rename, or multi-file transactions. Concurrent requests can lose updates or corrupt related state.

**Evidence:**

- `apps/api/src/orders/orderRepository.js:15-58`
- `apps/api/src/products/catalogRepository.js:122-124`
- `apps/api/src/customers/customerAccountRepository.js:82-90`

- Block JSON persistence when `NODE_ENV=production`.
- Keep JSON only for fixtures, seeds, export, and local demos.
- Stop committing mutable runtime order, customer, inventory, and discount state.
- Provide explicit import/export tools instead of treating tracked JSON as a live database.

### P1: Improve promotion concurrency

Promo eligibility and usage increment are separate operations. Two concurrent orders can both pass a one-use remaining limit.

- Lock the promo row or use an atomic conditional usage increment in the checkout transaction.
- Store the exact applied rule and calculated savings on the order, which the current snapshot model already supports.
- Add concurrency tests for usage limits and overlapping automatic promotions.

### P2: Clarify payment workflows

- Give prepaid methods explicit pending, verified, failed, refunded, and reconciliation workflows.
- Never mark GCash or bank transfer paid based on browser input.
- Add proof/reference capture only after storage, privacy, and fraud rules are defined.
- Keep COD amount calculation and J&T export covered by integration tests.

## Architecture And Maintainability

### P1: Retire the legacy static storefront

The API still serves a second HTML/CSS/JavaScript storefront while React is the active customer and admin surface. This creates duplicate behavior, outdated routes, security surface, and a very large asset tree.

**Evidence:**

- `apps/api/src/app.js:15-20`
- `README.md:9-12`
- `apps/api/public/` contains about 310 MB, of which about 317 MB is tracked file allocation.

- Decide one canonical storefront.
- Keep only API-served assets required by React, such as uploads and optimized brand media.
- Remove legacy HTML, CSS, JavaScript, and route compatibility after redirect and regression tests exist.
- Update Nginx proxy locations after the legacy surface is removed.

### P1: Split oversized modules by use case

Several modules are too large for safe incremental changes:

- `apps/api/src/routes/admin.js`: about 1,469 lines
- `apps/web/src/admin/OrderDetail.jsx`: about 740 lines
- `apps/api/src/products/catalogRepository.js`: about 712 lines
- `apps/web/src/admin/ProductEditor.jsx`: about 677 lines
- `apps/web/src/pages/Checkout.jsx`: about 555 lines

Split the admin API into products, orders, customers, discounts, inventory, content, settings, and uploads routers. Extract checkout validation/calculation/persistence into services. Split large React screens into domain components and hooks while preserving behavior with tests.

### P2: Standardize repository contracts

Some repository functions return values synchronously in JSON mode and promises in PostgreSQL mode. This forces `isPromise` branching and makes composition harder.

- Make every repository API asynchronous.
- Accept an optional transaction/client context for composed operations.
- Define consistent not-found and validation errors.
- Separate normalization, persistence, and presentation responsibilities.

### P2: Add a shared validation layer

Validation is distributed across route handlers and repositories.

- Adopt a schema validator for request bodies, query strings, environment variables, and persisted JSON.
- Return stable error codes in addition to human-readable messages.
- Validate maximum string lengths and array sizes to protect the database and admin UI.
- Generate or share API contracts with the frontend where practical.

### P2: Improve frontend data management

- Centralize request cancellation, caching, retries, and unauthorized handling.
- Prevent stale responses from overwriting newer admin edits.
- Add route-level error boundaries and intentional loading/empty states.
- Add optimistic updates only where rollback behavior is defined.
- Consider a small query library only if the repeated fetching patterns justify it.

## Testing And Quality

### P1: Add real PostgreSQL integration coverage

CI forces JSON mode. Schema-oriented tests do not prove that real migrations, transactions, constraints, locking, and concurrent checkout work against PostgreSQL.

- Start PostgreSQL as a CI service.
- Apply migrations and run repository plus checkout integration tests against it.
- Test transaction rollback, concurrent stock deduction, promo limits, and idempotency.
- Keep the fast JSON tests, but treat them as unit/development-mode coverage.

### P1: Replace source-pattern frontend tests with behavior tests

Most files under `apps/web/test` read source code and assert regular-expression matches. These tests can pass while the UI is broken and fail during harmless refactoring.

- Add React component tests for forms, navigation, cart behavior, authentication, and admin editing.
- Add Playwright smoke tests for browse -> cart -> checkout -> confirmation and admin login -> order update.
- Test mobile navigation, keyboard use, focus management, and error recovery.
- Keep a few source assertions only for intentional static policy checks.

### P1: Add tests for the critical gaps

- Unauthorized and cross-account order lookup.
- Shipping-fee and region tampering.
- Duplicate checkout submission and idempotency.
- Partial failure rollback after stock deduction.
- Login and checkout rate limits.
- Upload signature validation and aborted upload cleanup.
- Customer token revocation and expiration.
- Backup restoration and migration upgrade paths.

### P2: Add static quality gates

- Add ESLint for Node and React.
- Add Prettier or another enforced formatter.
- Add TypeScript incrementally or use JSDoc with type checking for domain records.
- Add dependency audit, secret scan, and container image scan.
- Add coverage reporting with thresholds focused on critical services rather than raw line coverage.

### P2: Correct test isolation

The full API suite has been observed mutating tracked `discounts.json` and `inventory-movements.json` during local execution. Every test that writes data must use a temporary file or isolated database and restore environment variables in `finally`.

- Fail CI when tests leave the worktree dirty.
- Centralize temp repository setup helpers.
- Avoid tests that depend on committed mutable counters or timestamps.

## Deployment And Operations

### P1: Add production health and graceful shutdown

The health route always returns success without checking PostgreSQL, and the server does not handle termination signals.

**Evidence:**

- `apps/api/src/app.js:22-24`
- `apps/api/src/server.js:1-8`

- Separate liveness and readiness endpoints.
- Readiness should test database access and required configuration.
- Handle `SIGTERM`/`SIGINT`, stop accepting traffic, drain requests, and close the pool.
- Add API and web health checks to Compose and production orchestration.

### P1: Establish backup and restore procedures

- Schedule encrypted PostgreSQL backups with retention and off-site copies.
- Back up uploaded media or move it to versioned object storage.
- Document recovery point and recovery time targets.
- Run automated restore drills into a disposable environment.
- Export orders and settings in a documented, portable format.

### P1: Add observability

- Use structured JSON logs with request IDs and redaction.
- Record latency, error rate, checkout success/failure, stock conflicts, and job failures.
- Add exception tracking and alerts for elevated 5xx responses, database exhaustion, failed exports, and low disk space.
- Add an immutable admin audit log for product, stock, order, discount, credential, and settings changes.

### P2: Harden containers and builds

- Run API and Nginx as non-root users where supported.
- Pin base images by digest through a controlled update process.
- Add `.dockerignore` files that minimize contexts.
- For the web image, use a committed lockfile and `npm ci`; the current Dockerfile copies only `package.json` and runs `npm install`.
- Add image vulnerability scanning and a minimal production dependency set.
- Set CPU, memory, restart, and log-rotation policies in deployment configuration.

### P2: Add release discipline

- Protect `main` with required CI and reviewed pull requests.
- Run CI on `codex-edits` or all active branches, not only `main` pushes and pull requests.
- Add staging with production-like PostgreSQL and storage.
- Maintain release notes, migration notes, rollback steps, and a launch checklist.

## Performance, UX, SEO, And Accessibility

### P2: Optimize and externalize media

The tracked public asset tree is the largest repository cost, and Git packs are about 295 MB.

- Move large product and campaign media to object storage/CDN.
- Generate AVIF/WebP variants and responsive `srcset` sizes.
- Remove superseded originals from the current tree and, after team approval, consider history cleanup.
- Add image dimension and transfer-size budgets to CI.

### P2: Improve storefront performance

- Route-split admin and customer bundles.
- Lazy-load heavy admin editors and J&T-related screens.
- Cache public catalog/settings responses with explicit invalidation.
- Add compression and immutable caching for hashed assets.
- Measure Core Web Vitals on representative mobile connections.

### P2: Complete SEO fundamentals

- Generate canonical URLs, sitemap, robots policy, and product structured data.
- Add per-product title, description, Open Graph, and social image validation.
- Ensure discontinued/draft products have intentional status and redirect behavior.
- Test server-rendering or prerendering only if organic search performance requires it.

### P2: Perform an accessibility audit

- Run automated axe checks plus keyboard and screen-reader review.
- Verify focus trapping and restoration in the cart drawer and mobile navigation.
- Announce async cart, quote, login, and checkout errors correctly.
- Check color contrast, target sizes, form labels, table semantics, and reduced motion.

### P3: Product and operational enhancements

After the production blockers are complete, consider:

- Search, filtering, sorting, and pagination backed by server queries.
- Customer order cancellation/request workflows with clear stock policy.
- Transactional SMS/email through a provider with delivery status and retries.
- J&T API integration after credentials, webhook verification, and reconciliation are designed.
- Inventory reservations with expiration if checkout contention becomes significant.
- Returns/exchanges records instead of notes-only handling.
- Analytics event governance, consent, and conversion attribution.

## Documentation Corrections

- `README.md` says the API suite has 54 tests; the current suite has 111.
- `README.md` points to `docs/ENHANCEMENT_PROPOSALS.md`, which does not exist.
- Document every production environment variable, required/optional status, secret handling, and safe default.
- Add architecture diagrams for request flow, checkout transaction, persistence modes, and deployment.
- Mark old recommendation documents as completed, superseded, or active to prevent roadmap ambiguity.
- Add runbooks for failed checkout, stock correction, J&T export, credential rotation, backup restore, and rollback.

## Recommended Delivery Roadmap

### Phase 1: Public-data and checkout safety

1. Protect order lookup with ownership or a random confirmation token.
2. Calculate shipping from server settings and validated address data.
3. Add checkout idempotency.
4. Add rate limits to auth, lookup, quote, checkout, and uploads.
5. Remove production secret defaults.
6. Upgrade `multer` and decide the `xlsx` replacement.

### Phase 2: Transactional integrity

1. Create the checkout application service.
2. Add one PostgreSQL transaction for order, stock, movements, cart, and promo usage.
3. Add constraints and idempotency indexes.
4. Add PostgreSQL CI and concurrency/failure tests.
5. Restrict JSON mode to local development.

### Phase 3: Authentication and operational readiness

1. Move sessions to secure cookies with revocation.
2. Add password reset, verification, and admin audit logs.
3. Add security headers and upload content validation.
4. Add readiness, graceful shutdown, structured logs, monitoring, and alerts.
5. Implement and test database/media backup restoration.

### Phase 4: Simplification and maintainability

1. Retire the legacy static storefront.
2. Split the admin router and oversized screens.
3. Standardize async repositories and shared validation.
4. Replace source-pattern UI tests with component and Playwright coverage.
5. Add linting, formatting, type checking, and security scans.

### Phase 5: Performance and growth

1. Move media to CDN/object storage and optimize formats.
2. Add bundle splitting, caching, and performance budgets.
3. Complete SEO and accessibility work.
4. Add messaging, carrier, returns, and analytics features only after the core controls are stable.

## Production Readiness Gate

Do not launch publicly until all of these are true:

- [ ] Order confirmation PII requires secure authorization.
- [ ] Shipping and totals are calculated authoritatively on the server.
- [ ] Checkout is atomic and idempotent in PostgreSQL.
- [ ] Known default credentials are rejected in production.
- [ ] Authentication, checkout, lookup, quote, and upload endpoints are rate limited.
- [ ] `multer` is upgraded and the `xlsx` risk is removed or formally contained.
- [ ] PostgreSQL transaction and concurrency tests run in CI.
- [ ] HTTPS, secure session cookies, CSRF defense, and security headers are enabled.
- [ ] Uploads are content-validated and stored safely.
- [ ] Backups and restoration have been tested.
- [ ] Readiness checks, graceful shutdown, logs, metrics, alerts, and admin audit records exist.
- [ ] Privacy, retention, terms, and customer support procedures match actual behavior.

## Review Validation

Commands and evidence used during this review:

```bash
git status --short --branch
rg --files -g '!node_modules/**' -g '!.git/**'
wc -l apps/api/src/routes/*.js apps/api/src/**/*Repository.js apps/web/src/**/*.jsx
rg -n '<security, persistence, and operations patterns>' apps/api/src apps/web/src
npm audit --omit=dev --json
git count-objects -vH
```

The dependency audit result was current on 2026-06-20. Dependency findings should be rechecked immediately before implementation or release.
