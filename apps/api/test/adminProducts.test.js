const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ADMIN_TOKEN = 'local-admin-token';

test('admin products page includes product management controls', async () => {
  const root = path.join(__dirname, '..');
  const adminHtml = await fs.readFile(path.join(root, 'public', 'admin.html'), 'utf8');
  const adminLoginHtml = await fs.readFile(path.join(root, 'public', 'admin-login.html'), 'utf8');
  const adminJs = await fs.readFile(path.join(root, 'public', 'js', 'admin.js'), 'utf8');
  const styles = await fs.readFile(path.join(root, 'public', 'styles.css'), 'utf8');

  assert.match(adminHtml, /cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3/);
  assert.match(adminHtml, /class="admin-frame container-fluid/);
  assert.match(adminHtml, /class="admin-sidebar col-/);
  assert.match(adminHtml, /class="admin-workspace col/);
  assert.match(adminHtml, /navbar navbar-expand/);
  assert.match(adminLoginHtml, /cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3/);
  assert.match(adminHtml, /data-admin-products/);
  assert.match(adminHtml, /data-admin-product-detail/);
  assert.match(adminHtml, /data-admin-nav-link="collections"/);
  assert.match(adminHtml, /data-admin-nav-link="website-content"/);
  assert.match(adminHtml, /data-admin-page="collections"/);
  assert.match(adminHtml, /data-admin-page="website-content"/);
  assert.match(adminHtml, /data-admin-banner-upload/);
  assert.match(adminHtml, /data-admin-banner-list/);
  assert.match(adminHtml, /data-admin-banner-status/);
  assert.match(adminHtml, /data-admin-collection-tabs/);
  assert.match(adminHtml, /data-admin-collection-products/);
  assert.match(adminHtml, /data-admin-collection-add-product/);
  assert.doesNotMatch(adminHtml, /Select a product or create a new one/);
  assert.match(adminHtml, /data-admin-create-product/);
  assert.match(adminHtml, /data-admin-import-products/);
  assert.match(adminHtml, /data-admin-export-products/);
  assert.match(adminHtml, /data-admin-print-products/);
  assert.match(adminHtml, /data-admin-product-more-actions/);
  assert.match(adminHtml, /data-admin-product-search/);
  assert.match(adminHtml, /data-admin-product-status-filter/);
  assert.match(adminHtml, /data-admin-product-category-filter/);
  assert.match(adminHtml, /data-admin-product-stock-filter/);
  assert.match(adminHtml, /data-admin-product-sort/);
  assert.match(adminHtml, /data-admin-product-table-settings/);
  assert.match(adminHtml, /admin-products-page-heading/);
  assert.match(adminHtml, /admin-products-index/);
  assert.match(adminJs, /admin-product-filter-shell/);
  assert.match(adminJs, /ABC product analysis/);
  assert.match(adminJs, /Average sell-through rate/);
  assert.match(adminJs, /35\.09% —/);
  assert.match(adminJs, /₱13,470\.00 A/);
  assert.match(adminJs, /admin-product-abc-bars/);
  assert.match(adminJs, /Search and filter/);
  assert.match(adminHtml, /Recommended settings/);
  assert.match(adminJs, /\/api\/admin\/products/);
  assert.match(adminJs, /STOREFRONT_COLLECTIONS/);
  assert.match(adminJs, /loadCollectionsPage/);
  assert.match(adminJs, /loadWebsiteContentPage/);
  assert.match(adminJs, /uploadHomepageBannerImages/);
  assert.match(adminJs, /saveHomepageBanners/);
  assert.match(adminJs, /\/api\/admin\/site-content\/homepage-banners/);
  assert.match(adminJs, /addProductToActiveCollection/);
  assert.match(adminJs, /removeProductFromActiveCollection/);
  assert.match(adminJs, /method:\s*'POST'/);
  assert.match(adminJs, /'PUT'/);
  assert.match(adminJs, /method:\s*'DELETE'/);
  assert.match(adminJs, /data-admin-product-form/);
  assert.match(adminJs, /setProductEditingMode/);
  assert.match(adminJs, /data-admin-product-back/);
  [
    'Description editor',
    'Category metafields',
    'Search engine listing',
    'Sales past 90 days',
    'Theme template',
    'data-admin-rich-editor-toolbar',
    'contenteditable="true"',
    'applyDescriptionCommand',
    'getProductDescriptionFromEditor',
    'data-admin-delete-variant',
    'data-admin-seo-preview',
    'updateSeoPreview',
    'data-admin-product-sidebar',
    'data-admin-duplicate-product',
    'data-admin-product-seo-title',
    'data-admin-product-vendor',
    'data-admin-product-type',
    'data-admin-product-tags',
    'data-admin-product-metafield'
  ].forEach((pattern) => assert.match(adminJs, new RegExp(pattern)));
  assert.match(adminJs, /data-admin-product-image-upload/);
  assert.match(adminJs, /data-admin-product-image-alt/);
  assert.match(adminJs, /data-admin-delete-product-image/);
  assert.match(adminJs, /uploadProductImages/);
  assert.match(adminJs, /\/images/);
  assert.doesNotMatch(adminJs, /<span>URL slug<\/span>/);
  assert.match(adminJs, /admin-product-table/);
  assert.match(adminJs, /table table-hover align-middle/);
  assert.match(adminJs, /btn btn-dark/);
  assert.match(adminJs, /btn btn-outline-secondary/);
  assert.match(adminJs, /card admin-editor-section/);
  assert.doesNotMatch(adminJs, /Select a product or create a new one/);
  assert.match(adminJs, /Product type/);
  assert.match(adminJs, /Vendor/);
  assert.match(adminJs, /<th>Vendor<\/th>/);
  assert.match(adminJs, /data-admin-cell-label="Vendor"/);
  assert.match(adminJs, /Online Store/);
  assert.match(adminJs, /in stock for/);
  assert.match(adminJs, /renderProductStatus/);
  assert.match(adminJs, /admin-product-status-indicator/);
  assert.match(adminJs, /showAdminToast/);
  assert.match(adminJs, /Changes saved successfully/);
  assert.match(adminJs, /admin-toast/);
  assert.match(adminJs, /formatAdminPesoInput/);
  assert.match(adminJs, /adminPesoToCents/);
  assert.match(adminJs, /name="pricePeso"/);
  assert.doesNotMatch(adminJs, /name="priceCents"/);
  assert.match(adminJs, /selectedProducts/);
  assert.match(adminJs, /data-admin-cell-label="Product"/);
  assert.doesNotMatch(adminJs, /data-admin-cell-label="Actions"/);
  assert.match(styles, /@media \(max-width: 1080px\)/);
  assert.match(styles, /\.admin-product-layout\s*{\s*grid-template-columns: 1fr;/);
  assert.match(styles, /\.admin-product-table\s*{\s*min-width: 1080px;/);
  assert.match(styles, /\.admin-product-summary-card\s*{/);
  assert.match(styles, /\.admin-collections-page\s*{/);
  assert.match(styles, /\.admin-collection-manager\s*{/);
  assert.match(styles, /\.admin-collection-product-row\s*{/);
  assert.match(styles, /\.admin-product-filter-shell\s*{/);
  assert.match(styles, /\.admin-product-table-header\s*{/);
  assert.match(styles, /\.admin-product-thumbnail\s*{/);
  assert.match(styles, /\.admin-products-page\s*{[^}]*overflow-x: hidden;/s);
  assert.match(styles, /\.admin-products-index \.admin-table-scroll\s*{[^}]*overflow-x: auto;/s);
  assert.match(styles, /\.admin-product-editor-shell\s*{[^}]*max-width: 100%;/s);
  assert.match(styles, /\.admin-media-layout\s*{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 420px\);/s);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*\.admin-page-section\.is-product-editing \.admin-product-layout\s*{[\s\S]*padding: 0;/s);
  assert.match(styles, /@media \(max-width: 749px\)[\s\S]*\.admin-product-editor-header \.admin-page-actions\s*{[\s\S]*grid-template-columns: 1fr;/s);
  assert.match(styles, /@media \(max-width: 749px\)[\s\S]*\.admin-product-summary-card\s*{[\s\S]*grid-template-columns: 1fr;/s);
  assert.match(styles, /@media \(max-width: 749px\)[\s\S]*\.admin-media-layout\s*{[\s\S]*grid-template-columns: 1fr;/s);
  assert.match(styles, /min-width: 760px;/);
  assert.match(styles, /grid-template-columns: 44px minmax\(112px, 1fr\)/);
  assert.match(styles, /-webkit-line-clamp: 2/);
  assert.match(styles, /@media \(max-width: 1180px\)/);
  assert.match(styles, /\.admin-product-editor-grid\s*{\s*grid-template-columns: 1fr;/);
  assert.match(styles, /\.admin-variant-table\s*{[^}]*min-width: 620px;/s);
  assert.match(styles, /\.admin-product-editor-header\s*{[^}]*column-gap: 12px;/s);
  assert.match(styles, /\.admin-product-editor-header \.admin-page-actions\s*{[^}]*display: flex;/s);
  assert.match(styles, /\.admin-product-editor-header \.admin-page-actions\s*{[^}]*width: auto;/s);
  assert.match(styles, /\.admin-product-editor-header \.admin-page-actions > \.admin-icon-button\s*{[^}]*width: 40px;/s);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.admin-product-layout\s*{[^}]*padding: 14px;/s);
  assert.match(styles, /\.admin-product-layout\s*{[^}]*padding: 10px;/s);
  assert.match(styles, /@media \(max-width: 749px\)/);
  assert.match(styles, /\.admin-product-table,\s*\.admin-product-table thead,\s*\.admin-product-table tbody,/);
  assert.match(styles, /content: attr\(data-admin-cell-label\)/);
  assert.match(styles, /grid-template-columns: minmax\(104px, 38%\) minmax\(0, 1fr\)/);
  assert.match(styles, /word-break: break-word/);
  assert.match(styles, /\.admin-product-table td > \*/);
  assert.match(styles, /align-self: center/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /\.admin-image-grid\s*{/);
  assert.match(styles, /\.admin-image-upload\s*{/);
  assert.match(styles, /\.admin-page-section\.is-product-editing/);
  assert.match(styles, /\.admin-product-editor-shell\s*{/);
  assert.match(styles, /\.admin-product-editor-grid\s*{/);
  assert.match(styles, /\.admin-product-sidebar\s*{/);
  assert.match(styles, /\.admin-product-status-indicator\s*{/);
  assert.match(styles, /\.admin-product-status-dot\s*{/);
  assert.match(styles, /width: 7px;\s*height: 7px;/);
  assert.match(styles, /\.admin-toast\s*{/);
  assert.match(styles, /\.admin-toast\.is-visible\s*{/);
  assert.match(styles, /\.admin-rich-toolbar\s*{/);
  assert.match(styles, /\.admin-rich-editor\s*{[^}]*white-space: pre-wrap;/s);
  assert.match(styles, /\.admin-status-card\s*{[^}]*display: grid;/s);
  assert.match(styles, /\.admin-status-select-row\s*{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.admin-media-layout\s*{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 420px\);/s);
  assert.match(styles, /\.admin-image-tile-actions\s*{/);
  assert.match(styles, /\.admin-seo-preview\s*{/);
  assert.match(styles, /\.admin-page-actions\s+> \.button,/);
  assert.match(styles, /--button-radius: 10px;/);
  assert.match(styles, /--button-focus-ring:/);
  assert.match(styles, /\.button-danger\s*{/);
  assert.match(styles, /\.button-icon\s*{/);
  assert.match(styles, /\.button-sm\s*{/);
  assert.match(styles, /\.button-lg\s*{/);
  assert.match(styles, /\.button:focus-visible\s*{/);
  assert.match(styles, /\.button\[aria-disabled="true"\],/);
  assert.match(styles, /@media \(max-width: 749px\)[\s\S]*\.button-dark,[\s\S]*\.button-primary,[\s\S]*\.button-outline/s);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /white-space: normal/);
  assert.match(styles, /\.admin-product-editor-header \.admin-page-actions\s*{/);
  assert.match(styles, /\.admin-page \.btn\s*{/);
  assert.match(styles, /\.admin-sidebar\s*{[^}]*box-shadow:/s);
  assert.match(styles, /\.admin-card,\s*\.admin-editor-section\s*{[^}]*border-radius: 12px;/s);
  assert.match(styles, /@media \(max-width: 420px\)/);
});

test('admin product APIs require login and support product management', async () => {
  const previousProductsDataFile = process.env.PRODUCTS_DATA_FILE;
  const previousUploadDir = process.env.PRODUCT_UPLOAD_DIR;
  process.env.PRODUCTS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-products-')), 'products.json');
  process.env.PRODUCT_UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-product-uploads-'));
  await fs.copyFile(path.join(__dirname, '..', 'data', 'products.json'), process.env.PRODUCTS_DATA_FILE);
  const jpegFixture = await fs.readFile(path.join(__dirname, '..', 'public', 'MANDALA WHITE', 'mandala white front.jpg'));
  const pngFixture = await fs.readFile(path.join(__dirname, '..', 'public', 'uploads', 'products', 'oranges-mcc-box-tee-1781162364372-494817ca92b258.png'));

  const app = createFreshApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const rejectedResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`);
    const rejectedBody = await rejectedResponse.json();

    assert.equal(rejectedResponse.status, 401);
    assert.equal(rejectedBody.error, 'Admin authentication is required');

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products?q=curiosity`, adminRequest());
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.ok(listBody.products.length >= 1);
    assert.ok(listBody.summary.total >= listBody.products.length);
    assert.equal(listBody.products[0].channels, 'Online Store');
    assert.ok(listBody.products[0].category);
    assert.ok(listBody.products[0].productType);
    assert.ok(listBody.products[0].vendor);
    assert.ok(Array.isArray(listBody.products[0].variants));
    assert.ok(listBody.products[0].variants[0].id);
    assert.ok(listBody.products[0].variants[0].sku);

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
    const missingImagesBody = new FormData();
    missingImagesBody.append('product', JSON.stringify({ ...multipartProduct, slug: 'missing-images-shirt' }));
    const missingImagesResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, {
      method: 'POST',
      headers: adminRequest().headers,
      body: missingImagesBody
    });
    assert.equal(missingImagesResponse.status, 400);

    const multipartBody = new FormData();
    multipartBody.append('product', JSON.stringify(multipartProduct));
    multipartBody.append('images', new Blob([pngFixture], { type: 'image/png' }), 'front.png');
    multipartBody.append('images', new Blob([jpegFixture], { type: 'image/jpeg' }), 'back.jpg');

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
    assert.match(multipartJson.product.images[0].url, /^\/uploads\/products\/.*-optimized\.webp$/);
    assert.match(multipartJson.product.images[1].url, /^\/uploads\/products\/.*-optimized\.webp$/);

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
    invalidBody.append('images', new Blob([pngFixture], { type: 'image/png' }), 'orphan.png');
    const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, {
      method: 'POST',
      headers: adminRequest().headers,
      body: invalidBody
    });
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await fs.readdir(process.env.PRODUCT_UPLOAD_DIR), filesBeforeFailedCreate);

    const newProduct = {
      slug: 'admin-test-shirt',
      name: 'Admin Test Shirt',
      description: 'Temporary admin product for CRUD testing.',
      collections: ['Admin Tests', 'New Arrivals'],
      status: 'active',
      priceCents: 79900,
      compareAtPriceCents: 99900,
      images: [
        { url: '/product/admin-test-shirt.png', altText: 'Admin Test Shirt', sortOrder: 0 },
        { url: '/product/admin-test-shirt-back.png', altText: 'Admin Test Shirt back', sortOrder: 1 }
      ],
      variants: [
        { size: 'Small', sku: 'ADMIN-TEST-S', stockQuantity: 4 },
        { size: 'Medium', sku: 'ADMIN-TEST-M', stockQuantity: 8 }
      ]
    };

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, jsonAdminRequest('POST', newProduct));
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.product.slug, 'admin-test-shirt');
    assert.equal(createBody.product.images.length, 2);

    const imageUploadBody = new FormData();
    imageUploadBody.append('images', new Blob([pngFixture], { type: 'image/png' }), 'front.png');
    const imageUploadResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt/images`, {
      method: 'POST',
      headers: adminRequest().headers,
      body: imageUploadBody
    });
    const imageUploadJson = await imageUploadResponse.json();

    assert.equal(imageUploadResponse.status, 201);
    assert.equal(imageUploadJson.product.images.length, 3);
    assert.match(imageUploadJson.images[0].url, /^\/uploads\/products\/admin-test-shirt-.*-optimized\.webp$/);
    assert.equal(imageUploadJson.images[0].altText, 'Admin Test Shirt');

    const storefrontAfterImageUploadResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    const storefrontAfterImageUploadBody = await storefrontAfterImageUploadResponse.json();

    assert.equal(storefrontAfterImageUploadResponse.status, 200);
    assert.match(storefrontAfterImageUploadResponse.headers.get('cache-control') || '', /no-store/);
    assert.equal(storefrontAfterImageUploadBody.product.images.length, 3);
    assert.equal(storefrontAfterImageUploadBody.product.images[2].url, imageUploadJson.images[0].url);

    const manyImages = Array.from({ length: 8 }, (_item, index) => ({
      url: `/product/admin-test-shirt-${index + 1}.png`,
      altText: `Admin Test Shirt ${index + 1}`,
      sortOrder: index
    }));
    const imageManyResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt/images`, jsonAdminRequest('PUT', {
      images: manyImages
    }));
    const imageManyBody = await imageManyResponse.json();

    assert.equal(imageManyResponse.status, 200);
    assert.equal(imageManyBody.product.images.length, 8);

    const storefrontAfterManyImagesResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    const storefrontAfterManyImagesBody = await storefrontAfterManyImagesResponse.json();

    assert.equal(storefrontAfterManyImagesResponse.status, 200);
    assert.equal(storefrontAfterManyImagesBody.product.images.length, 8);
    assert.deepEqual(storefrontAfterManyImagesBody.product.images.map((image) => image.url), manyImages.map((image) => image.url));

    const imageEditResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt/images`, jsonAdminRequest('PUT', {
      images: imageManyBody.product.images.map((image, index) => index === 2
        ? { ...image, altText: 'Edited front product photo' }
        : image)
    }));
    const imageEditBody = await imageEditResponse.json();

    assert.equal(imageEditResponse.status, 200);
    assert.equal(imageEditBody.product.images[2].altText, 'Edited front product photo');

    const storefrontAfterImageEditResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    const storefrontAfterImageEditBody = await storefrontAfterImageEditResponse.json();

    assert.equal(storefrontAfterImageEditResponse.status, 200);
    assert.equal(storefrontAfterImageEditBody.product.images[2].altText, 'Edited front product photo');

    const imageDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt/images/2`, {
      method: 'DELETE',
      ...adminRequest()
    });
    const imageDeleteBody = await imageDeleteResponse.json();

    assert.equal(imageDeleteResponse.status, 200);
    assert.equal(imageDeleteBody.deleted, true);
    assert.equal(imageDeleteBody.product.images.length, 7);

    const storefrontAfterImageDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    const storefrontAfterImageDeleteBody = await storefrontAfterImageDeleteResponse.json();

    assert.equal(storefrontAfterImageDeleteResponse.status, 200);
    assert.equal(storefrontAfterImageDeleteBody.product.images.length, 7);
    assert.ok(!storefrontAfterImageDeleteBody.product.images.some((image) => image.url === manyImages[2].url));

    const storefrontCreateResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    const storefrontCreateBody = await storefrontCreateResponse.json();

    assert.equal(storefrontCreateResponse.status, 200);
    assert.equal(storefrontCreateBody.product.name, 'Admin Test Shirt');
    assert.equal(storefrontCreateBody.product.priceCents, 79900);

    const formattedDescription = '  Edited storefront description.\n\n  Keep this indented line exactly.\nFinal line with ending spaces.  ';
    const editResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`, jsonAdminRequest('PUT', {
      ...newProduct,
      name: 'Edited Admin Test Shirt',
      description: formattedDescription,
      status: 'active',
      priceCents: 69900,
      category: 'T-Shirts',
      images: [{ url: '/product/admin-edited.png', altText: 'Edited Admin Test Shirt', sortOrder: 0 }],
      variants: [{
        size: 'Small',
        sku: 'ADMIN-EDIT-S',
        priceCents: 74900,
        stockQuantity: 2,
        externalPosVariantId: 'pancake-source-variant'
      }],
      vendor: 'Maria Clara',
      productType: 'Tshirt',
      tags: ['black', 'cotton'],
      seo: {
        title: 'Edited Admin Test Shirt SEO',
        description: 'SEO description for edited admin product.',
        handle: 'edited-admin-test-shirt'
      },
      productPage: {
        heading: 'Edited Admin Test Shirt',
        intro: formattedDescription,
        detailsText: 'Edited product details for the product tab.',
        shippingText: 'Ships via J&T with COD confirmation before shipping.',
        sections: [
          {
            title: 'Product details',
            items: ['Edited fit', 'Edited fabric']
          }
        ],
        sizeChart: [
          {
            size: 'Small',
            width: '20 in',
            length: '27 in',
            sleeveLength: '8 in',
            shoulderDropLength: '18 in'
          }
        ]
      },
      metafields: {
        color: ['Black'],
        fabric: ['Cotton'],
        targetGender: ['Unisex']
      }
    }));
    const editBody = await editResponse.json();

    assert.equal(editResponse.status, 200);
    assert.equal(editBody.product.name, 'Edited Admin Test Shirt');
    assert.equal(editBody.product.status, 'active');
    assert.equal(editBody.product.description, formattedDescription);
    assert.equal(editBody.product.priceCents, 69900);
    assert.equal(editBody.product.images[0].url, '/product/admin-edited.png');
    assert.equal(editBody.product.variants[0].priceCents, 74900);
    assert.equal(editBody.product.vendor, 'Maria Clara');
    assert.equal(editBody.product.productType, 'Tshirt');
    assert.deepEqual(editBody.product.tags, ['black', 'cotton']);
    assert.equal(editBody.product.seo.title, 'Edited Admin Test Shirt SEO');
    assert.equal(editBody.product.productPage.detailsText, 'Edited product details for the product tab.');
    assert.equal(editBody.product.productPage.shippingText, 'Ships via J&T with COD confirmation before shipping.');
    assert.equal(editBody.product.productPage.sections[0].title, 'Product details');
    assert.equal(editBody.product.productPage.sections[0].body, 'Edited product details for the product tab.');
    assert.equal(editBody.product.productPage.sections[0].items, undefined);
    assert.equal(editBody.product.productPage.sections[1].title, 'Size Chart');
    assert.deepEqual(editBody.product.productPage.sections[1].items, [
      'Small: Width 20 in, Length 27 in, Sleeve length 8 in, Shoulder drop length 18 in'
    ]);
    assert.equal(editBody.product.productPage.sections[2].title, 'Shipping');
    assert.equal(editBody.product.productPage.sections[2].body, 'Ships via J&T with COD confirmation before shipping.');
    assert.deepEqual(editBody.product.productPage.sizeChart[0], {
      size: 'Small',
      width: '20 in',
      length: '27 in',
      sleeveLength: '8 in',
      shoulderDropLength: '18 in'
    });
    assert.deepEqual(editBody.product.metafields.color, ['Black']);

    const storefrontEditResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    const storefrontEditBody = await storefrontEditResponse.json();

    assert.equal(storefrontEditResponse.status, 200);
    assert.equal(storefrontEditBody.product.name, 'Edited Admin Test Shirt');
    assert.equal(storefrontEditBody.product.description, formattedDescription);
    assert.equal(storefrontEditBody.product.priceCents, 69900);
    assert.equal(storefrontEditBody.product.images[0].url, '/product/admin-edited.png');
    assert.equal(storefrontEditBody.product.variants[0].priceCents, 74900);
    assert.equal(storefrontEditBody.product.productPage.heading, 'Edited Admin Test Shirt');
    assert.equal(storefrontEditBody.product.productPage.intro, formattedDescription);
    assert.equal(storefrontEditBody.product.productPage.detailsText, 'Edited product details for the product tab.');
    assert.equal(storefrontEditBody.product.productPage.shippingText, 'Ships via J&T with COD confirmation before shipping.');
    assert.equal(storefrontEditBody.product.productPage.sections[0].body, 'Edited product details for the product tab.');
    assert.equal(storefrontEditBody.product.productPage.sections[0].items, undefined);
    assert.deepEqual(storefrontEditBody.product.productPage.sections[1].items, [
      'Small: Width 20 in, Length 27 in, Sleeve length 8 in, Shoulder drop length 18 in'
    ]);
    assert.equal(storefrontEditBody.product.productPage.sections[2].body, 'Ships via J&T with COD confirmation before shipping.');
    assert.equal(storefrontEditBody.product.productPage.sizeChart[0].shoulderDropLength, '18 in');

    const collectionUpdateResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`, jsonAdminRequest('PUT', {
      ...editBody.product,
      collections: ['Freedom of Mind']
    }));
    const collectionUpdateBody = await collectionUpdateResponse.json();

    assert.equal(collectionUpdateResponse.status, 200);
    assert.deepEqual(collectionUpdateBody.product.collections, ['Freedom of Mind']);

    const collectionListResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products?collection=${encodeURIComponent('Freedom of Mind')}`, adminRequest());
    const collectionListBody = await collectionListResponse.json();

    assert.equal(collectionListResponse.status, 200);
    assert.ok(collectionListBody.products.some((product) => product.slug === 'admin-test-shirt'));

    const categoryListResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products?category=${encodeURIComponent('T-Shirts')}`, adminRequest());
    const categoryListBody = await categoryListResponse.json();

    assert.equal(categoryListResponse.status, 200);
    assert.ok(categoryListBody.products.some((product) => product.slug === 'admin-test-shirt'));

    const vendorListResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products?vendor=${encodeURIComponent('Maria Clara')}`, adminRequest());
    const vendorListBody = await vendorListResponse.json();

    assert.equal(vendorListResponse.status, 200);
    assert.ok(vendorListBody.products.some((product) => product.slug === 'admin-test-shirt'));

    const draftResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`, jsonAdminRequest('PUT', {
      ...collectionUpdateBody.product,
      status: 'draft'
    }));
    const draftBody = await draftResponse.json();

    assert.equal(draftResponse.status, 200);
    assert.equal(draftBody.product.status, 'draft');

    const duplicateResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt/duplicate`, jsonAdminRequest('POST', {
      slug: 'admin-test-shirt-copy',
      name: 'Admin Test Shirt Copy'
    }));
    const duplicateBody = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 201);
    assert.equal(duplicateBody.product.slug, 'admin-test-shirt-copy');
    assert.equal(duplicateBody.product.name, 'Admin Test Shirt Copy');
    assert.equal(duplicateBody.product.status, 'draft');
    assert.equal(duplicateBody.product.variants[0].stockQuantity, 0);
    assert.equal(duplicateBody.product.variants[0].externalPosVariantId, '');
    assert.match(duplicateBody.product.variants[0].sku, /^ADMIN-EDIT-S-COPY-[A-F0-9]{8}$/);

    const originalAfterDuplicateResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`, adminRequest());
    const originalAfterDuplicateBody = await originalAfterDuplicateResponse.json();
    assert.equal(originalAfterDuplicateResponse.status, 200);
    assert.equal(originalAfterDuplicateBody.product.variants[0].sku, 'ADMIN-EDIT-S');
    assert.equal(originalAfterDuplicateBody.product.variants[0].stockQuantity, 2);
    assert.equal(originalAfterDuplicateBody.product.variants[0].externalPosVariantId, 'pancake-source-variant');

    const storefrontDraftResponse = await fetch(`http://127.0.0.1:${port}/api/products/admin-test-shirt`);
    assert.equal(storefrontDraftResponse.status, 404);

    const exportResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/export`, adminRequest());
    const exportBody = await exportResponse.json();
    assert.equal(exportResponse.status, 200);
    assert.ok(exportBody.products.some((product) => product.slug === 'admin-test-shirt'));

    const importProducts = exportBody.products.map((product) => product.slug === 'admin-test-shirt'
      ? { ...product, status: 'active', name: 'Imported Admin Test Shirt' }
      : product);
    const importResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/import`, jsonAdminRequest('POST', { products: importProducts }));
    const importBody = await importResponse.json();

    assert.equal(importResponse.status, 200);
    assert.ok(importBody.products.some((product) => product.name === 'Imported Admin Test Shirt'));

    const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`, {
      method: 'DELETE',
      ...adminRequest()
    });
    const deleteBody = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteBody.deleted, true);

    const deletedResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/admin-test-shirt`, adminRequest());
    assert.equal(deletedResponse.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('PRODUCTS_DATA_FILE', previousProductsDataFile);
    restoreEnv('PRODUCT_UPLOAD_DIR', previousUploadDir);
  }
});

test('admin product stock edits record inventory correction movements', async () => {
  const previousProductsDataFile = process.env.PRODUCTS_DATA_FILE;
  const previousMovementsDataFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-stock-correction-'));

  process.env.PRODUCTS_DATA_FILE = path.join(tempDir, 'products.json');
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'inventory-movements.json');
  await fs.copyFile(path.join(__dirname, '..', 'data', 'products.json'), process.env.PRODUCTS_DATA_FILE);

  const app = createFreshApp();
  const { listInventoryMovements } = require('../src/inventory/inventoryMovementRepository');
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  const product = {
    slug: 'stock-correction-shirt',
    name: 'Stock Correction Shirt',
    description: 'Temporary admin stock product.',
    collections: ['Admin Tests'],
    status: 'active',
    priceCents: 79900,
    images: [{ url: '/product/stock-correction-shirt.png', altText: 'Stock Correction Shirt', sortOrder: 0 }],
    variants: [
      { size: 'Small', sku: 'STOCK-CORRECT-S', stockQuantity: 4 },
      { size: 'Medium', sku: 'STOCK-CORRECT-M', stockQuantity: 8 }
    ]
  };

  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, jsonAdminRequest('POST', product));
    assert.equal(createResponse.status, 201);

    const editResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products/stock-correction-shirt`, jsonAdminRequest('PUT', {
      ...product,
      variants: [
        { size: 'Small', sku: 'STOCK-CORRECT-S', stockQuantity: 7 },
        { size: 'Medium', sku: 'STOCK-CORRECT-M', stockQuantity: 6 }
      ]
    }));
    const editBody = await editResponse.json();
    const movements = await listInventoryMovements();

    assert.equal(editResponse.status, 200);
    assert.equal(editBody.product.variants.find((variant) => variant.sku === 'STOCK-CORRECT-S').stockQuantity, 7);
    assert.ok(movements.some((movement) => movement.reason === 'admin_stock_correction' && movement.sku === 'STOCK-CORRECT-S' && movement.quantityChange === 3));
    assert.ok(movements.some((movement) => movement.reason === 'admin_stock_correction' && movement.sku === 'STOCK-CORRECT-M' && movement.quantityChange === -2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('PRODUCTS_DATA_FILE', previousProductsDataFile);
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previousMovementsDataFile);
  }
});

function adminRequest() {
  return {
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`
    }
  };
}

function jsonAdminRequest(method, body) {
  return {
    method,
    headers: {
      ...adminRequest().headers,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/admin')];
  delete require.cache[require.resolve('../src/routes/products')];
  delete require.cache[require.resolve('../src/products/catalogRepository')];
  delete require.cache[require.resolve('../src/products/catalogPresenter')];
  delete require.cache[require.resolve('../src/inventory/inventoryMovementRepository')];
  return require('../src/app').createApp();
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
