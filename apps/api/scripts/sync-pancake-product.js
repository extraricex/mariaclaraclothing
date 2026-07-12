const { env } = require('../src/config/env');
const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
const { syncProductToPancake } = require('../src/integrations/pancake/pancakeProductSyncService');

async function run(productSlug) {
  const slug = String(productSlug || '').trim();
  if (!slug) throw new Error('Usage: node scripts/sync-pancake-product.js <product-slug>');

  return syncProductToPancake({
    productSlug: slug,
    config: env.pancake,
    client: createPancakeClient(env.pancake)
  });
}

if (require.main === module) {
  run(process.argv[2])
    .then((result) => process.stdout.write(`${JSON.stringify({ ok: true, sync: result }, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({
        ok: false,
        code: error.code || 'pancake_product_sync_failed',
        message: error.message,
        sync: error.sync || null
      }, null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { run };
