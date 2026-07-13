const { createPayMongoClient } = require('./paymongoClient');
const { reconcilePendingPayments, releaseExpiredReservations } = require('./paymongoPaymentService');

function createPayMongoWorker({
  config, client = createPayMongoClient(config), intervalMs = 60_000,
  metaEnabled = false, setIntervalFn = setInterval, clearIntervalFn = clearInterval, logger = console,
  reconcilePayments = reconcilePendingPayments, releaseReservations = releaseExpiredReservations
} = {}) {
  let timer;
  let running = false;
  async function runOnce() {
    if (!config?.configured || running) return { status: 'skipped' };
    running = true;
    try {
      const reconciliation = await reconcilePayments({ client, metaEnabled });
      const result = await releaseReservations({ client });
      if (reconciliation.paidCount) logger.info?.('Pending PayMongo payments reconciled', { count: reconciliation.paidCount });
      if (result.releasedCount) logger.info?.('Expired PayMongo reservations released', { count: result.releasedCount });
      return { status: 'complete', reconciliation, ...result };
    } catch (error) {
      logger.error?.('PayMongo reservation worker failed:', error?.message || error);
      return { status: 'failed' };
    } finally { running = false; }
  }
  function start() {
    if (!config?.configured || timer) return;
    void runOnce();
    timer = setIntervalFn(() => void runOnce(), intervalMs);
    timer?.unref?.();
  }
  function stop() { if (timer) clearIntervalFn(timer); timer = undefined; }
  return { runOnce, start, stop };
}

module.exports = { createPayMongoWorker };
