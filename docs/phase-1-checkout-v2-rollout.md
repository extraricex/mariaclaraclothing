# Checkout V2 Rollout

Checkout V2 makes PostgreSQL the authority for product prices, stock, shipping, promotions,
idempotency, and private guest confirmations. Do not enable the final legacy-checkout rejection
until the API migration and V2 storefront are both deployed and one private confirmation succeeds.

## Preparation

1. Generate and securely store a stable confirmation secret of at least 32 characters.
2. Back up PostgreSQL and record the exact restore command before deployment.
3. Record the currently deployed API and web image identifiers for rollback.
4. Confirm Meta CAPI can be disabled independently during checkout troubleshooting.

## Deployment Sequence

Run these steps in order:

```bash
# 1. Back up PostgreSQL and record the restore command.

# 2. Deploy the API in compatibility mode.
CHECKOUT_V2_REQUIRED=false docker compose up -d --build api

# 3. Apply additive migrations and confirm quote state exists.
docker compose exec api npm run db:migrate
docker compose exec postgres psql -U postgres -d maria_clara -c '\d checkout_quotes'
docker compose exec postgres psql -U postgres -d maria_clara -c '\d checkout_idempotency'

# 4. Deploy the V2 web application.
docker compose up -d --build web

# 5. Complete one test order and open its private confirmation.

# 6. Reject legacy checkout after the test succeeds.
CHECKOUT_V2_REQUIRED=true docker compose up -d --force-recreate api
```

Verify that the test order used a quote ID and `Idempotency-Key`, ignored browser totals, deducted
stock once, produced one inventory movement, and required `X-Order-Confirmation` for PII.

## Health Checks

```bash
curl -fsS http://localhost:3000/api/health
curl -fsSI http://localhost:8081/
docker compose ps
```

Also run the browser journey twice. Each run must create a distinct cart and idempotency key and
reach the private thank-you page without manual database cleanup.

## Rollback

1. Set `CHECKOUT_V2_REQUIRED=false` and recreate the API.
2. Deploy the previous web image.
3. Keep the additive checkout tables and order confirmation columns in place.
4. Do not drop checkout tables or rotate `ORDER_CONFIRMATION_SECRET` during an incident rollback.
5. Restore PostgreSQL only when data integrity requires it, using the command recorded before deployment.

```bash
CHECKOUT_V2_REQUIRED=false docker compose up -d --force-recreate api
```

After recovery, inspect quote, idempotency, order, stock, movement, promotion, and Meta outbox state
before retrying the cutover.
