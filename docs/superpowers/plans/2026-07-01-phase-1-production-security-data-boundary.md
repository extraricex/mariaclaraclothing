# Phase 1 Production Security and Data Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. No Git operations are permitted for this execution.

**Goal:** Replace browser-readable production credentials, reject unsafe production configuration, strengthen abuse controls and security headers, gate Meta tracking on consent, and keep production mutations on PostgreSQL.

**Architecture:** Add a focused authentication-session repository backed by PostgreSQL with opaque HttpOnly cookies and per-session CSRF tokens. Preserve bearer-token compatibility only outside production so existing local/API test workflows remain usable while the React clients migrate to cookies. Centralize production validation, security headers, and endpoint-specific rate limiting in the Express boundary.

**Tech Stack:** Node.js, Express, PostgreSQL, React, Nginx, Docker Compose, Node test runner, Playwright.

---

### Task 1: Production environment validation

**Files:**
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/test/serverLifecycle.test.js`
- Modify: `apps/api/.env.example`
- Modify: `docker-compose.yml`

- [ ] Add failing tests proving `APP_ENV=production` rejects missing PostgreSQL, default admin credentials, missing customer session secret, and short checkout confirmation secrets.
- [ ] Run `node --test test/serverLifecycle.test.js` and confirm failures are configuration-specific.
- [ ] Implement `validateProductionConfig(source)` and call it while building runtime configuration.
- [ ] Keep `APP_ENV=development` compatible with current local defaults.
- [ ] Add documented `APP_ENV`, `CUSTOMER_AUTH_SECRET`, and trusted-proxy variables.
- [ ] Run the focused tests and confirm both production rejection and development compatibility.

### Task 2: PostgreSQL opaque sessions and CSRF

**Files:**
- Modify: `apps/api/db/schema.sql`
- Create: `apps/api/src/auth/sessionRepository.js`
- Create: `apps/api/src/auth/sessionHttp.js`
- Create: `apps/api/test/authSessions.test.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/src/routes/customer.js`

- [ ] Add failing repository tests for create, verify, expiry, CSRF matching, and revocation using a fake query executor.
- [ ] Add failing route tests proving login sets HttpOnly/SameSite cookies, authenticated reads use cookies, state changes require CSRF, logout revokes the session, and production rejects bearer fallback.
- [ ] Add the `auth_sessions` schema with hashed session token, hashed CSRF token, actor type/id, expiry, revocation, and useful indexes.
- [ ] Implement random 32-byte session and CSRF tokens; store only SHA-256 hashes.
- [ ] Implement cookie parsing/serialization without adding a broad cookie dependency.
- [ ] Create admin and customer sessions after login/registration.
- [ ] Add session and logout endpoints and enforce CSRF on authenticated mutations.
- [ ] Retain bearer support only when `APP_ENV !== 'production'`.
- [ ] Run focused session, admin security, and customer account tests.

### Task 3: React authentication migration

**Files:**
- Modify: `apps/web/src/lib/adminApi.js`
- Modify: `apps/web/src/lib/customerAuth.js`
- Modify: `apps/web/src/admin/Login.jsx`
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Modify: `apps/web/src/pages/CustomerAuth.jsx`
- Modify: `apps/web/src/pages/Account.jsx`
- Create: `apps/web/test/cookieSessions.test.js`

- [ ] Add failing tests proving auth requests use `credentials: 'same-origin'`, no auth credential is persisted in `localStorage`, CSRF is sent on mutations, and logout calls the server.
- [ ] Implement in-memory/sessionStorage CSRF handling; CSRF is not an authentication credential.
- [ ] Change session checks and logouts to API endpoints.
- [ ] Remove browser bearer-token reads/writes from application flows.
- [ ] Preserve current login/account UI and redirects.
- [ ] Run focused web tests and the production build.

### Task 4: Proxy-aware abuse controls

**Files:**
- Modify: `apps/api/src/app.js`
- Modify: `apps/api/src/middleware/rateLimit.js`
- Modify: `apps/api/test/security.test.js`
- Modify: `docker-compose.yml`

- [ ] Add failing tests for separate customer login, registration, quote, cart-session, order-lookup, upload, and security-action limits.
- [ ] Add a key selector supporting normalized account identifiers where appropriate without returning account existence.
- [ ] Mount endpoint-specific limiters and retain independent buckets.
- [ ] Set the local Docker Nginx-to-API trusted proxy hop to `1` while keeping direct non-proxy development safe.
- [ ] Run security and checkout route regressions.

### Task 5: Security headers and analytics consent

**Files:**
- Modify: `apps/api/src/app.js`
- Modify: `apps/web/nginx.conf`
- Modify: `apps/web/src/lib/metaPixel.js`
- Modify: `apps/web/src/components/MetaRouteTracker.jsx`
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/test/metaPixel.test.js`
- Create: `apps/web/test/securityHeadersSource.test.js`

- [ ] Add failing tests for baseline headers, report-only CSP, disabled server fingerprint header, consent-default denial, consent acceptance, consent withdrawal, and no admin tracking.
- [ ] Add Express/Nginx headers for nosniff, referrer, permissions, framing, and CSP report-only.
- [ ] Disable `x-powered-by` and Nginx version tokens.
- [ ] Make Meta Pixel initialization require stored affirmative consent.
- [ ] Add a compact theme-consistent Accept/Decline privacy control and a persistent settings path to change the decision.
- [ ] Run focused tests and browser accessibility checks.

### Task 6: Production data boundary and deployment verification

**Files:**
- Modify: `apps/api/data/orders.json`
- Modify: `apps/api/data/order-notifications.json`
- Modify: `apps/api/data/inventory-movements.json`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Create: `apps/api/test/productionConfig.test.js`

- [ ] Add a failing production-config test proving JSON mutation mode cannot start in production.
- [ ] Implement the guard and add CI production-config validation.
- [ ] Replace tracked runtime order/notification/movement content with empty synthetic seed structures after confirming tests use isolated storage.
- [ ] Update README session, secret, proxy, privacy, and deployment instructions.
- [ ] Run all API tests, all web tests, web build, and Playwright auth/checkout journeys.
- [ ] Rebuild/restart Docker with development settings and verify health, admin login, customer login, checkout, and headers.
- [ ] Do not run any Git command.
