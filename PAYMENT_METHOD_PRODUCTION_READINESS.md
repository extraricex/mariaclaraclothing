# Payment Method Production Readiness

## Overall Status

**Application implementation: ready. PayMongo live activation: not complete.**

Cash on Delivery is ready for production. PayMongo Hosted Checkout, verified
payment webhooks, inventory reservations, payment monitoring, and the refund
workflow are implemented. The production server was audited on July 13, 2026
and still uses PayMongo **test** public and secret keys. It must remain in test
mode until the merchant-account checklist below is completed.

Do not accept real money merely because test checkout succeeds. PayMongo
business activation, payouts, live channels, live keys, a separate live webhook,
and one controlled real payment are manual production requirements.

## Completed Application Controls

### Checkout and payment confirmation

- Customers can choose Cash on Delivery or PayMongo Online Payment on the
  separate checkout review page.
- Prices, discounts, shipping, cart contents, and variant stock are validated
  by the backend.
- PayMongo orders are created once using a checkout idempotency key before the
  customer is redirected to Hosted Checkout.
- Pending PayMongo orders reserve inventory for 30 minutes.
- A PayMongo order becomes paid only after a signed backend webhook or verified
  server-side reconciliation confirms the Checkout Session payment.
- The webhook checks the website order reference, Checkout Session ID, Payment
  ID, PHP currency, and exact centavo amount.
- Webhook event IDs are persisted to prevent duplicate processing.
- A one-minute recovery worker checks pending sessions when a webhook is late.
- Expired sessions release reserved stock exactly once after PayMongo confirms
  expiration.
- Meta Pixel `Purchase` runs only after the paid order is confirmed and is
  deduplicated by order.

### Pancake POS and inventory

- Pending PayMongo orders sync as online payment with zero COD amount.
- Verified paid orders sync their exact prepaid amount and PayMongo references.
- PayMongo webhook updates modify the existing linked Pancake order instead of
  creating another order.
- Website inventory and mapped Pancake variants use absolute stock updates and
  retryable outboxes.
- Order cancellation and payment refund remain separate actions. Cancelling an
  order can restore stock; refunding money does not restock items automatically.

### Refund safety

- Full and partial refund requests use PayMongo `POST /v1/refunds` from the API
  server only.
- The server sends the amount in centavos, the stored PayMongo Payment ID, an
  approved reason, and a unique provider `Idempotency-Key`.
- Refund submission is disabled unless the configured secret key is live.
- Refund rows persist provider refund ID, amount, reason, status, attempts,
  timestamps, mode, and a safe error code.
- Signed `payment.refunded` and `payment.refund.updated` webhooks are processed
  idempotently.
- Refund statuses support requesting, pending, processing, succeeded, and
  failed. Orders support paid, partially refunded, and refunded payment states.
- A successful provider refund cannot be downgraded because a later audit or
  Pancake queue action fails. Follow-up failures create an admin alert.
- Failed requests can be retried with their original idempotency key for up to
  23 hours. Older failures require PayMongo Dashboard reconciliation first.
- Refunds never restock inventory automatically. Staff must inspect the return
  and change stock separately.

### Admin operations

Admin > Payments provides:

- Explicit PayMongo test/live mode and refund-enabled state.
- Paid, pending, failed/expired, and refunded totals.
- Stale payment, failed payment, pending refund, and failed refund alerts.
- Search and payment-status filtering.
- Checkout Session ID, Payment ID, Pancake order ID, and sync status.
- Formula-safe CSV export without customer personal information or API keys.

Admin > Orders > Order Details provides:

- Payment method, payment status, paid amount, paid timestamp, and provider IDs.
- Remaining refundable amount after successful and in-flight refunds.
- Confirmed full/partial refund action in live mode.
- Refund history, provider status, failure code, and safe retry action.
- Pancake payment and order-status synchronization status.

## Verified Test Payment

Controlled test order `MCC-1783869820871-9B2B` passed on July 12-13, 2026:

- Hosted Checkout redirect and one signed paid webhook succeeded.
- Website total and paid amount both remained PHP 729.00.
- The order changed to paid only after backend verification.
- Inventory deducted once from 4 to 3 and matched Pancake.
- The Pancake order stayed linked, used zero COD, and stored PHP 729.00 as the
  prepaid amount.
- Admin cancellation updated the linked Pancake order to cancelled.
- Cancellation restored website and Pancake stock exactly once to 4.
- No duplicate order, payment event, or stock deduction was observed.

This confirms the test integration, not the merchant's ability to accept and
settle live payments.

## Manual Live-Launch Blockers

Do not mark PayMongo live until every box is complete:

- [ ] PayMongo business verification is approved.
- [ ] The settlement bank account or PayMongo Wallet is active.
- [ ] The payout schedule, fees, refund limits, and support escalation path are
      understood by the business owner.
- [ ] PayMongo confirms the merchant's live card, GCash, Maya, and QRPh channels.
- [ ] A separate live webhook and live webhook signing secret exist.
- [ ] Live public and secret keys are installed only in the VPS environment.
- [ ] One low-value real payment passes end to end.
- [ ] One eligible low-value live refund is submitted and reaches `succeeded`.
- [ ] The refunded order, Pancake note/status, and inventory decision are
      reviewed by staff.
- [ ] The live transaction appears in balance and payout reporting.

## Configure the Live Webhook

Create a **live-mode** webhook in PayMongo using this exact endpoint:

```text
https://mariaclaraclothing.com/api/payments/paymongo/webhook
```

Subscribe to:

```text
checkout_session.payment.paid
payment.refunded
payment.refund.updated
```

Use the signing secret from this live webhook. Do not reuse the test webhook
secret. Confirm PayMongo Dashboard shows successful deliveries after the live
deployment.

## Install Live Credentials

From the MacBook:

```bash
ssh -i ~/.ssh/mariaclara_hostinger -p 2222 root@72.61.127.119
cd /var/www/mariaclara
```

Run the configured backup before changing payment settings:

```bash
/usr/local/bin/mariaclara-backup
```

Edit the uncommitted server environment:

```bash
nano deploy/production.env
```

Configure only PayMongo-approved live channels:

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

Protect and verify the file without printing secrets:

```bash
chmod 600 deploy/production.env
git check-ignore deploy/production.env
```

Never put real keys in chat, GitHub, screenshots, frontend variables, or admin
settings.

## Restart Production

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build api web

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml ps

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs --since=10m api
```

The API entrypoint applies versioned database migrations before starting. In
Admin > Payments, confirm PayMongo says **Live mode** and refunds are enabled.
Do not continue if it says Test mode or Not configured.

## Controlled Live Acceptance Test

Start with one low-value item and one enabled channel:

1. Record SKU, variant, website stock, and Pancake stock.
2. Place a PayMongo order on the live customer website.
3. Confirm redirect to PayMongo's HTTPS Hosted Checkout page.
4. Complete a real payment.
5. Confirm Thank You changes from pending to paid.
6. Confirm Admin shows the exact total, paid amount, timestamp, Checkout Session
   ID, and Payment ID.
7. Confirm PayMongo Dashboard shows the same reference and amount.
8. Confirm one paid webhook event exists and stock decreased exactly once.
9. Confirm Pancake has one linked order, zero COD, and the exact prepaid amount.
10. Confirm Meta Events Manager receives one `Purchase` with PHP value.
11. Confirm the transaction appears in balance/payout reporting.

Then refund this eligible test transaction:

1. Open its order in Admin and confirm payment status is Paid.
2. Submit a full or small partial refund with a clear note.
3. Confirm the Admin refund reaches Succeeded through the provider response or
   signed webhook.
4. Confirm payment status becomes Refunded or Partially Refunded.
5. Confirm PayMongo Dashboard shows the same refund ID and amount.
6. Confirm no second refund or duplicate Pancake order exists.
7. Decide separately whether returned stock is sellable before restocking.

Test other enabled channels individually on mobile and desktop after the first
channel passes.

## Daily Operations

Every business day after launch:

- Review Admin > Payments alerts.
- Confirm no payment remains pending beyond the reservation window.
- Match paid website orders to PayMongo and Pancake.
- Match exact paid and refunded amounts.
- Resolve failed refunds in PayMongo before using Retry.
- Confirm website/Pancake stock mismatch count is zero.
- Reconcile the CSV with PayMongo balance, fees, and payout reports.

Never fulfill from a customer screenshot or browser redirect. Fulfill only when
Admin shows a verified paid status and stored PayMongo Payment ID.

## Incident Response

If checkout, webhook, or reconciliation becomes unreliable:

1. Disable PayMongo in Admin > Settings and keep Cash on Delivery enabled.
2. Do not delete pending orders or create another payment against the same order.
3. Compare order number, Checkout Session ID, Payment ID, and Refund ID in Admin
   and PayMongo.
4. Review Admin > Payments, PayMongo webhook deliveries, and API logs.
5. Do not retry a refund older than 23 hours; reconcile it in PayMongo first.
6. Restore PayMongo only after a controlled test completes without duplication.

## Remaining Optional Improvements

These are not blockers for the first controlled live payment, but should follow:

1. Send off-platform email/SMS alerts for repeated payment or refund failures.
2. Enable Meta Conversions API for server-side Purchase delivery and browser/
   server deduplication. It is currently disabled in production.
3. Import PayMongo fees and payout records for automated settlement
   reconciliation; the current CSV compares website payment/refund and Pancake
   data only.
4. Add a written staff approval policy for large or suspicious refunds.

## Final Go-Live Decision

The code is ready for live acceptance testing, but **PayMongo is not ready for
real customers while production remains on test keys**. Complete every manual
live-launch blocker and the controlled payment/refund test before enabling it
for general customer use. Cash on Delivery remains the production fallback.

## Official PayMongo References

- [Payment acceptance and refunds](https://docs.paymongo.com/docs/payment-acceptance-refunds)
- [Refund resource](https://docs.paymongo.com/reference/refund-resource)
- [Webhook resource](https://docs.paymongo.com/reference/webhook-resource)
- [Idempotent requests](https://docs.paymongo.com/reference/idempotent-requests)
