# Cloudflare Protected Preview Design

Date: 2026-07-04
Status: Approved for planning
Domain: `mariaclaraclothing.com`
Preview hostname: `preview.mariaclaraclothing.com`

## Purpose

Make the current Docker website available for testing through the store's Cloudflare-managed domain while development continues on the Mac. The preview must not be treated as the permanent production deployment.

## Current State

- The website runs locally through Docker Compose.
- The React/nginx gateway is available on local port `8081`.
- The API is also published locally on port `3000`, and PostgreSQL is private to the Compose network.
- Cloudflare is authoritative for `mariaclaraclothing.com`.
- The apex domain and `www` hostname currently have no public website DNS records.

## Selected Approach

Use a named Cloudflare Tunnel from the Mac to the existing nginx web gateway and publish it only at `preview.mariaclaraclothing.com`. Run `cloudflared` as an optional Docker Compose sidecar using a pinned official image. Protect the hostname with Cloudflare Access email verification. Preserve the apex domain and `www` for the eventual production launch.

This approach avoids router port forwarding and does not reveal the Mac's public IP address. It is appropriate for a temporary preview, but availability still depends on the Mac, Docker, internet connection, and tunnel process remaining online.

## Architecture

```text
Approved tester
      |
      | HTTPS
      v
Cloudflare Access
      |
      v
preview.mariaclaraclothing.com
      |
      | Cloudflare Tunnel
      v
cloudflared Compose sidecar
      |
      | Private Compose network
      v
Docker nginx web gateway: http://web:80
      |-- /api/*     -> api:3000
      |-- /uploads/* -> api:3000
      `-- SPA/static files
```

Only the nginx service at `http://web:80` is a tunnel origin. Port `3000` and PostgreSQL are never configured as Cloudflare origins.

## Components

### Cloudflare Tunnel

- Create one named tunnel for the Maria Clara preview.
- Run `cloudflared` as an optional Docker Compose sidecar using the pinned official image.
- Configure one ingress rule from `preview.mariaclaraclothing.com` to `http://web:80` on the private Compose network.
- End the ingress configuration with a catch-all `http_status:404` rule.
- Let Cloudflare create the tunnel-backed DNS record; do not create an `A` record pointing to the Mac.
- Keep the tunnel credential outside Git and outside the web image.

### Cloudflare Access

- Create a self-hosted Access application for `preview.mariaclaraclothing.com`.
- Permit only explicitly approved email addresses using a one-time PIN identity flow.
- Deny all other visitors before requests reach the Mac.
- Protect the entire hostname, including `/admin`, `/api`, and uploaded media.

### Local Docker Application

- Keep the existing application routing through the web/nginx container.
- Do not publish ports from the tunnel sidecar or expose API port `3000` or PostgreSQL through Cloudflare.
- Continue using the current Docker volumes for PostgreSQL and uploaded product media.
- Do not publish any additional ports for the tunnel.
- Keep this preview separate from permanent production infrastructure.

### Developer Workflow

Source files remain editable in the current repository. After a code change, run the normal tests and rebuild/recreate the affected Docker services. The preview hostname then serves the rebuilt containers; no DNS change is required for each update.

Database and upload volumes must not be deleted during ordinary rebuilds. Destructive Compose commands that remove volumes are outside this workflow.

## Security Boundary

- Cloudflare Access is mandatory because the repository is still under development and local deployment defaults must not be exposed publicly.
- No API, admin, database, tunnel credential, `.env`, or provider secret is committed or placed in frontend code.
- The tunnel connects only to the nginx gateway.
- The preview must not be advertised to customers or used for unrestricted production ordering.
- Before the public launch, deploy to an always-on production host with production secrets, backups, monitoring, HTTPS edge configuration, and a launch review.

## Data Flow

1. A tester opens `https://preview.mariaclaraclothing.com`.
2. Cloudflare Access verifies that the tester's email is allowed.
3. Cloudflare sends the authorized request through the named tunnel.
4. The `cloudflared` sidecar forwards the request to nginx at `http://web:80` on the private Compose network.
5. Nginx serves the React application or proxies same-origin API/media requests to the API container.
6. The API reads and writes the existing PostgreSQL and upload volumes.

## Failure Handling

- If the Mac, Docker, internet, or tunnel is offline, Cloudflare will show an origin/tunnel availability error; no fallback deployment is implied.
- If Access rejects a tester, the request must not reach nginx.
- If nginx is unavailable, the tunnel remains unable to serve the application rather than exposing another local service.
- A catch-all tunnel rule rejects unknown host routing.
- The implementation checklist will include commands for starting, stopping, checking, and diagnosing the tunnel without deleting application data.

## Verification

Implementation is accepted only after verifying:

- the preview hostname resolves through Cloudflare;
- an unapproved session cannot reach the website;
- an approved email can reach the storefront and admin login;
- `/api/health` works through the preview hostname after Access authentication;
- the API and PostgreSQL are not directly reachable through separate public hostnames;
- mobile and desktop storefront routes load through the preview;
- a small code change can be rebuilt and observed through the same preview hostname;
- Docker data and uploads survive an application rebuild;
- the full API tests, web tests, production web build, and Docker health checks still pass.

## Out of Scope

- Publishing the apex domain or `www`.
- Permanent cloud hosting or high availability.
- Public customer launch.
- Cloudflare commerce, caching, WAF, or performance tuning beyond what the protected preview requires.
- Pancake POS synchronization beyond the already approved Phase 1 connection foundation.
