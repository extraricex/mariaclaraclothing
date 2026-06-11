const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('product image audit classifies references and local upload safety', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-image-audit-'));
  const productsPath = path.join(tempDir, 'products.json');
  const publicDir = path.join(tempDir, 'public');
  const uploadsDir = path.join(publicDir, 'uploads', 'products');
  const brandDir = path.join(publicDir, 'brand');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(brandDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, 'used.png'), 'image');
  await fs.writeFile(path.join(uploadsDir, 'unused.png'), 'image');
  await fs.writeFile(path.join(brandDir, 'hero1v2.jpg'), 'image');
  await fs.writeFile(productsPath, JSON.stringify([
    {
      name: 'Audit Shirt',
      images: [
        { url: 'https://cdn.shopify.com/product.jpg', altText: 'Remote', sortOrder: 0 },
        { url: '/uploads/products/used.png', altText: 'Used local', sortOrder: 1 },
        { url: '/uploads/products/missing.png', altText: 'Missing local', sortOrder: 2 },
        { url: '/brand/hero1v2.jpg', altText: 'Local public', sortOrder: 3 }
      ]
    }
  ]), 'utf8');

  const { auditProductImages } = require('../scripts/audit-product-images');
  const audit = await auditProductImages({ productsPath, publicDir });

  assert.deepEqual(audit.summary, {
    products: 1,
    images: 4,
    remote: 1,
    localPublic: 1,
    localUpload: 2,
    missingLocalFiles: 1,
    unusedLocalUploadFiles: 1
  });
  assert.equal(audit.missingLocalFiles[0].url, '/uploads/products/missing.png');
  assert.equal(audit.unusedLocalUploadFiles[0].publicUrl, '/uploads/products/unused.png');
  assert.equal(audit.referencedLocalUploadFiles[0].publicUrl, '/uploads/products/used.png');
});
