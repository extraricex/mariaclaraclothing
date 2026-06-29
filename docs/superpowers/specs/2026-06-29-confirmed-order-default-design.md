# Confirmed Order Default Design

## Goal

Every order placed by a customer starts with the business status `confirmed` instead of
`received`.

## Scope

- Change the initial status in the authoritative Checkout V2 order builder.
- Change the initial status in the legacy order creation path while that path remains available.
- Change the PostgreSQL schema default and repository fallback so direct persistence follows the
  same invariant.
- Update regression tests that assert the initial order status.
- Keep `received` as a supported admin status for existing and manually edited historical orders.
- Do not rewrite existing order records.

## Data Flow

After checkout validates the customer, address, cart, totals, inventory, and idempotency state,
the newly built order is persisted with `status: confirmed`. Fulfillment remains `unfulfilled`,
payment remains `cod_pending`, COD confirmation remains `pending`, and delivery remains `pending`.
Only the business order status changes.

## Compatibility

Both JSON fallback persistence and PostgreSQL persistence accept the new initial value. Existing
orders with `received` remain valid and continue to display correctly in admin and customer status
views.

## Testing

Regression coverage will prove that customer order creation returns `confirmed` through the
legacy route and that Checkout V2 builds a `confirmed` order. Existing order-management tests
will be updated only where they intentionally assert the initial state. The complete API and web
test suites, production build, and Docker health checks will run before completion.
