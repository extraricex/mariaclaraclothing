# Payment Method Production Readiness

## Overall Status

**Test mode is working. Live PayMongo payments are not yet enabled.**

Cash on Delivery and PayMongo Hosted Checkout are available in the website. The
controlled PayMongo test order `MCC-1783869820871-9B2B` passed on July 12, 2026:

- The checkout session redirected to PayMongo successfully.
- One signed `checkout_session.payment.paid` webhook was processed.
- The paid amount and website order total both remained PHP 729.00.
- The order was marked paid only after backend verification.
- Inventory was deducted exactly once, from 4 to 3.
- Website and Pancake inventory both showed 3 after synchronization.
- The order exported to Pancake on the first attempt and remained linked.
- No related production API errors were found.

Do not treat the successful test payment as approval to accept real money. The
live-account, refund, settlement, and monitoring steps below must be completed
first.

## Current Implementation

The project currently provides:

- Cash on Delivery and PayMongo selection during checkout.
- Server-side PayMongo Checkout Session creation.
- Authoritative backend price, discount, shipping, and stock validation.
- A unique website order created before redirecting to PayMongo.
- A 30-minute inventory reservation for pending PayMongo orders.
- Signed webhook validation at:
  `https://mariaclaraclothing.com/api/payments/paymongo/webhook`
- Order reference, Checkout Session ID, currency, and exact amount validation.
- Idempotent webhook processing using the PayMongo event ID.
- A one-minute recovery worker that checks pending Checkout Sessions if a
  webhook is delayed.
- Automatic expiration and stock release after PayMongo confirms that a pending
  Checkout Session has expired.
- PayMongo payment status protected from manual admin changes.
- Website order and inventory synchronization to Pancake POS.
- Browser Meta Pixel `Purchase` tracking after the paid Thank You page loads.

Relevant implementation files:

- `apps/api/src/routes/paymongo.js`
- `apps/api/src/payments/paymongoPaymentService.js`
- `apps/api/src/payments/paymongoWebhookSignature.js`
- `apps/api/src/payments/paymongoWorker.js`
- `apps/web/src/pages/Checkout.jsx`
- `apps/web/src/pages/ThankYou.jsx`

## Required Next Steps

### 1. Activate the PayMongo business account

Complete PayMongo business verification and confirm that the account is allowed
to process live payments. Configure the settlement bank account or PayMongo
Wallet and verify the payout schedule before switching keys.

Do not switch the website to live keys while the PayMongo account is pending,
restricted, or unable to receive payouts.

### 2. Confirm live payment channels

In PayMongo, verify which channels are enabled for this merchant account:

- Cards
- GCash
- Maya
- QRPh

Only configure methods that PayMongo has enabled. A method being available in
test mode does not guarantee that it is active for the live merchant account.

Recommended initial production setting:

```env
PAYMONGO_PAYMENT_METHOD_TYPES=card,gcash,paymaya,qrph
```

Remove any unavailable channel before launch. Do not advertise online banking
unless it is enabled and actually offered by the Hosted Checkout page.

### 3. Create a separate live webhook

Create the live PayMongo webhook with this exact HTTPS endpoint:

```text
https://mariaclaraclothing.com/api/payments/paymongo/webhook
```

Subscribe to the Checkout Session paid event used by the integration:

```text
checkout_session.payment.paid
```

Store the new **live webhook signing secret** in the VPS environment. Do not
reuse the test webhook secret. PayMongo retries unsuccessful webhook deliveries,
so the endpoint must remain public and return a successful HTTP response after
valid processing.

### 4. Install live credentials securely

On the MacBook, connect to the VPS:

```bash
ssh -i ~/.ssh/mariaclara_hostinger -p 2222 root@72.61.127.119
cd /var/www/mariaclara
```

Create a database backup before changing payment configuration:

```bash
mkdir -p /var/backups/mariaclara
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > /var/backups/mariaclara/pre-paymongo-live-$(date +%F-%H%M%S).sql.gz
```

Edit the uncommitted production environment:

```bash
nano deploy/production.env
```

Use live credentials without quotes or spaces around `=`:

```env
PAYMONGO_ENABLED=true
PAYMONGO_API_BASE_URL=https://api.paymongo.com
PAYMONGO_PUBLIC_KEY=pk_live_REPLACE_WITH_REAL_VALUE
PAYMONGO_SECRET_KEY=sk_live_REPLACE_WITH_REAL_VALUE
PAYMONGO_WEBHOOK_SECRET=whsk_REPLACE_WITH_REAL_LIVE_VALUE
PAYMONGO_SUCCESS_URL=https://mariaclaraclothing.com/thank-you
PAYMONGO_CANCEL_URL=https://mariaclaraclothing.com/checkout
PAYMONGO_PAYMENT_METHOD_TYPES=card,gcash,paymaya,qrph
PAYMONGO_RESERVATION_MINUTES=30
```

In `nano`, save with **Control+O**, press **Return**, then exit with
**Control+X**. `O` is the letter, not zero.

Never paste secret keys into chat, GitHub, screenshots, frontend variables, or
admin settings. Confirm that the file is ignored by Git:

```bash
git check-ignore deploy/production.env
chmod 600 deploy/production.env
```

### 5. Restart and verify live mode

Recreate the API container so it receives the new environment:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build api web

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml ps

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs --since=10m api
```

Verify in Admin > Settings that PayMongo says **live mode configured**. Do not
print or inspect the full secret key in terminal output.

### 6. Run one controlled live payment

Use a low-value real order with one product and one unit. Record the product SKU
and starting stock before checkout.

Verify all of the following:

1. The customer is redirected to the official PayMongo HTTPS page.
2. A real enabled payment channel completes successfully.
3. The Thank You page changes from pending to paid.
4. The admin order shows the exact amount, paid timestamp, Checkout Session ID,
   and Payment ID.
5. PayMongo Dashboard shows the same order reference and amount.
6. Only one paid webhook event exists for the order.
7. Stock decreases exactly once.
8. Website and Pancake stock match.
9. Pancake contains one linked order with the correct payment note.
10. Meta Events Manager contains one `Purchase` event with the correct PHP value.
11. The payment appears in the PayMongo balance or payout reporting as expected.

Do not test every live channel at once. Start with one channel, verify the whole
flow, then test each additional enabled channel separately.

## Remaining Launch Blocker

### Refund workflow

The website does **not** currently call the PayMongo Refund API. Cancelling a
paid PayMongo order in Maria Clara Admin does not return money automatically.

Until an in-app refund workflow is implemented:

1. Find the payment using the stored PayMongo Payment ID.
2. Issue the refund from the PayMongo Dashboard.
3. Wait for PayMongo to show the refund as successful.
4. Record the refund reference in the admin order notes.
5. Set the local payment status to refunded only through a controlled backend
   workflow. Do not fake a refund by only changing visible text.
6. Confirm whether stock should be returned before restocking the order.

Recommended code improvement: implement full and partial refund requests,
`payment.refunded` and `payment.refund.updated` webhooks, refund IDs, amount,
reason, timestamp, idempotency, audit history, and admin confirmation. PayMongo
states that only paid live transactions can be refunded and refund limits vary
by payment channel.

Official reference:
[PayMongo refund documentation](https://developers.paymongo.com/v1/docs/refunding-transactions)

## Verified Cancellation and Pancake Sync

Commit `6c63cba` was deployed and verified in production test mode on July 13,
2026 using order `MCC-1783869820871-9B2B`:

- Admin cancellation changed the linked Pancake order to official status `6`
  (`canceled`).
- Pancake stored `cod=0` and `transfer_money=729` for the paid PayMongo order.
- Payment status remained paid locally; cancellation did not pretend to refund
  the payment.
- The restored website and Pancake stock both settled at 4.
- The inventory outbox synchronized on its first attempt without an error.
- The outbound cancellation event succeeded and remained idempotently linked to
  the existing Pancake order.
- Pancake inbound polling retained the local cancelled state.

A one-time idempotent backfill also corrected all existing linked paid PayMongo
test orders to use zero COD and their exact prepaid amounts.

## Remaining Operational Improvements

### Payment failure and abandoned checkout visibility

Expired Checkout Sessions are recovered automatically, but Admin should provide
a clear filtered view for:

- Pending payment
- Expired
- Failed
- Paid
- Refunded

Add alerts for an unusual number of pending payments, repeated PayMongo API
errors, webhook signature failures, and stock reservations older than the
configured expiration period.

## Recommended Improvements

Implement these in priority order:

1. **P0: Live account and payout activation.** Real payments are not useful if
   funds cannot be settled.
2. **P0: Live webhook and low-value live acceptance test.** Do this before
   enabling PayMongo for all customers.
3. **P0: Written manual refund procedure.** Staff must understand that order
   cancellation and payment refund are separate actions.
4. **P1: PayMongo refund integration.** Add verified refund webhooks and an admin
   refund action with confirmation and audit logs.
5. **P1: Payment operations dashboard.** Show pending age, webhook result, last
   reconciliation, reservation state, and safe error code without exposing keys.
6. **P1: Automated alerts.** Notify the support email when paid webhook handling,
   pending reconciliation, or reservation release repeatedly fails.
7. **P1: Server-side Meta Conversions API.** Browser Pixel is installed, but the
   server-side Meta Purchase outbox is inactive unless a Conversions API token is
   configured. Enable it for more reliable Purchase reporting and browser/server
   event deduplication.
8. **P2: Finance reconciliation export.** Produce a daily CSV comparing website
   orders, PayMongo payments/refunds, Pancake orders, fees, and payouts.
9. **P2: Additional payment-channel acceptance tests.** Test card 3DS, GCash,
    Maya, and QRPh on mobile and desktop as each becomes available.

## Daily Operations Checklist

Check these every business day after launch:

- No paid PayMongo transaction is missing from Maria Clara Admin.
- No paid website order is missing from Pancake.
- Paid amounts match order totals exactly.
- No order remains pending beyond the reservation window.
- Website and Pancake stock mismatches are zero.
- Failed webhook and synchronization counts are zero.
- Refunds in PayMongo match refunded orders in Admin.
- Payout totals and fees match the finance record.

Never fulfill a PayMongo order based only on the customer redirect or a customer
screenshot. Fulfill only when Maria Clara Admin shows `payment_status=paid` and a
PayMongo Payment ID produced by the verified backend flow.

## Incident Response

If PayMongo checkout or webhook processing becomes unreliable:

1. Disable PayMongo in Admin > Settings while keeping Cash on Delivery enabled.
2. Do not delete pending orders or retry payments manually against the same
   order without checking PayMongo first.
3. Compare the website order reference with the PayMongo Checkout Session and
   Payment IDs.
4. Check API logs, webhook delivery history, pending reservations, and the
   one-minute reconciliation worker.
5. Restore service only after one controlled test completes without duplicate
   payment, order, or stock movement.

## Final Go-Live Decision

PayMongo can be marked **ready for real customers** only when all of these are
true:

- PayMongo business activation and payouts are complete.
- Live channels are enabled and confirmed by PayMongo.
- Live keys and a separate live webhook secret are installed securely.
- One controlled real payment passes end to end.
- Cancellation restores website and Pancake stock exactly once.
- Staff have a tested refund procedure.
- Pending and failed payments are monitored.
- Cash on Delivery remains available as a fallback.

Until then, keep PayMongo in test mode or disable it for customers.
