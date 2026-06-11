# Shipping Settings Page

## Route
- `/admin.html#shipping-settings`

## Source Files
- `public/admin.html`
- `public/js/admin.js`
- `public/js/checkout.js`
- `public/data/philippines-addresses.json`
- `public/styles.css`

## Purpose
The Shipping Settings page is reserved for configuring shipping fees, delivery estimates, and free shipping rules.

## Current UI
- Page heading: `Shipping Settings`.
- Placeholder text for Metro Manila/Cavite, Luzon, Visayas/Mindanao rates, free shipping rules, and delivery estimates.

## Current Checkout Rules
- Metro Manila and Cavite: PHP 80.
- Luzon outside Metro Manila and Cavite: PHP 120.
- Visayas and Mindanao: PHP 180.
- Free shipping for orders with at least 2 items.

## Planned Features
- Editable region rates.
- Editable free shipping threshold.
- Editable delivery estimates.
- Province/area rule management.

## Notes
- Address dropdowns use the local Philippine address dataset.
