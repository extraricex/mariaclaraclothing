# Cloudflare Preview Operations

The protected preview is `https://preview.mariaclaraclothing.com`. It is a temporary test environment hosted by the Mac, not the permanent customer deployment.

## Security rules

- Cloudflare Access must allow only explicit email addresses through One-time PIN.
- Store `CLOUDFLARE_TUNNEL_TOKEN` only in the ignored root `.env`.
- Never paste the tunnel token into chat, screenshots, source files, or Git.
- Never publish API port `3000` or PostgreSQL through Cloudflare.

## Local preflight

```bash
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8081/api/health
```

## Start or update the preview

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.preview.yml ps
docker compose -f docker-compose.yml -f docker-compose.preview.yml logs --tail=100 cloudflared
```

## Stop only internet access

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml stop cloudflared
```

This leaves the website, database, and uploads running locally. Do not run `docker compose down -v`; `-v` removes persistent database and upload volumes.

## Development updates

Edit the repository normally, run tests, and rebuild with the preview command above. The hostname and Access policy remain unchanged.

## Verification

- A private browser session must show Cloudflare Access before the website.
- An unapproved email must not receive access.
- An approved email signs in with One-time PIN and can load the storefront, `/admin`, and `/api/health`.
- `docker compose ps` must show PostgreSQL healthy and `cloudflared` running.

## Recovery

If the preview is unavailable, verify Docker, local health, tunnel logs, internet connectivity, and the Cloudflare tunnel status in that order. Rotate the token in Cloudflare immediately if it is exposed, update `.env`, and recreate only the `cloudflared` service.
