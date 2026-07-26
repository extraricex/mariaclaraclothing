const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  abbreviatedNumber,
  annotateProductsWithCommerceStats,
  calculateAvailableStock,
  soldDisplayText
} = require('../src/products/productCommerceStatsService');
const { productSalesSummaries } = require('../src/orders/orderRepository');

function product(stock, overrides = {}) {
  return {
    id: 'catalog-shirt',
    slug: 'shirt',
    publicHandle: 'shirt',
    createdAt: '2026-07-10T00:00:00.000Z',
    variants: stock.map((quantity, index) => ({
      sku: `SHIRT-${index}`,
      stockQuantity: quantity
    })),
    commerceStats: {},
    historicalSoldQuantity: 0,
    ...overrides
  };
}

function settings(overrides = {}) {
  return {
    productCardSalesInformation: {
      showRemainingStockGlobally: true,
      showSoldCountGlobally: true,
      defaultLowStockThreshold: 10,
      hideExactStockAboveThreshold: true,
      showInStockAboveThreshold: true,
      showNewWhenSoldCountZero: true,
      newProductPeriodDays: 30,
      soldCountFormatting: 'exact',
      includeVerifiedHistoricalSales: true,
      ...overrides
    }
  };
}

async function annotate(record, eligibleQuantity = 0, globalOverrides = {}) {
  const [result] = await annotateProductsWithCommerceStats([record], {
    settings: settings(globalOverrides),
    salesSummaries: new Map([['catalog-shirt', {
      eligibleQuantity,
      refundReturnDeduction: 0
    }]]),
    now: () => new Date('2026-07-26T00:00:00.000Z')
  });
  return result;
}

test('stock display uses real summed sellable variant inventory', async () => {
  assert.equal(calculateAvailableStock(product([3, 3, -5])), 6);
  assert.equal(calculateAvailableStock(product([5, 4], {
    variants: [
      { stockQuantity: 5, active: false },
      { stockQuantity: 4, sellable: true }
    ]
  })), 4);

  assert.equal((await annotate(product([0]))).stockDisplayText, 'Sold out');
  assert.equal((await annotate(product([1]))).stockDisplayText, 'Only 1 left');
  assert.equal((await annotate(product([2, 4]))).stockDisplayText, 'Only 6 left');
  assert.equal((await annotate(product([20, 15]))).stockDisplayText, 'In stock');
  assert.equal((await annotate(product([20, 15]), 0, {
    hideExactStockAboveThreshold: false
  })).stockDisplayText, '35 in stock');
});

test('sold display is exact, truthful, plural-safe, and optionally abbreviated', async () => {
  assert.equal((await annotate(product([20]), 0)).soldDisplayText, 'New');
  assert.equal((await annotate(product([20]), 1)).soldDisplayText, '1 sold');
  assert.equal((await annotate(product([20]), 187)).soldDisplayText, '187 sold');
  assert.equal((await annotate(product([20]), 1204)).soldDisplayText, '1,204 sold');
  assert.equal((await annotate(product([20]), 1204, {
    soldCountFormatting: 'abbreviated'
  })).soldDisplayText, '1.2K sold');
  assert.equal(abbreviatedNumber(1000), '1K');
  assert.equal(soldDisplayText(0, 'exact', false), '');
});

test('verified historical sales are added only when the global setting allows them', async () => {
  const record = product([12], { historicalSoldQuantity: 120 });
  const included = await annotate(record, 42);
  const excluded = await annotate(record, 42, { includeVerifiedHistoricalSales: false });
  assert.equal(included.websiteSoldQuantity, 42);
  assert.equal(included.displayedSoldQuantity, 162);
  assert.equal(included.soldDisplayText, '162 sold');
  assert.equal(excluded.displayedSoldQuantity, 42);
});

test('cancelled, returned, refunded, failed, pending-payment, and test orders are not eligible sales', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-verified-sales-'));
  const ordersFile = path.join(directory, 'orders.json');
  const previous = process.env.ORDERS_DATA_FILE;
  process.env.ORDERS_DATA_FILE = ordersFile;
  const order = (orderNumber, status, paymentStatus, quantity, extra = {}) => ({
    orderNumber,
    status,
    paymentStatus,
    items: [{ productId: 'catalog-shirt', quantity }],
    ...extra
  });
  await fs.writeFile(ordersFile, JSON.stringify({
    orders: [
      order('COD-1', 'confirmed', 'cod_pending', 2),
      order('PAY-1', 'confirmed', 'paid', 3),
      order('PARTIAL-1', 'confirmed', 'partially_refunded', 4),
      order('CANCEL-1', 'cancelled', 'cod_pending', 10),
      order('RETURN-1', 'returned', 'paid', 5),
      order('REFUND-1', 'confirmed', 'refunded', 6),
      order('FAILED-1', 'failed', 'failed', 7),
      order('PENDING-1', 'pending_payment', 'pending_payment', 8),
      order('TEST-1', 'confirmed', 'paid', 9, { isTestOrder: true })
    ]
  }));

  try {
    const summaries = await productSalesSummaries();
    assert.deepEqual(summaries.get('catalog-shirt'), {
      eligibleQuantity: 9,
      refundReturnDeduction: 11
    });
  } finally {
    if (previous === undefined) delete process.env.ORDERS_DATA_FILE;
    else process.env.ORDERS_DATA_FILE = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
