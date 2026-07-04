const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let sessions = {};
try {
  sessions = require('../src/auth/sessionRepository');
} catch (_error) {
  // The first TDD run proves the session module does not exist yet.
}

test('auth session repository exposes the session lifecycle contract', () => {
  for (const name of ['createAuthSession', 'findAuthSession', 'revokeAuthSession', 'verifySessionCsrf']) {
    assert.equal(typeof sessions[name], 'function', `${name} must be implemented`);
  }
});

test('opaque sessions verify token and CSRF values without storing raw secrets', async () => {
  sessions.resetMemorySessions?.();
  const now = new Date('2026-07-01T00:00:00.000Z');
  const created = await sessions.createAuthSession?.({
    actorType: 'customer',
    actorId: 'customer-1',
    ttlMs: 60_000
  }, { now: () => now, forceMemory: true });

  assert.ok(created?.token);
  assert.ok(created?.csrfToken);
  assert.notEqual(created?.session?.tokenHash, created?.token);
  assert.notEqual(created?.session?.csrfTokenHash, created?.csrfToken);

  const found = await sessions.findAuthSession?.(created.token, { now: () => now, forceMemory: true });
  assert.equal(found?.actorType, 'customer');
  assert.equal(found?.actorId, 'customer-1');
  assert.equal(sessions.verifySessionCsrf?.(found, created.csrfToken), true);
  assert.equal(sessions.verifySessionCsrf?.(found, 'wrong-csrf-token'), false);
});

test('expired and revoked sessions cannot authenticate', async () => {
  sessions.resetMemorySessions?.();
  const createdAt = new Date('2026-07-01T00:00:00.000Z');
  const created = await sessions.createAuthSession?.({
    actorType: 'admin',
    actorId: 'admin',
    ttlMs: 1_000
  }, { now: () => createdAt, forceMemory: true });
  assert.ok(created?.token);

  const expired = await sessions.findAuthSession?.(created.token, {
    now: () => new Date(createdAt.getTime() + 1_001),
    forceMemory: true
  });
  assert.equal(expired, null);

  const fresh = await sessions.createAuthSession?.({
    actorType: 'admin', actorId: 'admin', ttlMs: 60_000
  }, { now: () => createdAt, forceMemory: true });
  await sessions.revokeAuthSession?.(fresh.token, { forceMemory: true });
  assert.equal(await sessions.findAuthSession?.(fresh.token, { now: () => createdAt, forceMemory: true }), null);
});

test('database schema defines expiring revocable auth sessions', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(schema, /token_hash text PRIMARY KEY/);
  assert.match(schema, /csrf_token_hash text NOT NULL/);
  assert.match(schema, /expires_at timestamptz NOT NULL/);
  assert.match(schema, /revoked_at timestamptz/);
});
