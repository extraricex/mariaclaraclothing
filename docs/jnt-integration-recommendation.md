# J&T Express Philippines Integration

## Current Status

The store supports two safe J&T workflows today:

1. Export selected orders to the official J&T Excel template.
2. Preview a normalized parcel from Admin > Orders > Order detail > **Preview J&T parcel**.

The preview validates the receiver, Philippine phone number, structured address, items,
effective parcel weight, parcel count, and COD amount. It does not contact J&T or create an AWB.

Keep this setting in every environment:

```env
JNT_INTEGRATION_MODE=dry_run
```

## Why Live Booking Is Blocked

Dashboard login access is not API access. Do not store the J&T dashboard password in this
application and do not automate or scrape the dashboard. The previously reviewed public
documentation was for J&T Indonesia and its endpoints, fields, area codes, currency, and
signature scheme must not be used for Philippine shipments.

Live or sandbox modes intentionally return `503 jnt_api_unavailable` until an official J&T
Philippines specification is implemented and tested.

## Request From J&T Philippines

Contact the VIP account representative or submit a VIP inquiry and request:

- API/EDI enablement for the existing VIP account
- sandbox and production base URLs
- customer/account code
- authentication and request-signing specification
- create/cancel shipment endpoints
- AWB/waybill response fields
- tracking webhook or tracking-query endpoint
- Philippine province/city/barangay service-area codes
- COD, insurance, pickup, parcel-size, and weight rules
- rate limits, retry rules, and idempotency behavior
- sample requests and error-code reference

Do not send dashboard credentials by email or place them in `.env`.

## Activation Phases

### 1. Dry Run (implemented)

- Product parcel weight is editable in grams.
- Order weight is calculated from product weight x quantity.
- Admin can override the final parcel weight.
- Preview shows normalized receiver, items, weight, parcel count, and COD.
- Missing shipment data is shown before export.

### 2. Sandbox (after official access)

- Add the official adapter behind the existing parcel service.
- Store secrets only as server environment variables.
- Add destination-code mapping from checkout address fields.
- Persist request state, provider reference, AWB, and sanitized errors.
- Test duplicate requests, cancellation, timeout, retry, and COD cases.
- Require an explicit admin action to create a shipment.

### 3. Production

- Obtain J&T approval of sandbox payloads.
- Use a separate production credential set.
- Enable idempotency and audit logging.
- Save AWB to the order and expose tracking to the customer.
- Add scheduled tracking synchronization or signed webhooks.
- Monitor failures and reconcile created parcels against the VIP dashboard.

## Intended Server Variables

These placeholders are wired into Docker but are unused in dry-run mode:

```env
JNT_INTEGRATION_MODE=dry_run
JNT_API_BASE_URL=
JNT_API_CUSTOMER_CODE=
JNT_API_KEY=
```

The final names may change to match J&T's official authentication specification. Never switch
to `sandbox` or `live` merely by filling these values; the country-specific adapter must first
be implemented and verified.
