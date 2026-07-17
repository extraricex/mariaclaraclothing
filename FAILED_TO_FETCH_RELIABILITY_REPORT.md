# Failed to Fetch Reliability Report

## Overall Status

Fixed and verified in production.

## Root Cause

The live server did not show an ongoing API crash, memory shortage, disk
shortage, or database outage. Caddy logs showed genuine HTTP 502 responses at
2026-07-17 01:48 UTC while a full Docker Compose release recreated the public
web/nginx container. During that handoff, Caddy could not connect to
`127.0.0.1:8081` and reported `connection refused`.

The production Compose health check ran only every 30 seconds and the web
container waited for the API to become healthy. That extended the public
upstream gap. Customers active at that moment—including traffic from the
Facebook in-app browser—could receive a network failure. The React data layer
then displayed the browser's raw `Failed to fetch` exception.

No unexplained live 5xx cluster was found outside the recorded release window.
The production containers were healthy with no observed CPU, memory, or disk
pressure at the time of the audit.

## Reliability Fixes

- Added one shared storefront request helper for read-only GET/HEAD/OPTIONS
  recovery. It retries only network errors and HTTP 502/503/504 responses with a
  short bounded backoff.
- Kept POST, checkout, payment, order, review, and other mutation requests
  single-dispatch. They are never automatically replayed, avoiding duplicate
  orders or payments.
- Replaced the raw browser exception with clear connection and temporary-service
  messages.
- Updated nginx to resolve the Docker API service dynamically. API container IP
  changes no longer require a web-container restart.
- Added a structured temporary HTTP 503 response with `Retry-After: 1` when the
  API upstream is briefly unavailable.
- Reduced API health-check detection from a 30-second interval to five seconds.
- Added a release script that builds first, replaces the API, waits for API
  health, and performs the web handoff last.
- Added a source-controlled Caddy configuration with a five-second upstream
  connection retry window for the short web-container handoff.

## Customer Behavior

Read-only storefront loads now recover automatically from a brief release or
network interruption. If recovery is not possible, customers see:

> We could not reach the store. Check your connection and try again.

or:

> The store is briefly reconnecting. Please try again in a moment.

Customer-entered checkout data is not deliberately cleared by this handling.
Unsafe writes are not retried automatically.

## Tests Performed

- Storefront source/unit suite: 223 passed.
- Backend suite: 489 passed, 2 PostgreSQL-environment tests skipped because
  `TEST_POSTGRES_URL` was not supplied, 0 failed.
- Production frontend build: passed.
- Production Compose configuration validation: passed.
- nginx configuration validation in the official nginx container: passed.
- Release script shell validation: passed.
- Local endpoint verification: homepage, API health, products, site content,
  storefront settings, robots, sitemap, merchant feed, and product SEO route all
  returned HTTP 200.
- Simulated API outage: static storefront remained HTTP 200; API returned the
  intentional friendly HTTP 503 JSON; API requests returned HTTP 200 after the
  service restarted.
- Integrated local recovery test: a read-only request that began while the API
  was stopped recovered automatically and completed with HTTP 200 after restart.

## Production Verification

- Pre-release backup: `20260717T032549Z`.
- Released commit: `108e67c`.
- Caddy configuration validated before reload and matched the source-controlled
  production file afterward.
- Monitored 360 homepage requests and 360 API health requests across the release:
  all 720 returned HTTP 200.
- Caddy 502 responses during and after the release: 0.
- Caddy `connection refused` errors during and after the release: 0.
- Homepage, products, storefront settings, robots, sitemap, and the current
  compiled frontend asset were verified live.
- API, web, and PostgreSQL containers were healthy with zero restart counts and
  no API error logs after release.
- The active Meta Test Events code remained configured; no unrelated production
  integration setting was changed.

## Operations and Monitoring

Routine releases must use:

```bash
deploy/release-production.sh deploy/production.env
```

Do not run a blind full-stack forced recreation while the site is receiving
traffic. Monitor Caddy for upstream failures and the API/web containers for
health and restart counts after every release.

## Remaining Issues

The in-app browser automation session was unavailable during this audit, so
visual reproduction in that tool could not be performed. The production server
logs provided the exact failure evidence, and the automated, local interruption,
live release, and post-release endpoint paths all passed. A customer's own lost
mobile connection can still interrupt a request; the site now recovers bounded
read-only requests and shows a useful message when recovery is impossible.

## Final Status

Fixed and production-verified.
