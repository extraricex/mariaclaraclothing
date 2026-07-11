# Pancake Automatic Sync Design

Date: 2026-07-08
Status: Approved option 1
Mode: automatic safe sync; no live Pancake order creation

## Purpose

Make the Pancake POS integration feel like the previous Shopify + Pancake setup by removing the need to click manual sync buttons for routine updates. Pancake catalog references, SKU mappings, website stock, and website order shadow payloads should refresh automatically in the background.

## Scope

This phase adds a server-side background worker that periodically runs the already implemented safe operations:

- read-only catalog import;
- read-only inventory reconciliation from Pancake warehouse stock into website stock;
- order shadow export build for queued or existing website orders.

The worker does not create Pancake orders, update Pancake stock, overwrite website merchandising, process public webhooks, or sync Pancake order/customer status yet.

## Behavior

When `PANCAKE_MODE` is `read_only` or `shadow` and `PANCAKE_AUTO_SYNC_ENABLED` is not disabled, the API process starts a Pancake auto-sync worker. The worker runs once shortly after startup, then repeats on a configurable interval.

Each cycle:

1. Skips all work if Pancake is disabled or the API key is missing.
2. Runs catalog import first so changed Pancake SKUs/variations are mirrored.
3. Runs inventory reconciliation only after catalog import succeeds or the latest catalog state is already complete.
4. Runs order shadow build so new website orders are automatically prepared for Pancake review.
5. Logs only safe result codes and counts.

Manual buttons remain in Admin as immediate “run now” controls, but they are no longer required for normal operation.

## Configuration

Add non-secret env settings:

- `PANCAKE_AUTO_SYNC_ENABLED`: defaults to true for `read_only` and `shadow`; false for `disabled`.
- `PANCAKE_AUTO_SYNC_INTERVAL_MS`: default 10 minutes, allowed range 1 minute to 24 hours.
- `PANCAKE_AUTO_SYNC_STARTUP_DELAY_MS`: default 15 seconds, allowed range 0 to 5 minutes.

The worker uses the existing server-held Pancake API key and never exposes it to the browser or database.

## Safety

Automatic sync is constrained to safe operations:

- catalog import uses existing read-only Pancake GET APIs;
- inventory reconciliation only updates `product_variants.stock_quantity` locally using absolute Pancake sellable stock;
- order shadow export only stores redacted local review payloads;
- no `POST /shops/{SHOP_ID}/orders` call is made;
- no Pancake write endpoint is called.

Failures must not crash the API process. A failed cycle logs a safe code and the next interval tries again.

## Acceptance Criteria

- API startup starts the Pancake auto-sync worker when mode/config allow it.
- API startup does not start the worker when Pancake is disabled or auto-sync is disabled.
- Worker `runOnce()` calls catalog import, inventory reconciliation, and order shadow build in order.
- Worker catches step failures and continues to later safe steps when appropriate.
- Pancake config exposes interval/startup settings without secrets.
- Existing manual Admin controls continue to work.
- API tests, web tests, build, Docker migration/rebuild, health check, secret scan, and whitespace check pass.
