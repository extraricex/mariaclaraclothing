import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function readAdminSource(fileName) {
  return readFile(path.join(import.meta.dirname, '..', 'src', 'admin', fileName), 'utf8');
}

test('admin layout uses the uploaded site logo with text fallback', async () => {
  const source = await readAdminSource('AdminLayout.jsx');

  assert.match(source, /import \{ fetchSiteContent \} from '\.\.\/lib\/api\.js';/);
  assert.match(source, /fetchSiteContent\(\)/);
  assert.match(source, /siteContent\?\.logo/);
  assert.match(source, /<img[\s\S]+adminLogo\.url/);
  assert.match(source, /Maria<span className="text-accent">Clara<\/span>/);
});

test('admin login uses the uploaded site logo with text fallback', async () => {
  const source = await readAdminSource('Login.jsx');

  assert.match(source, /import \{ fetchSiteContent \} from '\.\.\/lib\/api\.js';/);
  assert.match(source, /fetchSiteContent\(\)/);
  assert.match(source, /siteContent\?\.logo/);
  assert.match(source, /<img[\s\S]+adminLogo\.url/);
  assert.match(source, /Maria<span className="text-accent">Clara<\/span>/);
});
