const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('preview overlay runs a pinned hardened tunnel without exposing ports or secrets', () => {
  const compose = read('docker-compose.preview.yml');

  assert.match(compose, /cloudflare\/cloudflared:2026\.6\.1/);
  assert.match(compose, /TUNNEL_TOKEN:\s*\$\{CLOUDFLARE_TUNNEL_TOKEN:\?/);
  assert.match(compose, /command:\s*tunnel run/);
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:[\s\S]*- ALL/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /eyJ[A-Za-z0-9_-]{20,}/);
});

test('preview design routes the tunnel only to the nginx service', () => {
  const design = read('docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md');

  assert.match(design, /cloudflared.*Compose sidecar/i);
  assert.match(design, /`http:\/\/web:80`/);
  assert.match(design, /Port `3000`.*PostgreSQL.*never/i);
});

test('preview operations guide documents protected lifecycle and verification', () => {
  const guide = read('docs/cloudflare-preview-operations.md');

  assert.match(guide, /preview\.mariaclaraclothing\.com/);
  assert.match(guide, /CLOUDFLARE_TUNNEL_TOKEN/);
  assert.match(guide, /One-time PIN/i);
  assert.match(guide, /explicit email/i);
  assert.match(guide, /docker compose -f docker-compose\.yml -f docker-compose\.preview\.yml up -d/);
  assert.match(guide, /docker compose -f docker-compose\.yml -f docker-compose\.preview\.yml logs/);
  assert.match(guide, /docker compose -f docker-compose\.yml -f docker-compose\.preview\.yml stop cloudflared/);
  assert.match(guide, /Do not run.*-v/is);
  assert.match(guide, /127\.0\.0\.1:8081\/api\/health/);
});
