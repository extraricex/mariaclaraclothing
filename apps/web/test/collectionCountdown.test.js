import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  countdownStorageKey,
  durationPartsToSeconds,
  formatRemainingTime,
  resolveVisitorCountdown,
  selectProductCountdown
} from '../src/lib/collectionCountdown.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key) ?? null
  };
}

const enabled = {
  enabled: true,
  message: 'Hurry! Limited time left',
  durationSeconds: 7200,
  revision: 4
};

test('duration fields validate and format through 99:59:59', () => {
  assert.equal(durationPartsToSeconds('02', '03', '04'), 7384);
  assert.equal(durationPartsToSeconds('99', '59', '59'), 359999);
  assert.throws(() => durationPartsToSeconds('00', '00', '00'), /at least one second/);
  assert.throws(() => durationPartsToSeconds('100', '00', '00'), /99:59:59/);
  assert.equal(formatRemainingTime(7384), '02:03:04');
});

test('only the first product collection selects a countdown', () => {
  const settings = {
    collectionCountdowns: {
      'New Arrivals': { ...enabled, enabled: false },
      'Freedom of Mind': enabled
    }
  };
  assert.equal(selectProductCountdown({
    collections: ['New Arrivals', 'Freedom of Mind']
  }, settings), null);
  assert.deepEqual(selectProductCountdown({
    collections: ['Freedom of Mind', 'New Arrivals']
  }, settings), {
    collectionName: 'Freedom of Mind',
    config: enabled
  });
  assert.equal(selectProductCountdown(
    { collections: ['Freedom of Mind'] },
    { collectionCountdowns: { 'Freedom of Mind': { ...enabled, durationSeconds: 360000 } } }
  ), null);
});

test('visitor deadline persists, expires, and restarts only for a new revision', () => {
  const storage = memoryStorage();
  const key = countdownStorageKey('New Arrivals');
  const first = resolveVisitorCountdown('New Arrivals', enabled, storage, 1000);
  assert.equal(first.deadlineMs, 7201000);
  assert.equal(JSON.parse(storage.value(key)).revision, 4);

  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, storage, 2000).deadlineMs, 7201000);
  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, storage, 7201000), null);
  assert.equal(JSON.parse(storage.value(key)).deadlineMs, 7201000);

  const restarted = resolveVisitorCountdown(
    'New Arrivals', { ...enabled, revision: 5 }, storage, 8000000
  );
  assert.equal(restarted.deadlineMs, 15200000);
});

test('malformed or unavailable storage does not block a timer', () => {
  const malformed = memoryStorage({ [countdownStorageKey('New Arrivals')]: '{bad' });
  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, malformed, 100).deadlineMs, 7200100);
  const unavailable = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  assert.equal(resolveVisitorCountdown('New Arrivals', enabled, unavailable, 100).deadlineMs, 7200100);
});

test('product page renders the collection countdown between price and size', async () => {
  const component = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'components', 'CollectionCountdown.jsx'),
    'utf8'
  );
  const product = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'pages', 'Product.jsx'),
    'utf8'
  );
  const settings = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'lib', 'storeSettings.js'),
    'utf8'
  );
  const nginx = await readFile(
    path.join(import.meta.dirname, '..', 'nginx.conf'),
    'utf8'
  );

  assert.match(component, /role="timer"/);
  assert.match(component, /resolveVisitorCountdown/);
  assert.match(component, /setInterval/);
  assert.match(component, /rounded-2xl/);
  assert.match(component, /text-accent/);
  assert.match(product, /selectProductCountdown/);
  assert.match(product, /<CollectionCountdown/);
  assert.ok(product.indexOf('<CollectionCountdown') < product.indexOf('>Size</p>'));
  assert.match(settings, /collectionCountdowns:\s*\{\}/);
  assert.doesNotMatch(nginx, /location \/product\/\s*\{[\s\S]*?proxy_pass/);
  assert.match(
    nginx,
    /location = \/index\.html\s*\{[\s\S]*?Cache-Control "no-store, no-cache, must-revalidate"/
  );
});

test('dedicated product countdown page owns the editor and Collections stays focused', async () => {
  const countdownPage = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'ProductCountdown.jsx'),
    'utf8'
  );
  const collectionsPage = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'Collections.jsx'),
    'utf8'
  );

  assert.match(countdownPage, /Product page countdown/);
  assert.match(countdownPage, /Show countdown/);
  assert.match(countdownPage, /Marketing message/);
  assert.match(countdownPage, /Hours/);
  assert.match(countdownPage, /Minutes/);
  assert.match(countdownPage, /Seconds/);
  assert.match(countdownPage, /Save and restart countdown/);
  assert.match(countdownPage, /durationPartsToSeconds/);
  assert.match(countdownPage, /settings\/collection-countdowns/);
  assert.match(countdownPage, /Live preview/);
  assert.match(countdownPage, /absolute inset-0 z-10 cursor-pointer opacity-0/);

  assert.doesNotMatch(collectionsPage, /Product page countdown/);
  assert.doesNotMatch(collectionsPage, /durationPartsToSeconds/);
  assert.doesNotMatch(collectionsPage, /\/api\/admin\/settings/);
  assert.doesNotMatch(collectionsPage, /countdownForm/);
});
