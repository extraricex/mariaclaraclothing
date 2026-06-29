# Parcel And Delivery Notification Operations

## Admin Workflow

1. Set each product's packed parcel weight in **Products > Edit product > Parcel weight**.
2. Open an order and review **J&T readiness**.
3. Leave the order override empty to use calculated weight, or enter the measured packed weight.
4. Use **Preview J&T parcel** to validate receiver, address, items, weight, parcel count, and COD.
5. Export ready orders to the J&T Excel file while the live API is unavailable.
6. Mark the order delivered only after delivery is confirmed.

On the first transition to any delivered status, the API creates one SMS and one email outbox
record when valid recipients exist. Repeated saves do not create duplicates. Provider calls run
in the background, so saving an order is not blocked by a slow or unavailable provider.

## Enable SMS And Email

Add these only to the ignored root `.env` used by Docker or the private API environment:

```env
ORDER_NOTIFICATIONS_ENABLED=true
SEMAPHORE_API_KEY=your-semaphore-api-key
SEMAPHORE_SENDER_NAME=MARIACLARA
RESEND_API_KEY=your-resend-api-key
ORDER_NOTIFICATION_FROM_EMAIL=Maria Clara Clothing <orders@your-verified-domain.com>
```

Then rebuild the API container. The Resend sender domain must be verified. Semaphore sender
names may require provider approval; leave `SEMAPHORE_SENDER_NAME` empty until approved.

Never expose these values through `VITE_*`, browser JavaScript, screenshots, logs, or Git.

## Delivery States

The order page shows each confirmation as:

- `pending`: waiting for the worker
- `sending`: currently claimed by a worker
- `sent`: provider accepted the message
- `failed`: permanent failure or retry limit reached
- `skipped`: notification feature/provider was not configured at delivery time

Temporary provider errors use bounded exponential retries. Credentials are never included in
stored errors. A skipped record is intentionally not sent later; manually verify the customer
contact before any future resend feature is used.

## Deployment Check

1. Run the database migration.
2. Enable providers with test credentials and an approved sender.
3. Create an order using controlled phone/email recipients.
4. Move it from shipped to delivered once.
5. Confirm exactly two outbox records and provider receipt IDs.
6. Save the delivered order again and confirm no duplicates.
7. Review provider dashboards and application logs for delivery acceptance.

The application records provider acceptance, not final handset delivery or inbox placement.
