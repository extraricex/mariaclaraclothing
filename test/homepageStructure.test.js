const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const homepage = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('homepage contains Shopify-style visual prototype sections', () => {
  assert.match(homepage, /data-announcement-bar/);
  assert.match(homepage, /data-menu-drawer/);
  assert.match(homepage, /data-search-overlay/);
  assert.match(homepage, /class="[^"]*\bshopify-slideshow\b/);
  assert.match(homepage, /id="new-arrivals"/);
  assert.match(homepage, /id="freedom-of-mind"/);
  assert.match(homepage, /data-video-poster/);
  assert.match(homepage, />ABOUT US</);
  assert.doesNotMatch(homepage, /class="image-banner"/);
  assert.doesNotMatch(homepage, /Maria Clara collection banner/);
});

test('homepage applies the requested carousel and uppercase about layout', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const shellScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'shell.js'), 'utf8');

  assert.match(homepage, /<section class="shopify-slideshow homepage-carousel"[^>]*data-carousel/);
  assert.match(homepage, /data-homepage-banners/);
  assert.match(styles, /\.shopify-header\s*{[^}]*grid-template-columns:\s*auto\s+1fr\s+auto/s);
  assert.match(styles, /\.logo-mark\s*{[^}]*background:\s*transparent/s);
  assert.match(styles, /\.shopify-slideshow\s*{[^}]*aspect-ratio:\s*9795\s*\/\s*3681/s);
  assert.match(styles, /\.shopify-slideshow\s*{[^}]*height:\s*auto/s);
  assert.match(styles, /\.homepage-carousel \.slide img\s*{[^}]*object-fit:\s*contain/s);
  assert.match(styles, /\.homepage-carousel \.slide img\s*{[^}]*object-position:\s*top center/s);
  assert.doesNotMatch(styles, /\.slide,\s*\.slide img\s*{[^}]*min-height:\s*72vh/s);
  assert.match(styles, /\.rich-text-section\s*{[^}]*text-transform:\s*uppercase/s);
  assert.match(shellScript, /initializeCarousel/);
  assert.match(shellScript, /renderHomepageBanners/);
  assert.match(shellScript, /getSiteContent/);
  assert.match(homepage, /AT <strong>MARIA CLARA CLOTHING<\/strong>/);
  assert.match(homepage, /STAY IN PEACE OF MIND/);
});

test('homepage banner removes CTA buttons and uses smooth carousel animation', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.doesNotMatch(homepage, /class="shopify-button"/);
  assert.doesNotMatch(homepage, /class="slide-copy/);
  assert.match(styles, /\.slide\s*{[^}]*position:\s*absolute[^}]*opacity:\s*0[^}]*transform:\s*translateX\(2\.5%\)/s);
  assert.match(styles, /\.slide\.is-active\s*{[^}]*opacity:\s*1[^}]*transform:\s*translateX\(0\)/s);
  assert.match(styles, /\.slide img\s*{[^}]*transform:\s*scale\(1\.015\)[^}]*transition:\s*transform\s+6200ms\s+ease/s);
});

test('frontend remains responsive while hero height follows screen width', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.shopify-prototype\s*{[^}]*overflow-x:\s*hidden/s);
  assert.doesNotMatch(styles, /\.shopify-slideshow\s*{[^}]*height:\s*500px/s);
  assert.doesNotMatch(styles, /\.shopify-slideshow\s*{[^}]*height:\s*clamp/s);
  assert.doesNotMatch(styles, /\.shopify-slideshow\s*{[^}]*height:\s*\d+vh/s);
  assert.doesNotMatch(styles, /\.slide\s*{[^}]*min-height:\s*500px/s);
  assert.doesNotMatch(styles, /\.slide img\s*{[^}]*min-height:\s*500px/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.account-link\s*{[^}]*display:\s*none/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.shopify-header\s*{[^}]*grid-template-columns:\s*auto\s+minmax\(48px,\s*1fr\)\s+auto/s);
  assert.doesNotMatch(styles, /\.shopify-button\s*{/);
  assert.doesNotMatch(styles, /\.slide-copy\s*{/);
});
