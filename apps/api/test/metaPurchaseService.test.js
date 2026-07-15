const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  claimBrowserMetaPurchase,
  completeBrowserMetaPurchase,
  metaPurchaseEligibility,
  queueMetaPurchase
} = require('../src/marketing/metaPurchaseService');

function order(overrides = {}) {
  return {
    orderNumber: 'MCC-DEDUP-1',
    metaPurchaseEventId: 'purchase_MCC-DEDUP-1',
    metaPurchaseTrackingVersion: 2,
    metaPurchaseStatus: 'eligible',
    metaBrowserPurchaseClaimId: '',
    metaBrowserPurchaseClaimedAt: '',
    metaBrowserPurchaseSentAt: '',
    metaCapiPurchaseQueuedAt: '2026-07-15T04:00:00.000Z',
    metaCapiPurchaseSentAt: '',
    metaPurchaseLastError: '',
    confirmationTokenHash: 'valid-hash',
    status: 'confirmed',
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'cod_pending',
    inventoryReservationStatus: 'committed',
    totalCents: 127800,
    placedAt: '2026-07-15T04:00:00.000Z',
    customer: {},
    items: [{ variantId: 'variant-1', quantity: 2, unitPriceCents: 64900 }],
    ...overrides
  };
}

function browserDependencies(initialOrder) {
  let saved = { ...initialOrder };
  let nextClaim = 0;
  const logs = [];
  return {
    dependencies: {
      transaction: async (work) => work({}),
      findOrder: async () => saved,
      verifyToken: (token, hash) => token === 'confirmation-token' && hash === 'valid-hash',
      now: () => new Date('2026-07-15T04:05:00.000Z'),
      randomId: () => `claim-${++nextClaim}`,
      claimOrder: async (_orderNumber, claim) => {
        if (saved.metaBrowserPurchaseSentAt || saved.metaBrowserPurchaseClaimId) return null;
        saved = {
          ...saved,
          metaBrowserPurchaseClaimId: claim.claimId,
          metaBrowserPurchaseClaimedAt: claim.claimedAt.toISOString(),
          metaPurchaseStatus: 'browser_claimed'
        };
        return saved;
      },
      completeClaim: async (_orderNumber, completion) => {
        if (saved.metaBrowserPurchaseClaimId !== completion.claimId) return null;
        saved = {
          ...saved,
          metaBrowserPurchaseClaimId: '',
          metaBrowserPurchaseClaimedAt: '',
          metaBrowserPurchaseSentAt: completion.sent ? completion.completedAt.toISOString() : '',
          metaPurchaseStatus: completion.sent
            ? (saved.metaCapiPurchaseSentAt ? 'complete' : 'browser_sent')
            : 'capi_queued'
        };
        return saved;
      },
      logger: { info: (message, details) => logs.push({ message, details }) }
    },
    get order() { return saved; },
    logs
  };
}

test('COD browser Purchase is claimed once, completed once, and blocked on refresh', async () => {
  const state = browserDependencies(order());
  const input = { orderNumber: state.order.orderNumber, confirmationToken: 'confirmation-token' };
  const first = await claimBrowserMetaPurchase(input, state.dependencies);
  assert.equal(first.shouldSend, true);
  assert.equal(first.purchase.eventId, 'purchase_MCC-DEDUP-1');
  assert.equal(first.purchase.payload.value, 1278);
  assert.equal(first.purchase.payload.currency, 'PHP');
  assert.equal(first.purchase.payload.num_items, 2);

  const concurrent = await claimBrowserMetaPurchase(input, state.dependencies);
  assert.equal(concurrent.shouldSend, false);
  assert.equal(concurrent.reason, 'claim_active');

  const completed = await completeBrowserMetaPurchase({ ...input, claimId: first.claimId, sent: true }, state.dependencies);
  assert.equal(completed.completed, true);
  const refresh = await claimBrowserMetaPurchase(input, state.dependencies);
  assert.equal(refresh.shouldSend, false);
  assert.equal(refresh.reason, 'already_sent');
  assert.equal(state.logs.filter((entry) => entry.message === 'Meta browser Purchase claimed.').length, 1);
});

test('Pancake received status remains eligible after a committed COD order is synchronized', async () => {
  const synchronized = order({ status: 'received' });
  assert.equal(metaPurchaseEligibility(synchronized).reason, 'eligible');
  const state = browserDependencies(synchronized);
  const claim = await claimBrowserMetaPurchase({
    orderNumber: synchronized.orderNumber,
    confirmationToken: 'confirmation-token'
  }, state.dependencies);
  assert.equal(claim.shouldSend, true);
  assert.equal(claim.purchase.eventId, synchronized.metaPurchaseEventId);
});

test('PayMongo browser Purchase waits for verified paid amount and then reuses the stored event ID', async () => {
  const pending = order({
    orderNumber: 'MCC-PAYMONGO-1',
    metaPurchaseEventId: 'purchase_MCC-PAYMONGO-1',
    paymentMethod: 'paymongo', paymentProvider: 'paymongo', paymentStatus: 'pending_payment',
    status: 'pending_payment', paidAmountCents: null, inventoryReservationStatus: 'reserved',
    metaPurchaseStatus: 'pending_payment'
  });
  assert.equal(metaPurchaseEligibility(pending).reason, 'payment_not_paid');
  assert.equal(metaPurchaseEligibility({
    ...pending,
    paymentStatus: 'paid',
    paidAmountCents: pending.totalCents
  }).reason, 'order_not_committed');
  assert.equal(metaPurchaseEligibility({
    ...pending,
    status: 'confirmed', paymentStatus: 'paid', paidAmountCents: 120000,
    inventoryReservationStatus: 'committed'
  }).reason, 'paid_amount_mismatch');
  const paid = {
    ...pending,
    status: 'confirmed', paymentStatus: 'paid', paidAmountCents: 127800,
    inventoryReservationStatus: 'committed'
  };
  const state = browserDependencies(paid);
  const claim = await claimBrowserMetaPurchase({ orderNumber: paid.orderNumber, confirmationToken: 'confirmation-token' }, state.dependencies);
  assert.equal(claim.shouldSend, true);
  assert.equal(claim.purchase.eventId, paid.metaPurchaseEventId);
  assert.equal(claim.purchase.payload.value, 1278);

  const synchronizedPaid = { ...paid, status: 'received' };
  assert.equal(metaPurchaseEligibility(synchronizedPaid).reason, 'eligible');
});

test('failed, legacy, uncommitted, and invalid-total orders cannot claim browser Purchase', () => {
  assert.equal(metaPurchaseEligibility(order({ status: 'cancelled' })).reason, 'order_unsuccessful');
  assert.equal(metaPurchaseEligibility(order({ metaPurchaseTrackingVersion: 1 })).reason, 'legacy_order_locked');
  assert.equal(metaPurchaseEligibility(order({ inventoryReservationStatus: 'released' })).reason, 'order_not_committed');
  assert.equal(metaPurchaseEligibility(order({ totalCents: 0 })).reason, 'invalid_purchase_data');
});

test('centralized CAPI queue sends one authoritative stored-ID event and reports duplicates', async () => {
  const insertedEvents = [];
  const first = await queueMetaPurchase({ client: {}, order: order(), enabled: true }, {
    insertEvent: async (_client, event) => {
      insertedEvents.push(event);
      return { id: 'outbox-1' };
    },
    logger: { info() {}, warn() {} }
  });
  assert.equal(first.status, 'queued');
  assert.equal(insertedEvents[0].event_id, 'purchase_MCC-DEDUP-1');
  assert.equal(insertedEvents[0].custom_data.value, 1278);
  assert.equal(insertedEvents[0].custom_data.currency, 'PHP');

  const duplicate = await queueMetaPurchase({ client: {}, order: order(), enabled: true }, {
    insertEvent: async () => null,
    logger: { info() {}, warn() {} }
  });
  assert.equal(duplicate.status, 'duplicate');
});

test('Meta order migration stores permanent IDs, browser/server timestamps, and unique protection', async () => {
  const migration = await fs.readFile(path.join(__dirname, '..', 'db', 'migrations', '20260715_meta_purchase_deduplication.sql'), 'utf8');
  for (const field of [
    'meta_purchase_event_id', 'meta_browser_purchase_claimed_at', 'meta_browser_purchase_sent_at',
    'meta_capi_purchase_queued_at', 'meta_capi_purchase_sent_at', 'meta_purchase_status'
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS orders_meta_purchase_event_id_idx/);
});
