# Codex promo/discount review — notes for the branch owner

Date: 2026-06-20. Read-only review of the promo/discount logic (no edits made to
`codex-edits`; this is a hand-off note). Scope: `src/promos/promoEngine.js`,
`src/discounts/discountRepository.js`, and the checkout path in
`src/routes/orders.js`. Inventory was intentionally left alone.

## What is solid (no action needed)

- **Discounts are recomputed server-side and can't be tampered with.**
  `routes/orders.js` validates every item against the catalog
  (`normalizeCheckoutItem`, rejects `Cart item price has changed`) *before*
  calling `quoteCart`, then stores `quote.*` totals — not the client-sent
  `adminEditableTotals`. So a forged discount amount or unit price cannot reach
  the saved order.
- **Quote and order use the same engine**, so the price shown at checkout and the
  price charged agree (same rounding, same rules).
- **Percentage rounding** is `Math.round(subtotal * value / 100)` and every
  discount is capped at the subtotal in `buildAppliedDiscount`
  (`Math.min(context.subtotalCents, …)`), and the total is floored at 0. No
  negative or over-subtotal discounts.
- **`minimumSubtotalCents` boundary** is inclusive/correct (`subtotal < minimum`
  rejects; subtotal == minimum passes).
- **JSON-mode usage increment persists** (`writeDiscountsFile`), so usage counts
  survive restarts in file mode.

## Findings

### 1. Usage-limit can be exceeded under concurrency (TOCTOU race) — main item

`discountValidationError` checks `usageCount >= usageLimit` at **quote time**
(`discountRepository.js`), but `incrementDiscountUsage` runs **after** the order
is saved and is **unconditional**:

```sql
UPDATE discount_codes SET usage_count = usage_count + 1 WHERE code = $1
```

Two orders submitted concurrently when `usageCount = usageLimit - 1` both pass
the check and both increment → the limit is exceeded. Single-user flows are fine;
this only bites under concurrent checkout.

Suggested fix (mirrors the guarded stock-deduction pattern already in
`catalogRepository.deductPostgresVariantStock`): make the increment the gate.

```sql
UPDATE discount_codes
   SET usage_count = usage_count + 1, updated_at = now()
 WHERE code = $1
   AND (usage_limit IS NULL OR usage_count < usage_limit)
```

Treat `rowCount === 0` as "limit reached" and fail the order (or, if accepting
the order regardless, surface that the code was not consumed). The JSON path
should re-read + check + write under the same guard. This makes the limit
authoritative instead of advisory.

### 2. `discountValidationError` doesn't check `startsAt` (minor)

It checks `endsAt` but not `startsAt`. The checkout path is covered because
`promoEngine.validatePromoForQuote` also calls `isPromoInDateWindow` (which checks
both). But `discountValidationError` is exported and reused; any direct caller
would let a not-yet-started promo through. Consider moving the full date-window
check into `discountValidationError` so it's correct standalone (and drop the now
redundant `endsAt` check in `isPromoInDateWindow`).

### 3. Tiny redundancy (no action required)

`endsAt` is checked in both `discountValidationError` and `isPromoInDateWindow`
on the quote path. Harmless; folds into finding #2 if consolidated.

## Already fixed during the merge draft

While drafting the `codex-edits → main` merge resolution (separate worktree), a
render-crash bug was fixed in `apps/web/src/pages/Checkout.jsx`: a leftover
`const discountCents = discount?.discountTotalCents` referenced an out-of-scope
`discount` (main's client-discount path) after switching to codex's server-quote
path. Discounts now flow solely through the quote. Carry that fix forward when
codex lands.
