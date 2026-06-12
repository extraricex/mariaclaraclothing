# Products

Current product catalog module and future product admin foundation.

Editable product records live in PostgreSQL when `DATABASE_URL` is set. Without `DATABASE_URL`, the repository falls back to `data/products.json`. The repository validates those records, and the presenter keeps the customer storefront API stable.

Run `npm run db:migrate` to create PostgreSQL tables, then `npm run db:seed` to import the current JSON catalog.

Visible product page details must map to the future admin product contract in `data/admin-contracts/products.json` and `docs/admin-product-storefront-field-map.md`.
