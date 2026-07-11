import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const adminRoot = path.join(import.meta.dirname, '..', 'src', 'admin');

test('ticker editor saves the ticker subfield of website settings', async () => {
  const source = await readFile(path.join(adminRoot, 'TickerEditor.jsx'), 'utf8');
  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /\{ ticker: items \}/);
  assert.match(source, /Add item/);
});

test('info pages editor saves one page at a time', async () => {
  const source = await readFile(path.join(adminRoot, 'InfoPagesEditor.jsx'), 'utf8');
  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /infoPages: \{ \[active\]: rows \}/);
  assert.match(source, /shippingReturns/);
  assert.match(source, /Add section/);
});

test('website content page hosts the ticker and info-page editors', async () => {
  const source = await readFile(path.join(adminRoot, 'Banners.jsx'), 'utf8');
  assert.match(source, /HeroTextEditor/);
  assert.match(source, /TickerEditor/);
  assert.match(source, /InfoPagesEditor/);
  assert.match(source, /\/api\/admin\/settings/);
});

test('hero text editor saves homepage hero copy and buttons', async () => {
  const source = await readFile(path.join(adminRoot, 'HeroTextEditor.jsx'), 'utf8');
  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /hero: form/);
  assert.match(source, /Main banner title/);
  assert.match(source, /Button text/);
  assert.match(source, /Button link/);
});
