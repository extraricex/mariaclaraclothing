const crypto = require('node:crypto');
const { hasDatabaseUrl, query } = require('../db/postgres');

const memorySessions = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function secureEqualHex(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function fromRow(row) {
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    actorType: row.actor_type,
    actorId: row.actor_id,
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

function usesPostgres(options) {
  return !options.forceMemory && hasDatabaseUrl();
}

async function createAuthSession({ actorType, actorId, ttlMs }, options = {}) {
  const now = (options.now || (() => new Date()))();
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const session = {
    tokenHash: sha256(token),
    csrfTokenHash: sha256(csrfToken),
    actorType: String(actorType || '').trim(),
    actorId: String(actorId || '').trim(),
    expiresAt: new Date(now.getTime() + Number(ttlMs || 0)).toISOString(),
    revokedAt: '',
    createdAt: now.toISOString()
  };
  if (!session.actorType || !session.actorId || !Number.isFinite(Number(ttlMs)) || Number(ttlMs) <= 0) {
    throw new Error('Auth session requires actor type, actor id, and a positive TTL.');
  }

  if (usesPostgres(options)) {
    const executor = options.executor || { query };
    await executor.query(
      `INSERT INTO auth_sessions (
        token_hash, csrf_token_hash, actor_type, actor_id, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.tokenHash, session.csrfTokenHash, session.actorType, session.actorId, session.expiresAt, session.createdAt]
    );
  } else {
    memorySessions.set(session.tokenHash, session);
  }
  return { token, csrfToken, session };
}

async function findAuthSession(token, options = {}) {
  const tokenHash = sha256(token);
  const now = (options.now || (() => new Date()))();
  if (usesPostgres(options)) {
    const executor = options.executor || { query };
    const result = await executor.query(
      `SELECT * FROM auth_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
      [tokenHash, now.toISOString()]
    );
    return fromRow(result.rows[0]);
  }
  const session = memorySessions.get(tokenHash) || null;
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= now.getTime()) return null;
  return session;
}

async function revokeAuthSession(token, options = {}) {
  const tokenHash = sha256(token);
  if (usesPostgres(options)) {
    const executor = options.executor || { query };
    await executor.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash]
    );
  } else {
    const session = memorySessions.get(tokenHash);
    if (session) memorySessions.set(tokenHash, { ...session, revokedAt: new Date().toISOString() });
  }
}

async function revokeActorSessions(actorType, actorId, options = {}) {
  if (usesPostgres(options)) {
    const executor = options.executor || { query };
    await executor.query(
      `UPDATE auth_sessions SET revoked_at = now()
       WHERE actor_type = $1 AND actor_id = $2 AND revoked_at IS NULL`,
      [actorType, actorId]
    );
    return;
  }
  for (const [key, session] of memorySessions) {
    if (session.actorType === actorType && session.actorId === actorId) {
      memorySessions.set(key, { ...session, revokedAt: new Date().toISOString() });
    }
  }
}

function verifySessionCsrf(session, csrfToken) {
  if (!session?.csrfTokenHash || !csrfToken) return false;
  return secureEqualHex(session.csrfTokenHash, sha256(csrfToken));
}

function resetMemorySessions() {
  memorySessions.clear();
}

module.exports = {
  createAuthSession,
  findAuthSession,
  resetMemorySessions,
  revokeActorSessions,
  revokeAuthSession,
  verifySessionCsrf
};
