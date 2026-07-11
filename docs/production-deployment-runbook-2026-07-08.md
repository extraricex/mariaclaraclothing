# Maria Clara Clothing Production Deployment Runbook

Date: 2026-07-08
Branch: `codex-edits`

## Current Deployable Shape

The app is deployable as a Docker stack:

- `web`: React storefront/admin served by nginx on public port 80.
- `api`: Express API, private to Docker network.
- `postgres`: PostgreSQL 16, private to Docker network.
- `uploads`: Docker volume mounted at `/app/public/uploads`.

The production template is in `deploy/docker-compose.production.yml`.

## Required Server Setup

Use a VPS or cloud VM with:

- Docker Engine and Docker Compose plugin.
- At least 2 GB RAM for a first launch.
- Persistent disk for Docker volumes.
- A domain pointed to the server.
- HTTPS from Cloudflare, Caddy, nginx-proxy, or the host provider.

The app uses secure cookies in production, so the public domain must be HTTPS before customer/admin login is used.

## First Production Deploy

1. Copy the env template:

   ```bash
   cp deploy/production.env.example deploy/production.env
   ```

2. Generate secrets:

   ```bash
   openssl rand -hex 32
   ```

3. Fill `deploy/production.env`:

   - Replace every `replace-with...` value.
   - Keep `APP_ENV=production`.
   - Keep `CHECKOUT_V2_REQUIRED=true`.
   - Keep `PANCAKE_MODE=live` only if you want live Pancake orders immediately.
   - Use the verified Pancake IDs already in the template.

4. Start the stack:

   ```bash
   docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml up -d --build
   ```

5. Verify containers:

   ```bash
   docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml ps
   ```

6. Verify health locally on the server:

   ```bash
   curl -fsS http://127.0.0.1/api/health
   ```

7. Verify the public domain:

   ```bash
   curl -fsS https://YOUR-DOMAIN.com/api/health
   ```

## Go-Live Test Order

After the domain is live:

1. Open the storefront.
2. Add one in-stock product to cart.
3. Checkout using Cash on Delivery.
4. Confirm the thank-you page opens.
5. Login to `/admin`.
6. Confirm the order appears in Orders.
7. Open Pancake POS and confirm the same order appears.
8. Confirm stock behavior for the ordered SKU.

Use a real phone/address for the final test if you need to validate COD operations.

## Backups

Before accepting paid traffic, configure backups for:

- PostgreSQL volume `postgres_data`.
- Upload volume `uploads`.

Minimum manual backup commands:

```bash
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
docker run --rm -v maria_clara_uploads:/uploads -v "$PWD":/backup alpine tar czf /backup/uploads-backup.tgz /uploads
```

Store backups away from the production server.

## Rollback

For a bad deploy:

1. Stop customer traffic at Cloudflare or maintenance mode if available.
2. Revert to the previous git commit.
3. Rebuild the stack:

   ```bash
   docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml up -d --build
   ```

4. Verify `/api/health`.
5. Place one internal test order before reopening traffic.

Do not restore an old database backup unless the schema/data itself is corrupted. Restoring old data can lose customer orders.

## Current Known Operational Notes

- Pancake live export was verified locally with fresh website order `DEMO-1783478294695-740F`.
- Current Pancake mappings are `82/82` verified with `0` open conflicts.
- One old historical test export still fails because Pancake reports insufficient remote inventory for `ARISOFF-S`.
- J&T is intentionally `dry_run`; shipment booking is not live.
- SMS/email delivered-order notifications are disabled until provider credentials are supplied and tested.
