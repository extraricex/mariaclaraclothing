# Pancake POS Sync Status

Date: 2026-07-08
Mode: live Phase 2 catalog, inventory, and realtime order sync

## Current Result

The website is connected to Pancake POS in live mode. The selected shop, warehouse, and order source are configured in the ignored root `.env`, and the latest checks show no open catalog conflicts.

Latest import result:

- Active website variants checked: 82
- Pancake variations imported: 88
- Verified mappings: 82
- Open conflicts: 0
- Price unit: `confirmed_pesos`

Latest inventory reconciliation:

- Checked mappings: 82
- Updated local stock rows: 1
- Unchanged local stock rows: 81
- Inventory conflicts: 0

Latest live order export state:

- Live sent orders: 3
- Latest fresh website checkout: `DEMO-1783478294695-740F`
- Latest fresh checkout status: `sent`
- Latest fresh checkout mode: `live`
- Pancake order id: `DEMO-1783478294695-740F`
- Shop: `4275005`
- Warehouse: `1c5f28ed-6be3-45a0-b683-f87f6704fe6b`
- Order source: `100378768366281`

Live order export fixes applied:

- Removed invalid `shipping_address.country_code` from the Pancake create-order payload after Pancake returned `[country_code]: is invalid`.
- Increased the default Pancake request timeout from 8 seconds to 20 seconds.
- Changed unsent export processing to prioritize the newest website orders first.

The historical blocked exports are old demo/test orders whose item SKUs no longer map cleanly. One older July 8 test export still fails because Pancake reports insufficient remote inventory for `ARISOFF-S`. These do not represent current catalog conflicts.

## Remaining Mapping Conflicts

None in the current catalog snapshot.

## Safe Next Step

Keep Pancake in `live`, monitor the Pancake POS order list, and reconcile Pancake inventory for `ARISOFF-S` before retrying the remaining failed historical test export.

The website is now creating live Pancake POS orders for fresh checkouts. Historical failed rows should be reviewed separately so they do not get confused with current customer order sync health.
