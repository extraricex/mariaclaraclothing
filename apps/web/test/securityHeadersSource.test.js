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
  assert.match(source, /add_header Content-Security-Policy /);
  assert.doesNotMatch(source, /Content-Security-Policy-Report-Only/);
  assert.match(source, /script-src 'self' 'nonce-\$request_id' https:\/\/connect\.facebook\.net/);
  assert.match(source, /location \^~ \/assets\/[\s\S]*expires 1y/);
  assert.match(source, /location = \/ \{\s*rewrite \^ \/index\.html\?seo_path=\/ last;/);
});

test('production proxy recovers cleanly during API container handovers', async () => {
  const nginx = await readFile(path.join(import.meta.dirname, '..', 'nginx.conf'), 'utf8');
  const compose = await readFile(path.join(import.meta.dirname, '..', '..', '..', 'deploy', 'docker-compose.production.yml'), 'utf8');
  const caddy = await readFile(path.join(import.meta.dirname, '..', '..', '..', 'deploy', 'Caddyfile.production'), 'utf8');
  const release = await readFile(path.join(import.meta.dirname, '..', '..', '..', 'deploy', 'release-production.sh'), 'utf8');

  assert.match(nginx, /resolver 127\.0\.0\.11 valid=1s/);
  assert.match(nginx, /resolver_timeout 1s;/);
  assert.match(nginx, /SERVICE_TEMPORARILY_UNAVAILABLE/);
  assert.match(nginx, /Retry-After "1"/);
  assert.match(compose, /web:[\s\S]*?depends_on:[\s\S]*?api:[\s\S]*?condition: service_started/);
  assert.match(compose, /interval: 5s/);
  assert.match(caddy, /lb_try_duration 5s/);
  assert.match(caddy, /lb_try_interval 100ms/);
  assert.match(release, /compose build api web/);
  assert.match(release, /wait_for_api/);
  assert.match(release, /compose up -d --no-deps --remove-orphans web/);
});
