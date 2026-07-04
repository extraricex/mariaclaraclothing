const test = require('node:test');
const assert = require('node:assert/strict');
const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');

const CONFIG = { apiBaseUrl: 'https://pos.pages.fm/api/v1', apiKey: 'secret', timeoutMs: 25 };

test('catalog client calls official read-only reference and variation endpoints', async () => {
  const urls = [];
  const client = createPancakeClient(CONFIG, async (url) => {
    urls.push(url);
    const body = url.includes('products/variations')
      ? { success: true, data: [], page_number: 2, page_size: 100, total_entries: 0, total_pages: 2 }
      : { success: true, data: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  await client.listWarehouses('123');
  await client.listOrderSources('123');
  await client.listVariations('123', { pageNumber: 2, pageSize: 100 });
  assert.equal(urls[0], 'https://pos.pages.fm/api/v1/shops/123/warehouses?api_key=secret');
  assert.equal(urls[1], 'https://pos.pages.fm/api/v1/shops/123/order_source?api_key=secret');
  assert.equal(urls[2], 'https://pos.pages.fm/api/v1/shops/123/products/variations?api_key=secret&page_number=2&page_size=100');
});

test('catalog client rejects unsafe identifiers and malformed outer payloads', async () => {
  const client = createPancakeClient(CONFIG, async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
  await assert.rejects(client.listWarehouses(''), (error) => error.code === 'pancake_invalid_request');
  await assert.rejects(client.listWarehouses('123'), (error) => error.code === 'pancake_invalid_response');
  await assert.rejects(client.listVariations('123', { pageNumber: 0, pageSize: 100 }), (error) => error.code === 'pancake_invalid_request');
});

test('variation response requires consistent pagination metadata', async () => {
  const client = createPancakeClient(CONFIG, async () => new Response(JSON.stringify({
    success: true, data: [], page_number: 1, page_size: 100, total_entries: -1, total_pages: 1
  }), { status: 200 }));
  await assert.rejects(client.listVariations('123', { pageNumber: 1, pageSize: 100 }), (error) => (
    error.code === 'pancake_invalid_response' && !String(error.message).includes(CONFIG.apiKey)
  ));
});
