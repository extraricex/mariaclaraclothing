const crypto = require('node:crypto');
const mapperDefault = require('./pancakeCatalogMapper');

let inFlight = null;

function safeCode(error) {
  const code = String(error?.code || 'pancake_unknown_error');
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_unknown_error';
}

function invalidResponse() {
  const error = new Error('Invalid Pancake catalog response');
  error.code = 'pancake_invalid_response';
  return error;
}

async function executeImport({ config, client, repository, mapper, now }) {
  const started = now();
  const importId = crypto.randomUUID();
  await repository.beginImport({ id: importId, startedAt: started.toISOString(), shopId: String(config.shopId || '') });
  try {
    const shopBody = await client.listShops();
    if (!Array.isArray(shopBody.shops)) throw invalidResponse();
    const shops = shopBody.shops.map((shop) => ({ id: String(shop.id || ''), name: String(shop.name || '') })).filter((shop) => shop.id);
    await repository.saveDiscoveredShops(importId, shops);
    const selection = await repository.loadEffectiveSelection(config);
    const shopId = String(selection.shopId || config.shopId || '');
    if (!shopId) {
      await repository.completeShopDiscovery(importId);
      return { status: 'shop_selection_required', importId, shopSelectionRequired: true, lastErrorCode: '' };
    }
    if (!shops.some((shop) => shop.id === shopId)) throw Object.assign(new Error('Shop not found'), { code: 'pancake_shop_not_found' });

    const [warehouseBody, sourceBody] = await Promise.all([
      client.listWarehouses(shopId), client.listOrderSources(shopId)
    ]);
    const warehouses = warehouseBody.data.map((item) => ({
      id: String(item.id || ''), name: String(item.name || ''), allowCreateOrder: item.allow_create_order === true,
      sourceUpdatedAt: item.updated_at || null
    })).filter((item) => item.id);
    const orderSources = sourceBody.data.map((item) => ({
      id: String(item.id ?? ''), parentId: item.parent_id === undefined || item.parent_id === null ? '' : String(item.parent_id),
      name: String(item.name || ''), sourceUpdatedAt: item.updated_at || null
    })).filter((item) => item.id);

    const variations = [];
    let expectedPages = null;
    let pageCount = 0;
    for (let pageNumber = 1; ; pageNumber += 1) {
      const body = await client.listVariations(shopId, { pageNumber, pageSize: config.catalogPageSize });
      if (body.page_number !== pageNumber || (expectedPages !== null && body.total_pages !== expectedPages)) throw invalidResponse();
      expectedPages = body.total_pages;
      if (expectedPages > config.catalogMaxPages || body.total_entries > config.catalogPageSize * config.catalogMaxPages) throw invalidResponse();
      variations.push(...body.data.map((item) => ({
        id: String(item.id || ''), product_id: String(item.product_id || ''), display_id: String(item.display_id || ''),
        retail_price: item.retail_price, is_hidden: item.is_hidden === true, is_locked: item.is_locked === true,
        updated_at: item.updated_at || null, product: { name: String(item.product?.name || '') }
      })).filter((item) => item.id));
      pageCount += 1;
      if (pageNumber >= expectedPages) break;
    }
    const localVariants = await repository.loadActiveLocalVariants();
    const mappingResult = mapper({ localVariants, pancakeVariations: variations, importId, now: now().toISOString() });
    await repository.commitCompleteImport({
      importId, shopId, selection, shops, warehouses, orderSources, variations, localVariants,
      mappingResult, pageCount, startedAt: started.toISOString(), finishedAt: now().toISOString()
    });
    return {
      status: 'complete', importId, shopSelectionRequired: false, summary: mappingResult.summary,
      validation: { currencyStatus: 'unknown', priceUnitStatus: mappingResult.priceEvidence.status }, lastErrorCode: ''
    };
  } catch (error) {
    const code = safeCode(error);
    await repository.failImport(importId, code, Math.max(0, now().getTime() - started.getTime()));
    return { status: 'failed', importId, shopSelectionRequired: false, lastErrorCode: code };
  }
}

async function runCatalogImport(options) {
  const config = options.config || {};
  if (config.mode === 'disabled') return { status: 'disabled', lastErrorCode: '' };
  if (config.mode !== 'read_only') return { status: 'mode_not_allowed', lastErrorCode: 'pancake_mode_not_allowed' };
  if (!config.apiKeyConfigured) return { status: 'incomplete', lastErrorCode: 'pancake_configuration_incomplete' };
  if (inFlight) return { status: 'concurrent', lastErrorCode: 'pancake_import_in_progress' };
  const work = executeImport({ ...options, mapper: options.mapper || mapperDefault.mapCatalog, now: options.now || (() => new Date()) });
  inFlight = work;
  try { return await work; } finally { if (inFlight === work) inFlight = null; }
}

async function getCatalogStatus({ config, repository }) {
  return { mode: config.mode, apiKeyConfigured: Boolean(config.apiKeyConfigured), ...(await repository.getCatalogStatus()) };
}

async function saveReferenceSelection({ config, repository, selection }) {
  return repository.saveSelection(selection, {
    shopLocked: Boolean(config.shopId), warehouseLocked: Boolean(config.warehouseId), orderSourceLocked: Boolean(config.orderSourceId)
  });
}

module.exports = { getCatalogStatus, runCatalogImport, saveReferenceSelection };
