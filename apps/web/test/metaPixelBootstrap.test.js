import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('initial HTML contains a detectable Meta Pixel bootstrap', () => {
  assert.match(html, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(html, /fbq\('init', '595813035761213'\)/);
  assert.match(html, /fbq\('track', 'PageView'\)/);
  assert.match(html, /facebook\.com\/tr\?id=595813035761213&amp;ev=PageView&amp;noscript=1/);
  assert.match(html, /\/api\/storefront-settings/);
});

test('HTML bootstrap honors admin enable and consent settings', () => {
  assert.match(html, /config\.enabled/);
  assert.match(html, /config\.requireConsent/);
  assert.match(html, /maria-clara-meta-tracking-consent/);
  assert.match(html, /__mariaClaraInitialMetaPageViewPath/);
});
