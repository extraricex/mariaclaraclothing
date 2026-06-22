# Meta Pixel Integration Guide

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` while implementing this guide. Use `superpowers:verification-before-completion` before enabling the Pixel in production.

**Goal:** Add consent-aware Meta Pixel browser tracking to the active React storefront, validate ecommerce events, and prepare a secure path to Meta Conversions API without tracking admin activity.

**Architecture:** The React application owns browser events through one tracking module. The module loads Meta's script only after marketing consent, standardizes event payloads, and prevents accidental tracking on admin routes. A later server-side Conversions API phase sends authoritative `Purchase` events from the Express checkout flow and deduplicates them against browser events with the same event ID.

**Tech stack:** React 18, React Router, Vite, Express, Meta Pixel, optional Meta Conversions API.

---

## Current Project Status

The website is **not yet ready to run Meta ads against the active storefront**.

Current state:

- The old static storefront under `apps/api/public/` contains a Pixel wrapper.
- The active customer website is the React app under `apps/web/src/`.
- The React app does not load Meta Pixel or send Meta events.
- The old Pixel ID file is blank: `apps/api/public/js/meta-pixel-config.js`.
- There is no marketing-consent control in the React app.
- There is no Conversions API integration or browser/server deduplication.
- Admin routes and customer routes are in the same React bundle, so tracking must explicitly exclude `/admin`.

Do not put a Pixel ID into the legacy file and assume the active website is tracked. The implementation must be added to `apps/web`.

## Decisions Required Before Coding

Record these decisions in the deployment ticket:

- [ ] The production website domain is final and verified in Meta Business Manager.
- [ ] The business owns or has access to the correct Meta Business Portfolio and ad account.
- [ ] A web Dataset/Pixel has been created for Maria Clara Clothing.
- [ ] The Pixel ID is available. A Pixel ID is public configuration, not a secret.
- [ ] The team has decided which regions require opt-in consent before marketing tracking.
- [ ] Privacy and cookie notices have been reviewed for the actual markets served.
- [ ] The business has decided whether browser Pixel only is acceptable for launch or whether Conversions API is required.
- [ ] Product identifiers sent to Meta are stable and match the identifiers intended for any future Meta catalog.

This document is technical guidance, not legal advice. Obtain privacy/legal review for consent, retention, and disclosure requirements in the markets where the site operates.

## Recommended Event Contract

Use standard Meta event names and send amounts as Philippine peso decimal values, not integer cent values.

| Event | Trigger | Required project data | Deduplication |
| --- | --- | --- | --- |
| `PageView` | Each customer-side React route change after consent | Current URL | Dedupe same route render in development |
| `ViewContent` | Product API response is loaded and displayed | Product ID, name, price, currency | Once per product route view |
| `AddToCart` | `addToCart()` succeeds from product, upsell, or future quick-add | Variant ID, product name, quantity, price | One event per user action |
| `InitiateCheckout` | Customer intentionally enters checkout with a non-empty cart | Cart item IDs, quantities, total | Once per checkout navigation/session |
| `Purchase` | API confirms order creation | Order number, authoritative total, purchased items | Browser and server use the same `event_id` |

Recommended parameters:

```js
{
  content_ids: ['VARIANT-ID'],
  content_name: 'Product name',
  content_type: 'product',
  contents: [
    { id: 'VARIANT-ID', quantity: 1, item_price: 799.00 }
  ],
  currency: 'PHP',
  value: 799.00
}
```

Identifier rule:

1. Prefer `externalPosVariantId` when it is stable and will match a Meta catalog.
2. Otherwise use the internal `variantId`.
3. Use the same identifier rule for every event.
4. Do not switch between product IDs and variant IDs across events without a documented catalog reason.

Never send address lines, order notes, passwords, payment instructions, or arbitrary form fields as Pixel parameters.

## Phase 1: Create The Meta Asset

### Step 1: Create or select the Meta web Dataset/Pixel

1. Sign in to Meta Business Manager using the business-owned account.
2. Open Events Manager.
3. Create or select the web data source for Maria Clara Clothing.
4. Choose the website/browser integration.
5. Record the numeric Pixel ID in the deployment secret/configuration manager.
6. Give only required team members access.
7. Connect the correct ad account.
8. Add and verify the production domain using the method Meta currently offers.

Do not paste a Conversions API access token into chat, source control, Vite variables, browser code, or screenshots. A Conversions API token is a server secret.

### Step 2: Configure Test Events

1. Open the Dataset/Pixel in Events Manager.
2. Open **Test Events**.
3. Keep the test view open during staging validation.
4. Install the Meta Pixel Helper browser extension for a second view of browser events.
5. Use a staging/test Pixel when possible so development traffic does not pollute production reporting.

## Phase 2: Add Public Frontend Configuration

### Step 1: Add Vite environment examples

**Modify:** `apps/web/.env.example` or create it if absent.

```dotenv
VITE_META_PIXEL_ENABLED=false
VITE_META_PIXEL_ID=
```

Rules:

- `VITE_META_PIXEL_ID` is compiled into browser code and is therefore public.
- Never use a `VITE_` variable for an API access token or secret.
- Local development defaults to disabled.
- Staging should use a test Pixel or remain disabled unless a test session is planned.
- Production should be enabled only after consent and QA are complete.

### Step 2: Make the Docker build deterministic

Vite environment variables are build-time values. Update the web Docker build or implement a runtime config file.

Simple build-time option:

**Modify:** `apps/web/Dockerfile`

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

ARG VITE_META_PIXEL_ENABLED=false
ARG VITE_META_PIXEL_ID=
ENV VITE_META_PIXEL_ENABLED=$VITE_META_PIXEL_ENABLED
ENV VITE_META_PIXEL_ID=$VITE_META_PIXEL_ID

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build
```

This matches the current `./apps/web` Docker build context. Separately, the project should add a web-local lockfile or change the Docker context to the monorepo root so the build can use the root workspace lockfile with `npm ci`.

**Modify:** `docker-compose.yml`

```yaml
web:
  build:
    context: ./apps/web
    args:
      VITE_META_PIXEL_ENABLED: ${VITE_META_PIXEL_ENABLED:-false}
      VITE_META_PIXEL_ID: ${VITE_META_PIXEL_ID:-}
```

For deployments that must change the Pixel ID without rebuilding, use a generated `/config.js` runtime configuration instead. Pick one configuration method and test it; do not support two competing sources.

### Step 3: Add startup validation

The browser tracking module must stay disabled when:

- The enabled flag is not exactly `true`.
- The Pixel ID is empty.
- The Pixel ID is a placeholder.
- The current route starts with `/admin`.
- Marketing consent is absent or denied.

Log a development-only diagnostic when tracking is disabled. Do not log customer event payloads in production.

## Phase 3: Add Consent Management First

Meta code should not load before the consent policy permits it.

### Step 1: Define consent categories

Use at least:

- `necessary`: required for cart, checkout, authentication, and security.
- `analytics`: optional first-party analytics, if added.
- `marketing`: Meta Pixel, advertising measurement, and retargeting.

Meta Pixel belongs to `marketing`.

### Step 2: Create the consent store

**Create:** `apps/web/src/lib/consent.js`

Recommended interface:

```js
const CONSENT_KEY = 'maria-clara-consent-v1';
const CONSENT_EVENT = 'maria-clara-consent-changed';

export function getConsent() {
  try {
    const value = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch (_error) {
    return null;
  }
}

export function hasMarketingConsent() {
  return getConsent()?.marketing === true;
}

export function saveConsent(consent) {
  const record = {
    necessary: true,
    analytics: Boolean(consent.analytics),
    marketing: Boolean(consent.marketing),
    decidedAt: new Date().toISOString(),
    policyVersion: '2026-06-20'
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: record }));
  return record;
}

export { CONSENT_EVENT };
```

### Step 3: Build the consent banner and settings dialog

**Create:** `apps/web/src/components/ConsentBanner.jsx`

**Create:** `apps/web/src/components/ConsentSettings.jsx`

Required behavior:

- Show **Accept all**, **Reject optional**, and **Manage preferences** with equal clarity.
- Do not preselect marketing consent.
- Keep necessary storage enabled.
- Allow the customer to change or withdraw consent later from a footer link.
- On withdrawal, stop sending new events and remove Meta cookies where technically possible.
- Persist the policy version and decision timestamp.
- Ensure keyboard access, focus management, labels, and readable contrast.

### Step 4: Update privacy and cookie information

Update the website privacy/cookie content to explain:

- What Meta Pixel does.
- Which events are sent.
- The categories of data involved.
- Why the business processes the data.
- How long consent preferences are retained.
- How customers can withdraw consent.
- Links to the applicable Meta privacy information.

Do this before enabling production tracking.

## Phase 4: Implement One React Tracking Module

### Step 1: Create the Pixel module

**Create:** `apps/web/src/lib/metaPixel.js`

The module should expose this interface:

```js
export function initializeMetaPixel() {}
export function disableMetaPixel() {}
export function trackPageView(path) {}
export function trackViewContent(product) {}
export function trackAddToCart(item) {}
export function trackInitiateCheckout(items, totals) {}
export function trackPurchase(order, items, eventId) {}
```

Implementation requirements:

1. Return immediately when disabled, unconfigured, on `/admin`, or without marketing consent.
2. Load `https://connect.facebook.net/en_US/fbevents.js` once.
3. Initialize `fbq` once per page load.
4. Queue events safely while the external script loads.
5. Convert cents to decimal PHP values with two-decimal precision.
6. Normalize item IDs using one helper.
7. Never throw into the checkout or cart UI when tracking fails.
8. Do not inject a `noscript` tracking image before consent.
9. Support an `eventID` option for `Purchase` deduplication.
10. Do not include customer PII in browser event parameters.

Purchase call shape:

```js
window.fbq('track', 'Purchase', parameters, { eventID: eventId });
```

### Step 2: Unit test the tracking module

**Create:** `apps/web/test/metaPixel.test.js`

Tests must verify:

- No script is injected without consent.
- No script is injected when disabled or missing the Pixel ID.
- Admin paths never initialize tracking.
- Initialization happens once.
- Cent values become decimal PHP values.
- Product/variant IDs follow the documented rule.
- `Purchase` passes the event ID in Meta's fourth argument.
- Tracking failures do not throw into application code.
- Withdrawing consent blocks subsequent events.

Do not use source-text regular expressions for these tests. Execute the module against a DOM test environment or extract pure payload builders for Node unit tests.

## Phase 5: Track React Page Views

React Router navigation does not reload `index.html`, so Meta's default initial `PageView` is insufficient.

### Step 1: Create a route tracker

**Create:** `apps/web/src/components/MetaRouteTracker.jsx`

```jsx
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../lib/metaPixel.js';

export default function MetaRouteTracker() {
  const location = useLocation();
  const lastPath = useRef('');

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (path.startsWith('/admin') || lastPath.current === path) return;
    lastPath.current = path;
    trackPageView(path);
  }, [location.pathname, location.search]);

  return null;
}
```

The `lastPath` guard also avoids misleading duplicate development events caused by React Strict Mode effect checks.

### Step 2: Mount the tracker inside `BrowserRouter`

**Modify:** `apps/web/src/main.jsx`

Mount the consent UI and route tracker inside `BrowserRouter` but outside the route pages:

```jsx
<BrowserRouter>
  <MetaRouteTracker />
  <ConsentBanner />
  <App />
</BrowserRouter>
```

### Step 3: Verify customer-only behavior

Expected:

- `/`, `/product/:slug`, `/cart`, `/checkout`, and `/thank-you` can send `PageView` after consent.
- `/admin`, `/admin/login`, and every nested admin route send nothing.
- Rejecting marketing consent sends nothing.
- Changing a query string intentionally sends a page view only when it represents meaningful navigation.

## Phase 6: Wire Ecommerce Events

### Step 1: `ViewContent`

**Modify:** `apps/web/src/pages/Product.jsx`

After a product is successfully loaded and displayed, call:

```js
useEffect(() => {
  if (product) trackViewContent(product);
}, [product?.id]);
```

Payload:

```js
{
  content_ids: [stableProductOrVariantId],
  content_name: product.name,
  content_type: 'product',
  currency: 'PHP',
  value: product.priceCents / 100
}
```

Do not fire while the request is loading, on a 404, or for product recommendations that were not opened.

### Step 2: `AddToCart`

Track after `addToCart()` succeeds.

Current insertion points:

- `apps/web/src/pages/Product.jsx` in `handleAdd()`
- `apps/web/src/pages/Cart.jsx` in `addUpsell()`
- Any future quick-add button

Preferred design: make the UI call `trackAddToCart()` explicitly after the cart mutation. Do not hide Meta-specific behavior inside the generic cart storage module because cart storage must remain functional when marketing consent is denied.

Payload:

```js
{
  content_ids: [item.externalPosVariantId || item.variantId],
  content_name: item.productName,
  content_type: 'product',
  contents: [{ id, quantity, item_price }],
  currency: 'PHP',
  value: item.unitPriceCents * quantity / 100
}
```

### Step 3: `InitiateCheckout`

Track the customer's intentional transition into checkout, not every render of the checkout page.

Recommended insertion points:

- The cart checkout link in `apps/web/src/pages/Cart.jsx`
- The cart drawer checkout link in `apps/web/src/components/Shell.jsx`
- As a fallback, the first valid non-empty render of `apps/web/src/pages/Checkout.jsx`, deduplicated by cart session ID

Use the current server quote totals when available. Do not claim an unconfirmed shipping amount.

### Step 4: `Purchase`

The event must fire only after `POST /api/orders` succeeds.

Current authoritative success point:

- `apps/web/src/pages/Checkout.jsx`, immediately after `createOrder()` returns successfully

Requirements:

- Use the returned order number as the base for `event_id`.
- Use the server-returned authoritative total and items. Extend the response if required.
- Do not calculate the final purchase value only from browser state.
- Do not fire when validation fails, payment/order creation fails, or the customer only visits `/thank-you`.
- Store the event ID with the last-order confirmation so a thank-you fallback does not create another event.
- Treat `sessionStorage` deduplication as a browser UX guard, not as reliable cross-channel deduplication.

Recommended API response addition:

```json
{
  "orderNumber": "MCC-...",
  "trackingEventId": "purchase:MCC-...",
  "totalCents": 171800,
  "currency": "PHP",
  "items": [
    {
      "variantId": "...",
      "externalPosVariantId": "...",
      "quantity": 2,
      "unitPriceCents": 79900
    }
  ]
}
```

Do not send `Purchase` again merely because the customer refreshes or revisits the thank-you URL.

## Phase 7: Prepare Conversions API

Browser Pixel can be implemented first, but the long-term recommendation is browser plus server events.

### Step 1: Keep server credentials server-side

Add server-only variables:

```dotenv
META_PIXEL_ID=
META_CONVERSIONS_API_ACCESS_TOKEN=
META_CONVERSIONS_API_ENABLED=false
META_CONVERSIONS_API_TEST_EVENT_CODE=
```

Rules:

- Never prefix the access token with `VITE_`.
- Never return it from an API.
- Store it in the production secret manager.
- Use the test event code only in staging/test sessions.

### Step 2: Create a server client

**Create:** `apps/api/src/marketing/metaConversionsApi.js`

Responsibilities:

- Build one `Purchase` server event from a persisted order.
- Use `event_name: "Purchase"`.
- Use Unix seconds for `event_time`.
- Use `action_source: "website"`.
- Include `event_source_url` when available.
- Use the same `event_id` as the browser Purchase.
- Normalize and SHA-256 hash permitted matching fields before transmission.
- Include `_fbp`, `_fbc`, client IP, and user agent only when collected lawfully and available.
- Apply timeouts, safe retries, redacted logging, and failure metrics.
- Never make order success depend on Meta availability.

### Step 3: Add an outbox

Do not call Meta inline as the only record of delivery.

Recommended flow:

1. Create the order transactionally.
2. Insert a `marketing_event_outbox` row in the same database transaction.
3. Return success to the customer.
4. A worker sends the event to Meta.
5. Record attempt count, last error, response trace ID, and sent time.
6. Retry transient failures with backoff.
7. Move permanent failures to an admin-visible dead-letter state.

Suggested schema:

```sql
CREATE TABLE marketing_event_outbox (
  id text PRIMARY KEY,
  provider text NOT NULL,
  event_name text NOT NULL,
  event_id text NOT NULL UNIQUE,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Step 4: Deduplicate browser and server events

Both channels must send:

- The same event name: `Purchase`
- The same event ID: for example `purchase:MCC-ORDER-NUMBER`

Browser:

```js
fbq('track', 'Purchase', purchasePayload, {
  eventID: 'purchase:MCC-ORDER-NUMBER'
});
```

Server:

```json
{
  "event_name": "Purchase",
  "event_id": "purchase:MCC-ORDER-NUMBER"
}
```

Do not generate the two IDs independently.

## Phase 8: Testing

### Step 1: Automated tests

Add tests for:

- Consent defaults to no marketing tracking.
- Accepting marketing initializes one Pixel.
- Rejecting or withdrawing blocks events.
- Admin routes never track.
- SPA navigation sends one `PageView` per customer route.
- Product load sends one correct `ViewContent`.
- Product and upsell actions send correct `AddToCart` values.
- Checkout navigation sends one `InitiateCheckout`.
- Failed checkout sends no `Purchase`.
- Successful checkout sends one `Purchase` with server totals.
- Browser and server Purchase use the same event ID.
- Conversions API retries do not create a second outbox event.

### Step 2: Local disabled test

Run with:

```bash
VITE_META_PIXEL_ENABLED=false npm run dev:web
```

Verify:

- No request to `connect.facebook.net`.
- No `fbq` global.
- Cart, checkout, login, and admin continue to work.

### Step 3: Staging consent test

Run a staging build with the test Pixel.

1. Open a fresh private window.
2. Before choosing consent, verify no Meta script or request exists.
3. Reject optional cookies and verify no Meta request appears.
4. Clear consent, accept marketing, and verify Pixel initialization.
5. Withdraw marketing consent and verify no new events are sent.
6. Confirm admin navigation never produces Meta events.

### Step 4: Staging commerce journey

Complete this exact sequence:

1. Open the homepage: `PageView`.
2. Open a product: `PageView`, then `ViewContent`.
3. Add one variant: `AddToCart` with correct item ID and PHP value.
4. Open cart: `PageView` only.
5. Enter checkout: `InitiateCheckout` with cart contents and total.
6. Trigger validation failure: no `Purchase`.
7. Submit a test order successfully: one `Purchase`.
8. Refresh thank-you: no second `Purchase`.
9. Reopen thank-you in another tab: no second server Purchase.
10. Confirm browser/server event deduplication in Events Manager when CAPI is enabled.

### Step 5: Validate data quality

In Events Manager and Pixel Helper, verify:

- Currency is `PHP`.
- Values are pesos, such as `799.00`, not `79900`.
- Content IDs are populated and consistent.
- Item quantities are correct.
- `Purchase` value matches the persisted order total.
- Event IDs exist for browser/server `Purchase`.
- No customer address, notes, or password data appears.
- No events originate from admin pages.
- Diagnostics show no duplicate Pixel initialization.

## Phase 9: Deployment And Rollout

### Step 1: Deploy disabled

Deploy all code with:

```dotenv
VITE_META_PIXEL_ENABLED=false
```

Smoke test the website before enabling tracking.

### Step 2: Enable staging

Enable only in staging with the test Pixel and complete every Phase 8 check.

### Step 3: Enable a controlled production rollout

1. Configure the production Pixel ID.
2. Keep Conversions API disabled initially if it has not passed staging.
3. Build and deploy the web image.
4. Confirm consent behavior on production.
5. Run one real or safely cancellable test order.
6. Verify events in Test Events and normal Events Manager reporting.
7. Monitor event count, value, duplicates, and diagnostics for at least 24 hours.
8. Enable campaign optimization only after Purchase data is stable.

### Step 4: Add rollback controls

The team must be able to disable tracking without reverting application code:

- Frontend enabled flag for browser Pixel.
- Server enabled flag for Conversions API.
- Independent kill switch for sending queued outbox events.

Document who can activate each switch.

## Definition Of Done

- [ ] Active React storefront loads Pixel only after marketing consent.
- [ ] Pixel configuration is environment-driven.
- [ ] Admin routes never initialize or send events.
- [ ] SPA route changes send deduplicated `PageView` events.
- [ ] `ViewContent`, `AddToCart`, and `InitiateCheckout` payloads are correct.
- [ ] `Purchase` fires only after successful order persistence.
- [ ] Purchase values come from the authoritative server result.
- [ ] Browser and server Purchase events share one event ID.
- [ ] Refreshing thank-you does not duplicate Purchase.
- [ ] Automated consent and event tests pass.
- [ ] Pixel Helper and Events Manager staging checks pass.
- [ ] Privacy/cookie content and consent controls are approved.
- [ ] Production has independent browser and server kill switches.
- [ ] Monitoring detects missing, rejected, or duplicate Purchase events.

## Files Expected To Change During Implementation

Create:

- `apps/web/.env.example`
- `apps/web/src/lib/consent.js`
- `apps/web/src/lib/metaPixel.js`
- `apps/web/src/components/ConsentBanner.jsx`
- `apps/web/src/components/ConsentSettings.jsx`
- `apps/web/src/components/MetaRouteTracker.jsx`
- `apps/web/test/metaPixel.test.js`
- `apps/api/src/marketing/metaConversionsApi.js` in the CAPI phase
- A versioned migration for the marketing event outbox in the CAPI phase

Modify:

- `apps/web/src/main.jsx`
- `apps/web/src/pages/Product.jsx`
- `apps/web/src/pages/Cart.jsx`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/ThankYou.jsx`
- `apps/web/src/components/Shell.jsx`
- `apps/web/Dockerfile`
- `docker-compose.yml`
- `apps/api/src/routes/orders.js` or the future checkout service
- Privacy/cookie content managed by store settings
- `.github/workflows/ci.yml`

Retire after the React implementation is validated:

- `apps/api/public/js/meta-pixel.js`
- `apps/api/public/js/meta-pixel-config.js`
- Legacy static-page Pixel script tags

Do not remove legacy files until the legacy storefront retirement work is approved, but do not maintain two active Pixel implementations.

## Official Meta References

Meta pages sometimes require a logged-in business account and may rate-limit automated access. Verify the latest UI and parameter requirements immediately before implementation:

- Meta Pixel documentation: <https://developers.facebook.com/docs/meta-pixel/>
- Meta Pixel getting started: <https://developers.facebook.com/docs/meta-pixel/get-started/>
- Meta Pixel event reference: <https://developers.facebook.com/docs/meta-pixel/reference/>
- Conversions API documentation: <https://developers.facebook.com/docs/marketing-api/conversions-api/>
- Browser/server deduplication: <https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/>
- Server event parameters: <https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/>
- Meta Events Manager: <https://business.facebook.com/events_manager2/>

The Meta documentation endpoints returned rate-limit responses during this guide's 2026-06-20 verification attempt. The links above are the official references and must be reviewed interactively while signed in before production launch.
