import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('website content uploads notify storefront shell to refresh logos', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Banners.jsx'), 'utf8');

  assert.match(source, /notifySiteContentChanged/);
  assert.match(source, /new Event\('maria-clara-site-content-changed'\)/);
  assert.match(source, /uploadFooterLogo/);
  assert.match(source, /setFooterLogo\(body\.siteContent\?\.footerLogo/);
});
