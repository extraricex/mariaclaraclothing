import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('admin discounts create form exposes promo management fields', async () => {
  const source = await readFile(path.join(root, 'admin', 'Discounts.jsx'), 'utf8');

  assert.match(source, /Create promo/);
  assert.match(source, /Promo name/);
  assert.match(source, /Promo description/);
  assert.match(source, /Promo method/);
  assert.match(source, /Automatic promo/);
  assert.match(source, /Discount code/);
  assert.match(source, /Buy More Save More/);
  assert.match(source, /Free shipping/);
  assert.match(source, /Bundle discount/);
  assert.match(source, /Banner text/);
  assert.match(source, /Terms or notes/);
  assert.match(source, /Notification priority/);
  assert.match(source, /Minimum quantity/);
  assert.match(source, /Start date/);
  assert.match(source, /buildRules/);
  assert.match(source, /bannerText:\s*form\.bannerText/);
  assert.match(source, /priority:\s*Number\(form\.priority/);
  assert.match(source, /rules:\s*buildRules\(form\)/);
});

test('admin discount detail editor preserves and edits promo metadata', async () => {
  const source = await readFile(path.join(root, 'admin', 'DiscountDetail.jsx'), 'utf8');

  assert.match(source, /Promo identity/);
  assert.match(source, /Promo method/);
  assert.match(source, /Promo banner/);
  assert.match(source, /Buy More Save More tiers/);
  assert.match(source, /formFromDiscount/);
  assert.match(source, /name:\s*discount\.name/);
  assert.match(source, /description:\s*discount\.description/);
  assert.match(source, /method:\s*discount\.method/);
  assert.match(source, /bannerText:\s*discount\.bannerText/);
  assert.match(source, /priority:\s*discount\.priority/);
  assert.match(source, /terms:\s*discount\.terms/);
  assert.match(source, /rules:\s*form\.rules/);
  assert.match(source, /minimumQuantity:\s*form\.minimumQuantity/);
  assert.match(source, /startsAt:\s*form\.startsAt/);
  assert.match(source, /Notification priority/);
});
