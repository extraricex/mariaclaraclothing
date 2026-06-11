# Admin Orders Workflow Improvements Plan

**Goal:** Make the Orders page easier for daily COD, packing, and shipping work.

## First Pass

- Add order work queues above the table:
  - Needs COD confirmation
  - Ready for J&T
  - To pack
  - Ready to ship
  - Shipped
  - Delivered
  - Cancelled
- Keep the main table clean and focused.
- Improve order detail sections:
  - Customer
  - Delivery address
  - Items
  - Payment and COD
  - Fulfillment checklist
  - Notes and tags
- Add customer contact actions:
  - Copy phone
  - Copy address
  - SMS customer
  - Mark COD unreachable via the existing status form
- Add J&T readiness visibility:
  - Show `Ready for J&T` when an order has the required customer, phone, address, payment, and total fields.
  - Show `Missing info` when J&T-required fields are missing.
  - Show `Exported` when the order has already been exported to J&T.
  - Add a `Ready for J&T` work queue so export-safe orders are easy to find.

## Later Improvements

- Bulk update selected orders.
- Print packing slips.
- Export selected orders. Completed for J&T Excel export.
- Add J&T export history details in the order preview:
  - exported date/time
  - batch filename
  - re-export status after address correction
- Add duplicate customer/order warning.
- Add item availability risk flags.
