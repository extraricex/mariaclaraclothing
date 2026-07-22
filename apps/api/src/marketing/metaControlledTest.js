const crypto = require('node:crypto');

const CONTROLLED_TEST_TTL_MS = 30 * 60 * 1000;
const TEST_CODE_PATTERN = /^TEST\d{4,12}$/;
const TEST_REFERENCE_PATTERN = /^META-TEST-[A-Z0-9-]{8,80}$/;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function normalizeReference(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return TEST_REFERENCE_PATTERN.test(normalized) ? normalized : '';
}

function normalizeTestEventCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return TEST_CODE_PATTERN.test(normalized) ? normalized : '';
}

function signingSecret(value) {
  const secret = String(value || '');
  if (secret.length < 32) throw new Error('A 32-character confirmation secret is required.');
  return secret;
}

function signature(payload, secret) {
  return crypto.createHmac('sha256', signingSecret(secret)).update(payload).digest('base64url');
}

function createControlledMetaTestGrant({
  reference,
  testEventCode,
  datasetId,
  now = new Date(),
  ttlMs = CONTROLLED_TEST_TTL_MS,
  nonce = crypto.randomUUID()
} = {}, secret) {
  const normalizedReference = normalizeReference(reference);
  const normalizedCode = normalizeTestEventCode(testEventCode);
  const normalizedDatasetId = String(datasetId || '').trim();
  const issuedAt = now instanceof Date ? now : new Date(now);
  if (!normalizedReference || !normalizedCode || !/^\d{8,30}$/.test(normalizedDatasetId) || !Number.isFinite(issuedAt.getTime())) {
    throw new Error('Controlled Meta test grant input is invalid.');
  }
  const boundedTtl = Math.min(CONTROLLED_TEST_TTL_MS, Math.max(60_000, Number(ttlMs) || CONTROLLED_TEST_TTL_MS));
  const payload = base64url(JSON.stringify({
    version: 1,
    reference: normalizedReference,
    testEventCode: normalizedCode,
    datasetId: normalizedDatasetId,
    issuedAt: Math.floor(issuedAt.getTime() / 1000),
    expiresAt: Math.floor((issuedAt.getTime() + boundedTtl) / 1000),
    nonce: String(nonce || crypto.randomUUID()).slice(0, 100)
  }));
  return `${payload}.${signature(payload, secret)}`;
}

function verifyControlledMetaTestGrant(token, {
  secret,
  expectedDatasetId,
  now = new Date()
} = {}) {
  const [payload, suppliedSignature, ...extra] = String(token || '').trim().split('.');
  if (!payload || !suppliedSignature || extra.length) return null;
  let expectedSignature;
  try {
    expectedSignature = signature(payload, secret);
  } catch (_error) {
    return null;
  }
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_error) {
    return null;
  }
  const reference = normalizeReference(decoded.reference);
  const testEventCode = normalizeTestEventCode(decoded.testEventCode);
  const datasetId = String(decoded.datasetId || '').trim();
  const currentSeconds = Math.floor(new Date(now).getTime() / 1000);
  if (decoded.version !== 1 || !reference || !testEventCode || datasetId !== String(expectedDatasetId || '').trim()
    || !Number.isInteger(decoded.issuedAt) || !Number.isInteger(decoded.expiresAt)
    || decoded.expiresAt <= currentSeconds || decoded.issuedAt > currentSeconds + 60
    || decoded.expiresAt - decoded.issuedAt > Math.floor(CONTROLLED_TEST_TTL_MS / 1000)) return null;
  return {
    reference,
    testEventCode,
    datasetId,
    issuedAt: decoded.issuedAt,
    expiresAt: decoded.expiresAt,
    nonce: String(decoded.nonce || '')
  };
}

function isControlledMetaTestOrder(order, { now = new Date() } = {}) {
  const metadata = order?.paymentMetadata || {};
  const reference = normalizeReference(metadata.metaTestReference);
  const expiresAt = Number(metadata.metaTestGrantExpiresAt || 0);
  return Boolean(
    order?.isTestOrder
      && metadata.metaControlledTest === true
      && reference
      && String(metadata.metaPrimaryDatasetId || '').trim()
      && Number.isInteger(expiresAt)
      && expiresAt > Math.floor(new Date(now).getTime() / 1000)
  );
}

module.exports = {
  CONTROLLED_TEST_TTL_MS,
  createControlledMetaTestGrant,
  isControlledMetaTestOrder,
  normalizeReference,
  normalizeTestEventCode,
  verifyControlledMetaTestGrant
};
