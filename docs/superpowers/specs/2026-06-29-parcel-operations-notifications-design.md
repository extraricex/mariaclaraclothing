# Parcel Operations and Completion Notifications Design

## Goal

Extend the admin workflow with parcel weights, one-click order selection, safe removal of
unconverted carts, delivery-completion notifications, and a J&T Philippines integration boundary
that is useful before API credentials are available.

## Scope

This release will:

- store an editable product parcel weight in grams;
- snapshot line and total parcel weight into authoritative orders;
- allow an admin to override total parcel weight before courier submission;
- add a select-all checkbox for the currently filtered order list;
- delete draft and abandoned cart sessions only after explicit confirmation;
- enqueue one transactional SMS and one email when an order first becomes delivered;
- deliver SMS through Semaphore and email through Resend with retryable outbox records;
- show notification delivery state in the admin order timeline;
- prepare, validate, and preview a J&T Philippines parcel request without using dashboard credentials;
- retain the existing J&T Excel export while official API access is pending.

This release will not scrape or automate the J&T VIP dashboard. Live shipment creation remains
disabled until J&T supplies an API endpoint, credentials, signing rules, location codes, sandbox,
and production approval for this Philippine VIP account.

## Product and Parcel Data

Each product has `parcelWeightGrams`, a positive integer edited in the admin product editor. It is
product-level rather than variant-level because the current catalog variants primarily represent
size and normally share packaging. The default for existing products is 250 grams.

An authoritative checkout line snapshots `unitWeightGrams` and `lineWeightGrams`. The persisted
order stores `parcelWeightGrams` as the sum of line weights. Admin order detail may set
`parcelWeightOverrideGrams`; courier payloads use the override when present and otherwise use the
calculated weight. The original item snapshots remain unchanged for auditability.

## Order Selection

The orders table header gains a checkbox that selects or clears every order currently returned by
the active filters. It shows an indeterminate state when only part of the filtered result is
selected. Changing filters keeps selections only for still-visible orders, preventing hidden orders
from being exported unintentionally.

## Draft and Abandoned Cart Deletion

Each draft/abandoned row gains a Delete action with a confirmation dialog. The API accepts deletion
only when the cart is unconverted and its current status is `draft` or `abandoned_checkout`.
Converted sessions, unknown sessions, and status mismatches return a conflict/not-found response.
The operation is admin-authenticated and is recorded in a server log without customer PII.

## Completion Notifications

The notification trigger is the first transition to `delivered`. It does not run on `shipped`.
Status updates remain fast: the order transaction inserts durable outbox records and a worker sends
them asynchronously.

Channels:

- SMS: Semaphore transactional message to a normalized Philippine mobile number.
- Email: Resend transactional email when the order has a valid email address.

The message confirms delivery, includes the order number, thanks the customer, and gives the store
contact path. It does not include a private confirmation token. A unique key per
`order + delivered + channel` prevents duplicate sends when an admin repeats the delivered status.
Outbox records track pending, sending, sent, retry, and permanent failure states with bounded
backoff. Provider secrets remain server-only environment variables. When a provider is disabled,
the channel is recorded as skipped rather than treated as delivered.

## J&T Philippines Boundary

The admin order detail gains a Parcel section containing calculated weight, override weight, parcel
count, COD amount, address readiness, and a `Preview J&T parcel` action. The backend builds a
provider-neutral shipment draft and validates receiver, address, phone, weight, quantity, COD, and
item description.

The J&T adapter has `disabled`, `dry_run`, `sandbox`, and `production` modes. This release enables
only `disabled` and `dry_run`. Dry-run returns a redacted request preview and saves no credentials.
Sandbox/production calls refuse to start until official API configuration is supplied.

To enable live J&T later, the business must request API integration access from its J&T Philippines
VIP account manager, including endpoint URLs, customer code, authentication/signature rules,
waybill/label endpoints, tracking/webhooks, area-code data, COD rules, and sandbox credentials.

## Failure Handling

- Invalid product weights are rejected by API and UI validation.
- Cart-session deletion is guarded by current persisted state, not the page's stale copy.
- Notification provider failures never roll back a delivered order; they remain retryable in the
  outbox and visible to admin.
- A duplicate delivered update cannot enqueue duplicate notifications.
- J&T dry-run validation returns field-level errors and never changes fulfillment status.
- No dashboard password, Semaphore key, Resend key, or future J&T secret is returned to browsers.

## Testing

- Repository and API tests cover weight normalization, snapshots, overrides, and migration shape.
- Admin source/component tests cover select-all, indeterminate state, weight controls, deletion, and
  notification/J&T panels.
- Cart-session tests cover successful deletion and converted-session rejection.
- Notification tests cover delivered-only triggering, channel idempotency, provider payloads,
  retry classification, and secret redaction.
- J&T tests cover dry-run payload validation and refusal of unconfigured live mode.
- Full API/web tests, production build, PostgreSQL integration tests, and Docker health checks run
  before completion.
