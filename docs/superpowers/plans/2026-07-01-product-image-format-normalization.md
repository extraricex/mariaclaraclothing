# Product Image Format Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept large common photo formats and store optimized, customer-safe WebP images.

**Architecture:** Multer keeps incoming files on disk with a 40 MB per-file limit. A focused Sharp normalizer validates bytes, auto-orients, resizes to 2400×2400, converts to WebP, mutates upload file records for existing cleanup paths, and preserves multipart order.

**Tech Stack:** Express, Multer, Sharp, React, Node test runner, Playwright, Docker Compose.

**Git constraint:** No Git operations.

---

### Task 1: Normalizer and upload limits

**Files:**
- Create: `apps/api/src/images/productImageNormalizer.js`
- Create: `apps/api/test/productImageNormalizer.test.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

- [ ] Write a failing test that copies real JPEG/PNG fixtures to a temp directory, normalizes them, and asserts `.webp`, `format === 'webp'`, width/height ≤ 2400, ordered records, and original removal.
- [ ] Verify RED because the normalizer does not exist.
- [ ] Install `sharp` in the API workspace.
- [ ] Implement `normalizeProductUploads(files)` using `sharp(file.path).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90 })`.
- [ ] On each success, delete the original and mutate `file.path`, `file.filename`, and `file.mimetype` to the optimized output so existing cleanup handles failures.
- [ ] Raise Multer product `fileSize` to 40 MB and accept common raster MIME types/extensions.
- [ ] Await normalization in both new-product creation and existing-product image upload before building image records.
- [ ] Verify GREEN and run focused admin product API tests.

### Task 2: Client compatibility

**Files:**
- Modify: `apps/web/test/newProductMedia.test.js`
- Modify: `apps/web/src/admin/newProductMedia.js`
- Modify: `apps/web/src/admin/QueuedProductMedia.jsx`
- Modify: `apps/web/src/admin/ProductEditor.jsx`

- [ ] Change tests first to accept a 13 MB JPEG, reject only above 40 MB, and require the common format accept string.
- [ ] Verify RED against the old 5 MB limit.
- [ ] Raise `MAX_PRODUCT_IMAGE_BYTES` to 40 MB and update the error text.
- [ ] Use `image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff,.jpg,.jpeg,.png,.webp,.avif,.gif,.tif,.tiff` on new and existing product inputs.
- [ ] Verify GREEN and run all web source/unit tests.

### Task 3: Real large-image browser verification

**Files:**
- Modify: `apps/web/e2e/new-product-media.spec.js`

- [ ] Add a failing browser test that selects the real 13 MB JPEG and PNG fixture together, completes a valid Active product, saves, and expects two `.webp` image URLs in original selection order.
- [ ] Verify RED against the current 5 MB browser limit.
- [ ] Rebuild web/API containers and verify GREEN.
- [ ] Delete the test product in `finally`.

### Task 4: Full verification

- [ ] Run complete API and web tests.
- [ ] Run the production web build.
- [ ] Rebuild and restart web/API Docker services.
- [ ] Verify Docker status, storefront HTTP 200, and API health.
- [ ] Run product-media, cursor, accessibility, and responsive browser suites.
- [ ] Do not run Git cleanup; remove only clearly test-generated untracked files with filesystem edits.
