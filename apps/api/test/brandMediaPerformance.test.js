const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');

test('campaign assets are bounded responsive WebP files and legacy database URLs are migrated', async () => {
  const expected = [
    ['hero1v2-1200.webp', 1200, 100_000],
    ['hero1v2-2400.webp', 2400, 400_000],
    ['hero2-1200.webp', 1200, 100_000],
    ['hero2-2200.webp', 2200, 400_000]
  ];

  for (const [filename, maxWidth, maxBytes] of expected) {
    const file = path.join(root, 'public', 'brand', filename);
    const stats = fs.statSync(file);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, 'webp');
    assert.ok(Number(metadata.width) <= maxWidth);
    assert.ok(stats.size <= maxBytes, `${filename} should remain below ${maxBytes} bytes`);
  }

  const migration = fs.readFileSync(path.join(root, 'db', 'migrations', '20260716_brand_media_performance.sql'), 'utf8');
  assert.match(migration, /"\/brand\/hero1v2\.jpg"/);
  assert.match(migration, /"\/brand\/hero1v2-2400\.webp"/);
  assert.match(migration, /"\/brand\/hero2-2200\.webp"/);
  assert.match(migration, /WHERE key = 'siteContent'/);
});
