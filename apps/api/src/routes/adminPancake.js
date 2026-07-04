const express = require('express');
const { env } = require('../config/env');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const repositoryDefault = require('../integrations/pancake/pancakeConnectionRepository');
const {
  getPancakeConnectionStatus,
  testPancakeConnection
} = require('../integrations/pancake/pancakeConnectionService');

function createAdminPancakeRouter(dependencies = {}) {
  const router = express.Router();
  const config = dependencies.config || env.pancake;
  const repository = dependencies.repository || repositoryDefault;
  const client = dependencies.client || createPancakeClient(config);

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

  return router;
}

module.exports = { createAdminPancakeRouter };
