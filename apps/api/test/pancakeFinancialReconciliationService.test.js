const test = require('node:test');
const assert = require('node:assert/strict');

const {
  providerFinancialAudit,
  reconcilePancakeOrderFinancials
} = require('../src/integrations/pancake/pancakeFinancialReconciliationService');

function websiteOrder(overrides = {}) {
  return {
    orderNumber: 'MCC-RECON-1',
    customer: { firstName: 'Private', lastName: 'Customer', phone: '09171234567' },
    address: {
      houseAddress: '123 Private Street',
      provinceCode: 'CAVITE', province: 'CAVITE',
      cityCode: 'CAVITE|IMUS', city: 'IMUS',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV', barangay: 'BUCANDALA IV'
    },
    items: [{ quantity: 1, unitPriceCents: 64900 }],
    subtotalCents: 64900,
    shippingFeeCents: 12000,
    discountTotalCents: 0,
    totalCents: 76900,
    freeShippingUnlocked: false,
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'cod_pending',
    status: 'received',
    updatedAt: '2026-07-17T00:00:00.000Z',
    ...overrides
  };
}

function codProvider(overrides = {}) {
  return {
    id: 'PK-RECON-1', custom_id: 'MCC-RECON-1',
    total_price: 649,
    shipping_fee: 190,
    total_discount: 0,
    cod: 839,
    transfer_money: 0,
    updated_at: '2026-07-17T00:01:00.000Z',
    ...overrides
  };
}

function memoryDependencies(order = websiteOrder(), provider = codProvider()) {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const syncRepository = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  syncRepository.resetMemoryForTests();
  let providerOrder = { ...provider };
  const updates = [];
  return {
    previous,
    restore() {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    },
    syncRepository,
    geoResolver: async () => ({
      countryCode: '63',
      province: { id: '63_826', name: 'Cavite' },
      district: { id: '63_8261588', name: 'Imus' },
      commune: { id: '63_82615881238', name: 'Bucandala iv' }
    }),
    orderRepository: { findOrderByNumber: async (number) => number === order.orderNumber ? order : null },
    client: {
      getOrder: async () => ({ ...providerOrder }),
      updateOrder: async (_shopId, _pancakeOrderId, payload) => {
        updates.push(payload);
        providerOrder = {
          ...providerOrder,
          shipping_fee: payload.shipping_fee,
          total_discount: payload.total_discount,
          cod: payload.cod,
          transfer_money: payload.transfer_money,
          note: payload.note,
          note_print: payload.note_print,
          updated_at: '2026-07-17T00:02:00.000Z'
        };
      }
    },
    updates
  };
}

test('financial audit uses Pancake COD payable rather than total_price that excludes shipping', () => {
  const audit = providerFinancialAudit(websiteOrder(), codProvider({
    total_price: 649,
    shipping_fee: 120,
    cod: 769
  }));
  assert.equal(audit.matches, true);
  assert.equal(audit.websiteTotalCents, 76900);
  assert.equal(audit.providerPayableCents, 76900);
  assert.equal(audit.providerPayableType, 'cod');
});

test('financial audit uses verified prepaid amount for PayMongo orders', () => {
  const audit = providerFinancialAudit(websiteOrder({
    paymentMethod: 'paymongo', paymentStatus: 'paid', paidAmountCents: 76900
  }), codProvider({
    total_price: 649,
    shipping_fee: 120,
    cod: 0,
    transfer_money: 769,
    note_print: 'payment_method=paymongo\npayment_status=paid'
  }));
  assert.equal(audit.matches, true);
  assert.equal(audit.providerPayableCents, 76900);
  assert.equal(audit.providerPayableType, 'prepaid');
});

test('reconciliation is read-only by default and reports no customer PII', async () => {
  const dependencies = memoryDependencies();
  try {
    await dependencies.syncRepository.upsertOrderLink({
      orderNumber: 'MCC-RECON-1', pancakeOrderId: 'PK-RECON-1', shopId: 'shop-1', syncStatus: 'synced'
    });
    const summary = await reconcilePancakeOrderFinancials({
      config: { mode: 'live', shopId: 'shop-1' },
      client: dependencies.client,
      orderRepository: dependencies.orderRepository,
      syncRepository: dependencies.syncRepository
    });
    assert.equal(summary.mode, 'audit');
    assert.equal(summary.initialMismatchCount, 1);
    assert.equal(summary.correctedCount, 0);
    assert.equal(dependencies.updates.length, 0);
    assert.doesNotMatch(JSON.stringify(summary), /Private|09171234567|123 Private Street|BUCANDALA/);
  } finally {
    dependencies.restore();
  }
});

test('apply requires explicit order scope and repairs only the selected linked order', async () => {
  const dependencies = memoryDependencies();
  try {
    await dependencies.syncRepository.upsertOrderLink({
      orderNumber: 'MCC-RECON-1', pancakeOrderId: 'PK-RECON-1', shopId: 'shop-1', syncStatus: 'synced'
    });
    await assert.rejects(
      reconcilePancakeOrderFinancials({
        apply: true,
        config: { mode: 'live', shopId: 'shop-1' }, client: dependencies.client,
        orderRepository: dependencies.orderRepository, syncRepository: dependencies.syncRepository
      }),
      (error) => error.code === 'pancake_financial_apply_scope_required'
    );

    const summary = await reconcilePancakeOrderFinancials({
      apply: true,
      orderNumbers: ['MCC-RECON-1'],
      config: { mode: 'live', shopId: 'shop-1' },
      client: dependencies.client,
      orderRepository: dependencies.orderRepository,
      syncRepository: dependencies.syncRepository,
      geoResolver: dependencies.geoResolver,
      now: () => new Date('2026-07-17T00:03:00.000Z')
    });

    assert.equal(summary.correctedCount, 1);
    assert.equal(summary.remainingMismatchCount, 0);
    assert.equal(dependencies.updates.length, 1);
    assert.equal(dependencies.updates[0].shipping_fee, 120);
    assert.equal(dependencies.updates[0].cod, 769);
    assert.equal(dependencies.updates[0].total_discount, 0);
    assert.match(dependencies.updates[0].shipping_address.full_address, /BUCANDALA IV/);
    assert.doesNotMatch(JSON.stringify(summary), /Private|09171234567|123 Private Street|BUCANDALA/);
  } finally {
    dependencies.restore();
  }
});

test('apply records a safe retryable failure when Pancake rejects the repair', async () => {
  const dependencies = memoryDependencies();
  try {
    await dependencies.syncRepository.upsertOrderLink({
      orderNumber: 'MCC-RECON-1', pancakeOrderId: 'PK-RECON-1', shopId: 'shop-1', syncStatus: 'synced'
    });
    const providerError = new Error('private provider response');
    providerError.code = 'pancake_http_error';
    dependencies.client.updateOrder = async () => { throw providerError; };

    const summary = await reconcilePancakeOrderFinancials({
      apply: true,
      orderNumbers: ['MCC-RECON-1'],
      config: { mode: 'live', shopId: 'shop-1' },
      client: dependencies.client,
      orderRepository: dependencies.orderRepository,
      syncRepository: dependencies.syncRepository,
      geoResolver: dependencies.geoResolver,
      now: () => new Date('2026-07-17T00:03:00.000Z')
    });

    assert.equal(summary.correctedCount, 0);
    assert.equal(summary.remainingMismatchCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.results[0].status, 'repair_failed');
    assert.equal(summary.results[0].safeErrorCode, 'pancake_http_error');
    assert.doesNotMatch(JSON.stringify(summary), /private provider response/);
    const detail = await dependencies.syncRepository.getOrderSyncDetail('MCC-RECON-1');
    assert.equal(detail.syncStatus, 'sync_failed');
    assert.equal(detail.safeErrorCode, 'pancake_http_error');
  } finally {
    dependencies.restore();
  }
});

test('apply refuses non-live Pancake modes', async () => {
  const dependencies = memoryDependencies();
  try {
    await assert.rejects(
      reconcilePancakeOrderFinancials({
        apply: true, orderNumbers: ['MCC-RECON-1'],
        config: { mode: 'read_only', shopId: 'shop-1' }, client: dependencies.client,
        orderRepository: dependencies.orderRepository, syncRepository: dependencies.syncRepository
      }),
      (error) => error.code === 'pancake_financial_apply_requires_live_mode'
    );
  } finally {
    dependencies.restore();
  }
});
