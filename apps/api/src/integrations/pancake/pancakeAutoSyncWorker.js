const { env } = require('../../config/env');
const { createPancakeClient } = require('./pancakeClient');
const catalogRepositoryDefault = require('./pancakeCatalogRepository');
const catalogServiceDefault = require('./pancakeCatalogService');
const inventoryRepositoryDefault = require('./pancakeInventoryRepository');
const inventoryServiceDefault = require('./pancakeInventoryService');
const inventoryOutboxRepositoryDefault = require('./pancakeInventoryOutboxRepository');
const inventoryOutboxServiceDefault = require('./pancakeInventoryOutboxService');
const orderRepositoryDefault = require('./pancakeOrderExportRepository');
const orderServiceDefault = require('./pancakeOrderExportService');
const orderSyncRepositoryDefault = require('./pancakeOrderSyncRepository');
const orderSyncServiceDefault = require('./pancakeOrderSyncService');

function shouldRunPancakeAutoSync(config = {}) {
  return Boolean(
    config.autoSyncEnabled
    && config.apiKeyConfigured
    && (config.mode === 'read_only' || config.mode === 'shadow' || config.mode === 'live')
  );
}

function skipReason(config = {}) {
  if (!config.autoSyncEnabled) return 'pancake_auto_sync_disabled';
  if (!config.apiKeyConfigured) return 'pancake_configuration_incomplete';
  return 'pancake_mode_not_allowed';
}

function workerIntervalMs(config = {}) {
  const autoInterval = Number(config.autoSyncIntervalMs || 0);
  const orderInterval = Number(config.orderPollIntervalMs || 0);
  if (autoInterval > 0 && orderInterval > 0) return Math.min(autoInterval, orderInterval);
  return autoInterval || orderInterval || 60 * 1000;
}

function safeCode(error) {
  const code = String(error?.code || '');
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_auto_sync_failed';
}

function createPancakeAutoSyncWorker({
  config = env.pancake,
  client = createPancakeClient(config),
  catalogRepository = catalogRepositoryDefault,
  catalogService = catalogServiceDefault,
  inventoryRepository = inventoryRepositoryDefault,
  inventoryService = inventoryServiceDefault,
  inventoryOutboxRepository = inventoryOutboxRepositoryDefault,
  inventoryOutboxService = inventoryOutboxServiceDefault,
  orderRepository = orderRepositoryDefault,
  orderService = orderServiceDefault,
  orderSyncRepository = orderSyncRepositoryDefault,
  orderSyncService = orderSyncServiceDefault,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearTimeoutFn = clearTimeout,
  clearIntervalFn = clearInterval,
  logger = console
} = {}) {
  let startupTimer;
  let intervalTimer;
  let running = false;
  let stopped = true;

  async function guardedStep(name, work) {
    try {
      return await work();
    } catch (error) {
      const result = { status: 'failed', lastErrorCode: safeCode(error) };
      logger.error?.(`Pancake auto sync ${name} failed:`, error?.message || error);
      return result;
    }
  }

  async function runOnce() {
    if (!shouldRunPancakeAutoSync(config)) {
      return { status: 'skipped', reason: skipReason(config) };
    }
    if (running) return { status: 'skipped', reason: 'pancake_auto_sync_running' };

    running = true;
    try {
      const readOnlyConfig = { ...config, mode: 'read_only' };
      const result = {
        status: 'complete',
        catalog: await guardedStep('catalog import', () => catalogService.runCatalogImport({
          config: readOnlyConfig,
          client,
          repository: catalogRepository
        })),
        inventory: null,
        inventoryOutbound: null,
        orders: null,
        orderInbound: null,
        orderOutbound: null
      };
      result.orders = config.mode === 'live'
        ? await guardedStep('order live export', () => orderService.runOrderLiveExport({
          config,
          client,
          repository: orderRepository
        }))
        : await guardedStep('order shadow build', () => orderService.runOrderShadowBuild({
          config,
          repository: orderRepository
        }));
      result.orderInbound = await guardedStep('inbound order sync', () => orderSyncService.pollInboundPancakeOrders({
        config,
        client,
        syncRepository: orderSyncRepository
      }));
      result.orderOutbound = await guardedStep('outbound order sync', () => orderSyncService.processOutboundOrderEvents({
        config,
        client,
        syncRepository: orderSyncRepository
      }));
      result.inventoryOutbound = config.mode === 'live'
        ? await guardedStep('outbound inventory sync', () => inventoryOutboxService.processInventorySyncJobs({
          config, client, repository: inventoryOutboxRepository
        }))
        : { status: 'skipped', reason: 'pancake_mode_not_live' };
      result.inventory = await guardedStep('inventory reconciliation', () => inventoryService.runInventoryReconciliation({
        config: readOnlyConfig,
        client,
        repository: inventoryRepository
      }));
      logger.info?.('Pancake auto sync completed', {
        catalog: result.catalog?.status,
        inventory: result.inventory?.status,
        inventoryOutbound: result.inventoryOutbound?.status,
        orders: result.orders?.status,
        orderInbound: result.orderInbound?.status,
        orderOutbound: result.orderOutbound?.status
      });
      return result;
    } finally {
      running = false;
    }
  }

  async function tick() {
    if (stopped || running) return;
    try {
      await runOnce();
    } catch (error) {
      logger.error?.('Pancake auto sync worker failed:', error?.message || error);
    }
  }

  function start() {
    if (!stopped || !shouldRunPancakeAutoSync(config)) return;
    stopped = false;
    startupTimer = setTimeoutFn(() => void tick(), config.autoSyncStartupDelayMs || 0);
    startupTimer?.unref?.();
    intervalTimer = setIntervalFn(() => void tick(), workerIntervalMs(config));
    intervalTimer?.unref?.();
  }

  function stop() {
    stopped = true;
    if (startupTimer) clearTimeoutFn(startupTimer);
    if (intervalTimer) clearIntervalFn(intervalTimer);
    startupTimer = undefined;
    intervalTimer = undefined;
  }

  return { runOnce, start, stop };
}

module.exports = { createPancakeAutoSyncWorker, shouldRunPancakeAutoSync, workerIntervalMs };
