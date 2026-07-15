const test = require('node:test');
const assert = require('node:assert/strict');
const { sendMetaConversionsEvent } = require('../src/marketing/metaConversionsApi');

const event = { event_name: 'Purchase', event_id: 'purchase_MCC-1' };
const config = {
  pixelId: '595813035761213',
  accessToken: 'secret-token',
  graphApiVersion: 'v-test',
  testEventCode: 'TEST123'
};

test('Meta CAPI client posts the event and maps acceptance metadata', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1, fbtrace_id: 'trace-1', messages: [] })
    };
  };

  const result = await sendMetaConversionsEvent(event, { config, fetchImpl });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://graph.facebook.com/v-test/595813035761213/events');
  assert.equal(request.options.method, 'POST');
  assert.ok(request.options.signal);
  assert.deepEqual(body.data, [event]);
  assert.equal(body.access_token, 'secret-token');
  assert.equal(body.test_event_code, 'TEST123');
  assert.deepEqual(result, { eventsReceived: 1, traceId: 'trace-1', messages: [] });
});

test('Meta CAPI client classifies retryable and permanent errors without leaking tokens', async () => {
  await assert.rejects(
    sendMetaConversionsEvent(event, {
      config,
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'slow down secret-token' } }) })
    }),
    (error) => error.retryable === true && !error.message.includes('secret-token')
  );

  await assert.rejects(
    sendMetaConversionsEvent(event, {
      config,
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'invalid event' } }) })
    }),
    (error) => error.retryable === false && /invalid event/.test(error.message)
  );
});
