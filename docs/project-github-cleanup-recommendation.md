# Project GitHub Cleanup Recommendation

Date: 2026-06-11

## Goal

Prepare the Maria Clara webstore project for GitHub upload without breaking the admin website, customer website, J&T export, product data, tests, or local development workflow.

This document is a recommendation only. No source cleanup should be performed until the removal list is approved.

## Current Findings

- The workspace is not currently initialized as a git repository.
- There is no `.gitignore`.
- There is no `README.md`.
- `.env` exists and should not be uploaded to GitHub.
- `node_modules/` exists locally and should not be uploaded.
- Browser automation state exists in `.playwright-profile/` and should not be uploaded.
- Hidden screenshot/reference PNG files exist at the project root and are not needed for the app to run.
- Duplicate J&T template files exist at the project root, while the app uses `data/jnt/jntexportfile.xlsx`.
- `public/` is large because it contains original product/campaign media. Some files are actively referenced and should not be deleted without an asset audit.

## Recommended Approach

Use a conservative cleanup in three stages.

## Stage 1: GitHub Hygiene

Add:

- `.gitignore`
- `README.md`

Recommended `.gitignore` coverage:

- `node_modules/`
- `.env`
- `.DS_Store`
- `.playwright-profile/`
- hidden root screenshots like `.admin-*.png`, `.product-editor-*.png`, `.products-*.png`, `.shopify-login-reference.png`
- local test/browser artifacts
- logs

Recommended README coverage:

- project purpose
- local setup
- required environment variables
- common commands
- admin login note for local development
- J&T export template note
- GitHub upload checklist

## Stage 2: Safe Local Cleanup

These are safe to remove from the upload because they are local/generated artifacts:

- `.DS_Store`
- `public/.DS_Store`
- `node_modules/`
- `.playwright-profile/`
- `.superpowers/`
- `.admin-login-desktop.png`
- `.admin-login-mobile.png`
- `.admin-orders-shopify-desktop.png`
- `.admin-orders-shopify-mobile.png`
- `.admin-orders-simplified-desktop.png`
- `.admin-orders-simplified-mobile.png`
- `.product-editor-desktop.png`
- `.product-editor-mobile.png`
- `.product-editor-tablet.png`
- `.products-admin-review.png`
- `.products-desktop.png`
- `.products-mobile.png`
- `.products-tablet.png`
- `.shopify-login-reference.png`

These files should be removed only after `.gitignore` is added, so they do not return by accident.

## Stage 3: Review Before Removing

These may be removable, but need approval because they are related to business data, docs, or assets:

- Root duplicate J&T templates:
  - `jntexportfile.xls`
  - `jntexportfile.xlsx`
- Old planning docs in `docs/`
- `MD_FILES/`
- large original images in `public/brand/`
- large product images in `public/MANDALA WHITE/`
- `public/data/philippines-addresses.json`

Recommendation:

- Keep `data/jnt/jntexportfile.xlsx` because the J&T export code uses it as the base template.
- Keep `data/jnt/jntexportfile.xls` for now as a backup of the original uploaded template.
- Remove only the root duplicate `jntexportfile.xls` and `jntexportfile.xlsx` after confirming they are exact duplicates or no longer needed.
- Keep `public/data/jnt-address-guide.json` because checkout/admin address dropdowns depend on it.
- Keep `public/data/philippines-addresses.json` only if the older PSGC checkout fallback is still needed. Otherwise, remove it after code references are removed.
- Keep active brand assets currently referenced by the storefront, especially `/brand/hero1v2.jpg` and `/brand/video-poster.mp4`, unless we replace/compress them first.

## Files To Keep

Keep these core folders and files:

- `package.json`
- `package-lock.json`
- `src/`
- `public/`
- `data/products.json`
- `data/orders.json`
- `data/jnt/`
- `db/schema.sql`
- `scripts/`
- `test/`
- `docs/`
- `MD_FILES/` until the user decides whether old documentation should stay
- `.env.example`

Do not upload:

- `.env`

## Risk Notes

- Do not delete product images just because they are large. Product/gallery images may be referenced from `data/products.json`.
- Do not delete `data/jnt/jntexportfile.xlsx`; it is required by `src/jnt/jntExport.js`.
- Do not delete `public/data/jnt-address-guide.json`; checkout and admin address dropdowns rely on it.
- Do not delete tests before GitHub upload. The tests are useful proof that the website still works after cleanup.

## Recommended Next Action

1. Add `.gitignore`.
2. Add `README.md`.
3. Remove safe local artifacts from Stage 2.
4. Run `npm test`.
5. Review duplicate J&T files and large media separately.
6. Initialize git only after the cleanup passes tests.
7. Make the first commit with the cleaned project.

## Approval Needed

Before cleanup starts, approve one of these options:

### Option A: Conservative Cleanup

Add `.gitignore` and `README.md`, remove only safe local artifacts, keep all docs, templates, data, and public assets.

Recommended for the first GitHub upload.

### Option B: Medium Cleanup

Do Option A, then remove root duplicate J&T templates and archive old screenshots/docs after confirming they are not needed.

Recommended after the first safe cleanup passes tests.

### Option C: Aggressive Cleanup

Do Option B, then compress or replace large public assets and remove unused data files.

Not recommended until we run a full asset reference audit and visual check.

## Implementation Result

Implemented on 2026-06-11:

- Added `.gitignore`.
- Added `README.md`.
- Added `scripts/audit-product-images.js`.
- Added `npm run audit:product-images`.
- Added `test/productImageAudit.test.js`.
- Removed safe local artifacts:
  - `.DS_Store`
  - `public/.DS_Store`
  - `.playwright-profile/`
  - `.superpowers/`
  - hidden root screenshot/reference PNG files
- Removed two unused local product upload files:
  - `public/uploads/products/oranges-mcc-box-tee-1780548163165-511a218d8e3ee8.jpg`
  - `public/uploads/products/oranges-mcc-box-tee-1781081590899-7f328e69f1efd.png`
- Kept the protected local product image still referenced by the catalog:
  - `public/uploads/products/oranges-mcc-box-tee-1781162364372-494817ca92b258.png`

Verification:

- `npm run audit:product-images` reports 15 products, 40 image records, 39 remote images, 1 local upload image, 0 missing local files, and 0 unused local upload files.
- `npm test` passes 50 tests.
