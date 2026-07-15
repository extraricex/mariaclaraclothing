import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('nginx applies security headers to the SPA and proxied assets', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'nginx.conf'), 'utf8');
  assert.match(source, /X-Content-Type-Options\s+"nosniff"\s+always/);
  assert.match(source, /X-Frame-Options\s+"DENY"\s+always/);
  assert.match(source, /Referrer-Policy\s+"strict-origin-when-cross-origin"\s+always/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /Strict-Transport-Security\s+"max-age=15552000"\s+always/);
  assert.match(source, /Content-Security-Policy-Report-Only/);
  assert.match(source, /location \^~ \/assets\/[\s\S]*expires 1y/);
});
