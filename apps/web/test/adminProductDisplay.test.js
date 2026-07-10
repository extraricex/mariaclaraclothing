import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminProductDisplayParts,
  cleanAdminProductName,
  truncateAdminProductCode
} from '../src/admin/adminProductDisplay.js';

test('cleanAdminProductName removes catalog slug noise and keeps the actual product name', () => {
  assert.equal(
    cleanAdminProductName('catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1'),
    'MC Curiosity Oversized Fit Shirt'
  );
});

test('adminProductDisplayParts separates clean name, color, size, SKU, and truncated product code', () => {
  const parts = adminProductDisplayParts({
    productName: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
    slug: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
    sku: 'ARISOFF-M',
    size: 'Medium'
  });

  assert.equal(parts.cleanName, 'MC Curiosity Oversized Fit Shirt');
  assert.equal(parts.color, 'Black');
  assert.equal(parts.size, 'Medium');
  assert.equal(parts.sku, 'ARISOFF-M');
  assert.equal(parts.productCode, 'catalog-oversized-fit-shirt-mc-curiosity-black-maria...');
});

test('truncateAdminProductCode keeps short codes intact and ellipsizes long codes', () => {
  assert.equal(truncateAdminProductCode('ARISOFF-M'), 'ARISOFF-M');
  assert.equal(truncateAdminProductCode('x'.repeat(64)), `${'x'.repeat(52)}...`);
});
