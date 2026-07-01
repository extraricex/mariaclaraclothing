# New Product Media and Collection Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators upload customer-facing photos and select multiple storefront collections while creating a product, without redesigning the current editor.

**Architecture:** Extend the existing product-create route to accept either its current JSON body or a multipart body containing serialized product data and image files. Keep new-product file validation and `FormData` construction in a small web helper, queue local previews in `ProductEditor`, and isolate the accessible multi-select collection UI in its own component.

**Tech Stack:** React 18, React Router, browser `FormData` and object URLs, Express 4, Multer 2, Node test runner, Playwright, Vite, Docker Compose.

---

### Task 1: Multipart Product Creation API

**Files:**
- Modify: `apps/api/test/adminProducts.test.js`
- Modify: `apps/api/src/routes/admin.js`

- [ ] **Step 1: Write failing multipart creation and cleanup tests**

In the existing authenticated product CRUD test, add a unique multipart product before the normal JSON-created `admin-test-shirt`:

```js
const multipartProduct = {
  slug: 'multipart-product-shirt',
  name: 'Multipart Product Shirt',
  description: 'Created with customer photos.',
  collections: ['New Arrivals', 'Freedom of Mind'],
  status: 'active',
  priceCents: 89900,
  images: [],
  variants: [{ size: 'm', sku: 'MULTIPART-M', stockQuantity: 5 }]
};
const multipartBody = new FormData();
multipartBody.append('product', JSON.stringify(multipartProduct));
multipartBody.append('images', new Blob([Buffer.from('front bytes')], { type: 'image/png' }), 'front.png');
multipartBody.append('images', new Blob([Buffer.from('back bytes')], { type: 'image/jpeg' }), 'back.jpg');

const multipartResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, {
  method: 'POST',
  headers: adminRequest().headers,
  body: multipartBody
});
const multipartJson = await multipartResponse.json();

assert.equal(multipartResponse.status, 201);
assert.deepEqual(multipartJson.product.collections, ['New Arrivals', 'Freedom of Mind']);
assert.equal(multipartJson.product.images.length, 2);
assert.deepEqual(multipartJson.product.images.map((image) => image.sortOrder), [0, 1]);
assert.ok(multipartJson.product.images.every((image) => image.altText === multipartProduct.name));
assert.match(multipartJson.product.images[0].url, /^\/uploads\/products\//);

const multipartStorefrontResponse = await fetch(`http://127.0.0.1:${port}/api/products/multipart-product-shirt`);
const multipartStorefrontJson = await multipartStorefrontResponse.json();
assert.equal(multipartStorefrontResponse.status, 200);
assert.deepEqual(
  multipartStorefrontJson.product.images.map((image) => image.url),
  multipartJson.product.images.map((image) => image.url)
);

const filesBeforeFailedCreate = await fs.readdir(process.env.PRODUCT_UPLOAD_DIR);
const invalidBody = new FormData();
invalidBody.append('product', JSON.stringify({ ...multipartProduct, slug: 'invalid-multipart', priceCents: -1 }));
invalidBody.append('images', new Blob([Buffer.from('orphan bytes')], { type: 'image/png' }), 'orphan.png');
const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, {
  method: 'POST',
  headers: adminRequest().headers,
  body: invalidBody
});
assert.equal(invalidResponse.status, 400);
assert.deepEqual(await fs.readdir(process.env.PRODUCT_UPLOAD_DIR), filesBeforeFailedCreate);
```

- [ ] **Step 2: Run the focused API test and verify RED**

Run:

```bash
node --test --test-name-pattern="admin product CRUD" apps/api/test/adminProducts.test.js
```

Expected: FAIL because multipart `req.body` is not parsed into a product and uploaded images are not attached during product creation.

- [ ] **Step 3: Add multipart-compatible creation helpers**

In `apps/api/src/routes/admin.js`, add these helpers beside `productUploadUrl`:

```js
function multipartProductBody(req) {
  if (!req.is('multipart/form-data')) return req.body || {};
  try {
    return JSON.parse(String(req.body?.product || '{}'));
  } catch {
    const error = new Error('Product data is invalid JSON');
    error.status = 400;
    throw error;
  }
}

function uploadedProductImages(files, productName) {
  return (Array.isArray(files) ? files : []).map((file, index) => ({
    url: productUploadUrl(file.filename),
    altText: String(productName || 'Product image').trim(),
    sortOrder: index
  }));
}

function removeUploadedProductFiles(files) {
  (Array.isArray(files) ? files : []).forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });
}
```

Replace the create route with a Multer-enabled, backward-compatible handler:

```js
router.post('/products', upload.array('images', 8), async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  let product;
  try {
    const incoming = multipartProductBody(req);
    if (req.is('multipart/form-data') && !files.length) {
      const error = new Error('Add at least one product photo before saving');
      error.status = 400;
      throw error;
    }
    const images = files.length ? uploadedProductImages(files, incoming.name) : incoming.images;
    product = await saveEditableProduct(withSyncedStorefrontProductPage(normalizeProductRequest({
      ...incoming,
      images
    })));
  } catch (error) {
    try {
      removeUploadedProductFiles(files);
    } catch (cleanupError) {
      cleanupError.cause = error;
      return next(cleanupError);
    }
    return next(error);
  }
  return res.status(201).json({
    product,
    summary: productSummary(await listEditableProducts(), await activeLowStockThreshold())
  });
});
```

Do not change `POST /products/:slug/images`; existing-product uploads continue to use it.

- [ ] **Step 4: Run focused and complete API tests**

Run:

```bash
node --test --test-name-pattern="admin product CRUD" apps/api/test/adminProducts.test.js
npm test
```

Expected: both commands PASS, including JSON product creation compatibility and multipart storefront image assertions.

- [ ] **Step 5: Commit the API change**

```bash
git add apps/api/src/routes/admin.js apps/api/test/adminProducts.test.js
git commit -m "feat: create products with uploaded media"
```

### Task 2: New-Product Media Queue

**Files:**
- Create: `apps/web/src/admin/newProductMedia.js`
- Create: `apps/web/test/newProductMedia.test.js`
- Create: `apps/web/e2e/new-product-media.spec.js`
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/test/adminProductsSource.test.js`

- [ ] **Step 1: Write failing media-helper tests**

Create `apps/web/test/newProductMedia.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNewProductBody, validateQueuedProductFiles } from '../src/admin/newProductMedia.js';

function image(name, type = 'image/png', size = 4) {
  return new File([new Uint8Array(size)], name, { type });
}

test('new product media accepts at most eight images of five MB each', () => {
  const front = image('front.png');
  assert.deepEqual(validateQueuedProductFiles([], [front]), [front]);
  assert.throws(() => validateQueuedProductFiles([], [image('notes.txt', 'text/plain')]), /image files/i);
  assert.throws(() => validateQueuedProductFiles([], [image('large.png', 'image/png', (5 * 1024 * 1024) + 1)]), /5 MB/i);
  assert.throws(() => validateQueuedProductFiles([], Array.from({ length: 9 }, (_, i) => image(`${i}.png`))), /eight/i);
});

test('new product body carries serialized product and ordered images', () => {
  const files = [image('front.png'), image('back.png')];
  const body = buildNewProductBody({ name: 'Queued Shirt', collections: ['New Arrivals'] }, files);
  assert.deepEqual(JSON.parse(body.get('product')).collections, ['New Arrivals']);
  assert.deepEqual(body.getAll('images').map((file) => file.name), ['front.png', 'back.png']);
});
```

Also create `apps/web/e2e/new-product-media.spec.js` before implementation:

```js
import { test, expect } from '@playwright/test';

test('new product queues and removes a customer photo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
  await page.goto('/admin/products/new');

  await page.getByLabel('Add photos').setInputFiles({
    name: 'customer-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('customer photo')
  });
  await expect(page.getByAltText('Customer product preview')).toBeVisible();

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByAltText('Customer product preview')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
node --test apps/web/test/newProductMedia.test.js
npm run test:e2e -w apps/web -- e2e/new-product-media.spec.js
```

Expected: the helper test FAILS with `ERR_MODULE_NOT_FOUND`; the browser test FAILS because new-product media is disabled.

- [ ] **Step 3: Implement the media helper**

Create `apps/web/src/admin/newProductMedia.js`:

```js
export const MAX_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateQueuedProductFiles(currentFiles, incomingFiles) {
  const next = [...currentFiles, ...incomingFiles];
  if (next.length > MAX_PRODUCT_IMAGES) throw new Error('Choose no more than eight product photos.');
  if (next.some((file) => !String(file.type || '').startsWith('image/'))) {
    throw new Error('Only image files can be used as product photos.');
  }
  if (next.some((file) => Number(file.size) > MAX_PRODUCT_IMAGE_BYTES)) {
    throw new Error('Each product photo must be 5 MB or smaller.');
  }
  return next;
}

export function buildNewProductBody(product, files) {
  const body = new FormData();
  body.append('product', JSON.stringify(product));
  files.forEach((file) => body.append('images', file));
  return body;
}
```

- [ ] **Step 4: Wire queued files and previews into `ProductEditor`**

Import `buildNewProductBody` and `validateQueuedProductFiles`. Add state and cleanup:

```jsx
const [queuedImages, setQueuedImages] = useState([]);
const queuedImagesRef = useRef([]);

useEffect(() => {
  queuedImagesRef.current = queuedImages;
}, [queuedImages]);

useEffect(() => () => {
  queuedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
}, []);

function queueNewProductImages(files) {
  try {
    const accepted = validateQueuedProductFiles(queuedImages.map((image) => image.file), [...files]);
    const existingCount = queuedImages.length;
    setQueuedImages([
      ...queuedImages,
      ...accepted.slice(existingCount).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    ]);
    setMessage('');
  } catch (error) {
    setMessage(error.message);
  }
}

function removeQueuedImage(index) {
  setQueuedImages((current) => current.filter((image, imageIndex) => {
    if (imageIndex === index) URL.revokeObjectURL(image.previewUrl);
    return imageIndex !== index;
  }));
}
```

Before sending a new product, require a queued image and submit multipart data:

```jsx
if (isNew && !queuedImages.length) {
  setMessage('Add at least one product photo before saving.');
  return;
}

if (isNew) {
  const body = await adminJson('/api/admin/products', {
    method: 'POST',
    body: buildNewProductBody(payload, queuedImages.map((image) => image.file))
  });
  queuedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  navigate(`/admin/products/${encodeURIComponent(body.product.slug)}`, { replace: true });
} else {
  // retain the existing PUT branch unchanged
}
```

Change the existing Media file input so new products call `queueNewProductImages` and existing products call `uploadImages`. Remove the disabled new-product state and the “Save this product before adding photos” message. In the current photo grid, render `queuedImages` for new products using the same `figure` styling and a Remove photo button connected to `removeQueuedImage`. Keep the existing product grid unchanged.

- [ ] **Step 5: Extend the editor source regression**

Add assertions to `apps/web/test/adminProductsSource.test.js`:

```js
assert.match(source, /queuedImages/);
assert.match(source, /queueNewProductImages/);
assert.match(source, /removeQueuedImage/);
assert.match(source, /buildNewProductBody/);
assert.match(source, /Add at least one product photo before saving/);
assert.doesNotMatch(source, /Save this product before uploading photos/);
```

- [ ] **Step 6: Run web tests and commit**

Run:

```bash
node --test apps/web/test/newProductMedia.test.js apps/web/test/adminProductsSource.test.js
node --test apps/web/test/*.test.js
npm run test:e2e -w apps/web -- e2e/new-product-media.spec.js
```

Expected: all web source and helper tests PASS.

```bash
git add apps/web/src/admin/newProductMedia.js apps/web/src/admin/ProductEditor.jsx apps/web/test/newProductMedia.test.js apps/web/test/adminProductsSource.test.js apps/web/e2e/new-product-media.spec.js
git commit -m "feat: queue media for new products"
```

### Task 3: Multi-Select Collection Dropdown

**Files:**
- Create: `apps/web/src/admin/CollectionDropdown.jsx`
- Modify: `apps/web/src/admin/ProductEditor.jsx`
- Modify: `apps/web/test/adminProductsSource.test.js`

- [ ] **Step 1: Write failing source expectations**

Add these assertions to the product-editor source test and load `CollectionDropdown.jsx` in the same test:

```js
const collectionDropdown = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'CollectionDropdown.jsx'), 'utf8');
assert.match(source, /<CollectionDropdown/);
assert.doesNotMatch(source, /COLLECTIONS\.map\(\(collection\)/);
assert.match(collectionDropdown, /aria-haspopup="listbox"/);
assert.match(collectionDropdown, /aria-multiselectable="true"/);
assert.match(collectionDropdown, /New Arrivals/);
assert.match(collectionDropdown, /Freedom of Mind/);
assert.match(collectionDropdown, /event\.key === 'Escape'/);
```

Append the collection behavior test to `apps/web/e2e/new-product-media.spec.js`:

```js
test('new product selects multiple storefront collections', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
  await page.goto('/admin/products/new');
  await page.getByRole('button', { name: 'Select collections' }).click();
  await page.getByLabel('New Arrivals').check();
  await page.getByLabel('Freedom of Mind').check();
  await expect(page.getByRole('button', { name: /New Arrivals, Freedom of Mind/ })).toBeVisible();
});
```

- [ ] **Step 2: Run the source test and verify RED**

Run:

```bash
node --test apps/web/test/adminProductsSource.test.js
npm run test:e2e -w apps/web -- e2e/new-product-media.spec.js --grep "selects multiple"
```

Expected: source test FAILS because `CollectionDropdown.jsx` does not exist, and browser test FAILS because the dropdown button does not exist.

- [ ] **Step 3: Build the accessible dropdown**

Create `apps/web/src/admin/CollectionDropdown.jsx` with a controlled button/menu component:

```jsx
import { useEffect, useRef, useState } from 'react';

export const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];

export default function CollectionDropdown({ value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  function toggle(name) {
    onChange(value.includes(name) ? value.filter((item) => item !== name) : [...value, name]);
  }

  return (
    <div
      ref={rootRef}
      className="relative mt-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        className="field flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value.length ? value.join(', ') : 'Select collections'}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full border border-line bg-paper p-2 shadow-lg" role="listbox" aria-multiselectable="true">
          {STOREFRONT_COLLECTIONS.map((name) => (
            <label key={name} className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-cream">
              <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} />
              {name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace only the current collection checkboxes**

Import `CollectionDropdown` in `ProductEditor.jsx`, remove the local `COLLECTIONS` constant, and replace the checkbox map inside the existing Collections section:

```jsx
<CollectionDropdown
  value={product.collections || []}
  onChange={(collections) => update('collections', collections)}
/>
```

Do not move, rename, or restyle the surrounding Collections card.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
node --test apps/web/test/adminProductsSource.test.js
node --test apps/web/test/*.test.js
npm run test:e2e -w apps/web -- e2e/new-product-media.spec.js
```

Expected: all web tests PASS.

```bash
git add apps/web/src/admin/CollectionDropdown.jsx apps/web/src/admin/ProductEditor.jsx apps/web/test/adminProductsSource.test.js apps/web/e2e/new-product-media.spec.js
git commit -m "feat: add product collection dropdown"
```

### Task 4: Complete Verification and Local Deployment

**Files:**
- Verify only; no production files are added in this task.

- [ ] **Step 1: Run complete automated verification**

```bash
npm test
node --test apps/web/test/*.test.js
npm run build:web
git diff --check
```

Expected: API suite PASS, web suite PASS, Vite production build succeeds, and `git diff --check` reports no errors.

- [ ] **Step 2: Rebuild Docker and verify live services**

```bash
docker compose build web api
docker compose up -d web api
docker compose ps
curl -fsS http://127.0.0.1:8081/ >/dev/null
curl -fsS http://127.0.0.1:3000/api/health
npm run test:e2e -w apps/web -- e2e/new-product-media.spec.js
```

Expected: web/API/Postgres are running, storefront returns HTTP 200, API returns `{"ok":true,...}`, and both live browser regressions pass.

- [ ] **Step 3: Preserve generated build artifacts and verify branch state**

```bash
git stash push -u -m "preserve new product media verification artifacts" -- apps/web/dist
git status --short
git log -4 --oneline
```

Expected: only the unrelated pre-existing deletion of `docs/ua-worldwide-clean-storefront-recommendation.md` remains in the working tree, and the feature commits are on `codex-edits`.
