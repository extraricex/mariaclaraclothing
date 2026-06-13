import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin discounts page exposes Shopify-style views, filters, table, and create panel', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Discounts.jsx'), 'utf8');

  assert.match(source, /DISCOUNT_VIEWS/);
  assert.match(source, /discount-view-tabs/);
  assert.match(source, /discount-filter-toolbar/);
  assert.match(source, /discount-search-field/);
  assert.match(source, /Create discount/);
  assert.match(source, /Generate code/);
  assert.match(source, /Discount method/);
  assert.match(source, /Discount code/);
  assert.match(source, /All/);
  assert.match(source, /Active/);
  assert.match(source, /Scheduled/);
  assert.match(source, /Expired/);
  assert.match(source, /Disabled/);
  assert.match(source, /Method/);
  assert.match(source, /Type/);
  assert.match(source, /Combinations/);
  assert.match(source, /Used/);
  assert.match(source, /Start/);
  assert.match(source, /End/);
  assert.match(source, /Export/);
  assert.match(source, /exportDiscounts/);
  assert.match(source, /disableSelectedDiscounts/);
  assert.match(source, /selectedDiscounts/);
  assert.match(source, /toggleDiscountSelection/);
  assert.match(source, /toggleAllDiscounts/);
  assert.match(source, /visibleDiscounts/);
  assert.match(source, /\/admin\/discounts\/\$\{encodeURIComponent\(discount\.code\)\}/);
});

test('admin discount detail editor exposes Shopify-style editable cards and actions', async () => {
  const appSource = await readFile(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8');
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'DiscountDetail.jsx'), 'utf8');

  assert.match(appSource, /DiscountDetail/);
  assert.match(appSource, /discounts\/:code/);
  assert.match(source, /discount-detail-shell/);
  assert.match(source, /discount-detail-grid/);
  assert.match(source, /Amount off products/);
  assert.match(source, /Discount value/);
  assert.match(source, /Eligibility/);
  assert.match(source, /Minimum purchase/);
  assert.match(source, /Maximum discount uses/);
  assert.match(source, /Active dates/);
  assert.match(source, /Summary/);
  assert.match(source, /Performance/);
  assert.match(source, /Tags/);
  assert.match(source, /Duplicate/);
  assert.match(source, /More actions/);
  assert.match(source, /Save/);
  assert.match(source, /duplicateDiscount/);
  assert.match(source, /deleteDiscount/);
  assert.match(source, /toggleStatus/);
  assert.match(source, /adminSend\('PATCH', `\/api\/admin\/discounts\/\$\{encodeURIComponent\(code\)\}`/);
});
