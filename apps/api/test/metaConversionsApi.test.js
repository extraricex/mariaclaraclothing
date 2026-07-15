const test = require('node:test');
const assert = require('node:assert/strict');
const { sendMetaConversionsEvent } = require('../src/marketing/metaConversionsApi');

const event = {
  event_name: 'Purchase', event_id: 'purchase_MCC-1',
  custom_data: { value: 649, currency: 'PHP' }
};
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
  assert.deepEqual(result, { eventsReceived: 1, traceId: 'trace-1', messages: [], status: 200 });
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

test('Meta CAPI client never sends malformed monetary values', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests += 1; };
  for (const customData of [
    { currency: 'PHP' },
    { currency: 'PHP', value: 0 },
    { currency: 'PHP', value: '649' },
    { currency: 'PHP 649', value: 649 },
    { currency: 'PHP', value: Number.NaN }
  ]) {
    await assert.rejects(
      sendMetaConversionsEvent({ ...event, custom_data: customData }, { config, fetchImpl }),
      (error) => error.retryable === false && /invalid value or currency/.test(error.message)
    );
  }
  assert.equal(requests, 0);
});
