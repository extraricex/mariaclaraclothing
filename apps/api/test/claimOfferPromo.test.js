const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('claimed 5% code stacks with automatic free shipping', async () => {
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-claim5-'));
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');
  await fs.copyFile(
    path.join(__dirname, 'fixtures', 'claim5-discounts.json'),
    process.env.DISCOUNTS_DATA_FILE
  );

  delete require.cache[require.resolve('../src/discounts/discountRepository')];
  delete require.cache[require.resolve('../src/promos/promoEngine')];
  const { quoteCart } = require('../src/promos/promoEngine');

  try {
    const quote = await quoteCart({
      discountCode: 'CLAIM5',
      shippingFeeCents: 8000,
      items: [{
        productId: 'catalog-shirt',
        variantId: 'catalog-shirt-small',
        productName: 'Shirt',
        quantity: 2,
        unitPriceCents: 64900
      }]
    });

    assert.equal(quote.subtotalCents, 129800);
    assert.equal(quote.discountCode, 'CLAIM5');
    assert.equal(quote.discountTotalCents, 6490);
    assert.equal(quote.freeShippingUnlocked, true);
    assert.equal(quote.shippingFeeCents, 0);
    assert.equal(quote.totalCents, 123310);
    assert.equal(quote.discountSnapshot.method, 'code');
    assert.equal(quote.discountSnapshot.automaticPromos[0].promoId, 'BUY2FREESHIP');
  } finally {
    if (previousDiscountsFile === undefined) {
      delete process.env.DISCOUNTS_DATA_FILE;
    } else {
      process.env.DISCOUNTS_DATA_FILE = previousDiscountsFile;
    }
    delete require.cache[require.resolve('../src/discounts/discountRepository')];
    delete require.cache[require.resolve('../src/promos/promoEngine')];
  }
});
