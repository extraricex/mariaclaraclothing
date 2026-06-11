# Product Image Database Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the project for GitHub by keeping product image references in the database/data layer, adding an audit tool, and removing only proven local junk.

**Architecture:** Product image records remain in `data/products.json` for seed/backup and in Postgres `product_images` when `DATABASE_URL` is enabled. A dedicated audit script classifies product image URLs and reports missing or unused local upload files before any deletion. GitHub hygiene is handled with `.gitignore` and `README.md`.

**Tech Stack:** Node.js, Express, PostgreSQL schema, built-in `node:test`, filesystem scripts.

---

### Task 1: Add GitHub Hygiene Files

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Add `.gitignore`**

Ignore local secrets, dependency folders, browser profiles, generated screenshots, logs, and OS files.

- [ ] **Step 2: Add `README.md`**

Document setup, environment variables, commands, database seeding, J&T template requirements, and cleanup notes.

### Task 2: Add Product Image Audit Script

**Files:**
- Create: `scripts/audit-product-images.js`
- Modify: `package.json`
- Test: `test/productImageAudit.test.js`

- [ ] **Step 1: Write failing tests**

Tests should prove the script classifies remote images, local upload images, missing local files, and unused files inside `public/uploads/products`.

- [ ] **Step 2: Implement the audit module**

Export `auditProductImages(options)` and support CLI output. The audit should never delete files.

- [ ] **Step 3: Add npm script**

Add `audit:product-images` to run the script.

### Task 3: Verify Database Image Source

**Files:**
- Test: `test/postgresPersistence.test.js`
- Possibly modify: `db/schema.sql`, `scripts/db-seed.js`

- [ ] **Step 1: Verify schema already has `product_images`**

Confirm product image records are stored separately from products.

- [ ] **Step 2: Verify seed uses `replaceEditableProducts`**

Confirm all product image records from `data/products.json` are written through the repository path that saves `product_images`.

### Task 4: Safe Cleanup

**Files/Directories:**
- Remove local artifacts only after tests pass.

- [ ] **Step 1: Run focused tests**

Run `node --test test/productImageAudit.test.js test/postgresPersistence.test.js`.

- [ ] **Step 2: Run image audit**

Run `npm run audit:product-images`.

- [ ] **Step 3: Remove safe junk**

Remove `.DS_Store`, `public/.DS_Store`, hidden root screenshots, `.playwright-profile/`, and `.superpowers/`.

- [ ] **Step 4: Do not remove protected files**

Keep `public/uploads/products/oranges-mcc-box-tee-1781162364372-494817ca92b258.png`, `data/jnt/`, active brand assets, source, tests, and docs.

### Task 5: Final Verification

**Files:**
- All project files.

- [ ] **Step 1: Run full test suite**

Run `npm test`.

- [ ] **Step 2: Summarize cleanup**

Report what was added, what was removed, and which image files remain protected.
