require('dotenv').config();

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

function metaConfig(source = process.env) {
  const enabled = source.META_CONVERSIONS_API_ENABLED === 'true';
  if (!enabled) return { enabled: false };

  const required = [
    'META_PIXEL_ID',
    'META_CONVERSIONS_API_ACCESS_TOKEN',
    'META_GRAPH_API_VERSION',
    'DATABASE_URL'
  ];
  for (const name of required) {
    if (!String(source[name] || '').trim()) {
      throw new Error(`${name} is required when Meta CAPI is enabled`);
    }
  }

  return {
    enabled: true,
    pixelId: String(source.META_PIXEL_ID).trim(),
    accessToken: String(source.META_CONVERSIONS_API_ACCESS_TOKEN),
    graphApiVersion: String(source.META_GRAPH_API_VERSION).trim(),
    testEventCode: String(source.META_CONVERSIONS_API_TEST_EVENT_CODE || '').trim()
  };
}

const env = {
  port: Number(optional('PORT', '3000')),
  meta: metaConfig()
};

module.exports = { env, metaConfig };
