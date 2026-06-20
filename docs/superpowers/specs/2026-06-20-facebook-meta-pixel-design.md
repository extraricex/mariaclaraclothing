# Facebook Meta Pixel Integration Design

**Date:** 2026-06-20
**Status:** Approved
**Pixel ID:** `595813035761213`

## Goal

Integrate Facebook Meta Pixel into the active React storefront and track the standard ecommerce journey without tracking the admin application or allowing analytics failures to disrupt shopping and checkout.

## Scope

This design covers:

- Loading Facebook Meta Pixel on the active React storefront.
- Tracking customer-side React route changes.
- Tracking `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, and `Purchase`.
- Preventing duplicate ecommerce events where duplicate delivery would distort reporting.
- Excluding every `/admin` route.
- Automated tests and manual validation in Meta Events Manager.
- Updating the privacy/cookie disclosure.

This design does not cover:

- Meta Conversions API.
- Meta product catalog synchronization.
- Advanced matching with customer contact data.
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
7. Application behavior must remain independent of tracking success.
8. Implementation starts only after this specification is reviewed.

## Privacy Decision And Consequences

The approved behavior loads Facebook Meta Pixel immediately rather than waiting for marketing consent. This means the site can contact Meta and set/read related identifiers as soon as a customer-side page loads.

Before production launch:

- The privacy and cookie notice must explicitly disclose Facebook Meta Pixel.
- The notice must describe advertising measurement and retargeting purposes.
- The business must confirm that immediate loading is appropriate for every market served.
- The business must obtain legal/privacy review where required.
- No customer address, password, order note, or unapproved personal data may be sent as event parameters.

This specification records the requested technical behavior. It is not legal advice.

## Selected Architecture

Use a centralized React tracking module rather than pasting the provided snippet directly into `apps/web/index.html`.

The provided Facebook snippet is the initialization reference, but a centralized module is necessary because the site is a React single-page application:

- `index.html` loads only once.
- React Router changes pages without full document navigation.
- Ecommerce events occur inside React handlers after application state changes.
- Admin and customer routes share the same bundle.
- Tests need a stable API that can be exercised without loading Meta's network script.

The architecture has four units:

1. `metaPixel.js`: initialization, payload normalization, and event dispatch.
2. `MetaRouteTracker.jsx`: customer-side React `PageView` tracking.
3. Page/component integrations: ecommerce event triggers.
4. Tests: initialization, payload, exclusion, and deduplication behavior.

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

The same ID will be used by a future Conversions API event for Facebook deduplication.

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

Use `purchase:<orderNumber>` as the event ID. Store the last tracked purchase event ID in `sessionStorage` only as a browser duplicate guard. The future server event uses the same ID for Meta deduplication.

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

Advanced matching is explicitly outside this phase.

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

### Manual validation

Use Facebook Events Manager Test Events and Meta Pixel Helper.

Test sequence:

1. Open the homepage: one `PageView`.
2. Navigate to a product: one `PageView` and one `ViewContent`.
3. Add a product: one `AddToCart` with correct PHP value.
4. Enter checkout: one `InitiateCheckout`.
5. Trigger validation failure: no `Purchase`.
6. Complete a test order: one `Purchase` with the persisted total.
7. Refresh thank-you: no duplicate `Purchase`.
8. Open `/admin/login`: no Facebook script or event.
9. Navigate through admin: no Facebook event.

## Deployment

1. Implement with the enabled flag set to false by default.
2. Run unit, frontend, API, and build verification.
3. Deploy disabled to staging.
4. Enable with Pixel ID `595813035761213` during a Meta Test Events session.
5. Complete the manual event sequence.
6. Confirm the privacy/cookie notice is published.
7. Deploy production with an environment-level kill switch.
8. Verify one controlled production order.
9. Monitor event volume, values, diagnostics, and duplicates before using Purchase optimization in ads.

Rollback requires setting:

```dotenv
VITE_FACEBOOK_META_PIXEL_ENABLED=false
```

and rebuilding/redeploying the current Vite setup. A runtime configuration mechanism may be added if disabling without a rebuild is required.

## Future Conversions API Phase

The future server-side phase will:

- Keep its access token only in the Express environment/secret manager.
- Create a marketing event outbox in the order transaction.
- Send an authoritative server `Purchase` asynchronously.
- Use the same event name and `purchase:<orderNumber>` event ID.
- Apply controlled retries without delaying checkout.
- Hash and transmit matching data only after a separate privacy review.
- Record redacted delivery diagnostics.

Conversions API is not required to complete this browser Pixel phase, but the browser event ID contract must remain compatible with it.

## Expected Files

Create:

- `apps/web/.env.example`
- `apps/web/src/lib/metaPixel.js`
- `apps/web/src/components/MetaRouteTracker.jsx`
- `apps/web/test/metaPixel.test.js`

Modify:

- `apps/web/src/main.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/components/Shell.jsx`
- `apps/web/Dockerfile`
- `docker-compose.yml`
- `apps/api/src/routes/orders.js`
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
- Refreshing or revisiting thank-you does not create another Purchase.
- Tracking failures never block customer actions.
- Automated tests and Meta Test Events validation pass.
- Privacy/cookie disclosure is updated before production activation.
