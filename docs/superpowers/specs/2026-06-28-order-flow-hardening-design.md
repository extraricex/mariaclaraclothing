# Order Flow Hardening Phased-Release Design

**Design date:** 2026-06-28
**Status:** Approved architecture; implementation plans are written one phase at a time.
**Source audit:** `docs/end-to-end-order-flow-audit-2026-06-28.md`

## Goal

Move the current working commerce prototype to a production-capable order workflow without a high-risk rewrite. Deliver six independently testable releases that progressively make checkout authoritative, protect customer data, preserve inventory consistency, model J&T operations correctly, harden security, and improve operations and scale.

## Delivery Strategy

Each phase is a separate release branch and deployment. A phase begins only after the previous phase passes its automated, migration, rollback, and production smoke-test gates.

The design deliberately avoids a single long-running branch because checkout, inventory, J&T, authentication, and operations have different failure modes. Independent releases limit blast radius and allow the business to validate the real workflow between phases.

### Sequence

1. Authoritative checkout and private confirmation.
2. Atomic admin inventory workflow.
3. Correct J&T export lifecycle.
4. Authentication and platform security.
5. Operations and customer communication.
6. Cleanup and scale.

## Shared Architecture Rules

### PostgreSQL is the production source of truth

- Production startup requires `DATABASE_URL`.
- JSON repositories remain available only for local fixtures and tests until Phase 6 removes runtime fallback paths.
- Business operations that affect more than one record use one PostgreSQL transaction.
- Versioned migrations are additive and backward-compatible for at least one deployment cycle.

### Commands replace arbitrary state mutation

Business transitions use explicit services such as `placeCheckout`, `cancelOrder`, `reviseOrderItems`, `prepareJntExport`, and `acceptJntShipment`. Route handlers validate transport input and delegate to these services.

### Server owns money and inventory

The browser submits identity and intent: variant IDs, quantities, discount code, address codes, payment choice, and idempotency key. The server loads prices, shipping policy, promotion state, stock, and allowed transitions.

### Every operation is retry-safe

- Public checkout and external submissions use idempotency records with request hashes and stored responses.
- Admin writes use order versions or `updated_at` preconditions.
- Export and notification jobs have durable records and unique operation keys.

### Sensitive access is explicit

- An order number is an identifier, not an access credential.
- Guest confirmation requires a cryptographic token.
- Customer account access requires verified ownership.
- Admin actions record an actor and audit event.

### Compatibility and rollout

- New response fields are introduced before old fields are removed.
- Frontend and API can run one release apart during rolling deployment.
- Feature flags are used only for risky cutovers, not as permanent competing implementations.
- Every phase documents forward migration, rollback behavior, data backfill, and monitoring.

## Phase 1: Authoritative Checkout and Private Confirmation

### Objective

Ensure the final amount, shipping decision, promotion, and confirmation access are trustworthy and that checkout retries return the original successful response.

### Scope

- Server-side address hierarchy validation using stable province, city, and barangay codes.
- Server-side shipping region, fee, delivery estimate, and serviceability calculation.
- Server-side catalog pricing and promotion calculation for quote and checkout.
- Short-lived authoritative quote records with normalized snapshot/version data.
- Dedicated idempotency records containing key, request hash, state, response, and expiry.
- Private guest confirmation tokens stored as hashes.
- Minimal public confirmation response.
- Updated React cart, checkout, thank-you, and customer-order flows.
- Tamper, retry, privacy, migration, and browser journey tests.

### Data model

- `checkout_quotes`: quote ID, cart session ID, normalized items, address codes, shipping snapshot, promotion snapshot, totals, catalog/settings versions, expiry, consumed order number, timestamps.
- `checkout_idempotency`: key, request hash, status, order number, response payload, expiry, timestamps.
- `orders.confirmation_token_hash`: nullable hash for guest confirmation.
- `orders.confirmation_token_created_at`: token lifecycle timestamp.
- Persist stable address codes and address-dataset version on the order.

### API contracts

- `POST /api/checkout/quotes` accepts variant IDs, quantities, discount code, and address codes. It returns `quoteId`, authoritative lines, totals, shipping decision, warnings, and expiry.
- `POST /api/orders` accepts `quoteId`, contact, payment method, notes, and `Idempotency-Key`. It does not accept authoritative money fields.
- Successful guest checkout returns `orderNumber`, `confirmationToken`, authoritative tracking fields, and order summary. The browser keeps the token in `sessionStorage`; it is never placed in a URL, analytics event, or log.
- `GET /api/orders/:orderNumber/confirmation` requires the token in `X-Order-Confirmation` and returns the minimal confirmation only after token verification.
- Authenticated customer history uses account ownership and does not use unverified phone matching.

### Error behavior

- Invalid address hierarchy: `400 address_invalid` with the invalid level.
- Unserviceable address: `422 address_unserviceable` with an operational review option only if explicitly configured.
- Expired quote: `409 quote_expired` and a newly generated quote may be included.
- Catalog/settings/promo change: `409 quote_changed` with authoritative differences.
- Idempotency key reused for different input: `409 idempotency_conflict`.
- Duplicate matching request: return the stored successful response without revalidating consumed stock.
- Invalid confirmation token: generic `404` to avoid order enumeration.

### Non-goals

- Admin order/inventory reconciliation.
- J&T batch and shipment states.
- Cookie-based authentication migration.
- SMS/email delivery.

### Exit gate

- No browser monetary or shipping field is authoritative.
- Order PII cannot be retrieved with an order number alone.
- Matching checkout retries return exactly one order and one stock deduction.
- Core quote/checkout tests run against PostgreSQL in CI.
- Existing production orders remain viewable by admins after migration.

## Phase 2: Atomic Admin Inventory Workflow

### Objective

Make every admin order modification preserve agreement among order lines, stock, inventory movements, totals, and audit history.

### Scope

- `adminOrderService` command boundary.
- PostgreSQL row locking and optimistic order version.
- Explicit commands for contact/address update, item revision, cancellation, reopen, payment, packing, and fulfillment.
- Inventory delta calculation for item additions, removals, variant changes, and quantity changes.
- Atomic order, stock, movement, and audit updates.
- Allowed transition matrix and derived display statuses.
- Required reasons for cancellation, reopen, manual price override, refund, and stock override.
- Full audit events for all changed fields and admin actor.

### Data model

- `orders.version` integer incremented on every admin write.
- `order_audit_events` containing operation, actor, reason, previous snapshot/diff, resulting diff, request ID, and timestamp.
- Inventory movements receive operation IDs for exact reconciliation.

### Error behavior

- Stale order version: `409 order_conflict` with current version.
- Insufficient stock: `409 insufficient_stock` with affected SKU and available quantity.
- Invalid transition: `409 invalid_order_transition`.
- Missing override reason: `400 reason_required`.
- Any database error rolls back every related record.

### Non-goals

- J&T export batch redesign.
- Admin authentication redesign.
- Returns and notification provider integration.

### Exit gate

- Failure injection at each write boundary leaves no partial changes.
- Concurrent admin edits cannot silently overwrite.
- Order totals, stock, and movement totals reconcile after every supported command.
- Reopening a cancellation reserves stock or fails cleanly.

## Phase 3: Correct J&T Export Lifecycle

### Objective

Represent workbook preparation, J&T submission, courier acceptance, pickup, transit, delivery, failure, and return as distinct auditable events.

### Scope

- Durable J&T export batches and batch-order membership.
- Strict server-side eligibility for all selection modes.
- Package weight, parcel count, COD amount, address validation, and serviceability review.
- Maintained spreadsheet library replacing `xlsx` 0.18.5.
- Export checksum and deterministic regeneration.
- Explicit submit, accept, reject, tracking-number, pickup, in-transit, delivered, failed-delivery, and return commands.
- Re-export with required reason and lineage to the original batch.
- Admin batch list/detail and order-level courier history.

### Data model

- `jnt_export_batches`: ID, status, operator, checksum, file metadata, error, timestamps.
- `jnt_export_batch_orders`: batch ID, order number, COD amount, weight, parcel count, row snapshot.
- `shipment_events`: order, provider, event type, tracking number, payload, source, timestamp.

### State semantics

- `export_prepared` means a file exists.
- `submitted_to_jnt` means an operator/API submitted it.
- `accepted_by_jnt` means the courier accepted the shipment data.
- `picked_up` or a verified equivalent marks fulfillment as shipped.
- `out_for_delivery` is set only from a courier/admin delivery event, never from export.

### Error behavior

- Ineligible order selection: reject before creating the batch.
- Workbook failure: no batch is marked ready and no order state changes.
- Partial J&T acceptance: preserve per-order results inside one batch.
- Re-export without reason: reject.

### Non-goals

- Choice of a specific J&T API before credentials and provider contract exist.
- General notification provider integration.

### Exit gate

- Downloading a workbook never marks an order shipped.
- Every exported row maps to one immutable batch snapshot.
- Duplicate/re-export behavior is explicit and tested.
- The production dependency audit no longer reports `xlsx`.

## Phase 4: Authentication and Platform Security

### Objective

Remove unsafe production defaults and protect customer/admin sessions and sensitive endpoints against credential theft and abuse.

### Scope

- Production environment validation and secret management.
- Secure HTTP-only same-site customer and admin sessions.
- CSRF protection for state-changing browser requests.
- Server-side session revocation and rotation.
- Named admin users and initial role boundary.
- Rate limits for authentication, quote, cart session, checkout, confirmation, and uploads.
- Verified email and phone/order-claim flow.
- Password reset and logout-all-sessions.
- Upload signature verification/re-encoding.
- Security headers, trusted proxy configuration, host restrictions, and private API network exposure.
- `multer` upgrade and CI vulnerability policy.

### Compatibility

- Cookie sessions are introduced while bearer-token reads remain temporarily accepted.
- Frontend switches to credentials-based requests.
- Bearer-token support is removed after active-session migration or expiry.

### Exit gate

- Production cannot start with local default secrets or JSON persistence.
- Browser JavaScript cannot read session credentials.
- Sensitive endpoints are throttled.
- No direct high-severity production dependency remains without an approved time-bound exception.

## Phase 5: Operations and Customer Communication

### Objective

Make failures observable and recoverable, and replace notification records with real delivery workflows.

### Scope

- Structured logging, request IDs, actor IDs, and PII redaction.
- Liveness and dependency-aware readiness.
- Metrics and alerts for checkout, stock, promo claims, admin conflicts, J&T batches, notifications, and Meta outbox.
- SMS/email provider abstraction with queued, sent, delivered, failed, and retried states.
- Notification outbox and templates for confirmation, shipment, delivery failure, and cancellation.
- Returns, failed delivery, return-to-sender, refund, and restock commands.
- Daily order/inventory/payment/J&T reconciliation.
- Backup, restore, incident, and disaster-recovery runbooks.
- Admin Meta outbox visibility and audited requeue.

### Exit gate

- Operators can detect and diagnose failed checkout, export, notification, and marketing jobs.
- A restore exercise succeeds from a documented backup.
- Notification UI distinguishes recording from actual provider delivery.
- Return and failed-delivery inventory outcomes reconcile.

## Phase 6: Cleanup and Scale

### Objective

Remove duplicate runtime paths, move large assets out of the API, and make common admin/customer queries efficient and regression-tested.

### Scope

- Retire the legacy static storefront after parity verification.
- Remove production JSON repository fallbacks.
- Move product/brand media to a managed asset pipeline or object storage.
- Server-side pagination/filtering for orders, customers, carts, inventory, and products.
- Saved operational views and validated bulk commands.
- Full Playwright customer-to-admin-to-J&T regression suite.
- Accessibility, performance, SEO, and asset-size budgets.
- Repository/documentation cleanup after migrations are stable.

### Exit gate

- One storefront and one production persistence path remain.
- Large legacy assets no longer inflate the API image.
- Operational lists perform predictably with production-scale data.
- The full critical browser journey runs in CI.

## Test Strategy Across Phases

Each feature follows red-green-refactor and includes:

1. Pure unit tests for normalization, money, transition, and inventory-delta rules.
2. Route/contract tests for status codes and response shapes.
3. PostgreSQL integration tests for transactions, constraints, migrations, locking, and retry behavior.
4. Failure-injection tests proving rollback.
5. Concurrency tests for stock, promotions, idempotency, and admin versions.
6. Playwright tests for the affected browser workflow.
7. Production configuration build and Docker smoke test.

Source-text regular-expression tests may remain for low-risk structural checks but cannot be the only evidence for critical behavior.

## Release Gate Applied to Every Phase

- Full API and web tests pass.
- Phase-specific PostgreSQL and Playwright tests pass.
- Migration succeeds from empty and previous-release databases.
- Rollback procedure is rehearsed against a disposable database.
- `npm audit --omit=dev` is reviewed under the approved policy.
- Docker images build and health/readiness checks pass.
- Production smoke checklist is completed with no customer PII in logs.
- Monitoring and rollback owner are recorded before rollout.

## Implementation Planning Rule

Only the next approved phase receives a detailed implementation plan. Later-phase plans are not written prematurely because file layout and contracts may change after the preceding release. Phase 1 is the next plan; Phase 2 planning begins only after Phase 1 is implemented, deployed, and reviewed.
