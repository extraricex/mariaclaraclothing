#!/usr/bin/env node
const { env } = require('../src/config/env');
const {
  CONTROLLED_TEST_TTL_MS,
  createControlledMetaTestGrant,
  normalizeReference,
  normalizeTestEventCode
} = require('../src/marketing/metaControlledTest');

const reference = normalizeReference(process.argv[2]);
const testEventCode = normalizeTestEventCode(process.argv[3]);

if (!reference || !testEventCode || !env.meta.enabled) {
  process.stderr.write('Usage: node scripts/create-meta-controlled-test-grant.js META-TEST-<REFERENCE> TEST<CODE>\n');
  process.exitCode = 1;
} else {
  const now = new Date();
  const grant = createControlledMetaTestGrant({
    reference,
    testEventCode,
    datasetId: env.meta.pixelId,
    now
  }, env.checkout.confirmationSecret);
  process.stdout.write(`${JSON.stringify({
    reference,
    datasetId: env.meta.pixelId,
    grant,
    expiresAt: new Date(now.getTime() + CONTROLLED_TEST_TTL_MS).toISOString()
  })}\n`);
}
