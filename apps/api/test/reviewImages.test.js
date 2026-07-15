const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const {
  cleanupReviewFiles,
  optimizeReviewImages,
  reviewImageFileAllowed,
  safeRemoteReviewImageUrl
} = require('../src/reviews/reviewImages');

test('review photo validation rejects unsafe file types and private or executable URLs', () => {
  assert.equal(reviewImageFileAllowed({ originalname: 'photo.JPG', mimetype: 'image/jpeg' }), true);
  assert.equal(reviewImageFileAllowed({ originalname: 'photo.svg', mimetype: 'image/svg+xml' }), false);
  assert.equal(reviewImageFileAllowed({ originalname: 'photo.jpg', mimetype: 'application/javascript' }), false);
  assert.equal(safeRemoteReviewImageUrl('https://cdn.example.com/reviews/photo.webp'), 'https://cdn.example.com/reviews/photo.webp');
  for (const url of [
    'http://cdn.example.com/photo.jpg',
    'https://127.0.0.1/photo.jpg',
    'https://[::1]/photo.jpg',
    'https://169.254.10.20/photo.jpg',
    'https://[fd00::1]/photo.jpg',
    'https://localhost/photo.png',
    'https://cdn.example.com/photo.svg',
    '=HYPERLINK("https://cdn.example.com/photo.jpg")'
  ]) assert.throws(() => safeRemoteReviewImageUrl(url));
});

test('customer review photos are decoded, resized, metadata-stripped, and converted to WebP', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-review-photo-'));
  const previousUploadDir = process.env.REVIEW_UPLOAD_DIR;
  process.env.REVIEW_UPLOAD_DIR = directory;
  const inputPath = path.join(directory, 'incoming.png');
  try {
    await sharp({ create: { width: 2200, height: 1200, channels: 3, background: '#aabbcc' } })
      .png()
      .toFile(inputPath);
    const output = await optimizeReviewImages([{
      path: inputPath, filename: 'incoming.png', originalname: 'photo.png', mimetype: 'image/png'
    }]);
    assert.equal(output.length, 1);
    assert.match(output[0].imageUrl, /^\/uploads\/reviews\/incoming\.webp$/);
    const metadata = await sharp(output[0].path).metadata();
    assert.equal(metadata.format, 'webp');
    assert.ok(metadata.width <= 1600);
    assert.ok(metadata.height <= 1600);
    await assert.rejects(fs.access(inputPath));
    await cleanupReviewFiles(output);
  } finally {
    if (previousUploadDir === undefined) delete process.env.REVIEW_UPLOAD_DIR;
    else process.env.REVIEW_UPLOAD_DIR = previousUploadDir;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
