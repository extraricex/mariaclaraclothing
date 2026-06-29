const crypto = require('node:crypto');

function deriveConfirmationToken(orderNumber, idempotencyKey, secret) {
  return crypto.createHmac('sha256', String(secret))
    .update(`order-confirmation:${orderNumber}:${idempotencyKey}`)
    .digest('base64url');
}

function hashConfirmationToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function verifyConfirmationToken(token, expectedHash) {
  const actual = hashConfirmationToken(token);
  const expected = String(expectedHash || '');
  if (!token || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

module.exports = {
  deriveConfirmationToken,
  hashConfirmationToken,
  verifyConfirmationToken
};
