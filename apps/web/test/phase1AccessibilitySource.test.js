import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', file), 'utf8');

test('phase one provides accessible contrast and touch targets', async () => {
  const css = await source('src/index.css');

  assert.match(css, /--color-clay:\s*color-mix\(in srgb, #202020 65%, #f1f1f1\);/i);
  assert.match(css, /\.touch-target\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.carousel-dot\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
  assert.match(css, /\.carousel-dot::after\s*{[^}]*width:\s*0\.625rem;[^}]*height:\s*0\.625rem;/s);
  assert.match(css, /\.carousel-dot\[aria-current="true"\]::after\s*{[^}]*background:\s*currentColor;/s);
});

test('homepage carousel slides sideways with dots and mobile swipe support', async () => {
  const home = await source('src/pages/Home.jsx');

  assert.match(home, /window\.setInterval/);
  assert.match(home, /window\.clearInterval/);
  assert.doesNotMatch(home, />\s*(Pause|Play)\s*</i);
  assert.match(home, /heroTouchStartX/);
  assert.match(home, /handleHeroTouchStart/);
  assert.match(home, /handleHeroTouchEnd/);
  assert.match(home, /showNextHero/);
  assert.match(home, /showPreviousHero/);
  assert.match(home, /translateX\(\$\{\(index - activeHeroIndex\) \* 100\}%\)/);
  assert.match(home, /className="absolute bottom-2 left-1\/2 flex -translate-x-1\/2 items-center justify-center sm:bottom-3"/);
  assert.match(home, /className="carousel-dot"/);
  assert.match(home, /aria-label={`Show banner \$\{index \+ 1\}`}/);
  assert.match(home, /onClick=\{\(\) => setActiveHeroIndex\(index\)\}/);
  assert.match(home, /hero-slide absolute inset-0/);
  assert.match(home, /transition-transform duration-700/);
});

test('cart drawer exposes modal keyboard behavior', async () => {
  const shell = await source('src/components/Shell.jsx');

  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /aria-labelledby="cart-drawer-title"/);
  assert.match(shell, /id="cart-drawer-title"/);
  assert.match(shell, /inert=\{open \? undefined : ''\}/);
  assert.match(shell, /useModalFocus/);
  assert.match(shell, /closeCartDrawer/);
});

test('mobile menu and checkout actions use accessible compact controls', async () => {
  const [shell, checkout, review] = await Promise.all([
    source('src/components/Shell.jsx'),
    source('src/pages/Checkout.jsx'),
    source('src/pages/CheckoutReview.jsx'),
  ]);

  assert.match(shell, /menuButtonRef/);
  assert.match(shell, /event\.key === 'Escape'[\s\S]*setMenuOpen\(false\)/);
  assert.match(shell, /aria-controls="storefront-mobile-menu"/);
  assert.match(shell, /aria-label=\{menuOpen \? 'Close navigation menu' : 'Open navigation menu'\}/);
  assert.match(shell, /id="storefront-mobile-menu"/);
  assert.match(shell, /className="touch-target px-3 py-1\.5" aria-label="Decrease quantity" onClick=\{\(\) => decreaseItem\(item\)\}/);
  assert.match(shell, /disabled=\{Number\(item\.maxStock\) > 0 && Number\(item\.quantity\) >= Number\(item\.maxStock\)\}/);
  assert.match(checkout, /btn-ink customer-compact-button mt-6 w-full/);
  assert.match(review, /btn-ink customer-compact-button mt-6 w-full/);
  assert.match(review, /disabled=\{pending \|\| loadingQuote \|\| !settingsLoaded \|\| !selectedPayment\}/);
});
