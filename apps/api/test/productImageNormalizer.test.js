const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { normalizeProductUploads } = require('../src/images/productImageNormalizer');

test('normalizes real JPEG and PNG uploads to bounded WebP files', async (t) => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-normalized-images-'));
  t.after(() => fs.rm(uploadDir, { recursive: true, force: true }));

  const fixtures = [
    {
      source: path.join(__dirname, '..', 'public', 'MANDALA WHITE', 'mandala3rd.jpg'),
      filename: 'large-photo.jpg',
      mimetype: 'image/jpeg'
    },
    {
      source: path.join(__dirname, '..', 'public', 'uploads', 'products', 'oranges-mcc-box-tee-1781162364372-494817ca92b258.png'),
      filename: 'transparent-photo.png',
      mimetype: 'image/png'
    }
  ];
  const files = [];
  for (const fixture of fixtures) {
    const destination = path.join(uploadDir, fixture.filename);
    await fs.copyFile(fixture.source, destination);
    const stats = await fs.stat(destination);
    files.push({
      path: destination,
      filename: fixture.filename,
      originalname: fixture.filename,
      mimetype: fixture.mimetype,
      size: stats.size
    });
  }

  await normalizeProductUploads(files);

  const sharp = require('sharp');
  for (const file of files) {
    assert.match(file.filename, /-optimized\.webp$/);
    assert.equal(file.mimetype, 'image/webp');
    assert.equal(path.extname(file.path), '.webp');
    const metadata = await sharp(file.path).metadata();
    assert.equal(metadata.format, 'webp');
    assert.ok(metadata.width <= 2400);
    assert.ok(metadata.height <= 2400);
  }
  await assert.rejects(fs.access(path.join(uploadDir, 'large-photo.jpg')));
  await assert.rejects(fs.access(path.join(uploadDir, 'transparent-photo.png')));
});
