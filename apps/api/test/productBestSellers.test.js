const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateBestSellerCounts, successfulOrder } = require('../src/routes/products');

test('best seller counts include only successful checkout quantities', () => {
  const products = [
    { id: 'catalog-shirt', slug: 'shirt' },
    { id: 'catalog-pants', slug: 'pants' }
  ];
  const orders = [
    {
      status: 'confirmed',
      paymentStatus: 'cod_pending',
      items: [{ productId: 'catalog-shirt', quantity: 2 }]
    },
    {
      status: 'delivered',
      paymentStatus: 'paid',
      items: [{ productId: 'pants', quantity: 3 }]
    },
    {
      status: 'cancelled',
      paymentStatus: 'cod_pending',
      items: [{ productId: 'catalog-shirt', quantity: 9 }]
    },
    {
      status: 'confirmed',
      paymentStatus: 'unpaid',
      items: [{ productId: 'catalog-pants', quantity: 9 }]
    }
  ];

  assert.equal(successfulOrder(orders[0]), true);
  assert.equal(successfulOrder(orders[2]), false);
  assert.equal(successfulOrder(orders[3]), false);
  assert.deepEqual(
    annotateBestSellerCounts(products, orders).map(({ id, successfulOrderCount }) => ({ id, successfulOrderCount })),
    [
      { id: 'catalog-shirt', successfulOrderCount: 2 },
      { id: 'catalog-pants', successfulOrderCount: 3 }
    ]
  );
});
