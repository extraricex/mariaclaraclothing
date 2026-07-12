const { releaseExpiredReservations } = require('./paymongoPaymentService');

function createPayMongoWorker({ config, intervalMs = 60_000, setIntervalFn = setInterval, clearIntervalFn = clearInterval, logger = console } = {}) {
  let timer;
  let running = false;
  async function runOnce() {
    if (!config?.configured || running) return { status: 'skipped' };
    running = true;
    try {
      const result = await releaseExpiredReservations();
      if (result.releasedCount) logger.info?.('Expired PayMongo reservations released', { count: result.releasedCount });
      return { status: 'complete', ...result };
    } catch (error) {
      logger.error?.('PayMongo reservation worker failed:', error?.message || error);
      return { status: 'failed' };
    } finally { running = false; }
  }
  function start() {
    if (!config?.configured || timer) return;
    timer = setIntervalFn(() => void runOnce(), intervalMs);
    timer?.unref?.();
  }
  function stop() { if (timer) clearIntervalFn(timer); timer = undefined; }
  return { runOnce, start, stop };
}

module.exports = { createPayMongoWorker };
