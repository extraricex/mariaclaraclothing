async function sendSemaphoreSms(event, { config, fetchImpl = fetch } = {}) {
  const body = new URLSearchParams({ apikey: config.apiKey, number: event.recipient, message: event.payload.message });
  if (config.senderName) body.set('sendername', config.senderName);
  const response = await fetchImpl('https://api.semaphore.co/api/v4/messages', { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError('Semaphore rejected the SMS request', response.status);
  const first = Array.isArray(data) ? data[0] : data;
  return { providerMessageId: String(first?.message_id || first?.id || '') };
}

function providerError(message, status) {
  const error = new Error(message);
  error.retryable = status === 429 || status >= 500;
  return error;
}

module.exports = { sendSemaphoreSms };
