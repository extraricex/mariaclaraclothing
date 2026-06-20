# Facebook Meta Pixel And Conversions API Integration Design

**Date:** 2026-06-20
**Status:** Approved
**Pixel ID:** `595813035761213`

## Goal

Integrate Facebook Meta Pixel into the active React storefront, send authoritative server-side `Purchase` events through Meta Conversions API, and track the ecommerce journey without tracking the admin application or allowing analytics failures to disrupt shopping and checkout.

## Scope

This design covers:

- Loading Facebook Meta Pixel on the active React storefront.
- Tracking customer-side React route changes.
- Tracking `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, and `Purchase`.
- Sending persisted orders to Meta Conversions API as server-side `Purchase` events.
- Deduplicating browser and server `Purchase` events.
- Secure access-token configuration, durable outbox delivery, retries, and diagnostics.
- Preventing duplicate ecommerce events where duplicate delivery would distort reporting.
- Excluding every `/admin` route.
- Automated tests and manual validation in Meta Events Manager.
- Updating the privacy/cookie disclosure.

This design does not cover:

- Meta product catalog synchronization.
- Browser-side advanced matching.
- Server-side Meta events other than `Purchase`.
- Google Tag Manager.
- A general-purpose analytics platform.
- A consent-management interface.

## Confirmed Product Decisions

1. The integration is specifically Facebook Meta Pixel.
2. The Pixel ID is `595813035761213`.
3. Pixel code loads immediately for every customer-side visitor.
4. Prior marketing consent is not required by the requested behavior.
5. Admin routes must never initialize the Pixel or send events.
6. The full standard ecommerce event set is required.
7. Meta Conversions API sends server-side `Purchase` only in the first release.
8. Browser and server `Purchase` use the same event ID for deduplication.
9. Application behavior must remain independent of tracking success.
10. Implementation starts only after this specification is reviewed.

## Privacy Decision And Consequences

The approved behavior loads Facebook Meta Pixel immediately rather than waiting for marketing consent. This means the site can contact Meta and set/read related identifiers as soon as a customer-side page loads.

Before production launch:

- The privacy and cookie notice must explicitly disclose Facebook Meta Pixel.
- The notice must describe advertising measurement and retargeting purposes.
- The business must confirm that immediate loading is appropriate for every market served.
- The business must obtain legal/privacy review where required.
- No customer address, password, order note, or unapproved personal data may be sent as event parameters.
- Server-side email and phone matching values may be sent only after normalization and SHA-256 hashing.
- Meta browser identifiers, client IP, and user agent may be sent server-side only after the privacy notice and retention policy explicitly cover them.

This specification records the requested technical behavior. It is not legal advice.

## Selected Architecture

Use a centralized React tracking module rather than pasting the provided snippet directly into `apps/web/index.html`.

The provided Facebook snippet is the initialization reference, but a centralized module is necessary because the site is a React single-page application:

- `index.html` loads only once.
- React Router changes pages without full document navigation.
- Ecommerce events occur inside React handlers after application state changes.
- Admin and customer routes share the same bundle.
- Tests need a stable API that can be exercised without loading Meta's network script.

The architecture has eight units:

1. `metaPixel.js`: initialization, payload normalization, and event dispatch.
2. `MetaRouteTracker.jsx`: customer-side React `PageView` tracking.
3. Page/component integrations: ecommerce event triggers.
4. Tests: initialization, payload, exclusion, and deduplication behavior.
5. `metaConversionsApi.js`: server payload normalization, hashing, and Graph API delivery.
6. `marketingEventOutboxRepository.js`: durable event queue and retry state.
7. `metaConversionsWorker.js`: asynchronous delivery that cannot block checkout.
8. A versioned database migration for outbox persistence and uniqueness.

## Configuration

The Pixel ID is public browser configuration, not a secret. It must still be environment-driven so staging and production can be controlled independently.

Frontend variables:

```dotenv
VITE_FACEBOOK_META_PIXEL_ENABLED=true
VITE_FACEBOOK_META_PIXEL_ID=595813035761213
```

Rules:

- Local tests default to disabled unless explicitly configured.
- Production enables the Pixel with ID `595813035761213`.
- Staging should use the production Pixel only during an intentional Test Events session; a dedicated test Pixel is preferable.
- A Conversions API access token must never use a `VITE_` variable or appear in browser code.
- The tracking module treats a missing, blank, or placeholder ID as disabled.

Because Vite variables are build-time values, the Docker web build must receive these values as build arguments or use one documented runtime configuration mechanism.

Server-only variables:

```dotenv
META_CONVERSIONS_API_ENABLED=false
META_PIXEL_ID=595813035761213
META_CONVERSIONS_API_ACCESS_TOKEN=
META_GRAPH_API_VERSION=
META_CONVERSIONS_API_TEST_EVENT_CODE=
```

Server configuration rules:

- The access token is a secret and must exist only in the API environment or secret manager.
- The access token must never use a `VITE_` prefix, appear in browser code, be committed, or be returned by an API.
- `META_PIXEL_ID` must equal the browser Pixel ID so events enter the same Dataset.
- `META_GRAPH_API_VERSION` must be explicitly set to the supported version verified during implementation; do not silently rely on Meta's default.
- `META_CONVERSIONS_API_TEST_EVENT_CODE` is staging-only and must be blank in normal production delivery.
- Startup must fail when Conversions API is enabled without PostgreSQL, a Pixel ID, an access token, or a Graph API version.
- Browser Pixel and Conversions API require separate enabled flags and kill switches.

## Meta Conversions API Account Setup

The business owner performs these steps in the current Meta Events Manager interface:

1. Sign in to the business-owned Meta account.
2. Open Events Manager and select the Dataset containing Pixel `595813035761213`.
3. Confirm the Dataset is connected to the correct Business Portfolio and ad account.
4. Open the Dataset settings and locate Conversions API setup.
5. Choose manual setup rather than a partner integration because this project uses a custom Express API.
6. Generate an access token for the Dataset.
7. Place the token directly into the production/staging secret manager as `META_CONVERSIONS_API_ACCESS_TOKEN`.
8. Never place the token in Git, a Markdown file, Vite configuration, Docker image layer, issue tracker, screenshot, or chat message.
9. In **Test Events**, obtain the current test event code for staging validation and store it temporarily as `META_CONVERSIONS_API_TEST_EVENT_CODE`.
10. Record the currently supported Graph API version as `META_GRAPH_API_VERSION` after checking Meta's official documentation.
11. After staging validation, remove the test event code and verify normal server events appear in the Dataset overview.
12. Review Event Match Quality, deduplication status, rejected parameters, and diagnostics before optimizing ads for `Purchase`.

Token rotation procedure:

1. Generate or authorize the replacement token in Meta.
2. Update the secret manager without changing frontend configuration.
3. Restart only the API/worker deployment.
4. Send one staging/test event and confirm acceptance.
5. Revoke the old token after the replacement is verified.
6. Record the rotation date and owner without recording either token value.

Official Meta screens and Graph API versions can change. The implementation plan must verify the current official setup flow immediately before coding and again before production activation.

## Initialization

`apps/web/src/lib/metaPixel.js` will adapt the supplied Facebook Meta Pixel loader:

```js
!function(f,b,e,v,n,t,s) {
  if (f.fbq) return;
  n = f.fbq = function() {
    n.callMethod
      ? n.callMethod.apply(n, arguments)
      : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  t = b.createElement(e);
  t.async = true;
  t.src = v;
  s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
```

After installing the loader:

```js
window.fbq('init', '595813035761213');
```

Initialization requirements:

- Initialize at most once per document load.
- Return without action on any path beginning with `/admin`.
- Return without action when disabled or unconfigured.
- Load Meta's external script asynchronously.
- Queue calls through the standard `fbq` loader until the script is ready.
- Never throw an error into React render, cart, or checkout flows.
- Do not log event payloads in production.

The provided `<noscript>` image is not useful for most React SPA behavior and cannot represent ecommerce interactions. It may be included only for the initial customer `PageView`, but it must never be present on admin pages. The preferred implementation omits it unless a server-rendered customer-only document is introduced.

## Tracking Module Interface

The module exposes:

```js
initializeFacebookMetaPixel()
trackFacebookPageView(path)
trackFacebookViewContent(product)
trackFacebookAddToCart(item)
trackFacebookInitiateCheckout(items, totals, eventId)
trackFacebookPurchase(order, items, eventId)
```

Pure payload builders should be exported separately or tested through public functions:

```js
facebookContentId(item)
facebookMoneyValue(cents)
facebookContents(items)
```

All event functions are no-ops when the current path begins with `/admin` or tracking is disabled.

## Identifier Contract

Use one stable identifier rule across events:

1. `externalPosVariantId`, when populated.
2. `variantId` or variant `id`.
3. `externalPosProductId`.
4. Product `id`.
5. Product `slug` only as a last fallback.

`AddToCart`, `InitiateCheckout`, and `Purchase` should use variant-level identifiers. `ViewContent` may use the product identifier if the future Meta catalog is product-level, but this choice must remain consistent with catalog setup.

The implementation must not send an empty string in `content_ids` or `contents[].id`.

## Money Contract

Application money values are integer cents. Facebook Meta Pixel expects decimal currency values.

Examples:

```text
79900 cents -> 799.00 PHP
171800 cents -> 1718.00 PHP
```

Conversion:

```js
Number((Number(cents || 0) / 100).toFixed(2))
```

Every commerce event uses:

```js
currency: 'PHP'
```

## Event Design

### `PageView`

Trigger:

- Once after Facebook Meta Pixel initializes on the first customer route.
- Once for each meaningful customer-side React route change.

Do not trigger:

- On `/admin` or any nested admin route.
- Twice for the same `pathname + search` combination.
- Merely because React Strict Mode re-runs an effect in development.

`MetaRouteTracker.jsx` uses `useLocation()` and stores the last tracked path in a ref.

### `ViewContent`

Trigger:

- After a product API response has been loaded and the product is displayed in `apps/web/src/pages/Product.jsx`.

Do not trigger:

- While loading.
- On product fetch failure.
- For recommendation cards that were never opened.
- More than once for the same product during the same route view.

Payload:

```js
{
  content_ids: [productId],
  content_name: product.name,
  content_type: 'product',
  currency: 'PHP',
  value: product.priceCents / 100
}
```

### `AddToCart`

Trigger:

- Immediately after `addToCart()` successfully updates local cart state.

Current trigger locations:

- Product page `handleAdd()`.
- Cart page `addUpsell()`.
- Any future quick-add control.

Payload:

```js
{
  content_ids: [variantId],
  content_name: item.productName,
  content_type: 'product',
  contents: [
    {
      id: variantId,
      quantity: item.quantity,
      item_price: item.unitPriceCents / 100
    }
  ],
  currency: 'PHP',
  value: item.unitPriceCents * item.quantity / 100
}
```

One explicit customer action produces one event, even when adding to an existing cart line.

### `InitiateCheckout`

Trigger:

- When a customer intentionally navigates to checkout with a non-empty cart.

Primary trigger locations:

- Checkout link in `apps/web/src/pages/Cart.jsx`.
- Checkout link in the cart drawer in `apps/web/src/components/Shell.jsx`.

Fallback:

- First non-empty render of `apps/web/src/pages/Checkout.jsx`, deduplicated by cart session/event ID.

Payload:

```js
{
  content_ids: [...variantIds],
  content_type: 'product',
  contents: [...normalizedItems],
  currency: 'PHP',
  num_items: totalQuantity,
  value: currentQuotedTotalCents / 100
}
```

If the final shipping fee is not known, the event uses the current server quote and does not invent a fee.

### `Purchase`

Trigger:

- Only after `POST /api/orders` returns a successful persisted order response.

Primary trigger location:

- `apps/web/src/pages/Checkout.jsx`, after `createOrder()` resolves and before cart state is cleared.

Do not trigger:

- On validation failure.
- On quote failure.
- On order API failure.
- Merely because `/thank-you` is loaded or refreshed.
- More than once for the same order.

Payload:

```js
{
  content_ids: [...variantIds],
  content_type: 'product',
  contents: [...normalizedItems],
  currency: 'PHP',
  num_items: totalQuantity,
  order_id: order.orderNumber,
  value: order.totalCents / 100
}
```

Event call:

```js
window.fbq('track', 'Purchase', payload, {
  eventID: `purchase:${order.orderNumber}`
});
```

The Express order response must include authoritative `totalCents` and normalized purchased items. The browser must not use only its pre-submit totals for `Purchase`.

The event ID format is fixed:

```text
purchase:<orderNumber>
```

The server-side Conversions API event uses the same ID for Facebook deduplication.

## React Route Integration

`MetaRouteTracker.jsx` will be mounted inside `BrowserRouter` in `apps/web/src/main.jsx`.

Routing rules:

- Customer routes initialize and track.
- `/checkout` tracks even though it is outside the normal `Shell` route.
- `/admin/login` does not track.
- `/admin` and all nested routes do not track.
- Unknown customer routes that render the customer shell may send `PageView`.

The route tracker owns `PageView`. Individual pages must not also send general page views.

## Admin Exclusion

Admin exclusion is defense in depth:

1. The route tracker skips `/admin` paths.
2. The tracking module rejects all event calls when `window.location.pathname` starts with `/admin`.
3. Tests cover `/admin`, `/admin/login`, and a nested route.
4. Manual network inspection confirms no request to `connect.facebook.net` after direct admin navigation.

## Failure Handling

Facebook tracking is non-critical telemetry.

- Meta script load failure does not show a customer-facing error.
- Missing `fbq` makes event functions return safely.
- Invalid event data causes the event to be skipped, not checkout to fail.
- Event calls are never awaited by cart or order operations.
- No retry loop runs in the browser.
- Production logs do not contain customer event payloads.

An order is successful based only on the Maria Clara API and database, never on Facebook availability.

## Duplicate Prevention

### Page views

Deduplicate by the last tracked `pathname + search` in the route tracker.

### View content

Deduplicate by route view and product ID.

### Initiate checkout

Generate or derive one event ID for the current cart session and checkout entry. Both cart and checkout fallback paths must share the guard.

### Purchase

Use `purchase:<orderNumber>` as the event ID. Store the last tracked purchase event ID in `sessionStorage` only as a browser duplicate guard. The server event uses the same ID for Meta deduplication.

Browser storage is not the authoritative record. The persisted order number is authoritative.

## Data Privacy Boundaries

Allowed event data:

- Product and variant identifiers.
- Product name.
- Quantity.
- Price and total.
- Currency.
- Order number as `order_id` and event ID.
- Current event source URL as handled by Pixel.

Not allowed in custom browser event parameters:

- Passwords or authentication tokens.
- Full name.
- Phone number.
- Email address.
- House address, barangay, city, province, or postal code.
- Order notes.
- Payment instructions or references.
- Admin data.

Browser-side advanced matching is explicitly outside this phase. The server-side event may use normalized, SHA-256-hashed email and phone values solely for Meta event matching after the required privacy review.

## Testing Strategy

### Unit tests

Test pure payload builders for:

- Cent-to-PHP conversion.
- Identifier priority.
- Empty identifier filtering.
- Quantity totals.
- `contents` normalization.
- Purchase event ID generation.

### Integration-style frontend tests

Test:

- Enabled and configured initialization.
- Missing configuration remains disabled.
- Initialization happens once.
- Admin paths do not inject the script.
- Customer route changes send one `PageView` each.
- React Strict Mode behavior does not produce duplicate route events.
- Product load sends `ViewContent`.
- Successful add sends `AddToCart`.
- Checkout entry sends `InitiateCheckout`.
- Failed order creation sends no `Purchase`.
- Successful order creation sends one `Purchase` with the server total.
- Thank-you refresh sends no duplicate Purchase.
- Tracking errors do not break the originating action.

Do not use only source-text regular-expression tests. Execute payload and behavior code.

### API tests

Test that successful order creation returns:

- `orderNumber`.
- Authoritative `totalCents`.
- Currency `PHP` or a stable server-side currency contract.
- Normalized purchased item IDs, quantities, and unit prices.

Test Conversions API behavior:

- Disabled configuration creates no outbox event.
- Enabled configuration rejects missing PostgreSQL, Pixel ID, token, or Graph API version at startup.
- Successful order transaction creates exactly one `Purchase` outbox row.
- Failed order transaction creates no outbox row.
- Duplicate checkout/idempotency handling creates no second event ID.
- Browser and server payloads use the same `purchase:<orderNumber>` event ID.
- Email and phone normalization produces expected SHA-256 values.
- Invalid/empty matching fields are omitted.
- `_fbp`, `_fbc`, user agent, IP, and source URL are validated and mapped correctly.
- Money, contents, currency, and order ID come from the persisted order.
- Access tokens never appear in payloads, logs, or returned errors.
- A 2xx accepted response marks the event `sent`.
- Timeout, 429, and 5xx responses schedule a retry.
- Permanent 4xx failures become `failed`.
- Retry backoff is bounded and deterministic under a test clock/random source.
- Concurrent workers cannot claim the same row.
- Stale claims recover after the lock timeout.
- Graceful shutdown stops new claims and releases or finishes active work.

### Manual validation

Use Facebook Events Manager Test Events and Meta Pixel Helper.

Test sequence:

1. Open the homepage: one `PageView`.
2. Navigate to a product: one `PageView` and one `ViewContent`.
3. Add a product: one `AddToCart` with correct PHP value.
4. Enter checkout: one `InitiateCheckout`.
5. Trigger validation failure: no `Purchase`.
6. Complete a test order: one `Purchase` with the persisted total.
7. Confirm one browser event and one server event share the event ID and are deduplicated by Meta.
8. Confirm the server event uses hashed matching fields and reports acceptable Event Match Quality.
9. Refresh thank-you: no duplicate `Purchase`.
10. Open `/admin/login`: no Facebook script or event.
11. Navigate through admin: no Facebook event.
12. Remove the staging test event code before normal production delivery.

## Deployment

1. Implement browser Pixel and Conversions API with both enabled flags set to false by default.
2. Run unit, frontend, API, and build verification.
3. Run PostgreSQL migration, transaction, outbox, concurrency, and worker tests.
4. Deploy both channels disabled to staging.
5. Enable with Pixel ID `595813035761213`, the staging access token, and a temporary Test Events code.
6. Complete the browser and server manual event sequence.
7. Confirm the privacy/cookie notice is published.
8. Remove the test event code.
9. Deploy production with independent browser and server kill switches.
10. Verify one controlled production order, including deduplication.
11. Monitor browser volume, outbox health, server acceptance, values, diagnostics, and duplicates before using Purchase optimization in ads.

Rollback requires setting:

```dotenv
VITE_FACEBOOK_META_PIXEL_ENABLED=false
META_CONVERSIONS_API_ENABLED=false
```

Disabling the Vite flag requires rebuilding/redeploying the current frontend setup. The server flag disables new outbox creation and delivery according to the documented incident procedure. Existing pending events must remain queued until an operator explicitly resumes or expires them; disabling must not silently discard data.

## Conversions API Event Design

### Server `Purchase` payload

The API builds the event only from the persisted, server-normalized order and trusted request metadata:

```json
{
  "event_name": "Purchase",
  "event_time": 1781930000,
  "event_id": "purchase:MCC-ORDER-NUMBER",
  "action_source": "website",
  "event_source_url": "https://example.com/checkout",
  "user_data": {
    "em": ["sha256-normalized-email"],
    "ph": ["sha256-normalized-phone"],
    "client_ip_address": "request-ip",
    "client_user_agent": "request-user-agent",
    "fbp": "_fbp-cookie-value",
    "fbc": "_fbc-cookie-value"
  },
  "custom_data": {
    "currency": "PHP",
    "value": 1718.00,
    "order_id": "MCC-ORDER-NUMBER",
    "content_type": "product",
    "content_ids": ["VARIANT-ID"],
    "contents": [
      {
        "id": "VARIANT-ID",
        "quantity": 2,
        "item_price": 799.00
      }
    ]
  }
}
```

Rules:

- `event_time` is Unix time in seconds from the successful order transaction.
- `event_id` is exactly the browser event ID.
- `action_source` is `website`.
- `value`, contents, and IDs come from the persisted order.
- Empty optional matching values are omitted rather than sent as blanks.
- The access token is added only to the outbound Graph API request, never stored in the event payload.
- `test_event_code` is added only when the staging variable is present.

### Matching-data normalization

Email:

1. Convert to string.
2. Trim surrounding whitespace.
3. Convert to lowercase.
4. Reject an empty or invalid result.
5. SHA-256 hash to lowercase hexadecimal.

Philippine phone:

1. Reuse the project's Philippine phone normalization.
2. Convert to country-code digits, such as `639171234567`.
3. Remove punctuation and whitespace.
4. Reject an invalid result.
5. SHA-256 hash to lowercase hexadecimal.

Do not hash `_fbp`, `_fbc`, client IP, or user agent. Do not send full name or address in this release.

### Request metadata

At checkout, capture only the permitted values required for event matching:

- `_fbp` from the request cookie when present.
- `_fbc` from the request cookie when present.
- If no `_fbc` cookie exists and a valid `fbclid` was recorded, construct it using Meta's documented format verified during implementation.
- Client IP from Express only after trusted-proxy configuration is correct.
- Client user agent from the checkout request.
- The customer-facing checkout/source URL, never an admin URL.

The browser must not send an arbitrary claimed client IP. Cookie and source metadata must be length-limited and validated before storage.

### Graph API request

`apps/api/src/marketing/metaConversionsApi.js` sends:

```text
POST https://graph.facebook.com/<META_GRAPH_API_VERSION>/<META_PIXEL_ID>/events
```

Request body:

```json
{
  "data": ["<normalized server event>"],
  "access_token": "<server secret>",
  "test_event_code": "<staging only>"
}
```

Requirements:

- Use the Node runtime's HTTP client with an abort timeout.
- Treat 2xx plus an accepted Meta response as success.
- Record `events_received`, response messages, and `fbtrace_id` when returned.
- Redact the access token and matching data from errors and logs.
- Classify timeouts, 429, and 5xx responses as retryable.
- Classify malformed/unauthorized 4xx responses as configuration or permanent failures requiring operator action.
- Never retry synchronously inside checkout.

## Durable Marketing Event Outbox

Conversions API requires PostgreSQL in production. JSON fallback remains suitable for disabled/local tests but must not claim durable delivery.

The checkout transaction must insert the order, deduct stock, create inventory movements, update promo usage/cart conversion, and insert the marketing outbox row atomically. If the order rolls back, no Purchase event may remain queued.

Required schema:

```sql
CREATE TABLE marketing_event_outbox (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'meta'),
  event_name text NOT NULL CHECK (event_name = 'Purchase'),
  event_id text NOT NULL UNIQUE,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_trace_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_event_outbox_pending_idx
  ON marketing_event_outbox(status, next_attempt_at, created_at);
```

Outbox rules:

- `event_id` uniqueness prevents duplicate queue entries for the same order.
- Payload contains normalized event data and already-hashed contact values, not raw email or phone duplicates.
- Access tokens are never stored in the outbox.
- Workers claim rows with a transaction and `FOR UPDATE SKIP LOCKED` or an equivalent atomic claim.
- A `sending` row with `locked_at` older than five minutes returns to `pending` before the next claim cycle.
- Success stores `sent_at` and the provider trace ID.
- Error text is redacted and length-limited.

## Conversions API Worker

`apps/api/src/marketing/metaConversionsWorker.js` owns asynchronous delivery.

Lifecycle:

1. Start after API configuration and database readiness checks pass.
2. Poll every 10 seconds and claim at most 10 due `pending` rows per cycle.
3. Claim each row atomically.
4. Send it through `metaConversionsApi.js`.
5. Mark accepted rows `sent`.
6. Return retryable failures to `pending` with exponential backoff and jitter.
7. Mark permanent failures or exhausted retries `failed`.
8. Stop polling on `SIGTERM`, finish or release active claims, and close cleanly.

Initial retry policy:

- Maximum 8 attempts.
- After attempts 1 through 7 fail, schedule delays of 1, 2, 4, 8, 16, 32, and 64 minutes respectively.
- Add zero to 15 percent positive jitter to each delay to avoid synchronized retries.
- Use a five-second outbound HTTP timeout.
- Mark the row `failed` after attempt 8; the nominal retry window is 127 minutes plus bounded jitter and request time.
- Operators can inspect and manually retry a failed event without changing its event ID.

Only one successful delivery is required. Meta deduplication handles browser/server overlap, while outbox uniqueness and status prevent repeated server delivery.

## Conversions API Operations

Provide operational visibility without exposing personal data:

- Pending, sent, retrying, and failed counts.
- Oldest pending event age.
- Delivery latency.
- Provider rejection and timeout counts.
- Alert when failed events or oldest-pending age cross thresholds.
- Admin retry action only after admin audit logging exists, or a controlled CLI initially.

Retention:

- Clear `payload` matching fields immediately after successful delivery while retaining non-personal event diagnostics.
- Delete sent diagnostic rows after 30 days.
- Retain failed rows for 30 days for investigation, then delete them unless a documented incident hold applies.
- Never surface hashed matching values in the admin UI.
- Document deletion behavior when an order or customer is removed.

## Expected Files

Create:

- `apps/web/.env.example`
- `apps/web/src/lib/metaPixel.js`
- `apps/web/src/components/MetaRouteTracker.jsx`
- `apps/web/test/metaPixel.test.js`
- `apps/api/src/marketing/metaConversionsApi.js`
- `apps/api/src/marketing/metaConversionsWorker.js`
- `apps/api/src/marketing/marketingEventOutboxRepository.js`
- `apps/api/test/metaConversionsApi.test.js`
- A versioned PostgreSQL migration for `marketing_event_outbox`

Modify:

- `apps/web/src/main.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/components/Shell.jsx`
- `apps/web/Dockerfile`
- `docker-compose.yml`
- `apps/api/src/routes/orders.js`
- `apps/api/src/server.js`
- `apps/api/src/config/env.js`
- `apps/api/src/db/postgres.js` or transaction-aware repository interfaces
- API order tests
- Privacy/cookie content
- `.github/workflows/ci.yml` if a new frontend test command is added

Do not activate or extend:

- `apps/api/public/js/meta-pixel.js`
- `apps/api/public/js/meta-pixel-config.js`

Those files belong to the legacy storefront and must not become a second active implementation.

## Acceptance Criteria

- Facebook Meta Pixel ID `595813035761213` initializes once on customer pages.
- Pixel loads immediately without a consent gate, as explicitly approved.
- No admin route initializes Pixel or sends events.
- React route navigation sends correct, deduplicated `PageView` events.
- Product display sends `ViewContent`.
- Successful cart additions send `AddToCart`.
- Checkout entry sends `InitiateCheckout`.
- Only successful order persistence sends `Purchase`.
- Purchase uses authoritative server totals and `purchase:<orderNumber>` as `eventID`.
- Successful persisted orders atomically create one server `Purchase` outbox event.
- Conversions API sends only server-side `Purchase` in the first release.
- Browser and server Purchase share the same name and event ID and appear deduplicated in Meta.
- Server email and phone matching values are normalized and SHA-256 hashed.
- Access tokens remain server-only and are redacted from diagnostics.
- Meta outages never delay or fail checkout.
- Retryable delivery failures use durable bounded retries; permanent failures are operationally visible.
- PostgreSQL concurrency tests prove two workers cannot send the same claimed row simultaneously.
- Browser and Conversions API channels have independent production kill switches.
- Refreshing or revisiting thank-you does not create another Purchase.
- Tracking failures never block customer actions.
- Automated tests and Meta Test Events validation pass.
- Privacy/cookie disclosure is updated before production activation.
