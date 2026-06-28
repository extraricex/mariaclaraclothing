# End-to-End Order Flow Audit and Recommendations

**Review date:** 2026-06-28
**Branch reviewed:** `codex-edits`
**Scope:** Customer visit, product discovery, cart, cart-session capture, checkout, promotions, order persistence, inventory, customer account history, admin processing, cancellation, J&T Excel export, tracking records, Meta tracking, security, operations, and tests.
**Purpose:** Review and approve the recommended work before implementation. This document does not change application behavior.

## Executive Summary

The project has a working end-to-end commerce prototype with a credible foundation:

- React storefront and admin application.
- PostgreSQL-backed products, orders, customers, settings, promotions, carts, and inventory.
- Server-side catalog price and stock validation during final checkout.
- Transactional PostgreSQL order creation, stock deduction, movement recording, cart conversion, promo usage update, and Meta outbox insertion.
- Checkout idempotency key and guarded stock deduction.
- Admin order editing, status history, cancellation restocking, inventory history, and J&T template export.
- Browser Meta Pixel events and durable server-side Purchase delivery.
- Broad automated API and source-level frontend tests.

The website is **not ready for unrestricted production order processing yet**. The main problem is not whether a happy-path order can be created; it can. The problem is that several boundaries still trust browser data or update related business records separately. Those gaps can produce wrong totals, expose customer data, corrupt inventory, or report an order as shipped before J&T has accepted it.

### Launch blockers

1. Shipping price, shipping region, and free-shipping state are still accepted from the browser.
2. Public order lookup exposes full customer, address, item, note, and total data using only an order number.
3. Admin item edits and cancellation processing are not one atomic inventory transaction.
4. Creating a J&T workbook immediately marks orders shipped and out for delivery.
5. Admin and customer authentication still use production-unsafe defaults and long-lived `localStorage` bearer tokens, with no rate limiting.
6. The production dependency audit still reports two direct high-severity packages: `multer` and `xlsx`.

The recommended sequence is: make checkout authoritative, protect confirmation data, make admin inventory changes atomic, separate export from shipment, harden authentication and dependencies, then improve operations, UX, and scale.

## Current Flow

### 1. Customer visits and browses

1. Nginx serves the React application and proxies `/api`, `/uploads`, `/brand`, product media, and address data to Express.
2. The shell loads site content, storefront settings, promotions, cart data, and the Facebook Meta Pixel.
3. Customer routes are wrapped by maintenance mode; admin routes remain accessible.
4. Products are fetched from `/api/products` and `/api/products/:slug`.
5. A product page chooses the first in-stock variant and sends `ViewContent`.

**What works:** Product visibility, stock indicators, settings, media, promotions, and customer-only Pixel tracking are connected.

**Observed weaknesses:**

- Product quantity can exceed available stock before checkout.
- Variant-level prices exist in the data model but add-to-cart and checkout use the product price.
- Rich product HTML is sanitized in the browser, not authoritatively on the server.
- The API still serves a second legacy static storefront, increasing maintenance and security surface.

### 2. Add to cart and cart drawer

1. The selected product and variant are saved to `localStorage`.
2. Existing variant quantities are incremented locally.
3. A public cart-session `PUT` is fired asynchronously.
4. The cart drawer opens and sends `AddToCart`.
5. The cart and drawer call the quote API to display discounts and totals.

**What works:** Cart state survives refresh, cart sessions support draft/abandoned views, and Meta events are wired after customer actions.

**Observed weaknesses:**

- Cart-session updates are fire-and-forget, un-debounced, and can complete out of order.
- A request is generated on many checkout field changes, including keystrokes.
- The public cart-session endpoint accepts arbitrary client prices, PII, and session IDs without authentication, signing, throttling, or retention limits.
- Cart-session IDs use timestamp plus `Math.random()`, not a server-issued cryptographic identifier.
- The quote endpoint trusts item prices and `shippingFeeCents`, so displayed totals can be manipulated even though final item prices are revalidated later.
- Cart errors are swallowed, leaving customers and operations unaware that abandoned-cart capture failed.

### 3. Checkout details and quote review

1. Checkout loads the Philippine/J&T address guide and storefront settings.
2. Logged-in customer contact and saved address data can prefill the form.
3. The browser maps province to a shipping region and calculates the base fee from public settings.
4. The browser sends items, discount code, and shipping fee to `/api/discounts/quote`.
5. A second quote is requested during review and again before order submission.
6. The customer can choose an enabled payment method.

**What works:** Address selection is guided, checkout has a review step, promotions are re-quoted, disabled payment methods are rejected server-side, and door-to-door warnings are shown.

**Critical weakness:** The server does not derive the address region or shipping fee. It accepts `shippingFeeCents`, `shippingRegion`, `shippingRegionLabel`, and part of `freeShippingUnlocked` from the browser.

### 4. Final order creation

1. The API verifies required contact, address, and cart fields.
2. Each item is looked up in the catalog.
3. Product and variant existence, stock, and product price are checked.
4. Promotions are recalculated using normalized items but the browser-supplied shipping fee.
5. PostgreSQL checkout takes an advisory lock on the cart-session idempotency key.
6. One transaction deducts stock, saves the order, appends inventory movements, converts the cart, increments promo usage, and optionally inserts the Meta Purchase outbox event.
7. The response returns authoritative item prices, total, currency, order number, and Meta event ID.
8. The browser records the Purchase event, clears the cart, resets the cart session, and navigates to thank-you.

**What works:** This is much stronger than the earlier flow. PostgreSQL writes are atomic, stock deduction is guarded, and the Meta event is durable and deduplicated.

**Remaining weaknesses:**

- A duplicate retry is normalized and stock-checked before the existing idempotent order is looked up. If the first order consumed the last stock, a valid retry can fail as sold out instead of returning the existing result.
- Idempotency uses a client-controlled cart-session ID and does not bind the key to a canonical request hash.
- Promo usage is incremented unconditionally after prior validation; concurrent usage-limit check and claim are not one conditional database operation.
- JSON fallback remains non-transactional and can partially write stock, orders, movements, carts, and promos.
- Order numbers still start with `DEMO-` and contain a timestamp plus only two random bytes.
- Phone and email validation is incomplete at final checkout compared with registration.
- The server checks non-empty address names but does not verify the submitted province/city/barangay hierarchy against the address dataset.

### 5. Thank-you and customer order history

1. The browser stores a confirmation summary in `sessionStorage`.
2. The thank-you page also calls public `GET /api/orders/:orderNumber`.
3. Logged-in accounts list explicitly linked orders plus historical orders matched by phone number.

**What works:** Customers get an immediate confirmation and account history.

**Critical weaknesses:**

- Public order lookup returns customer contact details, full address, notes, items, and operational status with no confirmation token or account ownership check.
- Order numbers are not sufficient secrets.
- Registration verifies phone format but not phone ownership. A new account can inherit historical orders by matching an unverified phone number.
- Thank-you text and payment display are hardcoded to Cash on Delivery even when GCash or bank transfer is enabled.

### 6. Admin receives and processes an order

1. Admin logs in with a shared bearer token.
2. The order list loads all orders, then filters status, search, and dates in application memory.
3. Admin can edit contact, address, items, quantities, prices, notes, tags, and independent status fields.
4. Status changes create history entries.
5. Cancelling an order through `status: cancelled` restocks items and records positive inventory movements.

**What works:** The admin has useful operational controls, searchable orders, status history, inventory history, and J&T readiness indicators.

**Critical weaknesses:**

- Order update, restock, movement insertion, and status-event insertion are separate operations.
- The order is saved as cancelled before restock runs. A restock failure leaves a cancelled order with stock still deducted.
- Editing order items or quantities recalculates totals but does not deduct or restore inventory.
- Items added in admin can be out of stock, have arbitrary price/SKU values, or no catalog identity.
- Restock only keys off the top-level order status transition. Setting fulfillment or delivery to cancelled can create inconsistent state without restocking.
- Status fields are independently editable, so impossible combinations are allowed, such as delivered/unfulfilled, cancelled/paid, or received/out-for-delivery.
- Reverting a cancelled order does not reserve or deduct stock again.
- Concurrent admin edits use read-modify-upsert with no version check, so the last save can silently overwrite another operator.
- Contact, address, item, price, note, and tag changes are not included in the audit history.

### 7. J&T Excel export

1. Admin selects orders or exports all eligible orders.
2. Server validates non-empty customer/address/payment/total fields and phone format.
3. Server writes rows into the repository-owned J&T workbook template.
4. Server marks every exported order as exported, shipped, fulfilled/shipped, and out for delivery.
5. Browser downloads the generated `.xlsx` file.

**What works:** The template format is tested, phone numbers are normalized, COD amount is zero for non-COD methods, invalid records block export, and the file is generated server-side.

**Critical weaknesses:**

- Workbook generation means “prepared for upload,” not “accepted by J&T” or “physically shipped.” The current status change is premature.
- Explicit order-number export bypasses normal eligibility filtering, so already exported, shipped, delivered, or cancelled orders can be exported again.
- Multi-order status updates use separate writes. A partial failure can mark only some rows while one workbook contains all rows.
- There is no durable export-batch record containing file checksum, order list, operator, attempt status, and J&T response.
- Default package weight and parcel count are hardcoded to `1` unless undeclared order fields happen to exist.
- Address validation checks only presence, not valid J&T hierarchy or serviceability.
- No J&T tracking number/import/acceptance flow completes the lifecycle.
- The “tracking notification” action records a log entry but does not actually send SMS or email.
- `xlsx` 0.18.5 has unresolved high-severity advisories in the npm audit.

## Priority Findings

## P0: Required Before Public Production

### P0.1 Make quote and checkout pricing server-authoritative

**Evidence:**

- `apps/web/src/pages/Checkout.jsx:185-191`
- `apps/api/src/promos/promoEngine.js:22-32`
- `apps/api/src/routes/orders.js:206-224`

**Fix:**

- Accept product/variant IDs, quantities, discount code, and address identifiers from the browser.
- Load current catalog prices, shipping settings, and address hierarchy on the server.
- Derive region and fee from the validated province.
- Apply free shipping and promotions entirely on the server.
- Return a signed or server-stored quote ID with an expiry and normalized totals.
- Final checkout should consume/revalidate the quote and reject stale catalog, shipping, or promo versions.
- Remove client monetary fields from the order-creation contract except for display-only comparison metadata.

**Acceptance gate:** A request with `shippingFeeCents: 0`, a false region, stale price, or fake free-shipping flag must still produce the correct server total or fail with a specific price-change response.

### P0.2 Protect order confirmation data

**Evidence:**

- `apps/api/src/routes/orders.js:20-33`
- `apps/api/src/routes/orders.js:151-178`
- `apps/web/src/pages/ThankYou.jsx:17-25`

**Fix:**

- Return a cryptographically random confirmation token after checkout and store only its hash.
- Require the token or authenticated account ownership for confirmation retrieval.
- Return a minimal confirmation view; do not expose phone, email, full address, notes, or internal snapshots by default.
- Use opaque non-`DEMO` order numbers with adequate randomness.
- Rate-limit lookups and record repeated failures without logging PII.

**Acceptance gate:** One customer cannot retrieve another order using an order number alone.

### P0.3 Make admin order/inventory changes atomic

**Evidence:**

- `apps/api/src/routes/admin.js:648-699`
- `apps/api/src/routes/admin.js:1051-1114`
- `apps/api/src/orders/orderRepository.js:111-137`

**Fix:**

- Introduce an `adminOrderService` using one PostgreSQL transaction.
- Lock the order and affected variants.
- Calculate the inventory delta between old and new order lines.
- Validate catalog identity, SKU, price override policy, and available stock.
- Apply stock changes, save the order, append movements, and append one audit event atomically.
- Add an order version or `updated_at` precondition for optimistic concurrency.
- Make cancellation an explicit command, not an arbitrary combination of fields.

**Acceptance gate:** Any injected failure leaves order, stock, movements, and history unchanged; concurrent edits return a conflict instead of silently overwriting.

### P0.4 Separate J&T export from fulfillment and delivery

**Evidence:**

- `apps/api/src/routes/admin.js:561-600`
- `apps/api/src/jnt/jntExport.js:32-75`

**Fix:**

- Add states such as `ready_for_export`, `export_prepared`, `submitted_to_jnt`, `accepted_by_jnt`, `picked_up`, `in_transit`, `delivered`, and `delivery_failed/returned`.
- Export should create a durable batch and mark orders only as `export_prepared`.
- Mark shipped/in-transit only after a J&T acceptance/import result or explicit verified admin action.
- Enforce eligibility for both bulk and explicit selections.
- Save batch ID, checksum, order list, operator, timestamps, errors, and re-export reason.
- Add package weight and parcel count as validated operational fields.

**Acceptance gate:** Downloading a workbook alone never sets shipped or out-for-delivery.

### P0.5 Harden authentication, secrets, and abuse controls

**Evidence:**

- `apps/api/src/routes/admin.js:130-148`
- `apps/api/src/routes/admin.js:1043-1049`
- `apps/api/src/customers/customerAccountRepository.js:17-19`
- `apps/web/src/lib/adminApi.js:1-26`
- `apps/web/src/lib/customerAuth.js:3-17`
- `docker-compose.yml:16-36`

**Fix:**

- Fail production startup when known local defaults are used.
- Replace `localStorage` bearer tokens with secure, HTTP-only, same-site sessions and CSRF protection.
- Add server-side session revocation, expiration, logout-all, and admin actor identity.
- Add IP/account rate limits for login, register, order lookup, order creation, quote, cart-session, and uploads.
- Configure trusted proxy hops before using `req.ip`.
- Add password reset, email verification, and verified phone ownership before historical linking.

**Acceptance gate:** Default secrets cannot start production, stolen frontend JavaScript cannot read session credentials, and repeated abuse is throttled.

### P0.6 Remove high-severity dependency exposure

`npm audit --omit=dev` on 2026-06-28 reports:

- `multer` 2.1.1: direct high severity; upgrade to 2.2.0 or later.
- `xlsx` 0.18.5: direct high severity; npm reports no fix in the installed package line.

**Fix:**

- Upgrade `multer`, strengthen upload signature checks, and rerun upload tests.
- Replace `xlsx` with a maintained library capable of preserving the required template, or isolate a reviewed supported SheetJS build.
- Until replacement, accept no user-provided workbook and place export generation behind strict memory/time limits.
- Add production dependency scanning to CI with an explicit exception process.

## P1: Required For Reliable Daily Operations

### P1.1 Repair idempotent retry ordering

- Look up/lock the idempotency record before stock validation that can change after the first success.
- Store request hash, response payload, status, and expiry in a dedicated idempotency table.
- Reject reuse of one key with a different normalized request.
- Return the original success response for safe network retries.

### P1.2 Enforce a real order state machine

- Replace independently editable status fields with explicit commands and allowed transitions.
- Derive display statuses where possible.
- Require reasons for cancellation, refund, return, manual price override, and re-export.
- Record actor, request ID, previous values, new values, and timestamps.

### P1.3 Make promotions concurrency-safe

- Lock or conditionally claim limited-use promotions in the checkout transaction.
- Ensure `usage_count < usage_limit` in the update predicate.
- Fail the transaction when no use remains.
- Add simultaneous-checkout tests for the final available use.

### P1.4 Validate addresses and serviceability on the server

- Submit stable province/city/barangay codes, not only names.
- Validate parent-child relationships against the versioned dataset.
- Persist the dataset version and serviceability result with the order.
- Block or route non-door-to-door addresses to an explicit review queue.

### P1.5 Make prepaid methods honest and complete

- Keep GCash and bank transfer disabled until there are pending, submitted, verified, rejected, refunded, and reconciled states.
- Never set J&T COD to zero merely because the browser selected a prepaid label; require verified payment.
- Make checkout and thank-you copy use the actual payment method.
- Define proof/reference storage, fraud review, privacy, and refund behavior.

### P1.6 Secure customer ownership and account lifecycle

- Stop linking historical orders by unverified phone match.
- Add verified claim/link flow for guest orders.
- Add password reset, email verification, credential change, account deletion/export, and session management.
- Define retention for carts, customer addresses, orders, notifications, and Meta identifiers.

### P1.7 Add operational observability

- Add structured logs with request/trace IDs and PII redaction.
- Add readiness checks for PostgreSQL and required assets, separate from liveness.
- Measure checkout success/failure, oversell attempts, quote changes, promo claims, admin conflicts, export batches, and Meta outbox health.
- Alert on failed exports, failed Meta events, stock inconsistencies, and growing pending queues.
- Create backup, restore, and disaster-recovery runbooks and test restoration.

### P1.8 Strengthen database rules and migrations

- Add checks for non-negative money/counts, valid statuses, valid promotion usage, and total consistency.
- Add explicit foreign keys where lifecycle behavior is defined.
- Stop applying a growing `schema.sql` from every API replica at startup.
- Use immutable versioned migrations in one release job.
- Block JSON persistence in production.

### P1.9 Harden uploads and HTTP behavior

- Detect actual file signatures and re-encode accepted images.
- Add image dimensions, decompression limits, storage quotas, and orphan cleanup.
- Add CSP, HSTS at the HTTPS edge, content-type protection, referrer policy, frame restrictions, and permissions policy.
- Do not expose the API port publicly when Nginx is the gateway.
- Restrict hosts and forward protocol/client headers correctly.

## P2: UX, Maintainability, and Scale

### P2.1 Improve cart and checkout UX

- Cap quantities to current stock and show stock-change reconciliation.
- Make quote responses authoritative and identify changed items/fees.
- Debounce cart-session updates and prevent stale responses from overwriting newer state.
- Surface cart-sync failures only where actionable; do not block shopping.
- Prevent double-submit at both UI and API levels.
- Decide and consistently support variant-level pricing.

### P2.2 Improve admin operations

- Add server-side pagination/filtering for orders, customers, carts, and products.
- Add saved views for needs-confirmation, ready-to-pack, ready-for-J&T, export-failed, and returns.
- Add bulk actions with validation previews and partial-failure reporting.
- Provide inventory reconciliation and order-vs-movement discrepancy reports.
- Add actual notification providers and distinguish `queued`, `sent`, `delivered`, and `failed` from `recorded`.

### P2.3 Retire duplicate storefront code and large legacy assets

- Make React the only storefront.
- Remove legacy HTML/JS routes after parity validation.
- Move product/brand media to managed object storage or a deliberate asset pipeline.
- `apps/api/public` is approximately 310 MB while the current React build is under 1 MB; audit oversized and duplicate assets.

### P2.4 Improve Meta operations and privacy controls

- Confirm immediate Pixel loading is legally appropriate for every served market.
- Configure `trust proxy` so CAPI receives the intended client IP.
- Add an admin-visible outbox dashboard and requeue command with audit history.
- Monitor browser/server Purchase deduplication and event-match quality.
- Ensure existing persisted Terms content contains the current Meta disclosure.

## Recommended Target Workflow

1. **Browse:** Customer views a server-backed active product and variant.
2. **Cart:** Server issues an opaque cart ID; local cart remains responsive while a debounced versioned draft syncs.
3. **Quote:** Customer submits variant IDs, quantities, discount code, and address codes. Server returns a short-lived authoritative quote ID.
4. **Checkout:** Customer submits contact, quote ID, payment choice, and idempotency key.
5. **Order transaction:** Server verifies quote/version, locks promo and stock, saves order/movements/cart/outbox, and stores idempotent response atomically.
6. **Confirmation:** Customer receives order number plus private confirmation token; account ownership can replace the token.
7. **COD review:** Admin verifies contact/address and explicitly confirms or cancels.
8. **Packing:** Admin starts a packing action; item changes run through inventory reconciliation.
9. **J&T preparation:** Admin validates serviceability, weight, parcels, COD amount, and creates an export batch.
10. **J&T submission:** Workbook/API submission result is stored. Export does not imply shipment.
11. **Acceptance/tracking:** J&T acceptance and tracking number move the order to submitted/accepted.
12. **Pickup/transit:** Verified courier/admin event marks shipped/in transit and triggers a real customer notification.
13. **Delivery outcome:** Delivered, failed delivery, return-to-sender, cancellation, refund, and restock follow explicit state-machine commands.
14. **Reconciliation:** Daily checks compare orders, stock movements, payments, J&T batches, and notification outcomes.

## Testing Recommendations

### Current baseline

Executed during this review:

- API: 130 passed, 0 failed, 1 skipped because `TEST_POSTGRES_URL` was not set in the local run.
- Web source/unit tests: 64 passed, 0 failed.
- Pixel-enabled production web build: passed.
- Production dependency audit: failed policy expectations with two direct high-severity packages.

### Gaps to close

1. Add Playwright browser tests for visitor -> product -> cart -> checkout -> thank-you -> admin -> J&T export.
2. Run core order, inventory, promo, cancellation, and J&T integration tests against PostgreSQL in CI, not only JSON fallback.
3. Add concurrent stock, promo-limit, idempotency, and admin-edit tests.
4. Add failure injection at every transactional write boundary.
5. Add privacy tests for public confirmation and account ownership.
6. Add shipping tamper tests for fee, region, address hierarchy, and free-shipping flags.
7. Add J&T state tests proving export does not mark shipped and ineligible explicit IDs are rejected.
8. Add workbook golden-file/schema tests after replacing `xlsx`.
9. Replace source-regex frontend tests for critical behavior with executed component/browser tests.
10. Add linting, formatting, dependency scanning, production-config build, migration-from-previous-release, and backup-restore checks.

## Proposed Implementation Sequence

Each phase should be approved, implemented with tests first, deployed independently, and verified before starting the next phase.

### Phase 1: Authoritative checkout and private confirmation

- Server shipping/address calculation.
- Authoritative quote contract.
- Private order confirmation token.
- Correct idempotent retry ordering and request hash.
- Shipping/public-lookup abuse tests.

**Exit gate:** No browser monetary value is trusted and no order PII is public by order number.

### Phase 2: Atomic admin inventory workflow

- Admin order application service.
- Order row/version locking.
- Item-delta stock reconciliation.
- Atomic cancellation/reopen behavior.
- Complete audit events and explicit state machine.

**Exit gate:** Order, inventory, movement, and audit records cannot diverge under failure or concurrency.

### Phase 3: J&T export lifecycle

- Export batches and eligibility rules.
- Prepared/submitted/accepted/shipped separation.
- Package metadata.
- Tracking import/entry.
- Maintained workbook library replacement.

**Exit gate:** Export is auditable, repeat-safe, and cannot falsely mark shipment.

### Phase 4: Authentication and platform security

- Production config validation.
- Cookie sessions, CSRF, roles/actors, rate limits.
- Upload hardening and security headers.
- Verified guest-order linking and account recovery.
- Dependency audit enforcement.

**Exit gate:** Public deployment has no known default credentials, high-severity direct dependencies, or unthrottled sensitive endpoints.

### Phase 5: Operations and customer communication

- Structured logs, metrics, alerts, readiness.
- Real SMS/email provider with delivery status.
- Backup/restore and reconciliation jobs.
- Returns/NDR/refund workflow.
- Meta outbox administration.

**Exit gate:** Operations can detect, investigate, and recover failed orders, exports, notifications, and marketing events.

### Phase 6: Cleanup and scale

- Retire legacy storefront.
- Server pagination and saved views.
- Asset storage cleanup.
- Full Playwright regression suite.
- Performance and accessibility review.

## Decisions Required Before Implementation

- [ ] Confirm PostgreSQL is the only production persistence mode.
- [ ] Approve server-authoritative shipping and address codes.
- [ ] Decide whether guest confirmation uses a URL token, OTP, or both.
- [ ] Define valid order, payment, fulfillment, delivery, return, and refund transitions.
- [ ] Define when inventory is reserved, deducted, restored, and reconciled.
- [ ] Confirm whether admins may override catalog prices and stock; define required reason/approval.
- [ ] Confirm the exact J&T operational stages and whether upload remains manual or moves to an API.
- [ ] Define package weight and parcel-count ownership.
- [ ] Choose SMS/email providers and message consent rules.
- [ ] Keep GCash/bank transfer disabled until verification/reconciliation is implemented.
- [ ] Choose a maintained XLSX/template library.
- [ ] Approve production session, rate-limit, and secret-management architecture.
- [ ] Review immediate Meta Pixel tracking and privacy disclosure for served markets.
- [ ] Define cart, PII, order, audit, notification, and marketing retention periods.

## Recommendation

Do not implement all findings as one large rewrite. Approve the six phases above, then produce a separate TDD implementation plan for Phase 1. Phase 1 and Phase 2 deliver the largest reduction in financial, privacy, and inventory risk and should be completed before advertising or accepting unrestricted production orders.
