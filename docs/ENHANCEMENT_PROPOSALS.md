# Enhancement Proposals — for owner review

Written 2026-06-12 during the overnight redesign run. Nothing in this document is
implemented; these are recommendations beyond the requested monorepo/Docker/React/
Tailwind/Grafana work, ordered by expected value to the store. Mark ✅ / ❌ next to
each and I'll act on the approved ones.

## High value, low effort

1. **Order status notifications (SMS/Viber/Messenger).** Orders are confirmed by text
   today, manually. Hook `PATCH /api/admin/orders/:n` status changes to a notification
   adapter (start with a simple Semaphore/Twilio SMS on `confirmed` and `shipped`,
   include the J&T tracking number). Biggest COD failure-rate lever a PH store has.
2. **Server-side shipping fee recomputation.** Today the server stores whatever fee the
   client sends (by design, for admin-editable totals). Recompute server-side from the
   address region and cart quantity, and store the client value only as
   `requestedShippingFeeCents` for audit. Closes a trivially exploitable hole.
3. **Rate limiting + login throttling.** `express-rate-limit` on `POST /api/orders`
   (spam orders are a real COD problem) and `POST /api/admin/login` (single static
   password today). Cheap insurance.
4. **Admin auth hardening.** Replace the single shared token with signed, expiring
   sessions (even just an HMAC token with `exp`), bcrypt the password, and add a
   second admin user for the inevitable assistant/VA.
5. **Postgres for site content.** Banners are JSON-file-only; in Docker the file lives
   in the container. Add a `site_content` table following the existing dual-persistence
   pattern (the repo docs already anticipate this).

## High value, medium effort

6. ✅ **(IMPLEMENTED 2026-06-12)** **Real customer records.** `src/customers/` is a placeholder. Derive customers from
   orders (phone as natural key), show repeat-buyer history in admin order detail —
   COD trust scoring ("3 delivered, 0 refused") changes how you confirm orders.
7. **Inventory movements ledger.** Stock is a mutable integer today. An
   `inventory_movements` table (order placed, cancelled, manual adjustment, restock)
   gives you auditability and makes the Grafana low-stock panel trustworthy.
8. ✅ **(IMPLEMENTED 2026-06-12)** **Discount codes.** `src/discounts/` placeholder + admin contract already exist.
   Percentage/fixed codes with expiry and usage caps, validated server-side at
   checkout. Pairs with Meta ads (`MARIA10` etc.).
9. **E2E tests with Playwright.** It's already a devDependency. A 6-scenario suite
   (browse → cart → checkout → admin confirm → J&T export) against the Docker stack
   would replace the brittle regex "structure tests" over time.
10. **Image pipeline.** Uploads are stored as-is. Add sharp-based resize to WebP with
    2–3 srcset sizes at upload time; product pages currently ship multi-MB originals —
    this is the single biggest storefront performance win.

## Worth considering

11. **Pancake POS webhook** — `PANCAKE_WEBHOOK_SECRET` is reserved but unused; wiring
    stock sync would prevent overselling across channels.
12. **GitHub Actions CI** — run `npm test` + web build + `docker compose build` on push.
13. **Order timeline/audit log** — who changed what status when (matters once a VA has
    admin access).
14. **Abandoned-checkout capture** — store checkout form contacts before submission
    (with consent) for follow-up; high ROI for COD stores.
15. **SEO pass on the React storefront** — it's a SPA; either pre-render product pages
    (vite-plugin-ssr / a tiny prerender script) or accept the tradeoff knowingly since
    most traffic comes from Meta ads, not organic search.
16. **Structured logging + error tracking** — pino + Sentry (free tier) so production
    COD order failures aren't silent.

## Security notes found while working (no action taken)

- `ADMIN_TOKEN`/`ADMIN_PASSWORD` defaults (`local-admin-token`/`admin`) must be
  overridden in any real deployment — now also true for the Docker compose file.
- Grafana in the compose file allows anonymous viewers for the dashboard embed;
  set `GF_AUTH_ANONYMOUS_ENABLED=false` and use proper Grafana users before exposing
  the stack beyond localhost.
- `.env` currently contains a real-looking local Postgres URL; fine locally, but keep
  it out of the image (the Dockerfile does not copy `.env`).
