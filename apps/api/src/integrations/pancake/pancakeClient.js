class PancakeApiError extends Error {
  constructor(code, { status = 0, retryable = false } = {}) {
    const messages = {
      pancake_auth_failed: 'Pancake authentication failed.',
      pancake_http_error: 'Pancake returned an unavailable response.',
      pancake_invalid_response: 'Pancake returned an invalid response.',
      pancake_rejected: 'Pancake rejected the request.',
      pancake_timeout: 'Pancake request timed out.',
      pancake_network_error: 'Pancake could not be reached.'
    };
    super(messages[code] || 'Pancake request failed.');
    this.name = 'PancakeApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function createPancakeClient(config, fetchImpl = fetch) {
  async function request(pathname) {
    const url = new URL(`${config.apiBaseUrl}${pathname}`);
    url.searchParams.set('api_key', config.apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new PancakeApiError('pancake_timeout', { retryable: true });
      }
      throw new PancakeApiError('pancake_network_error', { retryable: true });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new PancakeApiError('pancake_auth_failed', { status: response.status });
      }
      throw new PancakeApiError('pancake_http_error', {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500
      });
    }

    let body;
    try {
      body = JSON.parse(await response.text());
    } catch (_error) {
      throw new PancakeApiError('pancake_invalid_response');
    }
    if (!body || typeof body !== 'object') {
      throw new PancakeApiError('pancake_invalid_response');
    }
    if (body.success === false) {
      throw new PancakeApiError('pancake_rejected');
    }
    return body;
  }

  return {
    listShops: () => request('/shops')
  };
}

module.exports = { PancakeApiError, createPancakeClient };
