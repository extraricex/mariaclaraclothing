const defaultRepository = require('./marketingEventOutboxRepository');
const { sendMetaConversionsEvent } = require('./metaConversionsApi');

const MAX_ATTEMPTS = 8;

function retryDelayMs(attemptCount, random = Math.random) {
  const minutes = Math.min(64, 2 ** Math.max(0, Number(attemptCount) - 1));
  const jitter = Math.floor(minutes * 60_000 * 0.15 * random());
  return minutes * 60_000 + jitter;
}

function createMetaConversionsWorker({
  client,
  config,
  repository = defaultRepository,
  sendEvent = sendMetaConversionsEvent,
  now = () => new Date(),
  random = Math.random,
  pollIntervalMs = 10_000,
  logger = console
}) {
  let timer;
  let running = false;
  let stopped = true;

  async function runOnce() {
    const currentTime = now();
    await repository.recoverStaleMetaEventClaims(
      client,
      new Date(currentTime.getTime() - 5 * 60_000)
    );
    const events = await repository.claimDueMetaEvents(client, { now: currentTime, limit: 10 });
    const result = { claimed: events.length, sent: 0, retried: 0, failed: 0 };

    for (const event of events) {
      try {
        const response = await sendEvent(event.payload, { config });
        await repository.markMetaEventSent(client, event.id, { traceId: response.traceId });
        if (process.env.NODE_ENV === 'development') {
          logger.info?.('Meta Purchase development status.', {
            orderId: event.aggregate_id,
            eventId: event.event_id,
            purchaseValue: event.payload?.custom_data?.value,
            currency: event.payload?.custom_data?.currency,
            paymentMethod: event.payload?.custom_data?.payment_method || '',
            numberOfItems: event.payload?.custom_data?.num_items || 0,
            browserPixelSent: 'reported_by_browser',
            conversionsApiSent: true
          });
        }
        result.sent += 1;
      } catch (error) {
        const message = String(error?.message || 'Meta event delivery failed').slice(0, 1000);
        if (error?.retryable && event.attempt_count < MAX_ATTEMPTS) {
          const nextAttemptAt = new Date(currentTime.getTime() + retryDelayMs(event.attempt_count, random));
          await repository.scheduleMetaEventRetry(client, event.id, { nextAttemptAt, error: message });
          result.retried += 1;
        } else {
          await repository.markMetaEventFailed(client, event.id, message);
          result.failed += 1;
        }
      }
    }

    return result;
  }

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      await runOnce();
    } catch (error) {
      logger.error('Meta Conversions API worker failed:', error?.message || error);
    } finally {
      running = false;
    }
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    void tick();
    timer = setInterval(() => void tick(), pollIntervalMs);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  return { runOnce, start, stop };
}

module.exports = { MAX_ATTEMPTS, createMetaConversionsWorker, retryDelayMs };
