class PayMongoApiError extends Error {
  constructor(code, { status = 0, retryable = false } = {}) {
    super({
      paymongo_auth_failed: 'PayMongo authentication failed.',
      paymongo_rejected: 'PayMongo rejected the checkout request.',
      paymongo_timeout: 'PayMongo request timed out.',
      paymongo_network_error: 'PayMongo could not be reached.',
      paymongo_invalid_response: 'PayMongo returned an invalid response.',
      paymongo_refund_rejected: 'PayMongo rejected the refund request.'
    }[code] || 'PayMongo request failed.');
    this.name = 'PayMongoApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function createPayMongoClient(config, fetchImpl = fetch) {
  async function request(pathname, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 20_000);
    let response;
    try {
      response = await fetchImpl(`${config.apiBaseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new PayMongoApiError('paymongo_timeout', { retryable: true });
      throw new PayMongoApiError('paymongo_network_error', { retryable: true });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new PayMongoApiError('paymongo_auth_failed', { status: response.status });
      throw new PayMongoApiError(options.errorCode || 'paymongo_rejected', {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500
      });
    }
    const body = await response.json().catch(() => null);
    if (!body?.data?.id || !body.data?.attributes) throw new PayMongoApiError('paymongo_invalid_response');
    return body.data;
  }

  async function createCheckoutSession(payload) {
    const data = await request('/v2/checkout_sessions', { method: 'POST', body: payload });
    const checkoutUrl = String(data.attributes.checkout_url || '');
    if (!checkoutUrl.startsWith('https://')) throw new PayMongoApiError('paymongo_invalid_response');
    return { id: String(data.id), checkoutUrl, attributes: data.attributes };
  }

  async function retrieveCheckoutSession(checkoutSessionId) {
    const id = String(checkoutSessionId || '').trim();
    if (!/^cs_[A-Za-z0-9_-]+$/.test(id)) throw new PayMongoApiError('paymongo_invalid_response');
    const data = await request(`/v1/checkout_sessions/${encodeURIComponent(id)}`);
    return { id: String(data.id), attributes: data.attributes };
  }

  async function createRefund({ amountCents, paymentId, reason, notes = '' }, { idempotencyKey } = {}) {
    const payment = String(paymentId || '').trim();
    const key = String(idempotencyKey || '').trim();
    if (!/^pay_[A-Za-z0-9_-]+$/.test(payment) || !Number.isInteger(amountCents) || amountCents <= 0 || !key) {
      throw new PayMongoApiError('paymongo_invalid_response');
    }
    const data = await request('/v1/refunds', {
      method: 'POST',
      errorCode: 'paymongo_refund_rejected',
      headers: { 'Idempotency-Key': key },
      body: {
        data: {
          attributes: {
            amount: amountCents,
            payment_id: payment,
            reason,
            ...(String(notes || '').trim() ? { notes: String(notes).trim().slice(0, 255) } : {})
          }
        }
      }
    });
    return { id: String(data.id), attributes: data.attributes };
  }

  return { createCheckoutSession, createRefund, retrieveCheckoutSession };
}

module.exports = { PayMongoApiError, createPayMongoClient };
