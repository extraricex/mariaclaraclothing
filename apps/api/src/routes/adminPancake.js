const express = require('express');
const { env } = require('../config/env');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const repositoryDefault = require('../integrations/pancake/pancakeConnectionRepository');
const catalogRepositoryDefault = require('../integrations/pancake/pancakeCatalogRepository');
const catalogServiceDefault = require('../integrations/pancake/pancakeCatalogService');
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

  router.get('/status', async (_req, res, next) => {
    try {
      const pancake = await getPancakeConnectionStatus({ config, repository });
      return res.json({ pancake });
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

  return router;
}

module.exports = { createAdminPancakeRouter };
