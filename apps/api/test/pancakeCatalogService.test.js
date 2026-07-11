const test = require('node:test');
const assert = require('node:assert/strict');
const { mapCatalog } = require('../src/integrations/pancake/pancakeCatalogMapper');

function repository(selection = {}) {
  const calls = [];
  return {
    calls,
    beginImport: async (meta) => { calls.push(['begin', meta]); },
    saveDiscoveredShops: async (id, shops) => calls.push(['shops', id, shops]),
    loadEffectiveSelection: async () => selection,
    loadActiveLocalVariants: async () => [{ id: 1, productSlug: 'shirt', sku: 'SKU-S', status: 'active', priceCents: 64900 }],
    commitCompleteImport: async (snapshot) => calls.push(['commit', snapshot]),
    completeShopDiscovery: async (id) => calls.push(['selection', id]),
    failImport: async (id, code) => calls.push(['fail', id, code]),
    getCatalogStatus: async () => ({ status: 'never_imported' }),
    saveSelection: async (value) => value
  };
}

test('catalog import avoids provider calls when disabled or missing an API key', async () => {
  const { runCatalogImport } = require('../src/integrations/pancake/pancakeCatalogService');
  let calls = 0;
  const client = { listShops: async () => { calls += 1; } };
  assert.equal((await runCatalogImport({ config: { mode: 'disabled' }, client, repository: repository(), mapper: mapCatalog })).status, 'disabled');
  assert.equal((await runCatalogImport({ config: { mode: 'read_only', apiKeyConfigured: false }, client, repository: repository(), mapper: mapCatalog })).status, 'incomplete');
  assert.equal(calls, 0);
});

test('catalog import discovers shops before requiring selection', async () => {
  const { runCatalogImport } = require('../src/integrations/pancake/pancakeCatalogService');
  const repo = repository({ shopId: '' });
  const result = await runCatalogImport({
    config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 10 },
    client: { listShops: async () => ({ shops: [{ id: 7, name: 'Maria Clara', pages: ['unsafe'] }] }) },
    repository: repo, mapper: mapCatalog, now: () => new Date('2026-07-04T00:00:00Z')
  });
  assert.equal(result.status, 'shop_selection_required');
  assert.deepEqual(repo.calls.find((call) => call[0] === 'shops')[2], [{ id: '7', name: 'Maria Clara' }]);
  assert.equal(JSON.stringify(repo.calls).includes('unsafe'), false);
});

test('catalog import fetches every page and commits only the complete mapped snapshot', async () => {
  const { runCatalogImport } = require('../src/integrations/pancake/pancakeCatalogService');
  const repo = repository({ shopId: '7', warehouseId: 'w1', orderSourceId: 'web' });
  const pages = [];
  const client = {
    listShops: async () => ({ shops: [{ id: 7, name: 'Maria Clara' }] }),
    listWarehouses: async () => ({ data: [{ id: 'w1', name: 'Main', allow_create_order: true, address: 'private' }] }),
    listOrderSources: async () => ({ data: [{ id: 'web', name: 'Website' }] }),
    listVariations: async (_shop, { pageNumber }) => {
      pages.push(pageNumber);
      return { data: pageNumber === 1 ? [{ id: 'r1', product_id: 'p1', display_id: 'SKU-S', retail_price: 64900, product: { name: 'Shirt' } }] : [], page_number: pageNumber, page_size: 100, total_entries: 1, total_pages: 2 };
    }
  };
  const result = await runCatalogImport({ config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 10 }, client, repository: repo, mapper: mapCatalog });
  assert.equal(result.status, 'complete');
  assert.deepEqual(pages, [1, 2]);
  const snapshot = repo.calls.find((call) => call[0] === 'commit')[1];
  assert.equal(snapshot.mappingResult.summary.verifiedCount, 1);
  assert.equal(JSON.stringify(snapshot).includes('private'), false);
});

test('catalog import rejects changing pagination and retains the last complete snapshot', async () => {
  const { runCatalogImport } = require('../src/integrations/pancake/pancakeCatalogService');
  const repo = repository({ shopId: '7' });
  const client = {
    listShops: async () => ({ shops: [{ id: 7, name: 'Shop' }] }),
    listWarehouses: async () => ({ data: [] }), listOrderSources: async () => ({ data: [] }),
    listVariations: async (_id, { pageNumber }) => ({ data: [], page_number: pageNumber, page_size: 100, total_entries: 0, total_pages: pageNumber === 1 ? 2 : 3 })
  };
  const result = await runCatalogImport({ config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 10 }, client, repository: repo, mapper: mapCatalog });
  assert.equal(result.status, 'failed');
  assert.equal(repo.calls.some((call) => call[0] === 'commit'), false);
  assert.equal(repo.calls.find((call) => call[0] === 'fail')[2], 'pancake_invalid_response');
});
