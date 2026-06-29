async function sendResendEmail(event, { config, fetchImpl = fetch } = {}) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [event.recipient], ...event.payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Resend rejected the email request');
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return { providerMessageId: String(data.id || '') };
}

module.exports = { sendResendEmail };
