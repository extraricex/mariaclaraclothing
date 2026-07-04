# Addable Storefront Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while executing each task. Do not use Git for this user-requested run.

**Goal:** Create persistent collections in admin and propagate them to all collection consumers and customer homepage sections.

**Architecture:** Store collection names in the existing store-settings record. Add authenticated API endpoints, a shared React admin hook, and dynamic homepage rendering from public storefront settings.

**Tech Stack:** Node.js, Express, PostgreSQL/JSON settings storage, React, Node test runner, Playwright, Docker Compose.

---

### Task 1: Persistent collection registry

**Files:**
- Modify: `apps/api/src/settings/storeSettingsRepository.js`
- Modify: `apps/api/test/storeSettingsRepository.test.js`

- [ ] Add failing tests for default collections, adding a normalized unique name, duplicate rejection, and default countdown creation.
- [ ] Run `node --test test/storeSettingsRepository.test.js` and confirm the new tests fail for missing behavior.
- [ ] Add `storefrontCollections` normalization and `addStorefrontCollection`, supporting JSON and transaction-locked PostgreSQL persistence.
- [ ] Run the repository tests and confirm they pass.

### Task 2: Admin and public API contracts

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/src/routes/storeSettings.js`
- Modify: `apps/api/test/adminSettings.test.js`

- [ ] Add failing tests for authenticated `GET /api/admin/collections`, `POST /api/admin/collections`, duplicate errors, and public collection exposure.
- [ ] Run the focused API test and confirm endpoint failures.
- [ ] Implement list/create routes and expose collection names in public storefront settings.
- [ ] Run the focused API test and confirm it passes.

### Task 3: Dynamic admin collection consumers

**Files:**
- Create: `apps/web/src/admin/useAdminCollections.js`
- Modify: `apps/web/src/admin/Collections.jsx`
- Modify: `apps/web/src/admin/CollectionDropdown.jsx`
- Modify: `apps/web/src/admin/Products.jsx`
- Modify: `apps/web/src/admin/ProductCountdown.jsx`
- Modify: `apps/web/test/adminProductsSource.test.js`
- Modify: `apps/web/test/collectionCountdown.test.js`

- [ ] Add source tests requiring shared dynamic collection loading and the add form.
- [ ] Run the focused web tests and confirm the hardcoded implementations fail.
- [ ] Implement the shared hook, add form, and dynamic choices without restructuring the page.
- [ ] Run focused web tests and confirm they pass.

### Task 4: Customer storefront visibility

**Files:**
- Modify: `apps/web/src/lib/storeSettings.js`
- Modify: `apps/web/src/pages/Home.jsx`
- Create: `apps/web/test/storefrontCollections.test.js`

- [ ] Add failing tests for collection grouping, empty-section hiding, stable IDs, and preservation of the two existing collection descriptions.
- [ ] Run the test and confirm the dynamic helper is missing.
- [ ] Add a focused collection-section builder and render its results from public settings.
- [ ] Run the test and confirm it passes.

### Task 5: End-to-end verification and deployment

**Files:**
- Create: `apps/web/e2e/add-collection.spec.js`

- [ ] Add an end-to-end test that creates a unique collection, assigns a product, and confirms customer visibility.
- [ ] Run it against the old Docker deployment and confirm it fails at collection creation.
- [ ] Run API and web unit tests and the production web build.
- [ ] Rebuild and restart the API and web Docker services.
- [ ] Run the browser test and relevant regression suites against `http://localhost:8081`.
- [ ] Confirm both services are running and the health endpoint succeeds.
