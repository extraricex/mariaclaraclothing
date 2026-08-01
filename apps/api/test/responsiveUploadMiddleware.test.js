const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const {
  ensureResponsiveUpload,
  responsiveUploadRequest
} = require('../src/images/responsiveUploadMiddleware');

test('responsive upload requests accept only bounded local derivative paths', () => {
  assert.deepEqual(responsiveUploadRequest('/uploads/banners/campaign-800.webp'), {
    relativeStem: 'banners/campaign',
    width: 800
  });
  assert.equal(responsiveUploadRequest('/uploads/banners/campaign-1200.webp'), null);
  assert.equal(responsiveUploadRequest('/uploads/../secret-800.webp'), null);
  assert.equal(responsiveUploadRequest('/api/products-800.webp'), null);
});

test('missing derivatives are generated from optimized and legacy uploaded images', async (t) => {
  const publicDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-responsive-uploads-'));
  t.after(() => fs.rm(publicDirectory, { recursive: true, force: true }));
  const bannerDirectory = path.join(publicDirectory, 'uploads', 'banners');
  const logoDirectory = path.join(publicDirectory, 'uploads', 'logos');
  await fs.mkdir(bannerDirectory, { recursive: true });
  await fs.mkdir(logoDirectory, { recursive: true });
  await sharp({ create: { width: 1200, height: 600, channels: 4, background: '#f36b21' } })
    .webp()
    .toFile(path.join(bannerDirectory, 'campaign-optimized.webp'));
  await sharp({ create: { width: 1800, height: 400, channels: 4, background: '#111111' } })
    .png()
    .toFile(path.join(logoDirectory, 'site-logo.png'));

  assert.equal(await ensureResponsiveUpload({ publicDirectory, requestPath: '/uploads/banners/campaign-800.webp' }), true);
  assert.equal(await ensureResponsiveUpload({ publicDirectory, requestPath: '/uploads/logos/site-logo-320.webp' }), true);

  const banner = await sharp(path.join(bannerDirectory, 'campaign-800.webp')).metadata();
  const logo = await sharp(path.join(logoDirectory, 'site-logo-320.webp')).metadata();
  assert.equal(banner.format, 'webp');
  assert.ok(banner.width <= 800);
  assert.equal(logo.format, 'webp');
  assert.ok(logo.width <= 320);
});
