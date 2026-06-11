# Local PSGC Checkout Addresses Design

Date: 2026-06-03

## Goal

Make checkout show complete Philippine province, city/municipality, and barangay choices and calculate shipping from the selected delivery province without depending on live third-party address API calls during checkout.

## Design

Vendor a local PSGC-derived address dataset in `public/data/philippines-addresses.json`. The file will contain:

- `metadata`, including source and generated date.
- `provinces`, including provinces and NCR district/city groupings needed for Metro Manila addresses.
- `cities`, keyed by parent province or NCR grouping code.
- `barangays`, keyed by city/municipality code.

`public/js/checkout.js` will load this local file first. It will keep the current remote PSGC loader only as a secondary fallback, and the current tiny Metro Manila/Cavite data as the final emergency fallback. Shipping calculation will keep the existing storefront rates:

- Metro Manila and Cavite: PHP 80.
- Luzon: PHP 120.
- Visayas and Mindanao: PHP 180.
- Free shipping when cart quantity is at least 2.

The order payload shape remains unchanged.

## Testing

Add frontend contract tests that verify checkout loads `/data/philippines-addresses.json`, contains a local complete-data fallback path, and no longer relies on only the tiny fallback for normal operation. Add a data integrity test that validates the vendored file has broad national coverage, including Metro Manila, Cavite, Cebu, Davao del Sur, Batanes, and Tawi-Tawi, and includes barangays for representative cities/municipalities.

## Out Of Scope

- Changing shipping rates.
- Server-side geocoding or map validation.
- Database persistence for addresses.
- International shipping.
