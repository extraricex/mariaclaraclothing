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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.pixelId)}/events`;
  const body = {
    data: [event],
    access_token: config.accessToken
  };
  if (config.testEventCode) body.test_event_code = config.testEventCode;

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
      messages: responseBody.messages || []
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

module.exports = { MetaConversionsApiError, sendMetaConversionsEvent };
