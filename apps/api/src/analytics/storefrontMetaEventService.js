const { env } = require('../config/env');
const { hasDatabaseUrl, transaction } = require('../db/postgres');
const {
  normalizeEvent,
  persistNormalizedAnalyticsEvent
} = require('./storefrontAnalyticsRepository');
const { buildMetaFunnelEvent } = require('../marketing/metaFunnelEvent');
const { insertMetaEventOutbox } = require('../marketing/marketingEventOutboxRepository');

async function recordStorefrontMetaEvent(input, request = {}, {
  metaEnabled = env.meta.enabled,
  transactionFn = transaction,
  persistEvent = persistNormalizedAnalyticsEvent,
  buildEvent = buildMetaFunnelEvent,
  insertOutbox = insertMetaEventOutbox
} = {}) {
  const analyticsEvent = normalizeEvent(input, request);
  if (!hasDatabaseUrl()) {
    const result = await persistEvent(analyticsEvent);
    return { ...result, metaQueued: false, metaReason: 'database_required' };
  }
  return transactionFn(async (client) => {
    const result = await persistEvent(analyticsEvent, { client });
    if (!metaEnabled) return { ...result, metaQueued: false, metaReason: 'capi_disabled' };
    const metaEvent = buildEvent(input, analyticsEvent, request);
    if (!metaEvent) return { ...result, metaQueued: false, metaReason: 'not_eligible' };
    const outbox = await insertOutbox(client, metaEvent, {
      aggregateId: analyticsEvent.sessionHash,
      browserSent: true
    });
    return {
      ...result,
      metaQueued: Boolean(outbox),
      metaEventId: metaEvent.event_id,
      metaEventName: metaEvent.event_name,
      metaReason: outbox ? '' : 'duplicate_or_invalid'
    };
  });
}

module.exports = { recordStorefrontMetaEvent };
