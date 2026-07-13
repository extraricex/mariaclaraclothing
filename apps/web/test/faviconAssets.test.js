import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.join(import.meta.dirname, '..');

test('official favicon and install icon references are wired into the storefront', async () => {
  const [html, manifest, dockerfile, nginx] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'public', 'site.webmanifest'), 'utf8'),
    readFile(path.join(root, 'Dockerfile'), 'utf8'),
    readFile(path.join(root, 'nginx.conf'), 'utf8')
  ]);
  assert.match(html, /href="\/favicon\.ico"/);
  assert.match(html, /href="\/favicon-32x32\.png"/);
  assert.match(html, /href="\/favicon-16x16\.png"/);
  assert.match(html, /href="\/apple-touch-icon\.png"/);
  assert.match(html, /href="\/site\.webmanifest"/);
  assert.doesNotMatch(html, /maria-clara-logo\.png/);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.name, 'Maria Clara Clothing');
  assert.deepEqual(parsed.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  assert.match(dockerfile, /COPY apps\/web\/public \.\/apps\/web\/public/);
  assert.match(nginx, /location = \/site\.webmanifest[\s\S]*default_type application\/manifest\+json/);
});

test('generated favicon files have valid PNG and ICO signatures', async () => {
  for (const name of ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192x192.png', 'icon-512x512.png']) {
    const bytes = await readFile(path.join(root, 'public', name));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const ico = await readFile(path.join(root, 'public', 'favicon.ico'));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
});
