# Facebook Meta Pixel And Conversions API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Facebook Meta Pixel ID `595813035761213` on customer routes, track the ecommerce funnel, and deliver deduplicated server-side `Purchase` events through Meta Conversions API.

**Architecture:** A React tracking module owns browser initialization and standard events. Express creates the order and a unique marketing outbox row in one PostgreSQL transaction; a worker sends the outbox event to Meta with bounded retries. Browser and server `Purchase` use `purchase:<orderNumber>` as their shared event ID.

**Tech Stack:** React 18, React Router, Vite, Node.js, Express, PostgreSQL, Node test runner, Facebook Meta Pixel, Meta Graph API.

---

## Task 1: Add Disabled-By-Default Configuration

**Files:**
- Create: `apps/web/.env.example`
- Modify: `apps/web/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `apps/api/src/config/env.js`
- Create: `apps/api/test/metaEvent.test.js`

- [ ] **Step 1: Write the failing configuration test**

```js
test('Meta CAPI validates enabled configuration', () => {
  assert.equal(metaConfig({}).enabled, false);
  assert.throws(() => metaConfig({ META_CONVERSIONS_API_ENABLED: 'true' }), /META_PIXEL_ID/);
  assert.equal(metaConfig({
    META_CONVERSIONS_API_ENABLED: 'true',
    META_PIXEL_ID: '595813035761213',
    META_CONVERSIONS_API_ACCESS_TOKEN: 'test-token',
    META_GRAPH_API_VERSION: 'v-test',
    DATABASE_URL: 'postgres://test'
  }).pixelId, '595813035761213');
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `node --test apps/api/test/metaEvent.test.js`  
Expected: FAIL because `metaConfig` does not exist.

- [ ] **Step 3: Implement configuration validation**

```js
function metaConfig(source = process.env) {
  const enabled = source.META_CONVERSIONS_API_ENABLED === 'true';
  if (!enabled) return { enabled: false };
  const required = ['META_PIXEL_ID', 'META_CONVERSIONS_API_ACCESS_TOKEN', 'META_GRAPH_API_VERSION', 'DATABASE_URL'];
  for (const name of required) {
    if (!String(source[name] || '').trim()) throw new Error(`${name} is required when Meta CAPI is enabled`);
  }
  return {
    enabled,
    pixelId: String(source.META_PIXEL_ID).trim(),
    accessToken: String(source.META_CONVERSIONS_API_ACCESS_TOKEN),
    graphApiVersion: String(source.META_GRAPH_API_VERSION).trim(),
    testEventCode: String(source.META_CONVERSIONS_API_TEST_EVENT_CODE || '').trim()
  };
}
```

Add `VITE_FACEBOOK_META_PIXEL_ENABLED=false` and `VITE_FACEBOOK_META_PIXEL_ID=595813035761213` to the web example. Pass Vite build args through Docker. Add server variables to Compose without an access-token default.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/api/test/metaEvent.test.js && npm run build:web`  
Expected: PASS and successful build.

```bash
git add apps/web/.env.example apps/web/Dockerfile docker-compose.yml apps/api/src/config/env.js apps/api/test/metaEvent.test.js
git commit -m "feat: add Meta tracking configuration"
```

## Task 2: Build The Browser Pixel Module

**Files:**
- Create: `apps/web/src/lib/metaPixel.js`
- Create: `apps/web/test/metaPixel.test.js`

- [ ] **Step 1: Write failing payload tests**

```js
test('Purchase uses PHP values and stable IDs', () => {
  const event = buildFacebookPurchase({ orderNumber: 'MCC-1', totalCents: 171800 }, [
    { externalPosVariantId: 'POS-1', variantId: 'V-1', quantity: 2, unitPriceCents: 79900 }
  ]);
  assert.equal(event.eventId, 'purchase:MCC-1');
  assert.equal(event.payload.value, 1718);
  assert.deepEqual(event.payload.content_ids, ['POS-1']);
  assert.equal(event.payload.contents[0].item_price, 799);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `node --test apps/web/test/metaPixel.test.js`  
Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement pure builders and guarded initialization**

```js
export function facebookMoneyValue(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function facebookContentId(item = {}) {
  return String(item.externalPosVariantId || item.variantId || item.id ||
    item.externalPosProductId || item.productId || item.slug || '').trim();
}

export function purchaseEventId(orderNumber) {
  return `purchase:${String(orderNumber || '').trim()}`;
}
```

Adapt the supplied standard Facebook loader. Initialize only when enabled, configured, and outside `/admin`. Queue safely and never throw into application code. Add tests for one initialization, disabled mode, admin exclusion, and `fbq` event arguments.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/web/test/metaPixel.test.js`  
Expected: PASS.

```bash
git add apps/web/src/lib/metaPixel.js apps/web/test/metaPixel.test.js
git commit -m "feat: add Facebook Meta Pixel client"
```

## Task 3: Track SPA Page Views

**Files:**
- Create: `apps/web/src/components/MetaRouteTracker.jsx`
- Modify: `apps/web/src/main.jsx`
- Modify: `apps/web/test/metaPixel.test.js`

- [ ] **Step 1: Test route rules first**

Test a pure `shouldTrackFacebookPath(previous, next)` helper: customer transitions are true, repeated paths are false, and `/admin`, `/admin/login`, and nested admin paths are false.

- [ ] **Step 2: Verify failure**

Run: `node --test apps/web/test/metaPixel.test.js`  
Expected: FAIL for the missing helper.

- [ ] **Step 3: Implement and mount the tracker**

Use `useLocation()` and a `useRef()` last path. Call initialization and `trackFacebookPageView(path)`. Mount inside `BrowserRouter` before `<App />`.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/web/test/metaPixel.test.js && npm run build:web`  
Expected: PASS and successful build.

```bash
git add apps/web/src/components/MetaRouteTracker.jsx apps/web/src/main.jsx apps/web/test/metaPixel.test.js
git commit -m "feat: track React customer page views"
```

## Task 4: Track Product And Checkout-Funnel Events

**Files:**
- Modify: `apps/web/src/lib/metaPixel.js`
- Modify: `apps/web/src/pages/Product.jsx`
- Modify: `apps/web/src/pages/Cart.jsx`
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/test/metaPixel.test.js`

- [ ] **Step 1: Add failing builder tests**

Assert `ViewContent`, `AddToCart`, and `InitiateCheckout` use `PHP`, decimal money, stable IDs, correct quantities, and no empty content IDs.

- [ ] **Step 2: Verify failure**

Run: `node --test apps/web/test/metaPixel.test.js`  
Expected: FAIL for missing builders.

- [ ] **Step 3: Implement and wire events**

- Fire `ViewContent` after a product loads.
- Fire `AddToCart` after product and upsell cart mutations.
- Fire `InitiateCheckout` from cart and drawer checkout links.
- Derive a checkout guard from the cart session so one entry creates one event.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/web/test/*.test.js && npm run build:web`  
Expected: all web tests and build pass.

```bash
git add apps/web/src/lib/metaPixel.js apps/web/src/pages/Product.jsx apps/web/src/pages/Cart.jsx apps/web/src/components/Shell.jsx apps/web/test/metaPixel.test.js
git commit -m "feat: track Meta ecommerce funnel events"
```

## Task 5: Return And Track Authoritative Purchase Data

**Files:**
- Modify: `apps/api/src/routes/orders.js`
- Modify: `apps/api/test/inventoryDeduction.test.js`
- Modify: `apps/web/src/pages/Checkout.jsx`
- Modify: `apps/web/src/lib/metaPixel.js`
- Modify: `apps/web/test/metaPixel.test.js`

- [ ] **Step 1: Write failing API response assertions**

```js
assert.equal(body.currency, 'PHP');
assert.equal(body.totalCents, expectedTotal);
assert.equal(body.trackingEventId, `purchase:${body.orderNumber}`);
assert.equal(body.items[0].quantity, 1);
assert.equal(body.items[0].unitPriceCents, picked.unitPriceCents);
```

- [ ] **Step 2: Verify failure**

Run: `node --test apps/api/test/inventoryDeduction.test.js`  
Expected: FAIL because tracking response fields are absent.

- [ ] **Step 3: Return persisted values and track browser Purchase**

Return currency, total, normalized purchased items, and `purchase:<orderNumber>`. After `createOrder()` succeeds and before cart clearing, call `trackFacebookPurchase(result, result.items, result.trackingEventId)`. Guard by event ID in `sessionStorage`; do not fire from `ThankYou.jsx`.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/api/test/inventoryDeduction.test.js apps/web/test/metaPixel.test.js`  
Expected: PASS.

```bash
git add apps/api/src/routes/orders.js apps/api/test/inventoryDeduction.test.js apps/web/src/pages/Checkout.jsx apps/web/src/lib/metaPixel.js apps/web/test/metaPixel.test.js
git commit -m "feat: track authoritative browser purchases"
```

## Task 6: Build The Server Purchase Event

**Files:**
- Create: `apps/api/src/marketing/metaEvent.js`
- Modify: `apps/api/test/metaEvent.test.js`

- [ ] **Step 1: Write failing hash and payload tests**

```js
const event = buildMetaPurchaseEvent({ order, requestContext, eventTime: 1781930000 });
assert.equal(event.event_name, 'Purchase');
assert.equal(event.event_id, `purchase:${order.orderNumber}`);
assert.equal(event.custom_data.value, order.totalCents / 100);
assert.deepEqual(event.user_data.em, [sha256(order.customer.email.trim().toLowerCase())]);
```

- [ ] **Step 2: Verify failure**

Run: `node --test apps/api/test/metaEvent.test.js`  
Expected: FAIL because `metaEvent.js` is absent.

- [ ] **Step 3: Implement server normalization**

Implement `sha256`, email and Philippine-phone normalization, cookie parsing, and `buildMetaPurchaseEvent`. Omit empty fields. Do not hash `_fbp`, `_fbc`, IP, or user agent. Never include address or notes.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/api/test/metaEvent.test.js`  
Expected: PASS.

```bash
git add apps/api/src/marketing/metaEvent.js apps/api/test/metaEvent.test.js
git commit -m "feat: build Meta server purchase events"
```

## Task 7: Add The Durable Outbox

**Files:**
- Create: `apps/api/db/migrations/20260620_meta_event_outbox.sql`
- Modify: `apps/api/db/schema.sql`
- Modify: `apps/api/scripts/db-migrate.js`
- Create: `apps/api/src/marketing/marketingEventOutboxRepository.js`
- Create: `apps/api/test/marketingEventOutbox.test.js`
- Modify: `apps/api/test/postgresPersistence.test.js`

- [ ] **Step 1: Write failing schema and repository tests**

Assert the exact approved table, unique `event_id`, status check, and pending index. Add `orders.checkout_idempotency_key` with a partial unique index where the value is non-empty. With a fake client, test insert, `FOR UPDATE SKIP LOCKED` claim, sent, retry, failed, and five-minute stale recovery.

- [ ] **Step 2: Verify failure**

Run: `node --test apps/api/test/postgresPersistence.test.js apps/api/test/marketingEventOutbox.test.js`  
Expected: FAIL because schema and repository are absent.

- [ ] **Step 3: Implement migration and repository operations**

Add an idempotent migration runner that creates `schema_migrations`, applies sorted SQL files once inside transactions, and records each filename. Keep `schema.sql` able to bootstrap a new database and place the release change in `20260620_meta_event_outbox.sql`. Export:

```js
insertMetaPurchaseOutbox(client, event)
claimDueMetaEvents(client, { now, limit: 10 })
markMetaEventSent(client, id, result)
scheduleMetaEventRetry(client, id, retry)
markMetaEventFailed(client, id, error)
recoverStaleMetaEventClaims(client, cutoff)
```

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/api/test/postgresPersistence.test.js apps/api/test/marketingEventOutbox.test.js`  
Expected: PASS.

```bash
git add apps/api/db/schema.sql apps/api/db/migrations/20260620_meta_event_outbox.sql apps/api/scripts/db-migrate.js apps/api/src/marketing/marketingEventOutboxRepository.js apps/api/test/postgresPersistence.test.js apps/api/test/marketingEventOutbox.test.js
git commit -m "feat: add Meta event outbox"
```

## Task 8: Make Checkout And Outbox Atomic

**Files:**
- Modify: `apps/api/src/products/catalogRepository.js`
- Modify: `apps/api/src/orders/orderRepository.js`
- Modify: `apps/api/src/inventory/inventoryMovementRepository.js`
- Modify: `apps/api/src/cartSessions/cartSessionRepository.js`
- Modify: `apps/api/src/discounts/discountRepository.js`
- Modify: `apps/api/src/routes/orders.js`
- Modify: `apps/api/test/inventoryDeduction.test.js`
- Modify: `apps/api/test/promoFullFlow.test.js`

- [ ] **Step 1: Write rollback and idempotency tests**

Use the existing non-empty `cartSessionId` as `checkoutIdempotencyKey`; checkout creates it before submission and resets it only after success. Inject a failure after stock deduction. Assert no order, stock change, movement, promo increment, cart conversion, or outbox row remains. Submit the same key twice and assert the second request returns the first order without another deduction or outbox event. Reject an empty key.

- [ ] **Step 2: Verify failure**

Run: `node --test apps/api/test/inventoryDeduction.test.js apps/api/test/promoFullFlow.test.js`  
Expected: FAIL because writes are independent.

- [ ] **Step 3: Add transaction-client repository operations**

Accept `{ client }` in PostgreSQL repository functions and use `client.query`. Preserve JSON mode only when CAPI is disabled.

- [ ] **Step 4: Compose one transaction**

Within `transaction(async (client) => ...)`: query `orders.checkout_idempotency_key` first; return the existing order when found, otherwise deduct stock, persist the order with that key, insert movements, convert the cart, increment promo, build the server event, and insert the unique outbox row. Return the browser response only after commit. Handle a unique-key race by re-reading and returning the winning order.

- [ ] **Step 5: Verify and commit**

Run: `npm test`  
Expected: all API tests pass.

```bash
git add apps/api/src/products/catalogRepository.js apps/api/src/orders/orderRepository.js apps/api/src/inventory/inventoryMovementRepository.js apps/api/src/cartSessions/cartSessionRepository.js apps/api/src/discounts/discountRepository.js apps/api/src/routes/orders.js apps/api/test/inventoryDeduction.test.js apps/api/test/promoFullFlow.test.js
git commit -m "feat: atomically queue Meta purchases"
```

## Task 9: Implement The Graph API Client

**Files:**
- Create: `apps/api/src/marketing/metaConversionsApi.js`
- Create: `apps/api/test/metaConversionsApi.test.js`

- [ ] **Step 1: Write failing transport tests**

Inject `fetch`. Assert URL, server-only token body field, staging test code, five-second timeout, response mapping, redaction, and retry classification for timeout/429/5xx versus permanent 4xx.

- [ ] **Step 2: Verify failure**

Run: `node --test apps/api/test/metaConversionsApi.test.js`  
Expected: FAIL because the client is absent.

- [ ] **Step 3: Implement transport**

Export `sendMetaConversionsEvent(event, { config, fetchImpl = fetch })`. Build the URL from `config.graphApiVersion` and `config.pixelId` as `https://graph.facebook.com/` plus version plus `/` plus Pixel ID plus `/events`; return `{ eventsReceived, traceId }` and throw typed redacted errors with a `retryable` property.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/api/test/metaConversionsApi.test.js`  
Expected: PASS.

```bash
git add apps/api/src/marketing/metaConversionsApi.js apps/api/test/metaConversionsApi.test.js
git commit -m "feat: send Meta Conversions API events"
```

## Task 10: Implement Worker And Graceful Shutdown

**Files:**
- Create: `apps/api/src/marketing/metaConversionsWorker.js`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/src/db/postgres.js`
- Modify: `apps/api/test/marketingEventOutbox.test.js`

- [ ] **Step 1: Write failing lifecycle tests**

Inject clock, random, timer, repository, and sender. Assert batch 10, 10-second polling, delays `[1,2,4,8,16,32,64]` minutes plus zero-to-15-percent jitter, failure after attempt 8, five-minute stale recovery, and clean stop.

- [ ] **Step 2: Verify failure**

Run: `node --test apps/api/test/marketingEventOutbox.test.js`  
Expected: FAIL because the worker is absent.

- [ ] **Step 3: Implement and wire lifecycle**

Export `createMetaConversionsWorker(dependencies)` returning `{ start, stop, runOnce }`. Start only when enabled. On `SIGTERM`/`SIGINT`, stop polling, close the HTTP server, and close the database pool.

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/api/test/marketingEventOutbox.test.js apps/api/test/metaConversionsApi.test.js`  
Expected: PASS.

```bash
git add apps/api/src/marketing/metaConversionsWorker.js apps/api/src/server.js apps/api/src/db/postgres.js apps/api/test/marketingEventOutbox.test.js
git commit -m "feat: deliver queued Meta purchases"
```

## Task 11: Privacy, Operations, And CI

**Files:**
- Modify: privacy/cookie content in store settings
- Modify: `docs/meta-pixel-setup.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a failing disclosure test**

Require customer-facing content to name Facebook Meta Pixel and Conversions API, immediate browser loading, advertising measurement, server Purchase delivery, hashed contact matching, and contact/opt-out information approved by the business.

- [ ] **Step 2: Verify failure**

Run the focused store-settings/content test.  
Expected: FAIL because the disclosure is absent.

- [ ] **Step 3: Update disclosure, runbook, and CI**

Document token rotation, Test Events, deduplication, Event Match Quality, outbox inspection, manual retry, kill switches, retention, and incident response. Add browser tests and a PostgreSQL CI service; all Meta HTTP calls use a fake sender.

- [ ] **Step 4: Verify and commit**

Run: `npm test && node --test apps/web/test/*.test.js && npm run build:web`  
Expected: all tests and build pass.

```bash
git add docs/meta-pixel-setup.md .github/workflows/ci.yml apps/api/data/admin-contracts/settings.json apps/api/test
git commit -m "docs: complete Meta tracking operations"
```

## Task 12: Final Verification And Staging

**Files:**
- No planned source changes

- [ ] **Step 1: Run clean verification**

```bash
npm test
node --test apps/web/test/*.test.js
npm run build:web
git diff --check
```

Expected: every command exits 0 and tests leave the worktree unchanged.

- [ ] **Step 2: Verify Docker disabled mode**

Run Compose rebuild, verify PostgreSQL health, API health, web HTTP 200, and no Meta request while disabled.

- [ ] **Step 3: Configure staging safely**

Set Pixel ID `595813035761213`, both enabled flags, supported Graph API version, access token in the secret manager, and temporary Test Events code. Never put the access token in Git or shell history.

- [ ] **Step 4: Execute the funnel**

Verify `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, and one browser plus one server `Purchase` sharing the event ID. Confirm Meta reports deduplication and correct PHP value.

- [ ] **Step 5: Verify failure behavior and production rollout**

Confirm no admin events. Simulate a Meta timeout and verify checkout succeeds while outbox retry is scheduled. Remove the Test Events code, deploy one controlled production order, and monitor diagnostics before ad optimization.
