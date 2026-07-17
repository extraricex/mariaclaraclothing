import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../public/meta-bootstrap.js', import.meta.url), 'utf8');
const routeTracker = readFileSync(new URL('../src/components/MetaRouteTracker.jsx', import.meta.url), 'utf8');
const webDockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../../../deploy/docker-compose.production.yml', import.meta.url), 'utf8');

test('initial HTML loads the external settings-backed Meta Pixel bootstrap', () => {
  assert.match(html, /<script src="\/meta-bootstrap\.js"><\/script>/);
  assert.match(bootstrap, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(bootstrap, /fbq\('init', pixelId\)/);
  assert.match(bootstrap, /fbq\('set', 'autoConfig', false, pixelId\)/);
  assert.doesNotMatch(bootstrap, /fbq\('track', 'PageView'\)/);
  assert.match(bootstrap, /\/api\/storefront-settings/);
  assert.doesNotMatch(html, /facebook\.com\/tr\?/);
  assert.doesNotMatch(`${html}\n${bootstrap}`, /595813035761213/);
});

test('external bootstrap honors admin enable and consent settings and fails closed', () => {
  assert.match(bootstrap, /config\.enabled/);
  assert.match(bootstrap, /config\.requireConsent/);
  assert.match(bootstrap, /maria-clara-meta-tracking-consent/);
  assert.match(bootstrap, /if \(!consent\)[\s\S]*__mariaClaraFacebookConsent = 'revoke';[\s\S]*return;/);
  assert.match(bootstrap, /centralized route tracker sends the initial PageView/);
  assert.match(bootstrap, /enabled: false/);
  assert.match(bootstrap, /requireConsent: true/);
});

test('Meta bootstrap loads once on customer routes and leaves Purchase gating to centralized tracking', () => {
  assert.match(bootstrap, /browserPurchaseEnabled/);
  assert.match(bootstrap, /\.toLowerCase\(\)/);
  assert.match(bootstrap, /Server CAPI is authoritative/);
  assert.doesNotMatch(bootstrap, /purchaseSensitivePath/);
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
