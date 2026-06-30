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

test('homepage carousel is manual and adds no pause control', async () => {
  const home = await source('src/pages/Home.jsx');

  assert.doesNotMatch(home, /setInterval|clearInterval/);
  assert.doesNotMatch(home, />\s*(Pause|Play)\s*</i);
  assert.match(home, /className="mt-10 flex items-center justify-center"/);
  assert.match(home, /className="carousel-dot"/);
  assert.match(home, /aria-label={`Show banner \$\{index \+ 1\}`}/);
  assert.match(home, /onClick=\{\(\) => setActiveHeroIndex\(index\)\}/);
  assert.match(home, /hero-slide absolute inset-0/);
});
