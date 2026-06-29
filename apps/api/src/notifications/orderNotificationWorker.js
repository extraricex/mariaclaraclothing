const defaultRepository = require('./orderNotificationOutboxRepository');
const { sendSemaphoreSms } = require('./semaphoreClient');
const { sendResendEmail } = require('./resendClient');

const MAX_ATTEMPTS = 8;
const retryDelayMs = (attempt, random = Math.random) => Math.min(64, 2 ** Math.max(0, Number(attempt) - 1)) * 60_000 + Math.floor(random() * 10_000);

function createOrderNotificationWorker({ client, config, repository = defaultRepository, sendSms = sendSemaphoreSms, sendEmail = sendResendEmail, now = () => new Date(), random = Math.random, pollIntervalMs = 10_000, logger = console } = {}) {
  let timer;
  let running = false;
  let stopped = true;
  async function runOnce() {
    const current = now();
    await repository.recoverStaleClaims(client, new Date(current.getTime() - 5 * 60_000));
    const events = await repository.claimDue(client, { now: current, limit: 10 });
    const result = { claimed: events.length, sent: 0, retried: 0, failed: 0 };
    for (const event of events) {
      try {
        const response = event.channel === 'sms'
          ? await sendSms(event, { config: config.sms })
          : await sendEmail(event, { config: config.email });
        await repository.markSent(client, event.id, response);
        result.sent += 1;
      } catch (error) {
        const message = String(error?.message || 'Notification delivery failed').slice(0, 1000);
        if (error?.retryable && Number(event.attemptCount ?? event.attempt_count) < MAX_ATTEMPTS) {
          await repository.scheduleRetry(client, event.id, { nextAttemptAt: new Date(current.getTime() + retryDelayMs(event.attemptCount ?? event.attempt_count, random)), error: message });
          result.retried += 1;
        } else {
          await repository.markFailed(client, event.id, message);
          result.failed += 1;
        }
      }
    }
    return result;
  }
  async function tick() {
    if (running || stopped) return;
    running = true;
    try { await runOnce(); } catch (error) { logger.error('Order notification worker failed:', error?.message || error); } finally { running = false; }
  }
  function start() { if (!stopped) return; stopped = false; void tick(); timer = setInterval(() => void tick(), pollIntervalMs); timer.unref?.(); }
  function stop() { stopped = true; if (timer) clearInterval(timer); timer = undefined; }
  return { runOnce, start, stop };
}

module.exports = { MAX_ATTEMPTS, createOrderNotificationWorker, retryDelayMs };
