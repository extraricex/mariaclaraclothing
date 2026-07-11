# Pancake POS Phase 2 Catalog Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Pancake catalog import that discovers shop references, maps active website variants by exact normalized SKU, reports conflicts, and validates price-unit evidence in Admin → Pancake POS.

**Architecture:** Extend the Phase 1 server-only client with safe paginated reads, persist a normalized catalog mirror and import audit in PostgreSQL, and run deterministic mapping through pure domain functions before one transactional replace. Authenticated admin endpoints expose summaries and selections; the existing admin page gains responsive import, readiness, reference, mapping, and conflict views without changing storefront inventory or merchandising.

**Tech Stack:** Node.js 22, Express, PostgreSQL 16, React/Vite, Docker Compose, Node test runner, official Pancake POS Open API.

---

## File Map

- Create `apps/api/db/migrations/20260704_pancake_catalog_mapping.sql`: Phase 2 reference, mirror, mapping, conflict, and import schema.
- Modify `apps/api/db/schema.sql`: keep fresh installs equivalent to the migration.
- Modify `apps/api/src/config/env.js`: separate API-key availability from complete selected-shop configuration and add safe import bounds.
- Modify `apps/api/.env.example` and `docker-compose.yml`: document/pass Phase 2 pagination limits only to the API.
- Modify `apps/api/src/integrations/pancake/pancakeClient.js`: safe reference and paginated variation reads.
- Create `apps/api/src/integrations/pancake/pancakeCatalogMapper.js`: SKU normalization, exact matching, conflicts, and price evidence.
- Create `apps/api/src/integrations/pancake/pancakeCatalogRepository.js`: transactional mirror/import persistence and paginated admin reads.
- Create `apps/api/src/integrations/pancake/pancakeCatalogService.js`: complete import orchestration and selection rules.
- Modify `apps/api/src/integrations/pancake/pancakeConnectionRepository.js`: read/update selected non-secret references and validation state.
- Modify `apps/api/src/integrations/pancake/pancakeConnectionService.js`: expose safe Phase 2 readiness.
- Modify `apps/api/src/routes/adminPancake.js`: catalog import/status/mappings/reference routes.
- Modify `apps/web/src/admin/PancakePos.jsx`: Phase 2 admin workflow.
- Add focused API, migration, mapper, route, and web source tests.

### Task 1: Configuration and PostgreSQL Foundation

**Files:**
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/.env.example`
- Modify: `docker-compose.yml`
- Create: `apps/api/db/migrations/20260704_pancake_catalog_mapping.sql`
- Modify: `apps/api/db/schema.sql`
- Create: `apps/api/test/pancakeCatalogMigration.test.js`
- Modify: `apps/api/test/pancakeConfig.test.js`

- [ ] **Step 1: Write failing configuration and migration tests**

Add assertions that `PANCAKE_CATALOG_PAGE_SIZE` defaults to `100`, `PANCAKE_CATALOG_MAX_PAGES` defaults to `100`, each rejects non-positive/non-integer values, and `apiKeyConfigured` is true with an API key even when no shop is selected. Create a migration test that requires these tables and secret-free columns:

```js
for (const table of [
  'pancake_shops', 'pancake_warehouses', 'pancake_order_sources',
  'pancake_catalog_variations', 'pancake_variant_mappings',
  'pancake_sync_conflicts', 'pancake_catalog_imports'
]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));

assert.doesNotMatch(sql, /api_key|webhook_secret/i);
assert.match(sql, /UNIQUE \(shop_id, pancake_variation_id\)/);
assert.match(sql, /UNIQUE \(local_variant_id\)/);
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
node --test apps/api/test/pancakeConfig.test.js apps/api/test/pancakeCatalogMigration.test.js
```

Expected: FAIL because Phase 2 bounds and tables do not exist.

- [ ] **Step 3: Add bounded configuration**

Extend `pancakeConfig` with:

```js
function integerInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value === undefined || value === '' ? fallback : value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Pancake catalog value must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

const apiKey = String(source.PANCAKE_API_KEY || '');
apiKeyConfigured: Boolean(apiKey),
catalogPageSize: integerInRange(source.PANCAKE_CATALOG_PAGE_SIZE, 100, 1, 100),
catalogMaxPages: integerInRange(source.PANCAKE_CATALOG_MAX_PAGES, 100, 1, 500)
```

Keep `configured` as API key plus selected shop for Phase 1 compatibility. Add both variable names to `.env.example` and the API service in `docker-compose.yml`; never pass them to the web build.

- [ ] **Step 4: Add the migration and fresh schema definitions**

Use text IDs for every Pancake identifier. Define the core constraints:

```sql
CREATE TABLE IF NOT EXISTS pancake_shops (
  shop_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  safe_digest text NOT NULL,
  last_seen_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pancake_warehouses (
  shop_id text NOT NULL,
  warehouse_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  allow_create_order boolean NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (shop_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS pancake_order_sources (
  shop_id text NOT NULL,
  order_source_id text NOT NULL,
  parent_id text,
  name text NOT NULL DEFAULT '',
  source_updated_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (shop_id, order_source_id)
);

CREATE TABLE IF NOT EXISTS pancake_catalog_imports (
  id text PRIMARY KEY,
  shop_id text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('running','shop_selection_required','complete','failed')),
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  pancake_variation_count integer NOT NULL DEFAULT 0 CHECK (pancake_variation_count >= 0),
  local_variant_count integer NOT NULL DEFAULT 0 CHECK (local_variant_count >= 0),
  verified_count integer NOT NULL DEFAULT 0 CHECK (verified_count >= 0),
  conflict_count integer NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  price_unit_status text NOT NULL DEFAULT 'unknown',
  safe_error_code text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0)
);
```

Add `pancake_catalog_variations`, `pancake_variant_mappings`, and `pancake_sync_conflicts` with the fields and unique constraints from the approved spec. Add indexes for normalized SKU, mapping status, open conflict code, and recent imports. Extend `pancake_connections` with currency/price-unit status and environment-lock flags using `ADD COLUMN IF NOT EXISTS`.

Prevent concurrent imports across API processes with:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS pancake_one_running_catalog_import_idx
  ON pancake_catalog_imports ((1)) WHERE status = 'running';
```

- [ ] **Step 5: Verify configuration and migration tests**

```bash
node --test apps/api/test/pancakeConfig.test.js apps/api/test/pancakeCatalogMigration.test.js apps/api/test/productionConfig.test.js
git diff --check
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/api/src/config/env.js apps/api/.env.example docker-compose.yml apps/api/db/migrations/20260704_pancake_catalog_mapping.sql apps/api/db/schema.sql apps/api/test/pancakeConfig.test.js apps/api/test/pancakeCatalogMigration.test.js
git commit -m "feat: add Pancake catalog mapping schema"
```

### Task 2: Safe Read-Only Pancake Client

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeClient.js`
- Create: `apps/api/test/pancakeCatalogClient.test.js`

- [ ] **Step 1: Write failing endpoint and pagination tests**

Test these exact calls and response guards:

```js
await client.listWarehouses('123');
await client.listOrderSources('123');
await client.listVariations('123', { pageNumber: 2, pageSize: 100 });

assert.equal(urls[0], `${BASE}/shops/123/warehouses?api_key=secret`);
assert.equal(urls[1], `${BASE}/shops/123/order_source?api_key=secret`);
assert.match(urls[2], /products\/variations\?api_key=secret&page_number=2&page_size=100/);
```

Require safe rejection for blank shop IDs, missing `data` arrays, invalid pagination metadata, 401, 429, timeout, and provider bodies containing the API key.

- [ ] **Step 2: Run the client tests and verify the red state**

```bash
node --test apps/api/test/pancakeCatalogClient.test.js
```

Expected: FAIL because the new methods are undefined.

- [ ] **Step 3: Generalize the request helper and add client methods**

Use URL path segments encoded with `encodeURIComponent`, append query values through `URLSearchParams`, and export:

```js
listShops()
listWarehouses(shopId)
listOrderSources(shopId)
listVariations(shopId, { pageNumber, pageSize })
```

Validate only the outer contract in the client. Return safe `PancakeApiError` codes without including request URLs, raw responses, or identifiers in error messages.

- [ ] **Step 4: Run Phase 1 and Phase 2 client tests**

```bash
node --test apps/api/test/pancakeClient.test.js apps/api/test/pancakeCatalogClient.test.js
```

Expected: all tests pass and Phase 1 behavior remains unchanged.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/integrations/pancake/pancakeClient.js apps/api/test/pancakeCatalogClient.test.js
git commit -m "feat: add Pancake catalog read client"
```

### Task 3: Pure SKU Mapping and Price Evidence

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeCatalogMapper.js`
- Create: `apps/api/test/pancakeCatalogMapper.test.js`

- [ ] **Step 1: Write the mapping tests first**

Cover unique exact matches, NFKC/case/edge whitespace, punctuation preservation, blank SKUs, duplicate local SKUs, duplicate Pancake SKUs, inactive locals, missing matches, and external-ID mismatch. Define the public contract:

```js
const result = mapCatalog({ localVariants, pancakeVariations, importId: 'import-1', now });
assert.deepEqual(result.summary, {
  localVariantCount: 4,
  pancakeVariationCount: 5,
  verifiedCount: 1,
  conflictCount: 3
});
```

Add price tests where three mappings unanimously support centavos, three support pesos, fewer than three remain ambiguous, and mixed/mismatched evidence remains ambiguous with `price_mismatch` conflicts.

- [ ] **Step 2: Run the mapper tests and verify failure**

```bash
node --test apps/api/test/pancakeCatalogMapper.test.js
```

Expected: FAIL because the mapper module is missing.

- [ ] **Step 3: Implement deterministic pure functions**

Export:

```js
normalizeSku(value)
mapCatalog({ localVariants, pancakeVariations, importId, now })
evaluatePriceUnit(verifiedMappings)
```

`normalizeSku` must use `String(value).normalize('NFKC').trim().toUpperCase()` and must not remove punctuation. `mapCatalog` groups both sides, maps only one-to-one groups, and returns mapping/conflict arrays without database or network access. `evaluatePriceUnit` confirms only one unanimous candidate with at least three comparisons.

- [ ] **Step 4: Run tests and mutation-safety checks**

```bash
node --test apps/api/test/pancakeCatalogMapper.test.js
```

Expected: all mapper tests pass and input fixtures remain deep-equal to their pre-call copies.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/integrations/pancake/pancakeCatalogMapper.js apps/api/test/pancakeCatalogMapper.test.js
git commit -m "feat: map Pancake variations by exact SKU"
```

### Task 4: Transactional Catalog Repository and Import Service

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeCatalogRepository.js`
- Create: `apps/api/src/integrations/pancake/pancakeCatalogService.js`
- Modify: `apps/api/src/integrations/pancake/pancakeConnectionRepository.js`
- Modify: `apps/api/src/integrations/pancake/pancakeConnectionService.js`
- Create: `apps/api/test/pancakeCatalogRepository.test.js`
- Create: `apps/api/test/pancakeCatalogService.test.js`

- [ ] **Step 1: Write failing repository contract tests**

Use an injected fake transaction client to verify one complete import executes in this order: start audit, upsert safe references, replace current variation mirror, upsert mappings, update verified `product_variants.external_pos_variant_id`, upsert/resolve conflicts, update connection validation, complete audit, commit. Force one query failure and assert no completion result is returned.

- [ ] **Step 2: Write failing service tests**

Test disabled mode, missing API key, shop discovery without selection, selected shop absent from authenticated shops, complete multi-page import, inconsistent pagination, max-page rejection, concurrent import rejection, last-good mirror retention, and secret-free results. The service interface is:

```js
runCatalogImport({ config, client, repository, mapper, now })
getCatalogStatus({ config, repository })
saveReferenceSelection({ config, repository, selection })
```

- [ ] **Step 3: Run repository/service tests and verify failure**

```bash
node --test apps/api/test/pancakeCatalogRepository.test.js apps/api/test/pancakeCatalogService.test.js
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement repository boundaries**

Keep SQL in `pancakeCatalogRepository.js`. Expose:

```js
beginImport(meta)
saveDiscoveredShops(importId, shops)
loadEffectiveSelection(config)
loadActiveLocalVariants()
commitCompleteImport(snapshot)
failImport(importId, safeErrorCode, durationMs)
getCatalogStatus()
listMappings(filters)
listReferences()
saveSelection(selection, locks)
```

Redact shops to `{ id, name }`, warehouses to `{ id, name, allowCreateOrder }`, sources to `{ id, parentId, name }`, and variations to approved safe fields before persistence. Use one transaction for the complete snapshot and conflict lifecycle.

- [ ] **Step 5: Implement the import state machine**

Use a module-local in-flight promise for same-process callers and the partial unique PostgreSQL index for cross-process exclusion. Convert its unique violation to a safe concurrent-import result. Fetch shops first, persist safe shops, resolve selection, then fetch warehouses/sources and all variation pages. Reject changed `total_pages`, repeated page numbers, oversized totals, or non-array data. Call the pure mapper only after the full snapshot validates.

Return only:

```js
{
  status, importId, shopSelectionRequired, summary,
  validation: { currencyStatus, priceUnitStatus },
  lastErrorCode, startedAt, finishedAt
}
```

- [ ] **Step 6: Run repository/service and Phase 1 service tests**

```bash
node --test apps/api/test/pancakeCatalogRepository.test.js apps/api/test/pancakeCatalogService.test.js apps/api/test/pancakeClient.test.js
```

Expected: all tests pass with no mutation of product prices, images, collections, or stock.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/api/src/integrations/pancake apps/api/test/pancakeCatalogRepository.test.js apps/api/test/pancakeCatalogService.test.js
git commit -m "feat: import and map Pancake catalog safely"
```

### Task 5: Authenticated Admin Catalog APIs

**Files:**
- Modify: `apps/api/src/routes/adminPancake.js`
- Modify: `apps/api/test/adminPancake.test.js`

- [ ] **Step 1: Add failing route tests**

Require authentication for every Phase 2 route and CSRF for both writes. Inject a catalog service and assert:

```text
POST /catalog/import
GET  /catalog/status
GET  /catalog/mappings?page=1&pageSize=50&conflictOnly=true&search=SKU
GET  /references
PUT  /references/selection
```

Assert page bounds, selection string normalization, `409` for concurrent import, `400` for invalid selection, and absence of `apiKey`, `webhookSecret`, raw provider payload, warehouse address, supplier data, and cost fields.

- [ ] **Step 2: Run route tests and verify the red state**

```bash
node --test apps/api/test/adminPancake.test.js
```

Expected: new route assertions fail with 404.

- [ ] **Step 3: Add focused routes to the existing router factory**

Inject `catalogService` and `catalogRepository`, keep Phase 1 dependencies compatible, validate queries/bodies before service calls, and return `{ catalog }`, `{ mappings }`, or `{ references }`. Do not put provider calls or SQL in the router.

- [ ] **Step 4: Run admin security regression tests**

```bash
node --test apps/api/test/adminPancake.test.js apps/api/test/sessionAuth.test.js apps/api/test/security.test.js
```

Expected: all tests pass; writes require the existing admin cookie plus CSRF token.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/api/src/routes/adminPancake.js apps/api/test/adminPancake.test.js
git commit -m "feat: expose Pancake catalog admin APIs"
```

### Task 6: Responsive Admin Catalog Mapping UI

**Files:**
- Modify: `apps/web/src/admin/PancakePos.jsx`
- Modify: `apps/web/test/adminPancakeSource.test.js`

- [ ] **Step 1: Add failing UI source tests**

Require the existing page to expose `Import catalog`, `Read-only`, shop/warehouse/order-source selects, mapping coverage, currency, price unit, mapping status filter, safe conflict code, loading states, and calls to all Phase 2 admin endpoints. Assert responsive `grid-cols-1`, horizontal table overflow containment, labels, and disabled states.

- [ ] **Step 2: Run the web test and verify failure**

```bash
node --test apps/web/test/adminPancakeSource.test.js
```

Expected: FAIL because Phase 2 controls are absent.

- [ ] **Step 3: Extend the page without redesigning it**

Keep the Phase 1 connection cards and test button. Add small focused components inside the file initially: `CatalogSummary`, `ReferenceSelectors`, `PriceValidation`, and `MappingTable`. Use `adminJson` for reads and `adminSend` for POST/PUT. Never render or request credentials.

Import flow:

```js
const body = await adminSend('POST', '/api/admin/integrations/pancake/catalog/import', {});
setCatalog(body.catalog);
await Promise.all([loadReferences(), loadMappings()]);
```

Use a table wrapper with `max-w-full overflow-x-auto`, retain keyboard focus styles, and stack filters/selectors on phones.

- [ ] **Step 4: Run web tests and production build**

```bash
node --test apps/web/test/adminPancakeSource.test.js apps/web/test/adminResponsive.test.js apps/web/test/buttonInteraction.test.js
npm run build --workspace=maria-clara-web
```

Expected: tests and Vite build pass; new hashed `apps/web/dist` assets are generated.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/web/src/admin/PancakePos.jsx apps/web/test/adminPancakeSource.test.js apps/web/dist
git commit -m "feat: add Pancake catalog mapping admin view"
```

### Task 7: Credentialed Read-Only Activation and Deployment

**Files:**
- Modify locally only: ignored root `.env`
- Track: `docs/superpowers/plans/2026-07-04-pancake-phase-2-catalog-mapping.md`

- [ ] **Step 1: Add the API key locally without revealing it**

The user edits the ignored root `.env` directly and adds read-only Pancake mode plus a non-empty Pancake API key variable. Do not paste the key into chat, commands, logs, screenshots, or tracked files. Add `PANCAKE_SHOP_ID` only if the user already knows the correct shop; otherwise let Phase 2 discover shops.

Verify only names and ignore status:

```bash
git check-ignore -v .env
git status --short
```

- [ ] **Step 2: Run migrations and rebuild Docker**

```bash
docker compose run --rm api npm run db:migrate
docker compose build api web
docker compose up -d --force-recreate api web
docker compose ps
```

Expected: migration succeeds, PostgreSQL is healthy, API/web are running.

- [ ] **Step 3: Run the credentialed read-only contract**

Through authenticated Admin → Pancake POS, test connection, import shops, select the intended shop if required, select warehouse/source, and import the complete catalog. Confirm Pancake receives GET requests only. Record counts and safe conflict codes, never raw payloads or secrets.

- [ ] **Step 4: Verify deployed browser behavior**

Check desktop and phone widths at `http://127.0.0.1:8081/admin/pancake`: no overflow outside the mapping table, visible read-only labeling, working selectors/import, no console errors, and no secret in network response bodies.

- [ ] **Step 5: Run full regression and leakage checks**

```bash
(cd apps/api && npm test)
(cd apps/web && node --test test/*.test.js)
(cd apps/web && npm run build)
git diff --check
rg -n 'PANCAKE_(API_KEY|WEBHOOK_SECRET)=[^[:space:]]+' --glob '!node_modules/**' --glob '!.env' .
docker compose ps
curl -fsS http://127.0.0.1:8081/api/health
```

Expected: no test failures, production build succeeds, no tracked secret values, Docker is healthy, and health JSON is returned. Restore the two known test-mutated JSON fixtures before staging.

- [ ] **Step 6: Commit the plan and any final verified tracked changes**

```bash
git add docs/superpowers/plans/2026-07-04-pancake-phase-2-catalog-mapping.md
git commit -m "docs: add Pancake catalog mapping implementation plan"
```

Skip a separate final code commit when Tasks 1–6 already left no tracked changes. Do not stage the ignored `.env` or the paused Cloudflare preview plan.

- [ ] **Step 7: Report the Phase 2 boundary**

Report commits, test counts, imported shop/warehouse/source/variation counts, mapping coverage, price-unit state, conflicts, Docker health, and the admin URL. State explicitly that no Pancake write, storefront inventory replacement, webhook, or order synchronization was enabled.
