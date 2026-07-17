# Facebook Meta Pixel and Conversions API

This project is prepared for Facebook Meta Pixel browser tracking and server-side Purchase tracking through Meta Conversions API (CAPI).

## Current configuration

- Pixel ID: `595813035761213`
- Customer tracking: controlled by the runtime admin consent setting
- Admin routes: excluded
- Browser events: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`
- Server events: `Purchase`
- Browser/server deduplication key: `purchase_<orderNumber>`
- Currency: `PHP`

The browser Pixel is loaded from the runtime admin setting and fails closed if settings cannot be loaded. CAPI is disabled until its access token and Graph API version are configured.

## 1. Review privacy requirements

Before production activation, confirm that immediate tracking is appropriate for every market where the site operates. The default Terms privacy section discloses Facebook Meta Pixel and CAPI use. If store settings already exist in PostgreSQL or JSON, defaults will not overwrite them: open **Admin > Website Content > Terms**, replace the old Privacy section with the updated disclosure, and publish it before enabling ads.

## 2. Confirm the Meta data source

1. Sign in to Meta Business Manager.
2. Open **Events Manager**.
3. Select the web data source whose Pixel ID is `595813035761213`.
4. Confirm the business and ad account have access to this data source.
5. In **Settings**, enable automatic advanced matching only if it matches the business privacy policy. The website does not send unhashed email or phone from browser code.

## 3. Configure browser Pixel

Open **Admin > Settings > Meta Pixel**, enable the Pixel, enter the intended data-source ID, and choose whether consent is required. When server CAPI is enabled, the browser data-source ID is locked to `META_PIXEL_ID` to preserve Purchase deduplication. The CAPI access token always remains server-side.

## 4. Create a CAPI access token

1. In Meta Events Manager, select Pixel `595813035761213`.
2. Open **Settings > Conversions API**.
3. Choose the manual setup flow and generate an access token for the correct business and data source.
4. Store the token only in the deployment secret store or the server `.env`. Never commit it, paste it into frontend code, or include it in support screenshots.
5. Choose a supported Graph API version shown by Meta for the data source, including the leading `v`, for example `vXX.X`. Review and update this value during Meta API upgrades.

Set the server variables:

```dotenv
META_CONVERSIONS_API_ENABLED=true
META_PIXEL_ID=595813035761213
META_CURRENCY=PHP
META_CONVERSIONS_API_ACCESS_TOKEN=replace-with-secret-token
META_GRAPH_API_VERSION=vXX.X
META_CONVERSIONS_API_TEST_EVENT_CODE=
```

`DATABASE_URL` is also required. CAPI deliberately does not run in JSON fallback mode because durable and atomic Purchase delivery requires PostgreSQL.

The store currency is fixed to the ISO 4217 code `PHP`. Empty, non-PHP, or malformed `META_CURRENCY` values fall back to `PHP`; browser code never reads currency from an order form, locale, or payment-provider response.

## 4.1 Remove automatic Purchase rules

Maria Clara Clothing sends ecommerce events manually so values, quantities, and IDs come from validated product, quote, and order records. The Pixel bootstrap disables Meta automatic event configuration before `init`.

In Events Manager, also remove any old point-and-click rule that labels a checkout, COD, PayMongo, or Thank You button as `Purchase`:

1. Select the Maria Clara Clothing dataset.
2. Open **Settings** and launch **Open Event Setup Tool** for `https://mariaclaraclothing.com`.
3. Review configured events and delete every automatic `Purchase` rule.
4. Review partner integrations and Tag Manager containers; disconnect any integration that also sends `Purchase` to this dataset.
5. Keep only the application-owned browser Pixel and server Conversions API paths documented here.

An automatic button rule has no authoritative order object and can send `Purchase` without `value`, `currency`, or the permanent order event ID. It can also double-count a manually tracked Purchase.

## 5. Run the database migration

Before enabling CAPI on the API service:

```bash
docker compose exec api npm run db:migrate
```

The migration creates the durable `marketing_event_outbox` and checkout idempotency constraint. Each completed PostgreSQL checkout writes the order and its server Purchase event in the same transaction.

## 6. Validate with Test Events

1. Open **Events Manager > Test Events** and copy the test event code.
2. Temporarily set `META_CONVERSIONS_API_TEST_EVENT_CODE` to that code.
3. Recreate the API container so the server reads the new environment.
4. Browse the customer site and complete one test COD order using a new cart session.
5. Confirm the browser and server `Purchase` entries appear with the same event ID. Meta should show them as deduplicated rather than two purchases.
6. Confirm `value`, `currency`, `content_ids`, and order ID match the created order.
7. Remove `META_CONVERSIONS_API_TEST_EVENT_CODE` and recreate the API container before accepting production orders.

Example commands:

```bash
docker compose up -d --build api web
docker compose logs -f api
```

## 7. Validate browser events

Use Meta Events Manager Test Events and Meta Pixel Helper in a clean browser session:

1. Visit home and another customer route; each navigation should produce one `PageView`.
2. Open a product; confirm one `ViewContent` with its product/variant ID and price.
3. Add a variant; confirm `AddToCart` fires only after the cart accepts it.
4. Start checkout; confirm `InitiateCheckout` contains the cart value and contents.
5. Submit a test order; confirm one browser `Purchase` and one server `Purchase` share the same event ID.
6. Open `/admin`; confirm Pixel does not load and events do not fire.
7. Refresh the confirmation state; confirm the same browser Purchase is not sent again.

## Data sent to Meta

Browser events contain the event name, product/variant IDs, quantities, prices, value, and currency. Standard Pixel cookies may be set by Meta.

Server Purchase events contain:

- SHA-256 hashed normalized email and phone when supplied
- Client IP address and user agent
- `_fbp` and `_fbc` cookie values when present
- Purchase time, source URL, order number, product IDs, quantities, prices, total, and currency

Delivery address and order notes are not sent to Meta. After Meta accepts an outbox event, stored `user_data` is removed from that outbox payload.

## Reliability and operations

- The worker checks the outbox every 10 seconds and claims at most 10 due events.
- Transient failures use exponential retry delays from 1 to 64 minutes with jitter.
- Events stop retrying after eight attempts; permanent Meta validation errors fail immediately.
- Stale `sending` claims are recovered after five minutes.
- The access token is redacted from transport errors.

Inspect delivery health with PostgreSQL:

```sql
SELECT status, count(*)
FROM marketing_event_outbox
GROUP BY status
ORDER BY status;

SELECT event_id, attempt_count, next_attempt_at, last_error, updated_at
FROM marketing_event_outbox
WHERE status IN ('pending', 'failed')
ORDER BY updated_at DESC
LIMIT 50;
```

Treat a growing pending queue or any failed Purchase as an operational alert. Fix the token, permissions, Graph version, or payload issue before manually requeueing failed events.

## Rollback

To stop new browser tracking, disable Meta Pixel in **Admin > Settings > Meta Pixel**. To stop server delivery, set `META_CONVERSIONS_API_ENABLED=false` and recreate the API container. Disabling CAPI leaves pending events in PostgreSQL for later recovery; do not delete the outbox during a temporary rollback.
