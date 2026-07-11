# Pancake POS Connection Recommendation

Date: 2026-07-07
Branch: `codex-edits`

## Short Answer

Yes, we can connect Pancake POS to the website now, but only in the approved read-only Phase 2 mode.

The website already has the Pancake POS Phase 2 foundation implemented: connection status, catalog import, shop/warehouse/order-source selection, SKU mapping, conflict reporting, and admin UI. The remaining requirement is adding the real Pancake API key to the ignored local `.env` file and using Admin -> Pancake POS to run the first catalog import.

## Current Readiness

Ready:

- Docker API, web, and PostgreSQL services are running locally.
- Pancake Phase 2 code is present on `codex-edits`.
- Database migrations have been run.
- Admin page exists at `http://127.0.0.1:8081/admin/pancake`.
- The integration is designed to call Pancake with read-only GET requests only.
- API key and webhook secrets are not stored in the database or bundled into browser assets.

Not ready yet:

- The ignored root `.env` does not currently contain the Pancake mode or API key.
- No live credentialed Pancake catalog import has been run yet.
- No real shop, warehouse, order source, variation count, mapping coverage, or conflict count has been verified yet.

## Recommendation

Connect Pancake POS now in read-only mode and stop there until the catalog mapping report is reviewed.

Do not enable live order sync, webhooks, inventory replacement, or Pancake writes yet. The first connection should only prove that:

- the API key works;
- the intended Pancake shop can be discovered or selected;
- warehouses and order sources load correctly;
- Pancake variations import successfully;
- website variants map cleanly by exact normalized SKU;
- conflicts are visible before any operational workflow depends on them;
- price-unit evidence is confirmed or explicitly flagged as ambiguous.

This keeps the integration useful immediately while avoiding accidental changes to Pancake inventory, website stock, customer data, or orders.

## Safe Connection Steps

1. Edit the ignored root `.env` file locally.

   Add Pancake read-only mode and the real Pancake API key. Do not paste the key into chat, commits, screenshots, logs, or tracked files.

2. Restart the API container so the server reads the new environment values.

   ```bash
   docker compose up -d --force-recreate api web
   docker compose ps
   ```

3. Open the admin Pancake page.

   ```text
   http://127.0.0.1:8081/admin/pancake
   ```

4. Click the safe connection test.

   Expected result: the page reports read-only connection status without exposing the API key.

5. Import Pancake references.

   If multiple shops are discovered, select the intended shop first. Then choose the correct warehouse and order source.

6. Run the catalog import.

   Expected result: the page shows imported variation count, mapped website variants, conflicts, and price-unit status.

7. Review conflicts before moving forward.

   Treat duplicate SKUs, missing SKUs, stale external IDs, and price mismatches as blockers for later live sync phases.

## Go / No-Go Criteria

Go for read-only Phase 2 when:

- Pancake connection test succeeds.
- Correct shop, warehouse, and order source are selected.
- Catalog import completes without pagination or provider errors.
- Mapping coverage is acceptable for the products intended to sync later.
- Price-unit status is confirmed or the ambiguity is documented.
- No secrets appear in API responses, browser network bodies, logs, or tracked files.

No-go for live sync when:

- Any SKU duplicates exist on either side.
- Many active website variants are missing Pancake matches.
- Price-unit status is ambiguous.
- The selected shop, warehouse, or order source is uncertain.
- Pancake API responses include unexpected data shapes.
- The business has not reviewed the conflict report.

## Phase Boundary

This connection should remain Phase 2 only:

- no Pancake writes;
- no website inventory replacement;
- no webhook processing;
- no order creation in Pancake;
- no customer synchronization;
- no scheduled background sync.

The next phase should be planned only after the first real read-only import produces clean mapping evidence.

