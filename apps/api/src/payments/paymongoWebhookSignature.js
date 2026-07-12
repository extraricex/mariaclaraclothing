const crypto = require('node:crypto');

function parseSignature(header) {
  return Object.fromEntries(String(header || '').split(',').map((part) => part.trim().split('=', 2)).filter(([key, value]) => key && value));
}

function timingSafeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left || '')) || !/^[a-f0-9]{64}$/i.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function verifyPayMongoSignature({ rawBody, header, secret, livemode, now = Date.now(), toleranceSeconds = 300 }) {
  const parts = parseSignature(header);
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;
  const supplied = livemode ? parts.li : parts.te;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${Buffer.from(rawBody || '').toString('utf8')}`).digest('hex');
  return timingSafeEqualHex(supplied, expected);
}

module.exports = { parseSignature, verifyPayMongoSignature };
