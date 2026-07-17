export const NETWORK_ERROR_MESSAGE = 'We could not reach the store. Check your connection and try again.';
export const TEMPORARY_SERVICE_MESSAGE = 'The store is briefly reconnecting. Please try again in a moment.';

const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [250, 500, 1000, 2000];

function requestMethod(options = {}) {
  return String(options.method || 'GET').trim().toUpperCase();
}

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response) {
  const value = Number(response?.headers?.get?.('Retry-After'));
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(3000, value * 1000);
}

export function isTransientResponse(response) {
  return TRANSIENT_STATUS_CODES.has(Number(response?.status));
}

export function connectionError(cause) {
  const error = new Error(NETWORK_ERROR_MESSAGE, cause ? { cause } : undefined);
  error.code = 'NETWORK_ERROR';
  error.retryable = true;
  return error;
}

export function responseErrorMessage(response, fallback = 'Something went wrong.') {
  return isTransientResponse(response) ? TEMPORARY_SERVICE_MESSAGE : fallback;
}

export async function fetchWithRecovery(input, options = {}, configuration = {}) {
  const fetchImpl = configuration.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw connectionError();

  const safeToRetry = SAFE_RETRY_METHODS.has(requestMethod(options));
  const retryDelays = Array.isArray(configuration.retryDelaysMs)
    ? configuration.retryDelaysMs
    : DEFAULT_RETRY_DELAYS_MS;
  const wait = configuration.wait || delay;
  const attempts = safeToRetry ? retryDelays.length + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(input, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt >= attempts - 1) throw connectionError(error);
      await wait(retryDelays[attempt]);
      continue;
    }

    if (!isTransientResponse(response) || attempt >= attempts - 1) return response;
    await wait(Math.max(retryDelays[attempt], retryAfterMilliseconds(response)));
  }

  throw connectionError();
}
