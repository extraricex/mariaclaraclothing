# J&T Excel Export Implementation Plan

**Goal:** Export admin orders into the uploaded J&T Excel waybill/order upload template format.

## Template

- Uploaded files inspected:
  - `jntexportfile.xlsx`
  - `jntexportfile.xls`
- Copied export bases into:
  - `data/jnt/jntexportfile.xlsx`
  - `data/jnt/jntexportfile.xls`
- Use `data/jnt/jntexportfile.xlsx` as the export base.
- Preserve workbook sheets:
  - `List`
  - `Addressing guide`
  - `Dịch vụ`
- Preserve `List` rows 1 to 8.
- Headers are on row 8.
- Clear sample rows 9 and 10.
- Write real orders starting at row 9.

## Export Mapping

`List` sheet columns:

- A `Receiver(*)`: customer full name
- B `Receiver Telephone (*)`: normalized Philippine phone, `+639XXXXXXXXX`
- C `Receiver Address (*)`: detailed house/street/landmark only
- D `Receiver Province (*)`: saved province
- E `Receiver City (*)`: saved city/municipality
- F `Receiver Region (*)`: saved barangay
- G `Express Type (*)`: `EZ`
- H `Parcel Name (*)`: ordered product names joined by comma
- I `Weight (kg)  (*)`: default `1`
- J `Total parcels(*)`: default `1`
- K `Parcel Value (Insurance Fee) (*)`: order total for now
- L `COD (PHP) (*)`: order total for COD orders, otherwise `0`
- M `Remarks`: variants/sizes and order notes

## Admin Workflow

- Added `Export J&T Excel` button to Orders.
- Added row checkboxes so selected orders can be exported.
- If orders are selected, export selected orders.
- If none are selected, export all unshipped and unexported orders.
- Validate required fields before generating the workbook.
- Return validation errors instead of silently exporting bad data.
- After a successful export, mark exported orders with:
  - `exportedToJnt: true`
  - `jntExportedAt: ISO datetime`
- Do not mark orders as shipped.

## Checkout Address

- Use the J&T `Addressing guide` as the address reference.
- Added `scripts/generate-jnt-address-guide.js`.
- Generated `public/data/jnt-address-guide.json` from the uploaded template.
- Checkout province/city/barangay dropdowns use uppercase J&T values.
- Checkout now uses a single `Full Name` field.
- Checkout now includes optional `Order Notes`.
- Show a warning if door-to-door is not `YES`, but keep the order reviewable.
- Save order notes so they can be exported in J&T `Remarks`.

## Tests

- `node --test test/adminJntExport.test.js`
  - Verify the J&T template sheets and row 8 headers.
  - Verify generated J&T address guide hierarchy.
  - Verify the export route returns an Excel workbook with real order data on row 9.
  - Verify sample rows are not included.
  - Verify missing required fields return validation errors.
- `node --test test/adminOrders.test.js`
  - Verify admin page includes `Export J&T Excel`.
  - Verify admin JS includes selected-order export behavior.
- `node --test test/frontendBehavior.test.js`
  - Verify checkout uses J&T address data, door-to-door warning, full name, and order notes.

## Optional Later Settings

- Admin setting for default express type instead of environment default `JNT_DEFAULT_EXPRESS_TYPE || EZ`.
- Admin setting for insurance value behavior: order total or `0`.
- Admin control to mark exported orders as shipped after manual confirmation.
