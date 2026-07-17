const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('collection route resolver renders current slugs, redirects history, and preserves true 404s', async () => {
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-collection-route-'));
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'settings.json');

  let server;
  try {
    const repository = require('../src/settings/storeSettingsRepository');
    await repository.updateStorefrontCollection('freedom-of-mind', {
      slug: 'freedom-collection',
      name: 'Freedom of Mind'
    });
    const { createApp } = require('../src/app');
    server = await new Promise((resolve, reject) => {
      const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
      listener.on('error', reject);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const legacy = await fetch(`${origin}/api/collections/freedom-of-mind/route?utm_source=test`, { redirect: 'manual' });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get('location'), '/collections/freedom-collection?utm_source=test');

    const current = await fetch(`${origin}/api/collections/freedom-collection/route`);
    assert.equal(current.status, 200);
    assert.equal(current.headers.get('x-collection-canonical-slug'), 'freedom-collection');
    assert.equal(current.headers.get('x-accel-redirect'), '/index.html?seo_path=%2Fcollections%2Ffreedom-collection');

    const missing = await fetch(`${origin}/api/collections/not-a-real-collection/route`);
    assert.equal(missing.status, 404);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousSettingsFile === undefined) delete process.env.STORE_SETTINGS_FILE;
    else process.env.STORE_SETTINGS_FILE = previousSettingsFile;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
