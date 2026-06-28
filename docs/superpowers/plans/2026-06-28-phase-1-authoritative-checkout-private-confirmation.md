# Phase 1 Authoritative Checkout and Private Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make catalog pricing, shipping, promotions, checkout retries, and guest order confirmation server-authoritative without breaking a rolling API/web deployment.

**Architecture:** Add an authoritative quote boundary backed by PostgreSQL, then consume a locked quote inside the existing transactional order flow. Dedicated idempotency records return the original order before mutable stock checks, and deterministic confirmation tokens expose only a minimal guest confirmation. Deploy the API in compatibility mode, deploy the new React client, then require V2 checkout with a server flag.

**Tech Stack:** Node.js 22, Express 4, PostgreSQL 16, React 18, Vite 6, Node test runner, Playwright, Docker Compose.

---

## Scope and Fixed Decisions

- V2 quote endpoint: `POST /api/checkout/quotes`.
- V2 order endpoint remains `POST /api/orders`; V2 requests include `quoteId`, `cartSessionId`, and `Idempotency-Key`.
- Guest confirmation endpoint: `GET /api/orders/:orderNumber/confirmation` with `X-Order-Confirmation`.
- Confirmation tokens never appear in URLs, logs, Meta events, or persisted plaintext.
- Quote lifetime: 15 minutes.
- Idempotency lifetime: 24 hours.
- Variant price overrides product price when `variant.priceCents` is present.
- A quote without an address is preview-only and has `finalizable: false` and `shippingFeeCents: null`.
- V2 requires PostgreSQL. JSON-mode API tests retain the legacy order path until Phase 6, but production Compose enables `CHECKOUT_V2_REQUIRED=true` after the web cutover.
- Explicit account ownership replaces historical order matching by unverified phone.
- Promotion use is claimed conditionally inside the order transaction.

## File Map

### New API files

- `apps/api/db/migrations/20260628_authoritative_checkout.sql`: quote, idempotency, and confirmation schema.
- `apps/api/src/checkout/commerceError.js`: stable error code/status/details contract.
- `apps/api/src/checkout/requestHash.js`: canonical request hashing.
- `apps/api/src/checkout/addressService.js`: address hierarchy and shipping region resolution.
- `apps/api/src/checkout/checkoutQuoteService.js`: current catalog/settings/promo calculation.
- `apps/api/src/checkout/checkoutQuoteRepository.js`: quote persistence, lock, consume, and expiry.
- `apps/api/src/checkout/checkoutIdempotencyRepository.js`: transactional request claim and stored response.
- `apps/api/src/checkout/confirmationToken.js`: deterministic token derivation and one-way hashing.
- `apps/api/src/checkout/authoritativeCheckoutService.js`: locked quote consumption and atomic order creation.
- `apps/api/src/routes/checkout.js`: V2 quote route.

### Modified API files

- `apps/api/db/schema.sql`
- `apps/api/src/app.js`
- `apps/api/src/config/env.js`
- `apps/api/src/routes/orders.js`
- `apps/api/src/routes/customer.js`
- `apps/api/src/orders/orderRepository.js`
- `apps/api/src/discounts/discountRepository.js`
- `apps/api/src/customers/customerAccountRepository.js`
- `apps/api/.env.example`
- `docker-compose.yml`
- `.github/workflows/ci.yml`

### Modified web files

- `apps/web/src/lib/api.js`
- `apps/web/src/lib/addressGuide.js`
- `apps/web/src/lib/cart.js`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/components/Shell.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/src/pages/AccountSettings.jsx`

### New and modified tests

- `apps/api/test/commerceError.test.js`
- `apps/api/test/addressService.test.js`
- `apps/api/test/checkoutQuoteService.test.js`
- `apps/api/test/checkoutQuoteRepository.test.js`
- `apps/api/test/confirmationToken.test.js`
- `apps/api/test/authoritativeCheckoutService.test.js`
- `apps/api/test/authoritativeCheckoutPostgres.integration.test.js`
- `apps/api/test/checkoutV2Routes.test.js`
- `apps/api/test/customerAccounts.test.js`
- `apps/web/test/checkoutV2.test.js`
- `apps/web/e2e/checkout-v2.spec.js`
- `apps/web/playwright.config.js`

## Task 1: Stable Commerce Errors and Configuration

**Files:**
- Create: `apps/api/src/checkout/commerceError.js`
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/src/app.js`
- Modify: `apps/api/.env.example`
- Modify: `docker-compose.yml`
- Test: `apps/api/test/commerceError.test.js`

- [ ] **Step 1: Write the failing error/config tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { CommerceError } = require('../src/checkout/commerceError');
const { checkoutConfig } = require('../src/config/env');

test('CommerceError carries a public code, status, and details', () => {
  const error = new CommerceError('Quote expired', {
    code: 'quote_expired', status: 409, details: { quoteId: 'q-1' }
  });
  assert.equal(error.message, 'Quote expired');
  assert.equal(error.code, 'quote_expired');
  assert.equal(error.status, 409);
  assert.deepEqual(error.details, { quoteId: 'q-1' });
});

test('checkout config validates V2 secrets and durations', () => {
  assert.deepEqual(checkoutConfig({}), {
    v2Required: false,
    confirmationSecret: '',
    quoteTtlMs: 900000,
    idempotencyTtlMs: 86400000
  });
  assert.throws(() => checkoutConfig({ CHECKOUT_V2_REQUIRED: 'true' }), /ORDER_CONFIRMATION_SECRET/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test apps/api/test/commerceError.test.js`
Expected: FAIL because `commerceError.js` and `checkoutConfig` do not exist.

- [ ] **Step 3: Implement the error and config contracts**

```js
// apps/api/src/checkout/commerceError.js
class CommerceError extends Error {
  constructor(message, { code = 'commerce_error', status = 400, details } = {}) {
    super(message);
    this.name = 'CommerceError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
module.exports = { CommerceError };
```

Add to `apps/api/src/config/env.js`:

```js
function checkoutConfig(source = process.env) {
  const v2Required = source.CHECKOUT_V2_REQUIRED === 'true';
  const confirmationSecret = String(source.ORDER_CONFIRMATION_SECRET || '');
  if (v2Required && confirmationSecret.length < 32) {
    throw new Error('ORDER_CONFIRMATION_SECRET must be at least 32 characters when checkout V2 is required');
  }
  return {
    v2Required,
    confirmationSecret,
    quoteTtlMs: 15 * 60 * 1000,
    idempotencyTtlMs: 24 * 60 * 60 * 1000
  };
}
```

Expose `env.checkout = checkoutConfig()` and export `checkoutConfig`. Update the Express error response without breaking existing clients:

```js
const body = { error: error.status ? error.message : 'Something went wrong' };
if (error.code) body.code = error.code;
if (error.details !== undefined) body.details = error.details;
res.status(error.status || 500).json(body);
```

Add server-only examples:

```dotenv
CHECKOUT_V2_REQUIRED=false
ORDER_CONFIRMATION_SECRET=replace-with-at-least-32-random-characters
```

Add the same variables to the API service in `docker-compose.yml`, leaving `CHECKOUT_V2_REQUIRED` false for the first compatibility deployment.

- [ ] **Step 4: Run focused and existing error tests**

Run: `node --test apps/api/test/commerceError.test.js apps/api/test/health.test.js`
Expected: PASS; existing `{ error: message }` assertions remain valid.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/checkout/commerceError.js apps/api/src/config/env.js apps/api/src/app.js apps/api/test/commerceError.test.js apps/api/.env.example docker-compose.yml
git commit -m "feat: add checkout V2 configuration and errors"
```

## Task 2: Add Authoritative Checkout Schema

**Files:**
- Create: `apps/api/db/migrations/20260628_authoritative_checkout.sql`
- Modify: `apps/api/db/schema.sql`
- Test: `apps/api/test/authoritativeCheckoutPostgres.integration.test.js`

- [ ] **Step 1: Write the migration contract test**

```js
test('authoritative checkout migration defines durable quote and idempotency state', async () => {
  const sql = await fs.readFile(path.join(__dirname, '..', 'db', 'migrations', '20260628_authoritative_checkout.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS checkout_quotes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS checkout_idempotency/);
  assert.match(sql, /confirmation_token_hash/);
  assert.match(sql, /CHECK \(status IN \('in_progress', 'completed'\)\)/);
  assert.match(sql, /consumed_order_number/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/api/test/authoritativeCheckoutPostgres.integration.test.js`
Expected: FAIL with missing migration file.

- [ ] **Step 3: Create the additive migration and mirror it in schema.sql**

```sql
CREATE TABLE IF NOT EXISTS checkout_quotes (
  id text PRIMARY KEY,
  cart_session_id text NOT NULL,
  request_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  finalizable boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_order_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_quotes_expiry_idx ON checkout_quotes(expires_at);
CREATE INDEX IF NOT EXISTS checkout_quotes_cart_idx ON checkout_quotes(cart_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checkout_idempotency (
  key_hash text PRIMARY KEY,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  order_number text NOT NULL DEFAULT '',
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_idempotency_expiry_idx ON checkout_idempotency(expires_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token_hash text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token_created_at timestamptz;
```

- [ ] **Step 4: Apply the migration twice against PostgreSQL**

Run:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/maria_clara_test npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@localhost:5432/maria_clara_test npm run db:migrate
```

Expected: both commands print `PostgreSQL schema migrated.` and the second run makes no duplicate objects.

- [ ] **Step 5: Commit**

```bash
git add apps/api/db/migrations/20260628_authoritative_checkout.sql apps/api/db/schema.sql apps/api/test/authoritativeCheckoutPostgres.integration.test.js
git commit -m "feat: add authoritative checkout schema"
```

## Task 3: Resolve Address Hierarchy and Shipping Policy on the Server

**Files:**
- Create: `apps/api/src/checkout/addressService.js`
- Test: `apps/api/test/addressService.test.js`

- [ ] **Step 1: Write failing hierarchy and region tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCheckoutAddress } = require('../src/checkout/addressService');

test('server resolves a valid J&T address and Cavite shipping region', () => {
  const result = resolveCheckoutAddress({
    houseAddress: '12 Test St',
    provinceCode: 'CAVITE',
    cityCode: 'CAVITE|IMUS',
    barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
  });
  assert.equal(result.province, 'CAVITE');
  assert.equal(result.city, 'IMUS');
  assert.equal(result.barangay, 'BUCANDALA IV');
  assert.equal(result.shippingRegion, 'metro_manila_cavite');
  assert.equal(result.doorToDoor, true);
  assert.match(result.datasetVersion, /^2026-06-05/);
});

test('server assigns Cebu and Davao to Visayas/Mindanao', () => {
  assert.equal(resolveCheckoutAddress({
    houseAddress: '1 Test', provinceCode: 'CEBU', cityCode: 'CEBU|ALCOY',
    barangayCode: 'CEBU|ALCOY|ATABAY'
  }).shippingRegion, 'visayas_mindanao');
  assert.equal(resolveCheckoutAddress({
    houseAddress: '1 Test', provinceCode: 'DAVAO-DEL-SUR',
    cityCode: 'DAVAO-DEL-SUR|BANSALAN',
    barangayCode: 'DAVAO-DEL-SUR|BANSALAN|ALEGRE'
  }).shippingRegion, 'visayas_mindanao');
});

test('server rejects a city outside the submitted province', () => {
  assert.throws(() => resolveCheckoutAddress({
    houseAddress: '12 Test St', provinceCode: 'CAVITE',
    cityCode: 'CEBU|CEBU-CITY', barangayCode: 'CEBU|CEBU-CITY|ADLAON'
  }), (error) => error.code === 'address_invalid' && error.details.level === 'city');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/addressService.test.js`
Expected: FAIL because `addressService.js` does not exist.

- [ ] **Step 3: Implement indexed lookup and explicit island-group sets**

```js
const guide = require('../../public/data/jnt-address-guide.json');
const { CommerceError } = require('./commerceError');

const VISAYAS_MINDANAO = new Set([
  'AGUSAN-DEL-NORTE', 'AGUSAN-DEL-SUR', 'AKLAN', 'ANTIQUE', 'BASILAN',
  'BILIRAN', 'BOHOL', 'BUKIDNON', 'CAMIGUIN', 'CAPIZ', 'CEBU', 'COTABATO',
  'DAVAO-DE-ORO', 'DAVAO-DEL-NORTE', 'DAVAO-DEL-SUR', 'DAVAO-OCCIDENTAL',
  'DAVAO-ORIENTAL', 'DINAGAT-ISLANDS', 'EASTERN-SAMAR', 'GUIMARAS', 'ILOILO',
  'LANAO-DEL-NORTE', 'LANAO-DEL-SUR', 'LEYTE', 'MAGUINDANAO',
  'MISAMIS-OCCIDENTAL', 'MISAMIS-ORIENTAL', 'NEGROS-OCCIDENTAL',
  'NEGROS-ORIENTAL', 'NORTHERN-SAMAR', 'SARANGANI', 'SIQUIJOR', 'SOUTH-COTABATO',
  'SOUTHERN-LEYTE', 'SULTAN-KUDARAT', 'SULU', 'SURIGAO-DEL-NORTE',
  'SURIGAO-DEL-SUR', 'TAWI-TAWI', 'WESTERN-SAMAR', 'ZAMBOANGA-DEL-NORTE',
  'ZAMBOANGA-DEL-SUR', 'ZAMBOANGA-SIBUGAY'
]);

function shippingRegionForProvince(code) {
  if (code === 'CAVITE' || code === 'METRO-MANILA') return 'metro_manila_cavite';
  return VISAYAS_MINDANAO.has(code) ? 'visayas_mindanao' : 'luzon';
}
```

Build `Map` indexes once at module load. `resolveCheckoutAddress(input)` must validate house, province, child city, child barangay, and return codes, names, `addressLine`, `doorToDoor`, `shippingRegion`, and `datasetVersion: guide.metadata.generatedAt`.

- [ ] **Step 4: Run address tests**

Run: `node --test apps/api/test/addressService.test.js`
Expected: PASS for Luzon, Cavite/Metro Manila, Visayas/Mindanao, hierarchy rejection, and door-to-door mapping.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/checkout/addressService.js apps/api/test/addressService.test.js
git commit -m "feat: validate checkout addresses on server"
```

## Task 4: Build Authoritative Quote Snapshots

**Files:**
- Create: `apps/api/src/checkout/requestHash.js`
- Create: `apps/api/src/checkout/checkoutQuoteService.js`
- Modify: `apps/api/src/discounts/discountRepository.js`
- Test: `apps/api/test/checkoutQuoteService.test.js`

- [ ] **Step 1: Write failing quote tests with tampered client values**

```js
function quoteDependencies() {
  return {
    findProduct: async () => ({
      id: 'catalog-shirt', slug: 'shirt', name: 'Real Shirt', priceCents: 64900,
      variants: [{ id: 'catalog-shirt-0', sku: 'SHIRT-S', size: 'Small', priceCents: 70000, stockQuantity: 5 }]
    }),
    resolveAddress: () => ({
      houseAddress: '12 Test St', provinceCode: 'CAVITE', province: 'CAVITE',
      cityCode: 'CAVITE|IMUS', city: 'IMUS',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV', barangay: 'BUCANDALA IV',
      addressLine: '12 Test St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      shippingRegion: 'metro_manila_cavite', doorToDoor: true,
      datasetVersion: '2026-06-05T13:33:03.555Z'
    }),
    getSettings: async () => ({ shipping: {
      regions: [{ id: 'metro_manila_cavite', label: 'Metro Manila & Cavite', feeCents: 8000 }],
      freeShippingEnabled: true, freeShippingMinimumItems: 2
    } }),
    quotePromos: async ({ items, shippingFeeCents }) => ({
      discountCode: '', discountTotalCents: 0, discountSnapshot: {},
      shippingFeeCents, freeShippingUnlocked: false,
      subtotalCents: items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
    })
  };
}

test('quote ignores client names and prices and uses variant override price', async () => {
  const quote = await buildAuthoritativeQuote({
    cartSessionId: 'cart-1',
    items: [{ productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 2,
      productName: 'Fake', unitPriceCents: 1 }],
    address: {
      houseAddress: '12 Test St', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
    },
    discountCode: ''
  }, quoteDependencies());
  assert.equal(quote.items[0].productName, 'Real Shirt');
  assert.equal(quote.items[0].unitPriceCents, 70000);
  assert.equal(quote.shippingFeeCents, 0);
  assert.equal(quote.totalCents, 140000);
  assert.equal(quote.finalizable, true);
});

test('preview quote without address never invents a final shipping fee', async () => {
  const quote = await buildAuthoritativeQuote({
    cartSessionId: 'cart-1',
    items: [{ productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 1 }],
    discountCode: ''
  }, quoteDependencies());
  assert.equal(quote.finalizable, false);
  assert.equal(quote.shippingFeeCents, null);
  assert.equal(quote.shippingStatus, 'pending_address');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/checkoutQuoteService.test.js`
Expected: FAIL because quote service and hashing utility do not exist.

- [ ] **Step 3: Implement canonical hashes and authoritative calculation**

`requestHash.js` exports:

```js
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Object(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}
```

`buildAuthoritativeQuote(input, deps)` must:

1. Require a cart session and positive integer quantities.
2. Load each product and exact variant by server ID.
3. Use `variant.priceCents ?? product.priceCents`.
4. Resolve address codes when present.
5. Load store settings and the server shipping fee.
6. Call the existing promo engine only with normalized lines and server fee.
7. Apply settings-based free shipping as well as promo free shipping.
8. Return normalized `items`, `address`, `shippingRegion`, `shippingRegionLabel`, `shippingFeeCents`, `shippingStatus`, `discountCode`, `discountSnapshot`, `subtotalCents`, `discountTotalCents`, `totalCents`, `finalizable`, `pricingFingerprint`, and `requestHash`.

The pricing fingerprint is:

```js
sha256Object({
  items: items.map(({ variantId, unitPriceCents }) => ({ variantId, unitPriceCents })),
  shipping: settings.shipping,
  discountDefinition: appliedDiscountDefinition,
  addressDatasetVersion: address?.datasetVersion || ''
});
```

Add `claimDiscountUsage(code, { client })` to `discountRepository.js` with:

```sql
UPDATE discount_codes
SET usage_count = usage_count + 1, updated_at = now()
WHERE code = $1 AND (usage_limit IS NULL OR usage_count < usage_limit)
RETURNING code
```

Throw `promo_unavailable` when a quoted discount cannot be claimed.

- [ ] **Step 4: Run quote and promo tests**

Run: `node --test apps/api/test/checkoutQuoteService.test.js apps/api/test/promoFullFlow.test.js`
Expected: PASS; tests cover tampered price/name, variant price, three shipping regions, free-shipping settings, promo, preview, and invalid items.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/checkout/requestHash.js apps/api/src/checkout/checkoutQuoteService.js apps/api/src/discounts/discountRepository.js apps/api/test/checkoutQuoteService.test.js apps/api/test/promoFullFlow.test.js
git commit -m "feat: calculate authoritative checkout quotes"
```

## Task 5: Persist, Lock, and Expose Quotes

**Files:**
- Create: `apps/api/src/checkout/checkoutQuoteRepository.js`
- Create: `apps/api/src/routes/checkout.js`
- Modify: `apps/api/src/app.js`
- Test: `apps/api/test/checkoutQuoteRepository.test.js`
- Test: `apps/api/test/checkoutV2Routes.test.js`

- [ ] **Step 1: Write failing repository and route tests**

```js
test('quote repository stores, locks, and consumes a quote', async () => {
  const snapshot = {
    cartSessionId: 'cart-1', requestHash: 'hash-1', finalizable: true,
    items: [{ variantId: 'catalog-shirt-0', quantity: 1, unitPriceCents: 64900 }],
    totalCents: 72900
  };
  const stored = await insertCheckoutQuote(client, snapshot, { ttlMs: 900000, now });
  assert.match(stored.id, /^[0-9a-f-]{36}$/);
  const locked = await findCheckoutQuoteForUpdate(client, stored.id);
  assert.equal(locked.snapshot.totalCents, 72900);
  await consumeCheckoutQuote(client, stored.id, 'MCC-1');
  assert.equal(client.calls.at(-1).values[1], 'MCC-1');
});

test('POST /api/checkout/quotes returns server totals and no client price authority', async () => {
  const response = await jsonRequest(port, '/api/checkout/quotes', {
    method: 'POST',
    body: JSON.stringify({
      cartSessionId: 'cart-1',
      items: [{
        productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
        variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
        quantity: 1
      }],
      address: {
        houseAddress: '12 Test St', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS',
        barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
      }
    })
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.quote.shippingRegion, 'metro_manila_cavite');
  assert.equal(response.body.quote.finalizable, true);
  assert.equal(response.body.quote.items[0].unitPriceCents, 64900);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/checkoutQuoteRepository.test.js apps/api/test/checkoutV2Routes.test.js`
Expected: FAIL with missing repository/route exports.

- [ ] **Step 3: Implement repository and route**

Repository exports:

```js
insertCheckoutQuote(client, snapshot, { ttlMs, now })
findCheckoutQuoteForUpdate(client, quoteId)
consumeCheckoutQuote(client, quoteId, orderNumber)
deleteExpiredCheckoutQuotes(client, now)
```

The insert uses `crypto.randomUUID()` and stores the complete snapshot as JSONB. The lock query uses `SELECT * FROM checkout_quotes WHERE id = $1 FOR UPDATE`.

Route shape:

```js
router.post('/quotes', async (req, res, next) => {
  try {
    if (!hasDatabaseUrl()) throw new CommerceError('PostgreSQL is required for checkout V2', {
      code: 'checkout_v2_unavailable', status: 503
    });
    const snapshot = await buildAuthoritativeQuote(req.body || {}, dependencies);
    const quote = await insertCheckoutQuote(getPool(), snapshot, { ttlMs: env.checkout.quoteTtlMs });
    res.status(201).json({ quote: publicQuote(quote) });
  } catch (error) { next(error); }
});
```

Mount it at `/api/checkout`. `publicQuote` must not return repository-only hashes or raw promotion definitions.

- [ ] **Step 4: Run route and repository tests**

Run: `node --test apps/api/test/checkoutQuoteRepository.test.js apps/api/test/checkoutV2Routes.test.js`
Expected: PASS, including expired quote cleanup and preview quote behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/checkout/checkoutQuoteRepository.js apps/api/src/routes/checkout.js apps/api/src/app.js apps/api/test/checkoutQuoteRepository.test.js apps/api/test/checkoutV2Routes.test.js
git commit -m "feat: expose durable checkout quotes"
```

## Task 6: Add Private Confirmation Tokens to Orders

**Files:**
- Create: `apps/api/src/checkout/confirmationToken.js`
- Modify: `apps/api/src/orders/orderRepository.js`
- Test: `apps/api/test/confirmationToken.test.js`

- [ ] **Step 1: Write failing deterministic-token tests**

```js
test('confirmation token is deterministic for retry and only its hash is persisted', () => {
  const first = deriveConfirmationToken('MCC-1', 'idem-1', 'x'.repeat(32));
  const second = deriveConfirmationToken('MCC-1', 'idem-1', 'x'.repeat(32));
  assert.equal(first, second);
  assert.notEqual(first, 'idem-1');
  assert.equal(hashConfirmationToken(first).length, 64);
  assert.equal(verifyConfirmationToken(first, hashConfirmationToken(first)), true);
  assert.equal(verifyConfirmationToken('wrong', hashConfirmationToken(first)), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/confirmationToken.test.js`
Expected: FAIL because the token module does not exist.

- [ ] **Step 3: Implement HMAC derivation and order mapping**

```js
function deriveConfirmationToken(orderNumber, idempotencyKey, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`order-confirmation:${orderNumber}:${idempotencyKey}`)
    .digest('base64url');
}

function hashConfirmationToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
```

`verifyConfirmationToken` must compare equal-length buffers with `timingSafeEqual`. Add `confirmation_token_hash` and `confirmation_token_created_at` to order insert/update values and `fromPostgresOrder`.

- [ ] **Step 4: Run token and repository tests**

Run: `node --test apps/api/test/confirmationToken.test.js apps/api/test/checkoutService.test.js`
Expected: PASS and no token plaintext appears in repository SQL values except the 64-character hash.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/checkout/confirmationToken.js apps/api/src/orders/orderRepository.js apps/api/test/confirmationToken.test.js
git commit -m "feat: secure guest confirmation tokens"
```

## Task 7: Claim Idempotency Before Mutable Checkout Validation

**Files:**
- Create: `apps/api/src/checkout/checkoutIdempotencyRepository.js`
- Create: `apps/api/src/checkout/authoritativeCheckoutService.js`
- Modify: `apps/api/src/orders/checkoutService.js`
- Test: `apps/api/test/authoritativeCheckoutService.test.js`

- [ ] **Step 1: Write failing retry, conflict, expiry, and rollback tests**

```js
function requestFixture(overrides = {}) {
  return {
    quoteId: 'quote-1', cartSessionId: 'cart-1', idempotencyKey: 'idem-1234567890123456',
    customer: { fullName: 'Maria Test', phone: '09171234567', email: '' },
    paymentMethod: 'cash_on_delivery', notes: '', requestContext: {}, ...overrides
  };
}

function storedResponse() {
  return { orderNumber: 'MCC-1', totalCents: 72900, currency: 'PHP', items: [] };
}

function createDependencies({ idempotency } = {}) {
  const calls = [];
  const quote = {
    id: 'quote-1', cartSessionId: 'cart-1', finalizable: true,
    expiresAt: '2026-06-28T04:15:00.000Z', consumedOrderNumber: '',
    snapshot: {
      pricingFingerprint: 'price-hash', discountCode: 'SAVE', totalCents: 72900,
      items: [{ productId: 'catalog-shirt', variantId: 'catalog-shirt-0', sku: 'SHIRT-S',
        productName: 'Real Shirt', size: 'Small', quantity: 1, unitPriceCents: 64900 }],
      address: { houseAddress: '12 Test', barangay: 'BUCANDALA IV', city: 'IMUS', province: 'CAVITE' }
    }
  };
  return {
    calls,
    now: () => new Date('2026-06-28T04:00:00.000Z'),
    confirmationSecret: 'x'.repeat(32),
    hashRequest: () => 'same',
    hashKey: () => 'key-hash',
    transaction: async (callback) => { calls.push('transaction'); return callback({}); },
    claimIdempotency: async () => { calls.push('claimIdempotency'); return idempotency || { status: 'in_progress' }; },
    loadQuote: async () => { calls.push('loadQuote'); return quote; },
    refreshQuote: async () => { calls.push('refreshQuote'); return { ...quote.snapshot }; },
    deductStock: async () => calls.push('deductStock'),
    saveOrder: async () => calls.push('saveOrder'),
    appendMovements: async () => calls.push('appendMovements'),
    convertCart: async () => calls.push('convertCart'),
    claimPromo: async () => calls.push('claimPromo'),
    insertMeta: async () => calls.push('insertMeta'),
    consumeQuote: async () => calls.push('consumeQuote'),
    completeIdempotency: async () => calls.push('completeIdempotency'),
    deriveToken: () => 'derived-confirmation-token',
    hashToken: () => 'a'.repeat(64)
  };
}

test('completed matching retry returns before quote and stock validation', async () => {
  const deps = createDependencies({
    idempotency: { status: 'completed', requestHash: 'same', orderNumber: 'MCC-1', response: storedResponse() }
  });
  const result = await placeAuthoritativeCheckout(requestFixture(), deps);
  assert.equal(result.orderNumber, 'MCC-1');
  assert.equal(deps.calls.includes('loadQuote'), false);
  assert.equal(deps.calls.includes('deductStock'), false);
});

test('same key with different normalized request is rejected', async () => {
  const deps = createDependencies({ idempotency: { status: 'completed', requestHash: 'other' } });
  await assert.rejects(placeAuthoritativeCheckout(requestFixture(), deps),
    (error) => error.code === 'idempotency_conflict' && error.status === 409);
});

test('successful checkout consumes quote and completes idempotency in one transaction', async () => {
  const deps = createDependencies();
  const result = await placeAuthoritativeCheckout(requestFixture(), deps);
  assert.deepEqual(deps.calls, [
    'transaction', 'claimIdempotency', 'loadQuote', 'refreshQuote', 'deductStock',
    'saveOrder', 'appendMovements', 'convertCart', 'claimPromo', 'insertMeta',
    'consumeQuote', 'completeIdempotency'
  ]);
  assert.ok(result.confirmationToken);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/authoritativeCheckoutService.test.js`
Expected: FAIL because repository and service do not exist.

- [ ] **Step 3: Implement transactional idempotency and checkout**

`checkoutIdempotencyRepository.js` exports:

```js
hashIdempotencyKey(rawKey)
claimIdempotency(client, { keyHash, requestHash, expiresAt })
completeIdempotency(client, { keyHash, orderNumber, response })
```

`claimIdempotency` inserts `in_progress` with `ON CONFLICT DO NOTHING`, then selects the row `FOR UPDATE`. It throws `idempotency_conflict` for a different request hash and returns completed rows unchanged.

`placeAuthoritativeCheckout(input, deps)` must execute this exact order inside one transaction:

1. Validate raw idempotency key format (16-200 characters).
2. Hash normalized contact/payment/notes/quote/cart request.
3. Claim and lock idempotency.
4. Return a completed matching response and re-derive its confirmation token.
5. Lock the quote.
6. Validate cart binding, finalizable state, expiry, and unconsumed state.
7. Rebuild current authoritative quote and compare `pricingFingerprint`; throw `quote_changed` with public current totals when different.
8. Build the persisted order from the quote snapshot only.
9. Derive and hash confirmation token.
10. Deduct stock, save order, append movement, convert cart, conditionally claim promo, and insert Meta outbox.
11. Consume the quote.
12. Store the response without confirmation-token plaintext.
13. Return response plus the derived token.

Keep `persistPostgresCheckout` temporarily for the legacy compatibility branch only.

- [ ] **Step 4: Run service tests**

Run: `node --test apps/api/test/authoritativeCheckoutService.test.js apps/api/test/checkoutService.test.js`
Expected: PASS for retry-before-stock, conflict, expiry, consumed quote, quote changed, promo exhausted, rollback, and success.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/checkout/checkoutIdempotencyRepository.js apps/api/src/checkout/authoritativeCheckoutService.js apps/api/src/orders/checkoutService.js apps/api/test/authoritativeCheckoutService.test.js apps/api/test/checkoutService.test.js
git commit -m "feat: make checkout retries authoritative"
```

## Task 8: Cut Order Routes Over Safely and Privatize Confirmation

**Files:**
- Modify: `apps/api/src/routes/orders.js`
- Test: `apps/api/test/checkoutV2Routes.test.js`
- Test: `apps/api/test/health.test.js`

- [ ] **Step 1: Add failing route security and compatibility tests**

```js
async function jsonRequest(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  return { status: response.status, body: await response.json() };
}

function validQuoteInput() {
  return {
    cartSessionId: 'cart-1',
    items: [{
      productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
      variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
      quantity: 1
    }],
    address: {
      houseAddress: '12 Test St', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
    }
  };
}

function validCustomer() {
  return { fullName: 'Maria Test', phone: '09171234567', email: 'maria@example.com' };
}

async function createQuote(port, input) {
  const response = await jsonRequest(port, '/api/checkout/quotes', {
    method: 'POST', body: JSON.stringify(input)
  });
  assert.equal(response.status, 201);
  return response.body.quote;
}

async function placeV2Order(port, bodyOverrides = {}) {
  const quote = await createQuote(port, validQuoteInput());
  const response = await jsonRequest(port, '/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'idem-1234567890123456' },
    body: JSON.stringify({
      quoteId: quote.id, cartSessionId: 'cart-1',
      customer: validCustomer(), paymentMethod: 'cash_on_delivery', notes: '',
      shippingFeeCents: 0, totalCents: 1, ...bodyOverrides
    })
  });
  assert.equal(response.status, 201);
  return { quote, order: response.body };
}

test('V2 order ignores client money and returns a private confirmation token', async () => {
  const { quote, order } = await placeV2Order(port);
  assert.equal(order.totalCents, quote.totalCents);
  assert.ok(order.confirmationToken);
});

test('public order-number lookup returns no PII', async () => {
  const { order } = await placeV2Order(port);
  const response = await jsonRequest(port, `/api/orders/${order.orderNumber}`);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body.order).sort(), [
    'fulfillmentStatus', 'orderNumber', 'paymentStatus', 'placedAt', 'status', 'totalCents'
  ]);
  assert.equal(JSON.stringify(response.body).includes('0917'), false);
});

test('private confirmation requires the header and rejects a wrong token generically', async () => {
  const { order } = await placeV2Order(port);
  const denied = await jsonRequest(port, `/api/orders/${order.orderNumber}/confirmation`);
  const wrong = await jsonRequest(port, `/api/orders/${order.orderNumber}/confirmation`, {
    headers: { 'X-Order-Confirmation': 'wrong' }
  });
  assert.equal(denied.status, 404);
  assert.equal(wrong.status, 404);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/checkoutV2Routes.test.js apps/api/test/health.test.js`
Expected: FAIL because current public lookup returns PII and POST does not consume a quote.

- [ ] **Step 3: Implement dual-contract route behavior**

In `POST /api/orders`:

```js
if (req.body?.quoteId) {
  const result = await placeAuthoritativeCheckout({
    ...req.body,
    idempotencyKey: req.get('Idempotency-Key') || ''
  }, authoritativeDependencies(req));
  return res.status(201).json(result);
}
if (env.checkout.v2Required) {
  throw new CommerceError('Refresh checkout to continue', {
    code: 'checkout_upgrade_required', status: 409
  });
}
return createLegacyOrder(req, res);
```

Replace the existing public payload with only:

```js
{ orderNumber, placedAt, totalCents, status, fulfillmentStatus, paymentStatus }
```

Add the private confirmation route, verify the header against the stored hash, and return customer first name, address summary, payment method label, shipping, items, and totals. Every denied response is `{ error: 'Order confirmation not found', code: 'confirmation_not_found' }` with status 404.

- [ ] **Step 4: Run route tests**

Run: `node --test apps/api/test/checkoutV2Routes.test.js apps/api/test/health.test.js apps/api/test/metaEvent.test.js`
Expected: PASS; legacy POST works only when V2 is not required, public GET contains no PII, private GET requires the token, and Meta uses persisted totals.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/orders.js apps/api/test/checkoutV2Routes.test.js apps/api/test/health.test.js apps/api/test/metaEvent.test.js
git commit -m "feat: require private order confirmation"
```

## Task 9: Stop Unverified Phone-Based Account Linking

**Files:**
- Modify: `apps/api/src/routes/customer.js`
- Modify: `apps/api/src/customers/customerAccountRepository.js`
- Modify: `apps/web/src/pages/AccountSettings.jsx`
- Test: `apps/api/test/customerAccounts.test.js`

- [ ] **Step 1: Change the account test to require explicit ownership**

```js
test('customer order history includes owned orders but not phone-only guest orders', async () => {
  const body = await customerOrdersFor(accountToken);
  assert.deepEqual(body.orders.map((order) => order.orderNumber), [memberOrderNumber]);
  assert.equal(body.orders.some((order) => order.orderNumber === guestOrderNumber), false);
});
```

Also assert saved addresses retain `provinceCode`, `cityCode`, and `barangayCode`.

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/api/test/customerAccounts.test.js`
Expected: FAIL because current history includes phone-matched guest orders and saved address normalization drops codes.

- [ ] **Step 3: Implement explicit ownership and coded saved addresses**

Replace customer order selection with:

```js
const customerOrders = orders
  .filter((order) => order.customerAccountId === account.id)
  .map(customerOrderSummary);
```

Extend saved-address normalization with the three stable codes and dataset version. Remove the Account Settings copy that promises phone-based linking, and submit codes when saving an address.

- [ ] **Step 4: Run customer tests**

Run: `node --test apps/api/test/customerAccounts.test.js apps/api/test/adminCustomersDiscounts.test.js`
Expected: PASS; admin customer aggregation may still group operational records by phone, but customer account access does not.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/customer.js apps/api/src/customers/customerAccountRepository.js apps/web/src/pages/AccountSettings.jsx apps/api/test/customerAccounts.test.js
git commit -m "fix: restrict customer history to owned orders"
```

## Task 10: Move Web Cart and Quote Calls to V2

**Files:**
- Modify: `apps/web/src/lib/api.js`
- Modify: `apps/web/src/lib/addressGuide.js`
- Modify: `apps/web/src/pages/Product.jsx`
- Modify: `apps/web/src/pages/Cart.jsx`
- Modify: `apps/web/src/components/Shell.jsx`
- Test: `apps/web/test/checkoutV2.test.js`

- [ ] **Step 1: Write executable payload tests**

```js
test('quote request sends only item identity, quantity, cart session, discount, and address codes', () => {
  assert.deepEqual(buildCheckoutQuoteRequest({
    cartSessionId: 'cart-1',
    items: [{ productId: 'P-1', variantId: 'V-1', quantity: 2, unitPriceCents: 1 }],
    discountCode: 'SAVE',
    address: { provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS', barangayCode: 'B' }
  }), {
    cartSessionId: 'cart-1',
    items: [{ productId: 'P-1', variantId: 'V-1', quantity: 2 }],
    discountCode: 'SAVE',
    address: { provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS', barangayCode: 'B' }
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/web/test/checkoutV2.test.js`
Expected: FAIL because the helper and V2 endpoint do not exist.

- [ ] **Step 3: Implement V2 request helpers and price display**

In `api.js`:

```js
export function buildCheckoutQuoteRequest(input) {
  return {
    cartSessionId: input.cartSessionId,
    items: input.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
    discountCode: String(input.discountCode || '').trim(),
    ...(input.address ? { address: input.address } : {})
  };
}

export function createCheckoutQuote(input) {
  return request('/api/checkout/quotes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCheckoutQuoteRequest(input))
  });
}
```

Update cart and drawer to pass no address and render pending shipping as `Calculated at checkout`. On product add and buy-again, use `variant.priceCents ?? product.priceCents`.

- [ ] **Step 4: Run web quote/cart tests**

Run: `node --test apps/web/test/checkoutV2.test.js apps/web/test/phase2CheckoutQuoteSource.test.js apps/web/test/phase3CartDrawerSource.test.js`
Expected: PASS; no V2 payload includes `shippingFeeCents`, `shippingRegion`, product name, or unit price.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.js apps/web/src/lib/addressGuide.js apps/web/src/pages/Product.jsx apps/web/src/pages/Cart.jsx apps/web/src/components/Shell.jsx apps/web/test/checkoutV2.test.js apps/web/test/phase2CheckoutQuoteSource.test.js apps/web/test/phase3CartDrawerSource.test.js
git commit -m "feat: use authoritative web quotes"
```

## Task 11: Submit Checkout with Quote and Idempotency

**Files:**
- Modify: `apps/web/src/lib/cart.js`
- Modify: `apps/web/src/lib/api.js`
- Modify: `apps/web/src/pages/Checkout.jsx`
- Test: `apps/web/test/checkoutV2.test.js`

- [ ] **Step 1: Write failing idempotency and submit-payload tests**

```js
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('checkout idempotency key is stable for one quote and resets after success', () => {
  const storage = memoryStorage();
  const first = getCheckoutIdempotencyKey('quote-1', storage, () => 'uuid-1');
  const retry = getCheckoutIdempotencyKey('quote-1', storage, () => 'uuid-2');
  assert.equal(first, 'uuid-1');
  assert.equal(retry, 'uuid-1');
  clearCheckoutIdempotencyKey(storage);
  assert.equal(getCheckoutIdempotencyKey('quote-2', storage, () => 'uuid-3'), 'uuid-3');
});

test('order request excludes browser totals and sends quote identity', () => {
  const request = buildOrderRequest({
    cartSessionId: 'cart-1',
    customer: { fullName: 'Phase One Customer', phone: '09171234567' },
    paymentMethod: 'cash_on_delivery',
    notes: ''
  }, 'quote-1', 'uuid-1');
  assert.equal(request.body.quoteId, 'quote-1');
  assert.equal(request.headers['Idempotency-Key'], 'uuid-1');
  assert.equal('shippingFeeCents' in request.body, false);
  assert.equal('totalCents' in request.body, false);
  assert.equal('items' in request.body, false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/web/test/checkoutV2.test.js`
Expected: FAIL because idempotency and V2 order helpers do not exist.

- [ ] **Step 3: Implement stable browser retry state**

Use `crypto.randomUUID()` and `sessionStorage`, not `Math.random()`:

```js
const CHECKOUT_IDEMPOTENCY_KEY = 'maria-clara-checkout-idempotency';
export function getCheckoutIdempotencyKey(quoteId, storage = sessionStorage, create = () => crypto.randomUUID()) {
  const current = JSON.parse(storage.getItem(CHECKOUT_IDEMPOTENCY_KEY) || 'null');
  if (current?.quoteId === quoteId && current?.key) return current.key;
  const key = create();
  storage.setItem(CHECKOUT_IDEMPOTENCY_KEY, JSON.stringify({ quoteId, key }));
  return key;
}

export function buildOrderRequest(input, quoteId, idempotencyKey) {
  return {
    headers: { 'Idempotency-Key': idempotencyKey },
    body: {
      quoteId,
      cartSessionId: input.cartSessionId,
      customer: input.customer,
      paymentMethod: input.paymentMethod,
      notes: String(input.notes || '')
    }
  };
}
```

Checkout must:

1. Send address codes to create a finalizable quote.
2. Keep the reviewed quote ID.
3. Requote before submit and show `quote_changed` differences instead of placing the order.
4. Send only quote/cart/contact/payment/notes plus the header key.
5. Keep the key after network/server failure.
6. Clear the key, cart, and cart-session ID only after success.
7. Store `{ orderNumber, confirmationToken }` in session storage before navigation.

- [ ] **Step 4: Run checkout tests and build**

Run:

```bash
node --test apps/web/test/checkoutV2.test.js apps/web/test/phase2CheckoutQuoteSource.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: tests and production build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/cart.js apps/web/src/lib/api.js apps/web/src/pages/Checkout.jsx apps/web/test/checkoutV2.test.js apps/web/dist
git commit -m "feat: submit quote-backed checkout"
```

## Task 12: Use Private Confirmation and Correct Payment Copy

**Files:**
- Modify: `apps/web/src/lib/api.js`
- Modify: `apps/web/src/pages/ThankYou.jsx`
- Modify: `apps/web/src/pages/Checkout.jsx`
- Test: `apps/web/test/checkoutV2.test.js`

- [ ] **Step 1: Write failing confirmation-header and copy tests**

```js
test('confirmation fetch sends the token in a header and never a URL', async () => {
  let request;
  await fetchOrderConfirmation('MCC-1', 'secret-token', async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        order: {
          orderNumber: 'MCC-1',
          paymentMethod: 'cash_on_delivery',
          paymentMethodLabel: 'Cash on Delivery',
          totalCents: 72900
        }
      })
    };
  });
  assert.equal(request.url, '/api/orders/MCC-1/confirmation');
  assert.equal(request.options.headers['X-Order-Confirmation'], 'secret-token');
  assert.equal(request.url.includes('secret-token'), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/web/test/checkoutV2.test.js`
Expected: FAIL because private confirmation fetch does not exist.

- [ ] **Step 3: Implement private confirmation UI**

`ThankYou.jsx` reads `{ orderNumber, confirmationToken }` from session storage, confirms the URL order number matches, then calls the private endpoint. It does not call the old public endpoint for PII. Render payment copy from `summary.paymentMethodLabel` and show COD-specific language only for `cash_on_delivery`.

Keep `trackFacebookPurchase` at successful checkout using the authoritative order response; do not include the confirmation token in the Meta payload or stored Purchase object.

- [ ] **Step 4: Run confirmation, Meta, and build checks**

Run:

```bash
node --test apps/web/test/checkoutV2.test.js apps/web/test/metaPixel.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
```

Expected: PASS and built assets contain no literal `X-Order-Confirmation` token values beyond the header name.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.js apps/web/src/pages/Checkout.jsx apps/web/src/pages/ThankYou.jsx apps/web/test/checkoutV2.test.js apps/web/dist
git commit -m "feat: show private order confirmation"
```

## Task 13: Prove PostgreSQL Transactions, Concurrency, and Migration

**Files:**
- Modify: `apps/api/test/authoritativeCheckoutPostgres.integration.test.js`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add PostgreSQL integration tests**

Add tests that create isolated products/settings/promos and assert:

```js
await Promise.all([
  placeOrder({ quoteId, idempotencyKey: sameKey }),
  placeOrder({ quoteId, idempotencyKey: sameKey })
]);
assert.equal(await countOrdersForKey(sameKey), 1);
assert.equal(await stockDeductionForSku(sku), 1);
assert.equal(await movementCountForOrder(orderNumber), 1);
assert.equal(await metaOutboxCount(orderNumber), metaEnabled ? 1 : 0);
```

Also test different request/same key, same quote/different key, quote expiry, price fingerprint change, final promotion use race, transaction rollback after each dependency, and confirmation hash persistence.

- [ ] **Step 2: Run and verify RED against PostgreSQL**

Run:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/maria_clara_test npm run db:migrate
TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/maria_clara_test node --test apps/api/test/authoritativeCheckoutPostgres.integration.test.js
```

Expected: at least one concurrency or rollback assertion fails until all transaction dependencies use the same client.

- [ ] **Step 3: Correct any global-pool calls revealed by the test**

Every repository called inside `placeAuthoritativeCheckout` receives `{ client }`. No nested transaction or global `query()` call is allowed for stock, orders, movements, carts, promo claim, quote consume, idempotency complete, or Meta outbox.

- [ ] **Step 4: Expand CI PostgreSQL step**

Replace the Meta-only command with:

```yaml
- name: PostgreSQL commerce integration tests
  run: node --test apps/api/test/metaOutboxPostgres.integration.test.js apps/api/test/authoritativeCheckoutPostgres.integration.test.js
  env:
    TEST_POSTGRES_URL: postgres://postgres:postgres@localhost:5432/maria_clara_test
```

Run the same command locally and expect all PostgreSQL tests to PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/authoritativeCheckoutPostgres.integration.test.js .github/workflows/ci.yml
git commit -m "test: cover authoritative PostgreSQL checkout"
```

## Task 14: Add the Critical Browser Journey

**Files:**
- Create: `apps/web/playwright.config.js`
- Create: `apps/web/e2e/checkout-v2.spec.js`
- Modify: `apps/web/package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing browser journey**

```js
async function selectAddress(page, province, city, barangay) {
  const addressSelects = page.getByRole('combobox');
  await addressSelects.nth(0).selectOption({ label: province });
  await addressSelects.nth(1).selectOption({ label: city });
  await addressSelects.nth(2).selectOption({ label: barangay });
}

test('customer checkout uses server totals and private confirmation', async ({ page }) => {
  await page.goto('/product/oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1');
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('link', { name: /checkout/i }).first().click();
  await page.getByPlaceholder('Full name').fill('Phase One Customer');
  await page.getByPlaceholder(/Mobile number/).fill('09171234567');
  await selectAddress(page, 'CAVITE', 'IMUS', 'BUCANDALA IV');
  await page.getByPlaceholder(/House no/).fill('12 Test Street');
  await page.getByRole('button', { name: /review/i }).click();
  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page).toHaveURL(/\/thank-you\?order=MCC-/);
  await expect(page.getByText(/Order received/i)).toBeVisible();
  await expect(page.getByText(/Total due/i)).toBeVisible();
});
```

Intercept the order POST and assert its JSON has no `items`, `shippingFeeCents`, `shippingRegion`, or `totalCents`, and that `Idempotency-Key` is present.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:e2e -w apps/web`
Expected: FAIL because Playwright configuration/script and V2 fixtures are not wired.

- [ ] **Step 3: Configure Playwright against the Docker test stack**

`apps/web/package.json`:

```json
"test:e2e": "playwright test -c playwright.config.js"
```

The config uses `baseURL: http://127.0.0.1:8081`, one worker, trace on first retry, screenshot on failure, and no external production services. CI builds the Compose stack with Meta CAPI disabled and a disposable PostgreSQL volume, waits for health, seeds products, runs the test, and always captures `docker compose logs` on failure.

- [ ] **Step 4: Run the browser test twice**

Run:

```bash
npm run test:e2e -w apps/web
npm run test:e2e -w apps/web
```

Expected: both runs PASS without manual cleanup and use distinct cart/idempotency keys.

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.js apps/web/e2e/checkout-v2.spec.js apps/web/package.json package-lock.json .github/workflows/ci.yml
git commit -m "test: cover private checkout browser journey"
```

## Task 15: Controlled Cutover, Documentation, and Final Verification

**Files:**
- Modify: `docker-compose.yml`
- Modify: `apps/api/.env.example`
- Modify: `README.md`
- Create: `docs/phase-1-checkout-v2-rollout.md`

- [ ] **Step 1: Document the exact deployment sequence**

The runbook must contain these ordered commands and checks:

```bash
# 1. Back up PostgreSQL and record restore command.
# 2. Deploy API with CHECKOUT_V2_REQUIRED=false.
docker compose up -d --build api

# 3. Apply migration and confirm quote tables.
docker compose exec api npm run db:migrate

# 4. Deploy V2 web.
docker compose up -d --build web

# 5. Complete one test order and private confirmation.
# 6. Enable V2 rejection of legacy checkout.
CHECKOUT_V2_REQUIRED=true docker compose up -d --force-recreate api
```

Rollback keeps additive tables/columns, sets `CHECKOUT_V2_REQUIRED=false`, and deploys the previous web image. It never drops checkout tables during incident rollback.

- [ ] **Step 2: Set the final Compose default after the compatibility release**

Change the checked-in Compose default to:

```yaml
CHECKOUT_V2_REQUIRED: ${CHECKOUT_V2_REQUIRED:-true}
ORDER_CONFIRMATION_SECRET: ${ORDER_CONFIRMATION_SECRET:?ORDER_CONFIRMATION_SECRET is required}
```

The first API compatibility deployment overrides `CHECKOUT_V2_REQUIRED=false` explicitly.

- [ ] **Step 3: Run the full verification matrix**

Run:

```bash
npm test
node --test apps/web/test/*.test.js
VITE_FACEBOOK_META_PIXEL_ENABLED=true VITE_FACEBOOK_META_PIXEL_ID=595813035761213 npm run build:web
TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/maria_clara_test node --test apps/api/test/metaOutboxPostgres.integration.test.js apps/api/test/authoritativeCheckoutPostgres.integration.test.js
npm run test:e2e -w apps/web
npm audit --omit=dev
git diff --check
```

Expected: tests/build/diff check PASS. `npm audit` may still report the already-approved `multer`/`xlsx` findings until Phases 3 and 4; record them without introducing new findings.

- [ ] **Step 4: Rebuild and smoke-test Docker**

Run:

```bash
docker compose up -d --build
curl -fsS http://localhost:3000/api/health
curl -fsSI http://localhost:8081/
docker compose ps
```

Expected: API health JSON returns `ok: true`, web returns HTTP 200, and all services are up/healthy.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml apps/api/.env.example README.md docs/phase-1-checkout-v2-rollout.md apps/web/dist
git commit -m "docs: prepare checkout V2 rollout"
```

## Definition of Done

- [ ] Quote and final checkout ignore all browser price, fee, region, label, discount-total, and free-shipping claims.
- [ ] Address codes are validated against the J&T hierarchy on the server.
- [ ] Preview quotes are visibly non-final and final quotes expire after 15 minutes.
- [ ] Matching retries return the original order before quote, stock, or promo revalidation.
- [ ] One idempotency key cannot authorize a different request.
- [ ] Guest confirmation PII requires the header token; order number alone returns no PII.
- [ ] Confirmation-token plaintext is not stored in PostgreSQL or URLs.
- [ ] Customer order history uses explicit account ownership only.
- [ ] Promotion limits are claimed conditionally in the order transaction.
- [ ] Core checkout behavior runs against PostgreSQL in CI.
- [ ] The browser critical journey passes twice from a clean test stack.
- [ ] API-first compatibility deployment and V2-required cutover are documented and rehearsed.
- [ ] Full tests, production build, migration, Docker health, and diff checks pass.
