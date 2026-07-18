const express = require('express');
const { env } = require('../config/env');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const repositoryDefault = require('../integrations/pancake/pancakeConnectionRepository');
const catalogRepositoryDefault = require('../integrations/pancake/pancakeCatalogRepository');
const catalogServiceDefault = require('../integrations/pancake/pancakeCatalogService');
const inventoryRepositoryDefault = require('../integrations/pancake/pancakeInventoryRepository');
const inventoryServiceDefault = require('../integrations/pancake/pancakeInventoryService');
const inventoryOutboxRepositoryDefault = require('../integrations/pancake/pancakeInventoryOutboxRepository');
const inventoryOutboxServiceDefault = require('../integrations/pancake/pancakeInventoryOutboxService');
const orderExportRepositoryDefault = require('../integrations/pancake/pancakeOrderExportRepository');
const orderExportServiceDefault = require('../integrations/pancake/pancakeOrderExportService');
const orderSyncRepositoryDefault = require('../integrations/pancake/pancakeOrderSyncRepository');
const productSyncRepositoryDefault = require('../integrations/pancake/pancakeProductSyncRepository');
const productSyncServiceDefault = require('../integrations/pancake/pancakeProductSyncService');
const websiteOrderRepositoryDefault = require('../orders/orderRepository');
const geoRepositoryDefault = require('../integrations/pancake/pancakeGeoRepository');
const {
  listPancakeAddressOptions,
  resolvePancakeAddress,
  saveManualPancakeAddressMapping
} = require('../integrations/pancake/pancakeGeoService');
const addressReconciliationServiceDefault = require('../integrations/pancake/pancakeAddressReconciliationService');
const {
  getPancakeConnectionStatus,
  testPancakeConnection
} = require('../integrations/pancake/pancakeConnectionService');

function createAdminPancakeRouter(dependencies = {}) {
  const router = express.Router();
  const config = dependencies.config || env.pancake;
  const repository = dependencies.repository || repositoryDefault;
  const client = dependencies.client || createPancakeClient(config);
  const catalogRepository = dependencies.catalogRepository || catalogRepositoryDefault;
  const catalogService = dependencies.catalogService || catalogServiceDefault;
  const inventoryRepository = dependencies.inventoryRepository || inventoryRepositoryDefault;
  const inventoryService = dependencies.inventoryService || dependencies.catalogService || inventoryServiceDefault;
  const inventoryOutboxRepository = dependencies.inventoryOutboxRepository || inventoryOutboxRepositoryDefault;
  const inventoryOutboxService = dependencies.inventoryOutboxService || inventoryOutboxServiceDefault;
  const orderRepository = dependencies.orderRepository || orderExportRepositoryDefault;
  const orderService = dependencies.orderService || orderExportServiceDefault;
  const orderSyncRepository = dependencies.orderSyncRepository || orderSyncRepositoryDefault;
  const websiteOrderRepository = dependencies.websiteOrderRepository || websiteOrderRepositoryDefault;
  const geoRepository = dependencies.geoRepository || geoRepositoryDefault;
  const geoService = dependencies.geoService || {
    listPancakeAddressOptions,
    resolvePancakeAddress,
    saveManualPancakeAddressMapping
  };
  const addressReconciliationService = dependencies.addressReconciliationService || addressReconciliationServiceDefault;
  const productSyncRepository = dependencies.productSyncRepository || productSyncRepositoryDefault;
  const productSyncService = dependencies.productSyncService || productSyncServiceDefault;

  router.get('/status', async (_req, res, next) => {
    try {
      const pancake = await getPancakeConnectionStatus({ config, repository });
      const orderSync = await orderSyncRepository.getOrderSyncSummary();
      return res.json({ pancake: { ...pancake, orderSync } });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/test-connection', async (_req, res, next) => {
    try {
      const pancake = await testPancakeConnection({ config, client, repository });
      return res.json({ pancake });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/catalog/status', async (_req, res, next) => {
    try {
      return res.json({ catalog: await catalogService.getCatalogStatus({ config, repository: catalogRepository }) });
    } catch (error) { return next(error); }
  });

  router.post('/catalog/import', async (_req, res, next) => {
    try {
      const catalog = await catalogService.runCatalogImport({ config, client, repository: catalogRepository });
      return res.status(catalog.status === 'concurrent' ? 409 : 200).json({ catalog });
    } catch (error) { return next(error); }
  });

  router.get('/inventory/status', async (_req, res, next) => {
    try {
      return res.json({ inventory: await inventoryService.getInventoryStatus({ repository: inventoryRepository }) });
    } catch (error) { return next(error); }
  });

  router.post('/inventory/reconcile', async (_req, res, next) => {
    try {
      const inventory = await inventoryService.runInventoryReconciliation({ config, client, repository: inventoryRepository });
      return res.status(inventory.status === 'concurrent' ? 409 : 200).json({ inventory });
    } catch (error) { return next(error); }
  });

  router.get('/inventory/sync-dashboard', async (req, res, next) => {
    try {
      return res.json({ inventorySync: await inventoryOutboxRepository.listInventorySyncDashboard({ limit: req.query.limit }) });
    } catch (error) { return next(error); }
  });

  router.post('/inventory/process-outbox', async (_req, res, next) => {
    try {
      const inventorySync = await inventoryOutboxService.processInventorySyncJobs({
        config, client, repository: inventoryOutboxRepository, productSyncRepository
      });
      return res.json({ inventorySync });
    } catch (error) { return next(error); }
  });

  router.get('/orders/status', async (_req, res, next) => {
    try {
      return res.json({ orders: await orderService.getOrderExportStatus({ repository: orderRepository }) });
    } catch (error) { return next(error); }
  });

  router.post('/orders/shadow-build', async (_req, res, next) => {
    try {
      const orders = await orderService.runOrderShadowBuild({ config, client, repository: orderRepository });
      return res.status(orders.status === 'concurrent' ? 409 : 200).json({ orders });
    } catch (error) { return next(error); }
  });

  router.get('/geo/options', async (req, res, next) => {
    try {
      const options = await geoService.listPancakeAddressOptions({
        provinceId: String(req.query.provinceId || '').trim(),
        districtId: String(req.query.districtId || '').trim()
      }, { client });
      return res.json({ options });
    } catch (error) { return next(error); }
  });

  router.put('/orders/:orderNumber/address-mapping', async (req, res, next) => {
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      const order = await websiteOrderRepository.findOrderByNumber(orderNumber, { includeRelated: false });
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      const mapping = await geoService.saveManualPancakeAddressMapping(order.address, {
        provinceId: req.body?.provinceId,
        districtId: req.body?.districtId,
        communeId: req.body?.communeId
      }, { client, repository: geoRepository });
      await orderRepository.saveOrderAddressMapping?.(orderNumber, mapping);
      return res.json({ mapping });
    } catch (error) { return next(error); }
  });

  router.post('/orders/:orderNumber/address-mapping/resolve', async (req, res, next) => {
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      const order = await websiteOrderRepository.findOrderByNumber(orderNumber, { includeRelated: false });
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      const detail = await orderSyncRepository.getOrderSyncDetail(orderNumber);
      if (detail?.pancakeOrderId) {
        const result = await addressReconciliationService.reconcileOneAddress({
          orderNumber, client, config,
          orderRepository: websiteOrderRepository,
          exportRepository: orderRepository,
          syncRepository: orderSyncRepository,
          geoRepository
        });
        return res.status(result.status === 'verified' ? 200 : 409).json({ result });
      }
      const mapping = await geoService.resolvePancakeAddress(order.address, {
        client, repository: geoRepository, forceRefresh: true
      });
      await orderRepository.saveOrderAddressMapping?.(orderNumber, mapping);
      const orders = await orderService.runOrderLiveExport({
        config, client, repository: orderRepository, orderNumber,
        syncRepository: orderSyncRepository, geoRepository
      });
      return res.json({ mapping, orders });
    } catch (error) { return next(error); }
  });

  router.post('/address-reconciliation/preview', async (req, res, next) => {
    try {
      const preview = await addressReconciliationService.previewAddressReconciliation({
        from: String(req.body?.from || '').trim(),
        to: String(req.body?.to || '').trim(),
        limit: req.body?.limit,
        client, config,
        orderRepository: websiteOrderRepository,
        syncRepository: orderSyncRepository,
        geoRepository
      });
      return res.json({ preview });
    } catch (error) { return next(error); }
  });

  router.post('/address-reconciliation/apply', async (req, res, next) => {
    try {
      const reconciliation = await addressReconciliationService.applyAddressReconciliation({
        orderNumbers: Array.isArray(req.body?.orderNumbers) ? req.body.orderNumbers : [],
        confirmed: req.body?.confirmed === true,
        client, config,
        orderRepository: websiteOrderRepository,
        exportRepository: orderRepository,
        syncRepository: orderSyncRepository,
        geoRepository
      });
      return res.json({ reconciliation });
    } catch (error) { return next(error); }
  });

  router.get('/catalog/mappings', async (req, res, next) => {
    try {
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 50);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        const error = new Error('Invalid Pancake mapping pagination.'); error.status = 400; throw error;
      }
      const search = String(req.query.search || '').trim().slice(0, 100);
      const conflictOnly = String(req.query.conflictOnly || 'false') === 'true';
      return res.json({ mappings: await catalogRepository.listMappings({ page, pageSize, conflictOnly, search }) });
    } catch (error) { return next(error); }
  });

  router.get('/references', async (_req, res, next) => {
    try { return res.json({ references: await catalogRepository.listReferences() }); }
    catch (error) { return next(error); }
  });

  router.put('/references/selection', async (req, res, next) => {
    try {
      const selection = Object.fromEntries(['shopId', 'warehouseId', 'orderSourceId'].map((name) => [name, String(req.body?.[name] || '').trim()]));
      if (Object.values(selection).some((value) => value.length > 200)) {
        const error = new Error('Invalid Pancake reference selection.'); error.status = 400; throw error;
      }
      const saved = await catalogService.saveReferenceSelection({ config, repository: catalogRepository, selection });
      return res.json({ selection: saved });
    } catch (error) { return next(error); }
  });

  router.get('/products/status', async (req, res, next) => {
    try {
      const slugs = String(req.query.slugs || '').split(',').map((slug) => slug.trim()).filter(Boolean);
      if (!slugs.length || slugs.length > 100 || slugs.some((slug) => slug.length > 200)) {
        const error = new Error('Provide 1 to 100 valid product slugs.'); error.status = 400; throw error;
      }
      return res.json({ products: await productSyncRepository.listProductSyncStatuses(slugs) });
    } catch (error) { return next(error); }
  });

  router.post('/products/:slug/sync', async (req, res, next) => {
    try {
      const sync = await productSyncService.syncProductToPancake({
        productSlug: req.params.slug,
        config,
        client,
        repository: productSyncRepository
      });
      return res.json({ sync });
    } catch (error) {
      if (error?.sync) {
        return res.status(error.status || 502).json({ error: error.message, code: error.code, sync: error.sync });
      }
      return next(error);
    }
  });

  return router;
}

module.exports = { createAdminPancakeRouter };
