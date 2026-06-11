# Product Images Database Cleanup Recommendation

Date: 2026-06-11

## Goal

Move product image ownership into the database so the admin website and customer website use the same product image records, then safely clean local project files before GitHub upload.

Important: storing image URLs in the database is not the same as storing the actual image file. If an image URL points to a local file such as `/uploads/products/example.png`, that physical file must still exist unless we move it to external storage or store image binaries in the database.

## Current State

The project already has database support for product images:

- Table: `product_images`
- Schema file: `db/schema.sql`
- Repository support: `src/products/catalogRepository.js`
- Seed script: `scripts/db-seed.js`

Current product catalog inventory:

- Products: 15
- Product image records: 40
- Remote image URLs: 39
- Local uploaded image URLs: 1

The only local product image currently referenced by product data is:

- Product: `MARIACLARA ORANGE — CROP BOX 240 GSM Shirt`
- URL: `/uploads/products/oranges-mcc-box-tee-1781162364372-494817ca92b258.png`

## What Can Be Safely Moved To Database

These product image fields should live in `product_images`:

- `product_slug`
- `url`
- `alt_text`
- `sort_order`

This is already supported by the database schema. When `DATABASE_URL` is enabled, the app can read product images from Postgres instead of only `data/products.json`.

## What Cannot Be Deleted Yet

Do not delete this local upload file until its image is moved to stable hosting or stored differently:

- `public/uploads/products/oranges-mcc-box-tee-1781162364372-494817ca92b258.png`

Reason:

- The database can store the URL `/uploads/products/oranges-mcc-box-tee-1781162364372-494817ca92b258.png`.
- But the browser still needs the actual image file at that path.
- If the file is deleted from `public/uploads/products`, the image will break on the customer product page.

## Recommended Design

Use the database as the source of truth for product image records, but keep image files in one of these storage locations:

### Recommended Now: Database Records + Keep Local Public Uploads

Use Postgres for all product and image records.

Keep local upload files in `public/uploads/products/` only when a product image URL points there.

Pros:

- Small change.
- Matches the current app structure.
- Admin and customer websites stay synced.
- Safe for first GitHub upload.

Cons:

- Uploaded image files are still inside the repo/public folder.
- Future uploads can grow the repository if not moved to cloud storage later.

### Recommended Later: Database Records + Cloud Image Storage

Use Postgres for product image records, but upload actual image files to a storage service such as Cloudinary, S3, Supabase Storage, or another CDN-backed image host.

Pros:

- Repo stays clean.
- Product images survive deployments.
- Better long-term setup for an online store.

Cons:

- Requires storage account setup.
- Requires upload API changes.
- Requires environment variables and deployment configuration.

### Not Recommended: Store Image Binary Files In Database

Store image bytes directly in Postgres.

Pros:

- No separate file storage.

Cons:

- Bloats the database.
- Makes backups larger.
- Slower for serving images.
- More complex caching.
- Not a good fit for this project.

## Recommended Next Action

Implement the database source-of-truth path first:

1. Keep `data/products.json` as the seed/backup catalog.
2. Use `db/schema.sql` to create the `products`, `product_images`, and `product_variants` tables.
3. Run `npm run db:seed` with `DATABASE_URL` to copy all product records, including images, into Postgres.
4. Run the website with `DATABASE_URL` enabled so admin and customer websites read the same product images from the database.
5. Add a small product image audit script that reports:
   - every product image URL in the database
   - whether it is remote, local public, or local upload
   - whether local upload files exist
   - which local files are unused
6. Only delete local image files that are not referenced by the database or `data/products.json`.

## Cleanup Rule

Safe to delete:

- local image files that are not referenced by either the database or `data/products.json`
- old screenshot/reference PNGs at the project root
- browser cache/profile files
- `node_modules/`

Not safe to delete:

- any file referenced by `product_images.url`
- any file referenced by `data/products.json`
- the J&T template inside `data/jnt/`
- active brand media referenced by storefront pages

## Implementation Recommendation

Choose this implementation order:

1. Add `.gitignore` and `README.md`.
2. Add a product image audit script.
3. Add/verify Postgres image seeding.
4. Run database migration and seed.
5. Run the audit script.
6. Delete only files marked unused by the audit.
7. Run `npm test`.
8. Browser-check the product page for `MARIACLARA ORANGE`.

## Approval Needed

Approve this plan before implementation:

Use Postgres as the source of truth for product image records, keep the one currently referenced local upload file, and add an audit script so future cleanup only removes truly unused images.
