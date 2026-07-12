const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createPancakeWebhookRouter, SECRET_HEADER } = require('../src/routes/pancakeWebhook');

async function startWebhookApp(options) {
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/pancake/webhook', createPancakeWebhookRouter(options));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/api/integrations/pancake/webhook` };
}

test('Pancake webhook requires the configured private header', async () => {
  const { server, url } = await startWebhookApp({
    config: { webhookSecret: 'webhook-secret-at-least-32-characters', shopId: '123' },
    processOrder: async () => ({ status: 'updated' })
  });
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, shop_id: 123, status: 0 })
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Pancake webhook accepts official order payloads and wrapped records', async () => {
  const received = [];
  const secret = 'webhook-secret-at-least-32-characters';
  const { server, url } = await startWebhookApp({
    config: { webhookSecret: secret, shopId: '123' },
    processOrder: async ({ pancakeOrder }) => { received.push(pancakeOrder); return { status: 'updated' }; }
  });
  try {
    for (const body of [
      { id: 1, shop_id: 123, status: 0 },
      { data: { record: { id: 2, shop_id: '123', status: 2 } } }
    ]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SECRET_HEADER]: secret },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ok, true);
    }
    assert.deepEqual(received.map((item) => item.id), [1, 2]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Pancake webhook rejects payloads from a different shop', async () => {
  const secret = 'webhook-secret-at-least-32-characters';
  let calls = 0;
  const { server, url } = await startWebhookApp({
    config: { webhookSecret: secret, shopId: '123' },
    processOrder: async () => { calls += 1; return { status: 'updated' }; }
  });
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: secret },
      body: JSON.stringify({ id: 1, shop_id: 999, status: 0 })
    });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
