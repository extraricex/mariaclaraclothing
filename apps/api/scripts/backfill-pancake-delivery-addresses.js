#!/usr/bin/env node
const { env } = require('../src/config/env');
const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
const {
  backfillPancakeDeliveryAddresses
} = require('../src/integrations/pancake/pancakeAddressBackfillService');

async function main() {
  const apply = process.argv.includes('--apply');
  const summary = await backfillPancakeDeliveryAddresses({
    apply,
    client: createPancakeClient(env.pancake),
    config: env.pancake
  });
  console.log(JSON.stringify(summary));
  if (summary.failedCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error?.message || 'Address backfill failed.') }));
  process.exitCode = 1;
});
