import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../public/meta-bootstrap.js', import.meta.url), 'utf8');
const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');
const routeTracker = readFileSync(new URL('../src/components/MetaRouteTracker.jsx', import.meta.url), 'utf8');
const webDockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../../../deploy/docker-compose.production.yml', import.meta.url), 'utf8');

test('initial HTML defers the settings bootstrap without loading remote Meta code', () => {
  assert.match(html, /<script defer src="\/meta-bootstrap\.js\?v=\d+"><\/script>/);
  assert.doesNotMatch(bootstrap, /connect\.facebook\.net|fbevents|fbq\(/);
  assert.match(bootstrap, /\/api\/storefront-settings/);
  assert.doesNotMatch(html, /facebook\.com\/tr\?/);
  assert.doesNotMatch(`${html}\n${bootstrap}`, /595813035761213/);
  assert.match(nginx, /location = \/meta-bootstrap\.js[\s\S]*Cache-Control "no-cache, must-revalidate"/);
  assert.match(bootstrap, /cache: 'no-cache'/);
});

test('React schedules Meta after the critical visual window and retains consent-aware initialization', () => {
  assert.match(routeTracker, /requestIdleCallback/);
  assert.match(routeTracker, /\['pointerdown', 'touchstart', 'keydown'\]/);
  assert.match(routeTracker, /window\.setTimeout\(finish, 3500\)/);
  assert.match(routeTracker, /configureFacebookMetaPixel\(pixelSettings\)/);
  assert.match(routeTracker, /initializeFacebookMetaPixel/);
  assert.match(routeTracker, /flushPendingFacebookEvents/);
});

test('Meta bootstrap only shares the single settings request with the React app', () => {
  assert.match(bootstrap, /__mariaClaraStorefrontSettingsPromise = settingsRequest/);
  assert.doesNotMatch(bootstrap, /browserPurchaseEnabled|Purchase|customerPath/);
});

test('privacy-safe first-party page views are not gated by Meta Pixel initialization', () => {
  assert.match(routeTracker, /const initialized = initializeFacebookMetaPixel/);
  assert.match(routeTracker, /trackFacebookPageView\(path\);\s*if \(initialized\) flushPendingFacebookEvents/);
});

test('production has no second build-time Meta Pixel configuration', () => {
  assert.doesNotMatch(webDockerfile, /VITE_FACEBOOK_META_PIXEL/);
  assert.doesNotMatch(productionCompose, /VITE_FACEBOOK_META_PIXEL/);
  assert.match(productionCompose, /META_PIXEL_ID/);
});
