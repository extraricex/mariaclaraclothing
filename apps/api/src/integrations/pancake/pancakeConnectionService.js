function publicStatus(config, stored = {}) {
  const defaultHealth = config.mode === 'disabled'
    ? 'disabled'
    : (config.configured ? 'not_checked' : 'incomplete');
  return {
    mode: config.mode,
    configured: Boolean(config.configured),
    apiBaseUrl: config.apiBaseUrl || 'https://pos.pages.fm/api/v1',
    apiKeyConfigured: Boolean(config.apiKey),
    webhookSecretConfigured: Boolean(config.webhookSecret),
    shopId: String(config.shopId || ''),
    warehouseId: String(config.warehouseId || ''),
    orderSourceId: String(config.orderSourceId || ''),
    healthStatus: stored.healthStatus || defaultHealth,
    lastCheckedAt: stored.lastCheckedAt || '',
    lastConnectedAt: stored.lastConnectedAt || '',
    lastErrorCode: stored.lastErrorCode || '',
    ...(stored.shop ? { shop: stored.shop } : {})
  };
}

async function getPancakeConnectionStatus({ config, repository }) {
  const stored = await repository.getConnectionStatus();
  return publicStatus(config, stored || {});
}

async function testPancakeConnection({ config, client, repository, now = () => new Date() }) {
  const started = Date.now();
  const checkedAt = now().toISOString();
  let result;
  if (config.mode === 'disabled') {
    result = { healthStatus: 'disabled', lastErrorCode: '' };
  } else if (!config.configured) {
    result = { healthStatus: 'incomplete', lastErrorCode: 'pancake_configuration_incomplete' };
  } else {
    try {
      const response = await client.listShops();
      const shop = (Array.isArray(response.shops) ? response.shops : [])
        .find((candidate) => String(candidate.id) === String(config.shopId));
      result = shop
        ? {
            healthStatus: 'connected',
            lastErrorCode: '',
            lastConnectedAt: checkedAt,
            shop: { id: String(shop.id), name: String(shop.name || '') }
          }
        : { healthStatus: 'shop_not_found', lastErrorCode: 'pancake_shop_not_found' };
    } catch (error) {
      const code = String(error?.code || 'pancake_unknown_error');
      result = { healthStatus: 'unavailable', lastErrorCode: /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_unknown_error' };
    }
  }

  const record = {
    mode: config.mode,
    shopId: String(config.shopId || ''),
    warehouseId: String(config.warehouseId || ''),
    orderSourceId: String(config.orderSourceId || ''),
    lastCheckedAt: checkedAt,
    durationMs: Date.now() - started,
    ...result
  };
  await repository.recordConnectionCheck(record);
  return publicStatus(config, record);
}

module.exports = { getPancakeConnectionStatus, publicStatus, testPancakeConnection };
