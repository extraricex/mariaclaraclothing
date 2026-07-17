const crypto = require('node:crypto');

function secret(value = process.env.CART_RECOVERY_SECRET || process.env.ORDER_CONFIRMATION_SECRET) {
  const normalized = String(value || '');
  if (normalized.length < 32) {
    const error = new Error('Cart recovery is not configured.');
    error.code = 'CART_RECOVERY_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  return normalized;
}

function createCartRecoveryToken(sessionId, secretValue) {
  const encoded = Buffer.from(String(sessionId || ''), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret(secretValue)).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyCartRecoveryToken(token, secretValue) {
  const [encoded, provided, extra] = String(token || '').split('.');
  if (!encoded || !provided || extra) return '';
  const expected = crypto.createHmac('sha256', secret(secretValue)).update(encoded).digest();
  let candidate;
  try { candidate = Buffer.from(provided, 'base64url'); } catch (_error) { return ''; }
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return '';
  try {
    const sessionId = Buffer.from(encoded, 'base64url').toString('utf8');
    return /^[a-zA-Z0-9_-]{8,200}$/.test(sessionId) ? sessionId : '';
  } catch (_error) {
    return '';
  }
}

module.exports = { createCartRecoveryToken, verifyCartRecoveryToken };
