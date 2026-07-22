const { META_CURRENCY, validateMetaPurchaseEvent } = require('./metaMoney');

class MetaConversionsApiError extends Error {
  constructor(message, { retryable, status, cause } = {}) {
    super(message, { cause });
    this.name = 'MetaConversionsApiError';
    this.retryable = Boolean(retryable);
    this.status = status;
  }
}

function sanitizeMessage(message, accessToken) {
  const fallback = 'Meta Conversions API request failed';
  const text = String(message || fallback);
  return (accessToken ? text.split(accessToken).join('[REDACTED]') : text).slice(0, 500);
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function hasValidMetaMonetaryValue(event) {
  if (!['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase'].includes(event?.event_name)) {
    return true;
  }
  return event?.custom_data?.currency === META_CURRENCY &&
    typeof event?.custom_data?.value === 'number' &&
    Number.isFinite(event.custom_data.value) &&
    event.custom_data.value > 0;
}

async function sendMetaConversionsEvent(event, {
  config,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000
} = {}) {
  if (!config?.pixelId || !config?.accessToken || !config?.graphApiVersion) {
    throw new MetaConversionsApiError('Meta Conversions API configuration is incomplete', {
      retryable: false
    });
  }
  if (!hasValidMetaMonetaryValue(event)) {
    throw new MetaConversionsApiError('Meta monetary event has an invalid value or currency', {
      retryable: false
    });
  }
  if (event?.event_name === 'Purchase') {
    const validation = validateMetaPurchaseEvent(event);
    if (!validation.valid) {
      throw new MetaConversionsApiError(`Meta Purchase payload validation failed: ${validation.errors.join(' ')}`, {
        retryable: false
      });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.pixelId)}/events`;
  const outboundEvent = { ...event };
  const controlledTestEventCode = String(outboundEvent._meta_test_event_code || '').trim();
  delete outboundEvent._meta_test_event_code;
  const body = {
    data: [outboundEvent],
    access_token: config.accessToken
  };
  if (controlledTestEventCode || config.testEventCode) {
    body.test_event_code = controlledTestEventCode || config.testEventCode;
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseBody = await readResponseBody(response);

    if (!response.ok || Number(responseBody.events_received) < 1) {
      const message = responseBody?.error?.message || `Meta Conversions API returned HTTP ${response.status}`;
      throw new MetaConversionsApiError(sanitizeMessage(message, config.accessToken), {
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        status: response.status
      });
    }

    return {
      eventsReceived: responseBody.events_received,
      traceId: responseBody.fbtrace_id,
      messages: responseBody.messages || [],
      status: response.status
    };
  } catch (error) {
    if (error instanceof MetaConversionsApiError) throw error;
    const timedOut = error?.name === 'AbortError';
    throw new MetaConversionsApiError(
      sanitizeMessage(timedOut ? 'Meta Conversions API request timed out' : error?.message, config.accessToken),
      { retryable: true, cause: error }
    );
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { MetaConversionsApiError, hasValidMetaMonetaryValue, sendMetaConversionsEvent };
