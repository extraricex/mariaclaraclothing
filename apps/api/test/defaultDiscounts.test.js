const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('default discounts include automatic buy two free shipping promo', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'data', 'discounts.json'), 'utf8');
  const { discounts } = JSON.parse(source);
  const promo = discounts.find((discount) => discount.code === 'BUY2FREESHIP');

  assert.ok(promo);
  assert.equal(promo.name, 'Buy 2 Free Shipping');
  assert.equal(promo.method, 'automatic');
  assert.equal(promo.type, 'buy_more_save_more');
  assert.equal(promo.status, 'active');
  assert.equal(promo.minimumQuantity, 2);
  assert.equal(promo.bannerText, 'Buy 2 or more items and get free shipping');
  assert.deepEqual(promo.rules, [
    {
      minimumQuantity: 2,
      discountType: 'fixed',
      discountValue: 0,
      discountValueCents: 0,
      freeShipping: true
    }
  ]);
});
