# Phase 1 Promo Engine and Quote API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend promo engine and quote API so cart, checkout, and order creation can use one authoritative discount/free-shipping calculation path.

**Architecture:** Extend the existing discount-code repository into a richer promo-compatible model without replacing current APIs. Add a focused `promoEngine` module that validates active promos, applies automatic Buy More Save More rules, applies optional code discounts, and returns a stable order-ready quote. Keep `/api/discounts/validate` compatible, add `/api/discounts/quote`, and use the quote engine inside `POST /api/orders`.

**Tech Stack:** Node.js, Express, node:test, existing file/Postgres repository pattern, existing `discount_codes` and `orders` schema.

---

## Files

- Modify: `apps/api/test/adminCustomersDiscounts.test.js`
  - Add backend behavior tests for promo metadata, quote API, automatic Buy More Save More, expired/disabled promos, and order promo snapshots.
- Modify: `apps/api/src/discounts/discountRepository.js`
  - Extend normalization and persistence for promo fields while preserving current discount-code behavior.
- Create: `apps/api/src/promos/promoEngine.js`
  - Centralize quote calculation and promo selection.
- Modify: `apps/api/src/routes/discounts.js`
  - Add `POST /api/discounts/quote`.
- Modify: `apps/api/src/routes/orders.js`
  - Use `promoEngine.quoteCart()` during checkout and store `discountSnapshot`.
- Modify: `apps/api/src/orders/orderRepository.js`
  - Persist and return `discountSnapshot`.
- Modify: `apps/api/src/routes/admin.js`
  - Accept and return new promo fields through existing admin discount endpoints.
- Modify: `apps/api/db/schema.sql`
  - Add promo metadata columns to `discount_codes`.
  - Add `orders.discount_snapshot`.

## Task 1: Add Failing Quote and Promo Tests

- [ ] **Step 1: Add tests to `apps/api/test/adminCustomersDiscounts.test.js`**

Add a new test that creates an automatic Buy More Save More promo through the existing admin discounts endpoint, calls `POST /api/discounts/quote`, and verifies the backend response contains the applied promo and free shipping.

Add assertions for:

- `discount.name === 'Buy More Save More Promo'`
- `discount.type === 'buy_more_save_more'`
- `discount.discountTotalCents === 10000`
- `freeShippingUnlocked === true`
- `shippingFeeCents === 0`
- `totalCents === subtotalCents - 10000`

- [ ] **Step 2: Add order snapshot assertions**

In the same test, place an order using the same cart items and assert:

- `confirmation.order.discountSnapshot.name === 'Buy More Save More Promo'`
- `confirmation.order.discountSnapshot.type === 'buy_more_save_more'`
- `confirmation.order.discountSnapshot.freeShippingApplied === true`
- `confirmation.order.discountTotalCents === 10000`
- `confirmation.order.shippingFeeCents === 0`

- [ ] **Step 3: Run the test and verify RED**

Run:

```sh
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result before implementation:

- Fails because `/api/discounts/quote` does not exist or returns 404.
- If the local Node test runner crashes natively, retry the narrower test file after confirming no app assertion output was produced.

## Task 2: Extend Discount Repository Model

- [ ] **Step 1: Update discount normalization**

In `apps/api/src/discounts/discountRepository.js`, extend supported types to include:

- `buy_more_save_more`
- `percentage`
- `fixed`
- `free_shipping`
- `bundle`

Normalize these fields:

- `name`
- `description`
- `method`
- `minimumQuantity`
- `minimumSubtotalCents`
- `startsAt`
- `endsAt`
- `bannerText`
- `terms`
- `rules`

Default behavior:

- Existing discounts without `name` use their code as the name.
- Existing discounts without `method` use `code`.
- Existing discounts without `startsAt` are available immediately.
- Existing discounts without `rules` use an empty array.

- [ ] **Step 2: Preserve current validation**

Keep existing validation for:

- Percentage value between 1 and 100.
- Fixed value at least 1 centavo.
- Code required for code-based promos.

Add validation for:

- Automatic promos can have an empty code only if the repository can create a stable generated code/id.
- Buy More Save More must have at least one valid rule.
- Free shipping can have zero value.

- [ ] **Step 3: Update file and Postgres persistence mapping**

For file mode, write the extra fields into `discounts.json`.

For Postgres mode, map the extra columns:

- `name`
- `description`
- `method`
- `starts_at`
- `minimum_quantity`
- `banner_text`
- `terms`
- `rules`

- [ ] **Step 4: Run test and verify progress**

Run:

```sh
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result:

- Admin discount creation accepts new promo fields.
- Quote endpoint still fails until Task 3/4.

## Task 3: Add Promo Engine

- [ ] **Step 1: Create `apps/api/src/promos/promoEngine.js`**

Expose:

```js
async function quoteCart(input) {}
function normalizeQuoteItems(items) {}
function selectBestAutomaticPromo(discounts, context) {}
function applyDiscount(discount, context) {}
```

The public export should include:

```js
module.exports = {
  quoteCart,
  normalizeQuoteItems,
  selectBestAutomaticPromo,
  applyDiscount
};
```

- [ ] **Step 2: Implement quote behavior**

`quoteCart(input)` should:

- Normalize cart items.
- Calculate `itemCount`.
- Calculate `subtotalCents`.
- Load discounts from `listDiscounts()`.
- Apply an optional code promo when `input.discountCode` is present.
- Apply the best automatic active promo when no code is present.
- Calculate shipping from `input.shippingFeeCents`, then set it to zero when promo free shipping applies.
- Return `subtotalCents`, `discountTotalCents`, `shippingFeeCents`, `freeShippingUnlocked`, `totalCents`, and `discountSnapshot`.

- [ ] **Step 3: Implement Buy More Save More rules**

Rules should apply when:

- Promo type is `buy_more_save_more`.
- Promo is active.
- Current time is after `startsAt` when present.
- Current time is before `endsAt` when present.
- `itemCount` is greater than or equal to the rule's `minimumQuantity`.
- `subtotalCents` is greater than or equal to `minimumSubtotalCents` when present.

Pick the rule with the highest customer savings. If savings tie, prefer the rule with free shipping.

- [ ] **Step 4: Run tests and verify progress**

Run:

```sh
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result:

- Unit-level imports should load.
- Route still fails until Task 4.

## Task 4: Add Quote Route

- [ ] **Step 1: Modify `apps/api/src/routes/discounts.js`**

Add:

```js
router.post('/quote', async (req, res, next) => {
  try {
    const quote = await quoteCart(req.body || {});
    return res.json({ quote });
  } catch (error) {
    return next(error);
  }
});
```

Import `quoteCart` from `../promos/promoEngine`.

- [ ] **Step 2: Keep validate route compatible**

Do not remove `POST /api/discounts/validate`.

It should continue returning:

```json
{
  "discount": {
    "code": "MARIA10",
    "type": "percentage",
    "value": 10,
    "discountTotalCents": 6490
  }
}
```

- [ ] **Step 3: Run tests and verify quote passes**

Run:

```sh
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result:

- New quote assertions pass.
- Order snapshot assertions still fail until Task 5.

## Task 5: Use Promo Engine in Order Creation

- [ ] **Step 1: Modify `apps/api/src/routes/orders.js`**

Replace the current discount resolution with a call to `quoteCart()` after item normalization.

The order should store:

- `discountCode`
- `discountTotalCents`
- `discountSnapshot`
- `shippingFeeCents`
- `freeShippingUnlocked`
- `totalCents`

- [ ] **Step 2: Keep legacy no-code behavior safe**

If no promo applies:

- `discountCode` is `''`
- `discountTotalCents` is `0`
- `discountSnapshot` is `{}`

Do not trust client-sent `discountTotalCents` as authoritative for new orders.

- [ ] **Step 3: Run tests and verify order snapshot passes**

Run:

```sh
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result:

- Quote and order snapshot tests pass.
- Existing admin discount CRUD tests still pass.

## Task 6: Persist Order Discount Snapshot

- [ ] **Step 1: Modify `apps/api/src/orders/orderRepository.js`**

For file mode:

- Preserve `order.discountSnapshot || {}` when saving and reading.

For Postgres mode:

- Include `discount_snapshot` in insert/update/select mapping.

- [ ] **Step 2: Modify `apps/api/db/schema.sql`**

Add:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 3: Run tests**

Run:

```sh
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result:

- Order snapshot persists and appears in public confirmation.

## Task 7: Add Schema Columns for Promo Metadata

- [ ] **Step 1: Modify `apps/api/db/schema.sql`**

Add:

```sql
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'code';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS minimum_quantity integer;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS banner_text text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS terms text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Run backend API tests**

Run:

```sh
npm test -w apps/api
```

Expected result:

- Existing API test suite passes, except for any known local Node native test runner crash that occurs before app assertions.

## Task 8: Update Roadmap Status

- [ ] **Step 1: Modify `docs/enhancementdata2.md`**

Mark Phase 1 as finished only after tests pass:

```md
### Phase 1: Backend Promo Engine and Quote API

Status: Finished
```

- [ ] **Step 2: Run final targeted checks**

Run:

```sh
node --check apps/api/src/discounts/discountRepository.js
node --check apps/api/src/promos/promoEngine.js
node --check apps/api/src/routes/discounts.js
node --check apps/api/src/routes/orders.js
node --check apps/api/src/orders/orderRepository.js
node --test apps/api/test/adminCustomersDiscounts.test.js
```

Expected result:

- Syntax checks pass.
- Targeted API test passes or local Node native crash is reported exactly.

## Self-Review

- This plan covers Phase 1 only.
- Customer cart drawer, checkout review UI, inventory deduction, admin promo UI expansion, and promo notification UI remain in later phases.
- Existing `/api/discounts/validate` remains compatible.
- Existing admin discount routes remain the management surface.
- No Dockerfile, docker-compose.yml, package.json, or `.env` changes are planned.
